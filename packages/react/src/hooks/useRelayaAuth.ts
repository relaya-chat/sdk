// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaAuth — AT/RT token-based authentication for iframe/SDK contexts.
 *
 * auth-analysis-2026-06-05.md Wave 6 auth overhaul:
 * - Access token (AT): short-lived JWT (30 min), held in memory only (tokenRef)
 * - Refresh token (RT): stored in localStorage, persists across browser close/reopen
 * - Login: opens a popup window (/auth/popup) for OTP; tokens arrive via postMessage
 * - Session restore: on mount, checks localStorage for RT → calls POST /auth/refresh
 * - Auto-refresh: 2 min before AT expiry, silently calls POST /auth/refresh in background
 * - Logout: deletes RT from server, clears local state
 *
 * auth-analysis-2026-06-05.md Thread C cross-tab coordination:
 * - One tab is elected "refresh leader" via a short-lived localStorage lease
 * - The leader performs the scheduled refresh; follower tabs suppress their requests
 * - After a successful refresh the leader broadcasts the new AT+RT via BroadcastChannel
 * - Follower tabs receive the broadcast, update their in-memory tokens, and reschedule
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
import {
  createTabCoordinator,
  getActiveOtherLease,
  releaseRefreshLease,
  tryClaimRefreshLease,
} from './authTabCoordinator.js';

