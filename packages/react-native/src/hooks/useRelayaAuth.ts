// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaAuth — AT/RT authentication hook for React Native / Expo.
 *
 * Manages the full OTP authentication lifecycle with access token / refresh token separation:
 * - AT (access token): JWT, ~30 minutes, kept in memory only
 * - RT (refresh token): opaque, persisted via tokenStorage adapter
 *
 * On mount: read RT from storage → POST /auth/refresh → rotate both tokens
 * requestCode(email) → POST /auth/request-code → returns pendingId
 * verifyCode(pendingId, code) → POST /auth/verify-code → persist RT, keep AT in memory
 * logout() → POST /auth/logout with { refreshToken } → clear storage → anonymous
 * ensureFreshToken() → returns AT immediately when fresh; refreshes when near-expired
 *
 * Storage is provided by the host app via RelayaTokenStorage adapter.
 * Recommended: expo-secure-store for Expo, react-native-keychain for bare RN.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { ApiClient } from '@relaya-chat/core';
import type { Permission, Role } from '@relaya-chat/core';

// ── Public Types ───────────────────────────────────────────────────────────────

/**
 * Storage adapter interface. The host app provides a concrete implementation
 * backed by Expo SecureStore, react-native-keychain, or another secure store.
 */
export interface RelayaTokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type AuthStatus =
  | 'loading'        // initial storage check in progress
  | 'anonymous'      // no session; can view read-only
  | 'otp-sent'       // OTP email sent; waiting for user to enter code
  | 'authenticated'; // AT valid; full chat access

export interface RelayaAuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  permissions: Permission[];
  roles: Role[];
}

export interface RelayaAuthStation {
  id: string;
  name: string;
  slug: string;
}

export interface RelayaAuthState {
  status: AuthStatus;
  user: RelayaAuthUser | null;
  station: RelayaAuthStation | null;
  error: string | null;
}

export interface RelayaAuthOptions {
  /** Relaya SaaS endpoint — always 'https://api.relaya.chat' */
  serverUrl: string;
  /** Your space slug, assigned by Relaya — e.g. 'balearic-fm' */
  spaceSlug: string;
  /** Secure storage adapter (Expo SecureStore, react-native-keychain, etc.) */
  tokenStorage: RelayaTokenStorage;
  /** Storage key for the refresh token (default: 'relaya_refresh_token') */
  refreshTokenStorageKey?: string;
  /** Called when the session ends due to confirmed auth failure or explicit logout */
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}

export interface RelayaAuthActions {
  /** Send a 6-digit OTP to the given email. Returns pendingId for verifyCode(). */
  requestCode: (email: string) => Promise<{ pendingId: string }>;
  /** Verify the OTP code. On success, persists RT and transitions to 'authenticated'. */
  verifyCode: (pendingId: string, code: string) => Promise<void>;
  /** Log out: POST RT to server, clear secure storage, transition to 'anonymous'. */
  logout: () => Promise<void>;
  /**
   * Returns a fresh AT. Returns current AT immediately when still fresh (>2 min remaining).
   * Calls /auth/refresh when AT is expired or near expiry.
   * Returns null when no valid session exists.
   */
  ensureFreshToken: () => Promise<string | null>;
  /** Returns the current AT synchronously from memory. Null if unauthenticated. */
  getToken: () => string | null;
}

// ── Helper: JWT Expiry Decoder ─────────────────────────────────────────────────

/**
 * Decodes the expiry timestamp from a JWT without verifying the signature.
 * Returns the exp value in milliseconds, or null if the token is malformed
 * or has no exp claim.
 */
export function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(
      Buffer.from(padded, 'base64').toString('utf8')
    ) as Record<string, unknown>;
    if (typeof decoded.exp !== 'number') return null;
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Returns true when the AT is still fresh (more than 2 minutes from expiry).
 */
export function isTokenFresh(token: string): boolean {
  const expMs = decodeJwtExpiry(token);
  if (expMs === null) return false;
  return Date.now() < expMs - 2 * 60 * 1000;
}

// ── Helper: Transient-vs-Confirmed Failure Classifier ──────────────────────────

