// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * usePresenceConfig — fetch and update the presence grace period setting.
 * Only used by station_admin users.
 */

import { useState, useCallback } from 'react';
import { ApiClient, PERMISSIONS } from '@relaya-chat/core';
import type { PresenceConfig } from '@relaya-chat/core';
import type { AuthActions, AuthUser } from './useRelayaAuth.js';
import { useServerUrl } from '../contexts/RelayaServerContext.js';

export interface PresenceConfigState {
  config: PresenceConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export interface PresenceConfigActions {
  loadConfig: () => Promise<void>;
  updateConfig: (updates: Partial<PresenceConfig>) => Promise<void>;
}

export function usePresenceConfig(
  stationSlug: string,
  user: AuthUser | null,
  getToken: AuthActions['getToken']
): PresenceConfigState & PresenceConfigActions {
  const [state, setState] = useState<PresenceConfigState>({
    config: null,
    loading: false,
    saving: false,
    error: null,
  });

  const serverUrl = useServerUrl();
  const api = new ApiClient(serverUrl, getToken);

  const isAdmin = user?.permissions.includes(PERMISSIONS.MANAGE_ROLES) ?? false;

  const loadConfig = useCallback(async () => {
    if (!isAdmin || !stationSlug) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.getPresenceConfig(stationSlug);
      setState((s) => ({ ...s, config: res.config, loading: false }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as { message?: string })?.message ?? 'Failed to load presence config',
      }));
    }
  }, [isAdmin, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = useCallback(async (updates: Partial<PresenceConfig>) => {
    if (!isAdmin || !stationSlug) return;
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await api.updatePresenceConfig(stationSlug, updates);
      setState((s) => ({ ...s, config: res.config, saving: false }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        saving: false,
        error: (err as { message?: string })?.message ?? 'Failed to update presence config',
      }));
    }
  }, [isAdmin, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, loadConfig, updateConfig };
}
