// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaAuth — AsyncStorage-based authentication for React Native / Expo.
 *
 * Manages the full OTP authentication lifecycle:
 * - On mount: read token from AsyncStorage → GET /api/chat/:slug/me → set state
 * - requestCode(email) → POST /auth/request-code → returns pendingId
 * - verifyCode(pendingId, code) → POST /auth/verify-code → store JWT → authenticated
 * - logout() → POST /auth/logout → delete AsyncStorage entry → anonymous
 * - refresh() → POST /auth/refresh → replace stored token (call on app foreground)
 *
 * Uses Bearer token auth (not cookies). The host app installs
 * @react-native-async-storage/async-storage as a peer dependency.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from '@relaya-chat/core';
import type { Permission, Role } from '@relaya-chat/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | 'loading'        // initial AsyncStorage check in progress
  | 'anonymous'      // no session; can view read-only
  | 'otp-sent'       // OTP email sent; waiting for user to enter code
  | 'authenticated'; // JWT valid; full chat access

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
  stationSlug: string;
  /** AsyncStorage key for the JWT (default: 'relaya_token') */
  tokenStorageKey?: string;
}

export interface RelayaAuthActions {
  /** Send a 6-digit OTP to the given email. Returns pendingId for verifyCode(). */
  requestCode: (email: string) => Promise<{ pendingId: string }>;
  /** Verify the OTP code. On success, stores JWT and transitions to 'authenticated'. */
  verifyCode: (pendingId: string, code: string) => Promise<void>;
  /** Log out: call server endpoint, delete stored token, transition to 'anonymous'. */
  logout: () => Promise<void>;
  /** Refresh the stored JWT. Call when app returns to foreground. */
  refresh: () => Promise<void>;
  /** Returns the current JWT synchronously (from ref). Used by ApiClient and ChatConnection. */
  getToken: () => string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelayaAuth(
  options: RelayaAuthOptions
): RelayaAuthState & RelayaAuthActions {
  const { serverUrl, stationSlug, tokenStorageKey = 'relaya_token' } = options;

  const [state, setState] = useState<RelayaAuthState>({
    status: 'loading',
    user: null,
    station: null,
    error: null,
  });

  // Token ref — always holds the latest JWT without triggering re-renders.
  // getToken() reads from here so callers always get the freshest value.
  const tokenRef = useRef<string | null>(null);

  const getToken = useCallback((): string | null => tokenRef.current, []);

  // Shared ApiClient — uses getToken callback so it always sends the latest JWT.
  const api = useRef(new ApiClient(serverUrl, getToken)).current;

  // Guard against React StrictMode double-invocation
  const initStartedRef = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const storeToken = useCallback(async (token: string): Promise<void> => {
    tokenRef.current = token;
    await AsyncStorage.setItem(tokenStorageKey, token);
  }, [tokenStorageKey]);

  const clearToken = useCallback(async (): Promise<void> => {
    tokenRef.current = null;
    await AsyncStorage.removeItem(tokenStorageKey);
  }, [tokenStorageKey]);

  // ── Initial auth check ─────────────────────────────────────────────────────

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    async function initialize(): Promise<void> {
      // 1. Read stored token from AsyncStorage
      const storedToken = await AsyncStorage.getItem(tokenStorageKey);

      if (!storedToken) {
        setState((s) => ({ ...s, status: 'anonymous' }));
        return;
      }

      // 2. Validate token by calling GET /me
      tokenRef.current = storedToken;
      try {
        const meData = await api.getMe(stationSlug);
        const stationData = await api.getStation(stationSlug);

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
      } catch {
        // Token invalid or expired — clear it and go anonymous
        tokenRef.current = null;
        await AsyncStorage.removeItem(tokenStorageKey);
        setState({ status: 'anonymous', user: null, station: null, error: null });
      }
    }

    initialize().catch(() => {
      setState({ status: 'anonymous', user: null, station: null, error: null });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App foreground token refresh ───────────────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    const currentToken = tokenRef.current;
    if (!currentToken) return;

    try {
      const data = await api.refresh(currentToken);
      await storeToken(data.accessToken);
    } catch {
      // Refresh failed — token may be expired; transition to anonymous
      await clearToken();
      setState({ status: 'anonymous', user: null, station: null, error: null });
    }
  }, [api, storeToken, clearToken]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active' && tokenRef.current) {
          refresh().catch(() => {
            // Handled inside refresh()
          });
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [refresh]);

  // ── requestCode ────────────────────────────────────────────────────────────

  const requestCode = useCallback(
    async (email: string): Promise<{ pendingId: string }> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const data = await api.requestCode(email, stationSlug);
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
    [api, stationSlug]
  );

  // ── verifyCode ─────────────────────────────────────────────────────────────

  const verifyCode = useCallback(
    async (pendingId: string, code: string): Promise<void> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const data = await api.verifyCode(pendingId, code, stationSlug);
        await storeToken(data.accessToken);

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
    [api, stationSlug, storeToken]
  );

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${serverUrl}/auth/logout`, {
        method: 'POST',
        headers: tokenRef.current
          ? { Authorization: `Bearer ${tokenRef.current}` }
          : {},
      });
    } catch {
      // Ignore server errors — proceed with local logout regardless
    }

    await clearToken();
    setState({ status: 'anonymous', user: null, station: null, error: null });
  }, [serverUrl, clearToken]);

  return {
    ...state,
    requestCode,
    verifyCode,
    logout,
    refresh,
    getToken,
  };
}
