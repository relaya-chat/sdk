// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useBans — fetch and lift active bans for moderators.
 *
 * Loads the list of currently-active bans for the station and provides a
 * `liftBan` action that lifts a single ban and reloads the list.
 */

import { useState, useCallback, useRef } from 'react';
import { ApiClient, PERMISSIONS } from '@relaya-chat/core';
import type { AuthActions, AuthUser } from './useRelayaAuth.js';
import { API_BASE_URL } from '../config.js';

export interface BanEntry {
  banId: string;
  user: { userId: string; displayName: string };
  reason: string | null;
  bannedBy: { userId: string; displayName: string };
  expiresAt: string | null;
  isPermanent: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface BansState {
  bans: BanEntry[];
  loading: boolean;
  /** banId currently being lifted (used to disable per-row button) */
  lifting: string | null;
  error: string | null;
}

export interface BansActions {
  loadBans: () => Promise<void>;
  liftBan: (banId: string) => Promise<void>;
}

export function useBans(
  stationSlug: string,
  user: AuthUser | null,
  getToken: AuthActions['getToken']
): BansState & BansActions {
  const [state, setState] = useState<BansState>({
    bans: [],
    loading: false,
    lifting: null,
    error: null,
  });

  const canModerate = user?.permissions.includes(PERMISSIONS.BAN_USER) ?? false;
  const apiRef = useRef(new ApiClient(API_BASE_URL, getToken));

  const loadBans = useCallback(async () => {
    if (!canModerate || !stationSlug) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiRef.current.getBans(stationSlug, true);
      // getBans returns { bans: BanWithUser[] } — cast through unknown since
      // the API response shape is richer than the shared type definition.
      const bans = (res.bans as unknown) as BanEntry[];
      setState((s) => ({ ...s, bans, loading: false }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as { message?: string })?.message ?? 'Failed to load bans',
      }));
    }
  }, [canModerate, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const liftBan = useCallback(async (banId: string) => {
    if (!canModerate) return;
    setState((s) => ({ ...s, lifting: banId, error: null }));
    try {
      await apiRef.current.liftBan(stationSlug, banId);
      setState((s) => ({ ...s, lifting: null }));
      await loadBans();
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        lifting: null,
        error: (err as { message?: string })?.message ?? 'Failed to lift ban',
      }));
      throw err;
    }
  }, [canModerate, stationSlug, loadBans]);

  return { ...state, loadBans, liftBan };
}
