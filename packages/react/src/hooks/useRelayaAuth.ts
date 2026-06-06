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
import { openAuthPopup } from './authPopup.js';
import {
  clearStoredRefreshToken,
  clearStoredRefreshTokenIfCurrent,
  decodeJwtExp,
  refreshWithRaceRecovery,
  restoreRefreshToken,
  tryStoreRefreshToken,
  verifyOneTimeToken,
} from './authRefresh.js';
import type { RefreshResult } from './authRefresh.js';
import { loadAuthenticatedState } from './authState.js';
import type { AuthActions, AuthState, UseRelayaAuthOptions } from './authTypes.js';
export type {
  AuthActions,
  AuthStation,
  AuthState,
  AuthStatus,
  AuthUser,
  UseRelayaAuthOptions,
} from './authTypes.js';

type RefreshFailure = Extract<RefreshResult, { ok: false }>;

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
  // Drops local auth state to anonymous. Storage clearing is handled separately
  // so refresh-failure paths can avoid deleting a newer RT written by another tab.

  const setAnonymousState = useCallback(() => {
    tokenRef.current = null;
    currentRtRef.current = null;
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
  }, [configuredSpaceSlug]);

  const goAnonymous = useCallback(() => {
    if (manageOwnRT) clearStoredRefreshToken();
    setAnonymousState();
  }, [manageOwnRT, setAnonymousState]);

  const storeTokenPair = useCallback((accessToken: string, refreshToken: string) => {
    tokenRef.current = accessToken;
    currentRtRef.current = refreshToken;
    if (manageOwnRT) tryStoreRefreshToken(refreshToken);
    setState(s => s.status === 'authenticated' ? { ...s, token: accessToken } : s);
  }, [manageOwnRT]);

  const refreshTokenPair = useCallback((refreshToken: string) => (
    refreshWithRaceRecovery(api, refreshToken, {
      manageOwnRefreshToken: manageOwnRT,
      storageRecoveryAttempts: 2,
    })
  ), [api, manageOwnRT]);

  const syncLatestStoredRefreshToken = useCallback(() => {
    if (!manageOwnRT) return;
    const latestStored = restoreRefreshToken();
    if (latestStored) currentRtRef.current = latestStored;
  }, [manageOwnRT]);

  const handleRefreshFailure = useCallback((failure: RefreshFailure) => {
    if (failure.reason === 'race-lost') {
      syncLatestStoredRefreshToken();
      return;
    }

    if (failure.reason === 'auth-failed' && manageOwnRT) {
      clearStoredRefreshTokenIfCurrent(failure.failedRefreshToken);
    }
    setAnonymousState();
    if (failure.reason === 'auth-failed') {
      onSessionEndedRef.current?.('refresh-failed');
    }
  }, [manageOwnRT, setAnonymousState, syncLatestStoredRefreshToken]);


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
      // Read the latest RT from ref (not closure) — safe even if the pair rotated.
      const rt = currentRtRef.current;
      if (!rt) return;

      const handleResult = (result: RefreshResult) => {
        if (result.ok) {
          storeTokenPair(result.accessToken, result.refreshToken);
          scheduleAtRefresh(result.accessToken);
          return;
        }

        if (result.reason === 'transient' || result.reason === 'race-lost') {
          window.setTimeout(() => {
            syncLatestStoredRefreshToken();
            const retryRt = currentRtRef.current;
            if (!retryRt) return;
            refreshTokenPair(retryRt).then(retryResult => {
              if (retryResult.ok) {
                storeTokenPair(retryResult.accessToken, retryResult.refreshToken);
                scheduleAtRefresh(retryResult.accessToken);
              } else {
                handleRefreshFailure(retryResult);
              }
            });
          }, 10_000);
          return;
        }

        handleRefreshFailure(result);
      };

      refreshTokenPair(rt).then(handleResult);
    }, msUntilRefresh);
  }, [handleRefreshFailure, refreshTokenPair, storeTokenPair, syncLatestStoredRefreshToken]);


  // ── Apply token pair ──────────────────────────────────────────────────────
  // Called after popup postMessage or inline OTP verify.

  const applyTokenPair = useCallback(async (accessToken: string, refreshToken: string) => {
    tokenRef.current = accessToken;
    currentRtRef.current = refreshToken;
    if (manageOwnRT) tryStoreRefreshToken(refreshToken);
    scheduleAtRefresh(accessToken);


    try {
      setState(await loadAuthenticatedState(api, configuredSpaceSlug, accessToken));
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
        refreshTokenPair(storedRt).then(result => {
          if (result.ok) {
            void applyTokenPair(result.accessToken, result.refreshToken);
            return;
          }

          if (result.reason === 'transient' || result.reason === 'race-lost') {
            window.setTimeout(() => {
              const retryRt = restoreRefreshToken();
              if (!retryRt) {
                setAnonymousState();
                return;
              }
              refreshTokenPair(retryRt).then(retryResult => {
                if (retryResult.ok) {
                  void applyTokenPair(retryResult.accessToken, retryResult.refreshToken);
                } else {
                  handleRefreshFailure(retryResult);
                }
              });
            }, 10_000);
            return;
          }

          handleRefreshFailure(result);
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


  // ── Ensure fresh token ────────────────────────────────────────────────────
  // Checks if the in-memory AT is expired or expiring within 2 minutes and, if
  // so, triggers a proactive refresh before returning. Used by useRelayaChat to
  // avoid opening a WebSocket with a stale AT (which would produce an HTTP 401
  // on the WS upgrade and put the client into a reconnect loop).

  const ensureFreshToken = useCallback(async (): Promise<string | null> => {
    const at = tokenRef.current;
    if (!at) return null;

    const exp = decodeJwtExp(at);
    if (!exp) return at; // Can't decode expiry — return what we have

    // AT is still fresh (>2 min remaining) — return immediately
    if ((exp * 1000) - Date.now() > 2 * 60 * 1000) {
      return at;
    }

    // AT is expired or expiring soon — refresh now
    const rt = currentRtRef.current;
    if (!rt) return null;

    const result = await refreshTokenPair(rt);
    if (result.ok) {
      storeTokenPair(result.accessToken, result.refreshToken);
      scheduleAtRefresh(result.accessToken);
      return result.accessToken;
    }

    if (result.reason === 'auth-failed') {
      handleRefreshFailure(result);
    } else {
      syncLatestStoredRefreshToken();
    }
    return null;
  }, [handleRefreshFailure, refreshTokenPair, scheduleAtRefresh, storeTokenPair, syncLatestStoredRefreshToken]);


  // ── Login: open popup ─────────────────────────────────────────────────────

  const login = useCallback(async (_email?: string) => {
    setState(s => ({ ...s, error: null }));
    openAuthPopup({
      baseUrl: effectiveBaseUrl,
      stationSlug: configuredSpaceSlug,
      onBlocked: () => {
        setState(s => ({
          ...s,
          error: 'Please allow popups for this site to sign in.',
        }));
      },
      onTokenPair: (accessToken, refreshToken) => {
        void applyTokenPair(accessToken, refreshToken);
      },
    });
  }, [applyTokenPair, configuredSpaceSlug, effectiveBaseUrl]);

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
    ensureFreshToken,
  };
}
