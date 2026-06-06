// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk

import type { ApiClient } from '@relaya-chat/core';
import type { AuthState, AuthUser } from './authTypes.js';

type AuthStateApi = Pick<ApiClient, 'getMe' | 'getStation'>;

export async function loadAuthenticatedState(
  api: AuthStateApi,
  stationSlug: string,
  accessToken: string
): Promise<AuthState> {
  const meData = await api.getMe(stationSlug).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[RelayaAuth] getMe failed during token apply', { spaceSlug: stationSlug, err });
    }
    throw err;
  });
  const stationData = await api.getStation(stationSlug).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[RelayaAuth] getStation failed during token apply', { spaceSlug: stationSlug, err });
    }
    throw err;
  });

  return {
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
      headerName: ((stationData as unknown) as Record<string, unknown>).headerName as string | null ?? null,
    },
    stationSlug: stationData.slug,
    error: null,
  };
}