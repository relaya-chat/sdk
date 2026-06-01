// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useModerationConfig — fetch and update moderation thresholds.
 * Only used by station_admin users.
 */

import { useState, useCallback } from 'react';
import { ApiClient, PERMISSIONS } from '@relaya-chat/core';
import type { ModerationConfig } from '@relaya-chat/core';
import type { AuthActions, AuthUser } from './useRelayaAuth.js';
import { useServerUrl } from '../contexts/RelayaServerContext.js';

export interface ModerationConfigState {
  config: ModerationConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  note: string | null;
}

export interface ModerationConfigActions {
  loadConfig: () => Promise<void>;
  updateConfig: (updates: Partial<ModerationConfig>) => Promise<void>;
}

export function useModerationConfig(
  stationSlug: string,
  user: AuthUser | null,
  getToken: AuthActions['getToken']
): ModerationConfigState & ModerationConfigActions {
  const [state, setState] = useState<ModerationConfigState>({
    config: null,
    loading: false,
    saving: false,
    error: null,
    note: null,
  });

  const serverUrl = useServerUrl();
  const api = new ApiClient(serverUrl, getToken);

  const isAdmin = user?.permissions.includes(PERMISSIONS.MANAGE_ROLES) ?? false;

  const loadConfig = useCallback(async () => {
    if (!isAdmin || !stationSlug) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.getModerationConfig(stationSlug);
      setState((s) => ({
        ...s,
        config: res.config,
        note: res.note,
        loading: false,
      }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as { message?: string })?.message ?? 'Failed to load config',
      }));
    }
  }, [isAdmin, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = useCallback(async (updates: Partial<ModerationConfig>) => {
    if (!isAdmin || !stationSlug) return;
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await api.updateModerationConfig(stationSlug, updates);
      setState((s) => ({
        ...s,
        config: res.config,
        note: res.note,
        saving: false,
      }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        saving: false,
        error: (err as { message?: string })?.message ?? 'Failed to update config',
      }));
    }
  }, [isAdmin, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, loadConfig, updateConfig };
}