/**
 * Returns true when the error is a confirmed auth failure (HTTP 401 or 403).
 * Returns false for transient failures (network errors, 5xx, etc.).
 */
export function isConfirmedAuthFailure(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    return status === 401 || status === 403;
  }
  return false;
}

// ── Helper: RT-Keyed Refresh Deduplication ─────────────────────────────────────

/**
 * Tracks in-flight refresh promises keyed by RT value.
 * Concurrent callers sharing the same RT receive the same Promise,
 * preventing the same RT from being spent twice.
 */
export const inFlightRefreshMap = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>();

/**
 * Executes a refresh, deduplicating concurrent callers that hold the same RT.
 */
export function deduplicatedRefresh(
  rt: string,
  executor: () => Promise<{ accessToken: string; refreshToken: string }>
): Promise<{ accessToken: string; refreshToken: string }> {
  const existing = inFlightRefreshMap.get(rt);
  if (existing) return existing;

  const promise = executor().finally(() => {
    inFlightRefreshMap.delete(rt);
  });

  inFlightRefreshMap.set(rt, promise);
  return promise;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelayaAuth(
  options: RelayaAuthOptions
): RelayaAuthState & RelayaAuthActions {
  const {
    serverUrl,
    spaceSlug,
    tokenStorage,
    refreshTokenStorageKey = 'relaya_refresh_token',
    onSessionEnded,
  } = options;

  const [state, setState] = useState<RelayaAuthState>({
    status: 'loading',
    user: null,
    station: null,
    error: null,
  });

  // AT in memory only — never persisted
  const accessTokenRef = useRef<string | null>(null);
  // RT in memory for sync access — canonical copy is in tokenStorage
  const refreshTokenRef = useRef<string | null>(null);

  const getToken = useCallback((): string | null => accessTokenRef.current, []);

  // Shared ApiClient — uses getToken so it always sends the latest AT
  const api = useRef(new ApiClient(serverUrl, getToken)).current;

  // Guard against React StrictMode double-invocation
  const initStartedRef = useRef(false);

  // Track whether a retry timer is scheduled for transient failures
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Internal: rotate tokens after a successful refresh ────────────────────

  const applyTokenRotation = useCallback(
    async (accessToken: string, refreshToken: string): Promise<void> => {
      accessTokenRef.current = accessToken;
      refreshTokenRef.current = refreshToken;
      await tokenStorage.set(refreshTokenStorageKey, refreshToken);
    },
    [tokenStorage, refreshTokenStorageKey]
  );

  // ── Internal: load user + station state after successful auth ─────────────

  const loadAuthenticatedState = useCallback(async (): Promise<void> => {
    const [meData, stationData] = await Promise.all([
      api.getMe(spaceSlug),
      api.getStation(spaceSlug),
    ]);

    setState({
      status: 'authenticated',
      user: {
        id: meData.userId,
        displayName: meData.displayName,
        avatarUrl: null,
        permissions: meData.permissions,
        roles: meData.roles,
      },
      station: {
        id: stationData.id,
        name: stationData.name,
        slug: stationData.slug,
      },
      error: null,
    });
  }, [api, spaceSlug]);

  // ── Internal: clear all auth state ───────────────────────────────────────

  const clearAuthState = useCallback(async (): Promise<void> => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    await tokenStorage.delete(refreshTokenStorageKey);
    setState({ status: 'anonymous', user: null, station: null, error: null });
  }, [tokenStorage, refreshTokenStorageKey]);

  // ── Internal: perform RT rotation via /auth/refresh ───────────────────────

  const performRefresh = useCallback(async (): Promise<string | null> => {
    const rt = refreshTokenRef.current;
    if (!rt) return null;

    try {
      const data = await deduplicatedRefresh(rt, () => api.refresh(rt));
      await applyTokenRotation(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch (err: unknown) {
      if (isConfirmedAuthFailure(err)) {
        await clearAuthState();
        onSessionEnded?.('refresh-failed');
        return null;
      }
      return null;
    }
  }, [api, applyTokenRotation, clearAuthState, onSessionEnded]);

  // ── ensureFreshToken ──────────────────────────────────────────────────────

  const ensureFreshToken = useCallback(async (): Promise<string | null> => {
    const at = accessTokenRef.current;
    if (at && isTokenFresh(at)) return at;
    if (!refreshTokenRef.current) return null;
    return performRefresh();
  }, [performRefresh]);

  // ── Initial auth check ─────────────────────────────────────────────────────

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    async function initialize(): Promise<void> {
      const storedRt = await tokenStorage.get(refreshTokenStorageKey);

      if (!storedRt) {
        setState((s) => ({ ...s, status: 'anonymous' }));
        return;
      }

      refreshTokenRef.current = storedRt;

      try {
        const data = await deduplicatedRefresh(storedRt, () => api.refresh(storedRt));
        await applyTokenRotation(data.accessToken, data.refreshToken);
        await loadAuthenticatedState();
      } catch (err: unknown) {
        if (isConfirmedAuthFailure(err)) {
          await clearAuthState();
          onSessionEnded?.('refresh-failed');
          return;
        }
        // Transient failure: preserve RT, show anonymous, schedule one retry
        setState({ status: 'anonymous', user: null, station: null, error: null });

        retryTimerRef.current = setTimeout(async () => {
          retryTimerRef.current = null;
          const rt = refreshTokenRef.current;
          if (!rt) return;
          try {
            const retryData = await deduplicatedRefresh(rt, () => api.refresh(rt));
            await applyTokenRotation(retryData.accessToken, retryData.refreshToken);
            await loadAuthenticatedState();
          } catch {
            // Second transient failure: remain anonymous; RT preserved for next launch
          }
        }, 10_000);
      }
    }

    initialize().catch(() => {
      setState({ status: 'anonymous', user: null, station: null, error: null });
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App foreground: ensure fresh token ────────────────────────────────────

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && state.status === 'authenticated') {
          ensureFreshToken().catch(() => {
            // Handled inside ensureFreshToken / performRefresh
          });
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [state.status, ensureFreshToken]);

  // ── requestCode ────────────────────────────────────────────────────────────

  const requestCode = useCallback(
    async (email: string): Promise<{ pendingId: string }> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const data = await api.requestCode(email, spaceSlug);
        setState((s) => ({ ...s, status: 'otp-sent' }));
        return { pendingId: data.pendingId };
      } catch (err: unknown) {
        const message =
          (err as { message?: string })?.message ??
          'Failed to send verification code. Please try again.';
        setState((s) => ({ ...s, error: message }));
        throw err;
      }
    },
    [api, spaceSlug]
  );

  // ── verifyCode ─────────────────────────────────────────────────────────────

  const verifyCode = useCallback(
    async (pendingId: string, code: string): Promise<void> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const data = await api.verifyCode(pendingId, code, spaceSlug);

        // Persist RT only; keep AT in memory
        await applyTokenRotation(data.accessToken, data.refreshToken);

        setState({
          status: 'authenticated',
          user: {
            id: data.user.id,
            displayName: data.user.displayName,
            avatarUrl: data.user.avatarUrl,
            permissions: data.user.permissions,
            roles: data.user.roles,
          },
          station: {
            id: data.station.id,
            name: data.station.name,
            slug: data.station.slug,
          },
          error: null,
        });
      } catch (err: unknown) {
        const message =
          (err as { message?: string })?.message ??
          'Invalid or expired code. Please try again.';
        setState((s) => ({ ...s, error: message }));
        throw err;
      }
    },
    [api, spaceSlug, applyTokenRotation]
  );

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    const rt = refreshTokenRef.current;

    // POST { refreshToken } in request body — no Authorization header
    try {
      await fetch(`${serverUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
    } catch {
      // Ignore server errors — proceed with local logout regardless
    }

    await clearAuthState();
    onSessionEnded?.('logout');
  }, [serverUrl, clearAuthState, onSessionEnded]);

  return {
    ...state,
    requestCode,
    verifyCode,
    logout,
    ensureFreshToken,
    getToken,
  };
}
