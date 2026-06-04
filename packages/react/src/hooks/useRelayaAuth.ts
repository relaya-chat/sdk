// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaAuth — AT/RT token-based authentication for iframe/SDK contexts.
 *
 * Wave 6 auth overhaul:
 * - Access token (AT): short-lived JWT (15 min), held in memory only (tokenRef)
 * - Refresh token (RT): stored in localStorage, persists across browser close/reopen
 * - Login: opens a popup window (/auth/popup) for OTP; tokens arrive via postMessage
 * - Session restore: on mount, checks localStorage for RT → calls POST /auth/refresh
 * - Auto-refresh: 2 min before AT expiry, silently calls POST /auth/refresh in background
 * - Logout: deletes RT from server, clears local state
 *
 * No cookies are used. No Storage Access API calls needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClient } from '@relaya-chat/core';
import type { AuthVerifyResponse } from '@relaya-chat/core';
export type { AuthVerifyResponse };
import { appConfig } from '../config.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | 'loading'         // initial check in progress
  | 'unauthenticated' // no session, show login form (used for error states)
  | 'anonymous'       // no session, but can view read-only
  | 'magic-link-sent' // legacy — kept for API compat; not used in popup flow
  | 'authenticated';  // AT valid, enter chat

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  permissions: string[];
  roles: Array<{ id: string; name: string; priority: number }>;
  chatName: string | null;
}

export interface AuthStation {
  id: string;
  name: string;
  slug: string;
  /** Cosmetic header display name. Null = use the official name. */
  headerName?: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null; // AT (in memory); exposed for WS URL construction
  station: AuthStation | null;
  stationSlug: string;
  error: string | null;
}

export interface AuthActions {
  login: (email?: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  onOtpVerified: (data: AuthVerifyResponse) => void;
}

export interface UseRelayaAuthOptions {
  /** Explicit space slug supplied by SDK consumers. Falls back to URL-derived appConfig.spaceSlug. */
  spaceSlug?: string;
  /**
   * Base URL for all REST API calls. Pass `"https://api.relaya.chat"` for Relaya SaaS,
   * or `""` for same-origin (iframe / Vite-proxy dev). Defaults to same-origin.
   */
  serverUrl?: string;
  /** One-time magic-link token supplied by SDK consumers for auto-auth handoff. */
  initialToken?: string | null;
  /**
   * Whether the widget owns its own refresh-token persistence.
   *
   *  - `true` (default) — widget reads, writes, and clears
   *    `localStorage.relaya_refresh_token` and recovers a session on reload.
   *  - `false` — host application owns the session. The widget keeps its RT
   *    in memory only and never touches localStorage. The host is responsible
   *    for providing a fresh `initialToken` on every mount and for ending the
   *    session (subscribe to `onSessionEnded`).
   */
  manageOwnRefreshToken?: boolean;
  /**
   * Called when the widget's auth session ends — whether because the user
   * clicked the widget's Sign Out (`reason: 'logout'`) or because an
   * automatic refresh failed (`reason: 'refresh-failed'`). Embedders use this
   * to redirect to their own sign-in surface.
   */
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}


// ── localStorage RT helpers ───────────────────────────────────────────────────
// RT is stored in localStorage so it persists across browser close/reopen and
// is shared across tabs (same iframe origin). localStorage is keyed to the
// widget's own origin (chat.relayaplatform.com); the parent page's JS cannot
// read it (same-origin policy), so it remains cross-origin isolated.
// Access token lives only in memory (tokenRef) and is NOT stored.
//
// iOS Safari ITP note: localStorage in cross-origin iframes may be cleared
// after ~7 days without a direct user interaction with the iframe domain.
// Active users who interact with the chat widget are unaffected.

const REFRESH_TOKEN_KEY = 'relaya_refresh_token';

function tryStoreRefreshToken(rt: string): void {
  try { localStorage.setItem(REFRESH_TOKEN_KEY, rt); } catch { /* unavailable */ }
}
function restoreRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; }
}
function clearStoredRefreshToken(): void {
  try { localStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* unavailable */ }
}

// ── JWT payload decode (no verification — server verifies) ───────────────────

