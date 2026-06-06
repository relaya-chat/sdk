// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk

import type { AuthRefreshResponse } from '@relaya-chat/core';

const REFRESH_TOKEN_KEY = 'relaya_refresh_token';

type RefreshClient = {
  refresh: (refreshToken: string) => Promise<AuthRefreshResponse>;
};

export type RefreshFailureReason = 'auth-failed' | 'transient' | 'race-lost';

export type RefreshResult =
  | (AuthRefreshResponse & { ok: true; attemptedRefreshToken: string })
  | { ok: false; reason: RefreshFailureReason; failedRefreshToken: string; error: unknown };

export function tryStoreRefreshToken(rt: string): void {
  try { localStorage.setItem(REFRESH_TOKEN_KEY, rt); } catch { /* unavailable */ }
}

export function restoreRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_TOKEN_KEY); } catch { return null; }
}

export function clearStoredRefreshToken(): void {
  try { localStorage.removeItem(REFRESH_TOKEN_KEY); } catch { /* unavailable */ }
}

export function clearStoredRefreshTokenIfCurrent(rt: string): void {
  try {
    if (localStorage.getItem(REFRESH_TOKEN_KEY) === rt) {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* unavailable */
  }
}

export function decodeJwtExp(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.');
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

export function isAuthRefreshError(err: unknown): boolean {
  return err != null && typeof err === 'object' && 'status' in err &&
    ((err as { status: number }).status === 401 || (err as { status: number }).status === 403);
}

// Same-JS-realm refresh dedupe. Browser tabs have separate JS heaps, so this
// prevents duplicate refresh calls within one tab only; cross-tab coordination is
// a separate concern.
let refreshPromise: Promise<AuthRefreshResponse> | null = null;

function refreshOnce(api: RefreshClient, refreshToken: string): Promise<AuthRefreshResponse> {
  if (!refreshPromise) {
    refreshPromise = api.refresh(refreshToken).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/**
 * Refreshes an AT/RT pair and handles the common cross-tab rotation race.
 *
 * If the attempted RT returns 401/403 but localStorage now contains a different
 * RT, another tab probably won the rotation race. We retry the newer stored RT
 * before treating the session as expired/revoked.
 */
export async function refreshWithRaceRecovery(
  api: RefreshClient,
  initialRefreshToken: string,
  options: { manageOwnRefreshToken: boolean; storageRecoveryAttempts?: number }
): Promise<RefreshResult> {
  const attempted = new Set<string>();
  let refreshToken = initialRefreshToken;
  let storageRecoveryAttempts = options.storageRecoveryAttempts ?? 1;

  while (true) {
    attempted.add(refreshToken);

    try {
      const result = await refreshOnce(api, refreshToken);
      return { ok: true, attemptedRefreshToken: refreshToken, ...result };
    } catch (error) {
      if (!isAuthRefreshError(error)) {
        return { ok: false, reason: 'transient', failedRefreshToken: refreshToken, error };
      }

      const storedRefreshToken = options.manageOwnRefreshToken ? restoreRefreshToken() : null;
      if (
        storedRefreshToken &&
        storedRefreshToken !== refreshToken &&
        !attempted.has(storedRefreshToken) &&
        storageRecoveryAttempts > 0
      ) {
        refreshToken = storedRefreshToken;
        storageRecoveryAttempts -= 1;
        continue;
      }

      return {
        ok: false,
        reason: storedRefreshToken && storedRefreshToken !== refreshToken ? 'race-lost' : 'auth-failed',
        failedRefreshToken: refreshToken,
        error,
      };
    }
  }
}

const verifyTokenPromises = new Map<string, Promise<AuthRefreshResponse>>();

export function verifyOneTimeToken(baseUrl: string, token: string, stationSlug: string): Promise<AuthRefreshResponse> {
  const cacheKey = `${stationSlug}:${token}`;
  const cached = verifyTokenPromises.get(cacheKey);
  if (cached) return cached;

  const promise = fetch(`${baseUrl}/auth/verify?token=${encodeURIComponent(token)}&station=${encodeURIComponent(stationSlug)}`)
    .then(r => r.ok ? r.json() : Promise.reject()) as Promise<AuthRefreshResponse>;
  verifyTokenPromises.set(cacheKey, promise);
  promise.finally(() => {
    window.setTimeout(() => { verifyTokenPromises.delete(cacheKey); }, 5 * 60 * 1000);
  }).catch(() => { /* keep rejection handled for callers */ });
  return promise;
}