import type { TabCoordinator } from './authTabCoordinator.js';
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
  const apiKey = options.apiKey;
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
  const api = useRef(new ApiClient(effectiveBaseUrl, getToken, apiKey)).current;

  // Guard against React 18 StrictMode double-invocation
  const initStartedRef = useRef(false);

  // Cross-tab coordinator — null in host-managed mode (only active when manageOwnRT=true)
  const coordinatorRef = useRef<TabCoordinator | null>(null);

  // Latest onTokenRotated implementation — updated every render to capture current
  // state.status, storeTokenPair, and scheduleAtRefresh without stale closures.
  const onTokenRotatedRef = useRef<((at: string, rt: string) => void) | null>(null);

  // Retry handle for tabs that skip refresh because another tab currently holds
  // the leader lease. Cleared whenever a token-rotated broadcast or local success
  // gives this tab a fresh token pair.
  const coordinationRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // True while mount-restore is attempting to convert a stored RT into an AT.
  // During this narrow loading window, token-rotated broadcasts should be applied
  // so simultaneous reloads do not all refresh with the same stored RT.
  const restoreFromStorageInProgressRef = useRef(false);

  const clearCoordinationRetryTimer = useCallback(() => {
    if (coordinationRetryTimerRef.current !== null) {
      clearTimeout(coordinationRetryTimerRef.current);
      coordinationRetryTimerRef.current = null;
    }
  }, []);

  // ── Anonymous fallback ────────────────────────────────────────────────────
  // Drops local auth state to anonymous. Storage clearing is handled separately
  // so refresh-failure paths can avoid deleting a newer RT written by another tab.

  const setAnonymousState = useCallback(() => {
    clearCoordinationRetryTimer();
    restoreFromStorageInProgressRef.current = false;
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
  }, [clearCoordinationRetryTimer, configuredSpaceSlug]);

  const goAnonymous = useCallback(() => {
    if (manageOwnRT) clearStoredRefreshToken();
    setAnonymousState();
  }, [manageOwnRT, setAnonymousState]);

  const storeTokenPair = useCallback((accessToken: string, refreshToken: string) => {
    clearCoordinationRetryTimer();
    restoreFromStorageInProgressRef.current = false;
    tokenRef.current = accessToken;
    currentRtRef.current = refreshToken;
    if (manageOwnRT) tryStoreRefreshToken(refreshToken);
    setState(s => s.status === 'authenticated' ? { ...s, token: accessToken } : s);
  }, [clearCoordinationRetryTimer, manageOwnRT]);

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


  // ── Cross-tab leader coordination primitives ──────────────────────────────
  // Single definition of "should this tab run the refresh" and "tell other tabs
  // about a new pair". Every coordinated refresh entry point (scheduled timer,
  // mount restore, ensureFreshToken) routes its lease/broadcast policy through
  // these two helpers, so the rules live in exactly one place rather than being
  // re-implemented inline at each call site.

  // Returns 'lead' when this tab should perform the refresh, or 'skip' when
  // another tab holds an active leader lease (this tab should wait for its
  // broadcast). When coordination is inactive — host-managed mode, or no
  // BroadcastChannel to deliver the result — always returns 'lead' and the
  // caller falls back to Thread B race-aware refresh.
  const tryBecomeRefreshLeader = useCallback(async (): Promise<'lead' | 'skip'> => {
    if (!manageOwnRT || !coordinatorRef.current?.canBroadcast) return 'lead';
    if (getActiveOtherLease()) return 'skip';
    return (await tryClaimRefreshLease()) ? 'lead' : 'skip';
  }, [manageOwnRT]);

  // After any successful refresh the leader's lease has served its purpose, so
  // release it immediately and notify follower tabs. Releasing here (rather than
  // waiting for the lease TTL) prevents a tab that reloads within LEASE_DURATION_MS
  // from stalling against the lease its own predecessor left behind. The broadcast
  // is wrapped so a delivery failure can never abort the caller's token-apply path.
  const broadcastTokenRotation = useCallback((accessToken: string, refreshToken: string) => {
    releaseRefreshLease();
    if (manageOwnRT && coordinatorRef.current?.canBroadcast) {
      try {
        coordinatorRef.current.broadcast(accessToken, refreshToken);
      } catch {
        /* broadcast is best-effort; token application must still proceed */
      }
    }
  }, [manageOwnRT]);



  // ── Shared refresh-with-retry helper ──────────────────────────────────────
  // Consolidates the timer and mount-restore retry ladders into one place:
  // attempt a refresh and, on transient/race-lost, wait 10s and retry once.
  // Cross-tab leader claiming happens before this helper is called; successful
  // refreshes broadcast the new pair to follower tabs.
  //
  // onSuccess receives the new AT+RT. The caller decides what to do with them:
  //   - timer path: storeTokenPair + scheduleAtRefresh (no state reload)
  //   - mount path: applyTokenPair (full auth state reload including /me + /station)

  const runRefreshWithRetry = useCallback((
    initialRt: string,
    onSuccess: (at: string, rt: string) => void | Promise<void>
  ): void => {
    const handleAttempt = (result: RefreshResult, isRetry: boolean): void => {
      if (result.ok) {
        broadcastTokenRotation(result.accessToken, result.refreshToken);
        void onSuccess(result.accessToken, result.refreshToken);
        return;
      }

      if (!isRetry && (result.reason === 'transient' || result.reason === 'race-lost')) {
        window.setTimeout(() => {
          syncLatestStoredRefreshToken();
          const retryRt = currentRtRef.current;
          if (!retryRt) { setAnonymousState(); return; }
          refreshTokenPair(retryRt).then(r => handleAttempt(r, true));
        }, 10_000);
        return;
      }

      handleRefreshFailure(result);
    };

    refreshTokenPair(initialRt).then(r => handleAttempt(r, false));
  }, [broadcastTokenRotation, handleRefreshFailure, refreshTokenPair, setAnonymousState, syncLatestStoredRefreshToken]);

  const scheduleLeaseRetry = useCallback((start: () => void, retryAfterMs: number) => {
    clearCoordinationRetryTimer();
    const jitterMs = 75 + Math.floor(Math.random() * 250);
    coordinationRetryTimerRef.current = setTimeout(() => {
      coordinationRetryTimerRef.current = null;
      start();
    }, retryAfterMs + jitterMs);
  }, [clearCoordinationRetryTimer]);

  const runRefreshAsLeader = useCallback((
    initialRt: string,
    onSuccess: (at: string, rt: string) => void | Promise<void>,
    options: { onMissingRt?: () => void } = {}
  ): void => {
    const start = async (): Promise<void> => {
      const rt = currentRtRef.current ?? initialRt;
      if (!rt) { options.onMissingRt?.(); return; }

      if (await tryBecomeRefreshLeader() === 'skip') {
        // Another tab is leading this refresh. If a broadcast already advanced
        // our RT while we were contending, the stale refresh is no longer
        // needed. Otherwise retry after the visible leader lease expires so
        // leader crash / missed-broadcast cases still recover.
        if (currentRtRef.current && currentRtRef.current !== rt) return;
        scheduleLeaseRetry(start, getActiveOtherLease()?.retryAfterMs ?? 0);
        return;
      }

      runRefreshWithRetry(rt, onSuccess);
    };

    void start();
  }, [runRefreshWithRetry, scheduleLeaseRetry, tryBecomeRefreshLeader]);


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
      const rt = currentRtRef.current;
      if (!rt) return;

      runRefreshAsLeader(rt, (at, rtNew) => {
        storeTokenPair(at, rtNew);
        scheduleAtRefresh(at);
      });
    }, msUntilRefresh);
  }, [runRefreshAsLeader, storeTokenPair]);


  // ── Apply token pair ──────────────────────────────────────────────────────
  // Called after popup postMessage or inline OTP verify.

  const applyTokenPair = useCallback(async (accessToken: string, refreshToken: string) => {
    clearCoordinationRetryTimer();
    restoreFromStorageInProgressRef.current = false;
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
  }, [api, clearCoordinationRetryTimer, configuredSpaceSlug, scheduleAtRefresh, goAnonymous, manageOwnRT]);


  // Backward-compat: called when OTP is verified inline (non-popup path)
  const applyVerifyResponse = useCallback((data: AuthVerifyResponse) => {
    void applyTokenPair(data.accessToken, data.refreshToken);
  }, [applyTokenPair]);


  // ── Keep broadcast receiver ref current ───────────────────────────────────
  // Runs after every render so the coordinator's onTokenRotated callback always
  // closes over the latest state.status, storeTokenPair, and scheduleAtRefresh.
  // Broadcasts are applied to authenticated tabs and to loading tabs that are
  // actively restoring from a stored RT, preventing simultaneous reloads from
  // all spending the same RT.

  useEffect(() => {
    onTokenRotatedRef.current = (at: string, rt: string) => {
      if (state.status === 'loading' && restoreFromStorageInProgressRef.current) {
        void applyTokenPair(at, rt);
        return;
      }
      if (state.status !== 'authenticated') return;
      storeTokenPair(at, rt);
      scheduleAtRefresh(at);
    };
  });


  // ── Coordinator lifecycle ─────────────────────────────────────────────────
  // Owns the cross-tab BroadcastChannel. Kept in its own effect (not gated by
  // initStartedRef) so React StrictMode's mount → unmount → remount recreates a
  // live channel each time, instead of leaving the session-restore code holding
  // a coordinator that was disposed during the StrictMode unmount (a disposed
  // coordinator whose broadcast() throws would abort token application and drop
  // the session). Declared before the session-restore effect so coordinatorRef
  // is populated before mount-restore consults it for leader election.
  useEffect(() => {
    if (!manageOwnRT) return;
    coordinatorRef.current = createTabCoordinator((at, rt) => {
      onTokenRotatedRef.current?.(at, rt);
    });
    return () => {
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
    };
  }, [manageOwnRT]);


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
        currentRtRef.current = storedRt;
        restoreFromStorageInProgressRef.current = true;
        runRefreshAsLeader(
          storedRt,
          (at, rt) => applyTokenPair(at, rt),
          { onMissingRt: () => { setAnonymousState(); } }
        );
      } else {
        restoreFromStorageInProgressRef.current = false;
        setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
      }
    } else {
      // Host-managed mode with no initialToken yet: stay anonymous until the
      // host remounts us with a token (e.g. /account/dashboard-data load).
      setState(s => ({ ...s, status: 'anonymous', stationSlug: configuredSpaceSlug }));
    }

    return () => {
      // Coordinator disposal is owned by the coordinator-lifecycle effect above.
      clearCoordinationRetryTimer();
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

    // If another tab is already leading a refresh, don't open a competing one;
    // return null so the chat layer waits and a broadcast can update us first.
    if (await tryBecomeRefreshLeader() === 'skip') return null;

    const result = await refreshTokenPair(rt);
    if (result.ok) {
      broadcastTokenRotation(result.accessToken, result.refreshToken);
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
  }, [broadcastTokenRotation, handleRefreshFailure, refreshTokenPair, scheduleAtRefresh, storeTokenPair, syncLatestStoredRefreshToken, tryBecomeRefreshLeader]);


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