function decodeJwtExp(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.');
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

// ── Refresh deduplication — module-level so it's shared across hook instances ─
// Prevents multiple simultaneous refresh calls (e.g. from StrictMode double-invoke
// or multiple tabs triggering a refresh at the same time).

let _refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;
const _verifyTokenPromises = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>();

function verifyOneTimeToken(baseUrl: string, token: string, stationSlug: string): Promise<{ accessToken: string; refreshToken: string }> {
  const cacheKey = `${stationSlug}:${token}`;
  const cached = _verifyTokenPromises.get(cacheKey);
  if (cached) return cached;

  const promise = fetch(`${baseUrl}/auth/verify?token=${encodeURIComponent(token)}&station=${encodeURIComponent(stationSlug)}`)
    .then(r => r.ok ? r.json() : Promise.reject()) as Promise<{ accessToken: string; refreshToken: string }>;
  _verifyTokenPromises.set(cacheKey, promise);
  promise.finally(() => {
    window.setTimeout(() => { _verifyTokenPromises.delete(cacheKey); }, 5 * 60 * 1000);
  }).catch(() => { /* keep rejection handled for callers */ });
  return promise;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelayaAuth(options: UseRelayaAuthOptions = {}): AuthState & AuthActions {
  const configuredSpaceSlug = options.spaceSlug ?? appConfig.spaceSlug;
  const effectiveBaseUrl = options.serverUrl ?? '';
  const configuredInitialToken = options.initialToken ?? null;
  // Storage ownership: when manageOwnRefreshToken is false, the host application
  // owns the RT. The widget must never read, write, or clear
  // localStorage.relaya_refresh_token in that mode — that key belongs to the host.
  // Default is true (standalone-widget behavior, e.g. apps/chat-web iframe).
  const manageOwnRT = options.manageOwnRefreshToken ?? true;
  // Stable ref so the latest callback is invoked even if the host passes a
  // fresh closure each render. We deliberately do not put onSessionEnded in
  // useCallback dep arrays — it is a notification-out edge, not a control input.
  const onSessionEndedRef = useRef(options.onSessionEnded);
  onSessionEndedRef.current = options.onSessionEnded;


  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    token: null,
    station: null,
    stationSlug: configuredSpaceSlug,
    error: null,
  });

  // AT lives only in memory — never written to storage
  const tokenRef = useRef<string | null>(null);
  const getToken = useCallback(() => tokenRef.current, []);

  // Current RT ref — always reflects the latest RT so timer closure doesn't go stale
  const currentRtRef = useRef<string | null>(null);

  // Auto-refresh timer handle
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared ApiClient instance — stable reference
  const api = useRef(new ApiClient(effectiveBaseUrl, getToken)).current;

  // Guard against React 18 StrictMode double-invocation
  const initStartedRef = useRef(false);

  // ── Anonymous fallback ────────────────────────────────────────────────────
  // Drops to anonymous and (when the widget owns its RT storage) clears the
  // refresh-token key. Does NOT touch localStorage when manageOwnRefreshToken
  // is false — the host owns that key and is expected to clear it itself.

  const goAnonymous = useCallback(() => {
    tokenRef.current = null;
    currentRtRef.current = null;
    if (manageOwnRT) clearStoredRefreshToken();
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setState(s => ({
      ...s,
      status: 'anonymous',
      token: null,
      user: null,
      station: null,
      stationSlug: configuredSpaceSlug,
    }));
  }, [configuredSpaceSlug, manageOwnRT]);


  // ── Silent AT auto-refresh ────────────────────────────────────────────────
  // Scheduled after each successful applyTokenPair; reads currentRtRef at fire time.

  const scheduleAtRefresh = useCallback((accessToken: string) => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const exp = decodeJwtExp(accessToken);
    if (!exp) return;

    // Fire 2 minutes before expiry (min 0 to handle already-near-expiry ATs)
    const msUntilRefresh = Math.max(0, (exp * 1000) - Date.now() - 2 * 60 * 1000);

    refreshTimerRef.current = setTimeout(() => {
      // Read the latest RT from ref (not closure) — safe even if the pair rotated
      const rt = currentRtRef.current;
      if (!rt) return;

      // Deduplicate: reuse in-flight refresh if one is already running
      if (!_refreshPromise) {
        _refreshPromise = api.refresh(rt).finally(() => { _refreshPromise = null; });
      }
      const inflight = _refreshPromise!;
      inflight.then(result => {
        // Store updated pair
        tokenRef.current = result.accessToken;
        currentRtRef.current = result.refreshToken;
        if (manageOwnRT) tryStoreRefreshToken(result.refreshToken);
        // Update state token (used for WS URL)
        setState(s => s.status === 'authenticated' ? { ...s, token: result.accessToken } : s);
        // Schedule next refresh
        scheduleAtRefresh(result.accessToken);
      }).catch((err: unknown) => {
        // Only treat 401/403 as a genuine auth failure (RT expired or revoked).
        // Network errors and 5xx (e.g. server restarting on deploy) are transient —
        // keep the RT and retry once rather than forcing re-auth.
        const isAuthError = err != null && typeof err === 'object' && 'status' in err &&
          ((err as { status: number }).status === 401 || (err as { status: number }).status === 403);
        if (isAuthError) {
          goAnonymous();
          onSessionEndedRef.current?.('refresh-failed');
        } else {
          setTimeout(() => {
            const rt = currentRtRef.current;
            if (!rt) return;
            api.refresh(rt)
              .then(result => {
                tokenRef.current = result.accessToken;
                currentRtRef.current = result.refreshToken;
                if (manageOwnRT) tryStoreRefreshToken(result.refreshToken);
                setState(s => s.status === 'authenticated' ? { ...s, token: result.accessToken } : s);
                scheduleAtRefresh(result.accessToken);
              })
              .catch(() => {
                goAnonymous();
                onSessionEndedRef.current?.('refresh-failed');
              });
          }, 10_000);
        }
      });
    }, msUntilRefresh);
  }, [api, goAnonymous, manageOwnRT]);


  // ── Apply token pair ──────────────────────────────────────────────────────
  // Called after popup postMessage or inline OTP verify.

  const applyTokenPair = useCallback(async (accessToken: string, refreshToken: string) => {
    tokenRef.current = accessToken;
    currentRtRef.current = refreshToken;
    if (manageOwnRT) tryStoreRefreshToken(refreshToken);
    scheduleAtRefresh(accessToken);


    try {
      const meData = await api.getMe(configuredSpaceSlug).catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[RelayaAuth] getMe failed during token apply', { spaceSlug: configuredSpaceSlug, err });
        throw err;
      });
      const stationData = await api.getStation(configuredSpaceSlug).catch((err) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[RelayaAuth] getStation failed during token apply', { spaceSlug: configuredSpaceSlug, err });
        throw err;
      });

      setState({
        status: 'authenticated',
        user: {
          id: meData.userId,
          displayName: meData.displayName,
          avatarUrl: null,
          permissions: meData.permissions,
          roles: meData.roles as AuthUser['roles'],
          chatName: meData.chatName,
        },
        token: accessToken,
        station: {
          id: stationData.id,
          name: stationData.name,
          slug: stationData.slug,
          // headerName lives in the server response but not yet in the compiled @relaya-chat/core dist type.
          // Double-cast through unknown until the next SDK release rebuilds the dist.
          headerName: ((stationData as unknown) as Record<string, unknown>).headerName as string | null ?? null,
        },
        stationSlug: stationData.slug,
        error: null,
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('[RelayaAuth] Falling back to anonymous after token apply failure', { spaceSlug: configuredSpaceSlug, err });
      goAnonymous();
    }
  }, [api, configuredSpaceSlug, scheduleAtRefresh, goAnonymous, manageOwnRT]);


  // Backward-compat: called when OTP is verified inline (non-popup path)
  const applyVerifyResponse = useCallback((data: AuthVerifyResponse) => {
    void applyTokenPair(data.accessToken, data.refreshToken);
  }, [applyTokenPair]);

  // ── Mount: session restore ────────────────────────────────────────────────
  // Priority order (when widget owns its RT):
  //   1. ?token= in URL — auto-auth magic-link token from /account dashboard iframes
  //   2. localStorage RT — persists across browser close/reopen and across tabs
  //   3. anonymous fallback
  //
  // When the host owns the RT (manageOwnRefreshToken=false), the localStorage
  // branch is skipped entirely; the widget either authenticates with the
  // initialToken or stays anonymous until the host remounts it with a fresh
  // token. This is the architectural seam that prevents widget remounts from
  // re-reading and refreshing the host's RT after a sign-out.

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const tokenToVerify = configuredInitialToken ?? urlToken;
    const urlStation = urlParams.get('station') || configuredSpaceSlug;

    if (tokenToVerify) {
      // Scrub token from URL immediately — one-time-use, must not survive reload
      if (urlToken) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('token');
        window.history.replaceState({}, '', cleanUrl.toString());
      }

      verifyOneTimeToken(effectiveBaseUrl, tokenToVerify, urlStation)
        .then((data: { accessToken: string; refreshToken: string }) => {
          void applyTokenPair(data.accessToken, data.refreshToken);
        })
        .catch(() => goAnonymous());
    } else if (manageOwnRT) {
      const storedRt = restoreRefreshToken();
      if (storedRt) {
        // Deduplicate: reuse in-flight refresh if one is already running
        if (!_refreshPromise) {
          _refreshPromise = api.refresh(storedRt).finally(() => { _refreshPromise = null; });
        }
        const inflight = _refreshPromise!;
        inflight.then(result => {
          void applyTokenPair(result.accessToken, result.refreshToken);
        }).catch((err: unknown) => {
          // Only treat 401/403 as a genuine auth failure (RT expired or revoked).
          // Network errors and 5xx (e.g. server restarting on deploy) are transient —
          // keep the RT in localStorage and retry once so a deployment restart
          // doesn't force users to re-authenticate.
          const isAuthError = err != null && typeof err === 'object' && 'status' in err &&
            ((err as { status: number }).status === 401 || (err as { status: number }).status === 403);
          if (isAuthError) {
            clearStoredRefreshToken();
            setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
          } else {
            setTimeout(() => {
              const retryRt = restoreRefreshToken();
              if (!retryRt) {
                setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
                return;
              }
              api.refresh(retryRt)
                .then((result: { accessToken: string; refreshToken: string }) => void applyTokenPair(result.accessToken, result.refreshToken))
                .catch(() => {
                  clearStoredRefreshToken();
                  setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
                });
            }, 10_000);
          }
        });
      } else {
        setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
      }
    } else {
      // Host-managed mode with no initialToken yet: stay anonymous until the
      // host remounts us with a token (e.g. /account/dashboard-data load).
      setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
    }

    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Login: open popup ─────────────────────────────────────────────────────

  const login = useCallback(async (_email?: string) => {
    setState(s => ({ ...s, error: null }));

    // When serverUrl is set (cross-origin SDK consumer), the popup and auth flow
    // live on the Relaya server domain (e.g. api.relaya.chat), not the host app's
    // domain. postMessage origin check must match accordingly.
    const serverOrigin = effectiveBaseUrl
      ? new URL(effectiveBaseUrl).origin
      : window.location.origin;
    const popupUrl = `${serverOrigin}/auth/popup?station=${encodeURIComponent(configuredSpaceSlug)}`;
    const popup = window.open(popupUrl, 'relaya-auth', 'width=480,height=600,left=200,top=100');

    if (!popup) {
      setState(s => ({
        ...s,
        error: 'Please allow popups for this site to sign in.',
      }));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== serverOrigin) return;
      if ((event.data as { type?: string })?.type !== 'relaya:auth') return;
      window.removeEventListener('message', handleMessage);
      const { accessToken, refreshToken } = event.data as { accessToken: string; refreshToken: string };
      void applyTokenPair(accessToken, refreshToken);
    };

    window.addEventListener('message', handleMessage);
  }, [applyTokenPair, configuredSpaceSlug]);

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    // When the host owns the RT, do not fall back to reading localStorage —
    // that key isn't ours to inspect or consume. The widget's in-memory RT
    // is sufficient to revoke server-side; the host clears storage itself.
    const storedRt = currentRtRef.current ?? (manageOwnRT ? restoreRefreshToken() : null);
    goAnonymous();
    if (storedRt) {
      fetch(`${effectiveBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRt }),
      }).catch(() => { /* fire-and-forget; local state already cleared */ });
    }
    onSessionEndedRef.current?.('logout');
  }, [goAnonymous, manageOwnRT]);


  return {
    ...state,
    login,
    logout,
    getToken,
    onOtpVerified: applyVerifyResponse,
  };
}
