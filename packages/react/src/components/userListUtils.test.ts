// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { describe, expect, it } from 'vitest';
import { buildBlockedRows } from './userListUtils.js';
import type { OnlineUser } from '../hooks/useRelayaChat.js';
import type { UserInfo } from '@relaya-chat/core';

describe('buildBlockedRows', () => {
  it('includes a blocked user who is not currently online', () => {
    const rows = buildBlockedRows(['u1'], [], () => undefined);
    expect(rows).toEqual([{ id: 'u1', displayName: 'Unknown User', isOnline: false }]);
  });

  it('resolves display name via getUserInfo for an offline blocked user seen earlier this session', () => {
    const getUserInfo = (id: string): UserInfo | undefined =>
      id === 'u1' ? { id: 'u1', displayName: 'Alice', avatarUrl: null } : undefined;
    const rows = buildBlockedRows(['u1'], [], getUserInfo);
    expect(rows).toEqual([{ id: 'u1', displayName: 'Alice', isOnline: false }]);
  });

  it('marks a blocked user as online and prefers the online list display name', () => {
    const users: OnlineUser[] = [{ id: 'u1', displayName: 'Alice Online', avatarUrl: null }];
    const getUserInfo = (): UserInfo | undefined => ({
      id: 'u1',
      displayName: 'Stale Directory Name',
      avatarUrl: null,
    });
    const rows = buildBlockedRows(['u1'], users, getUserInfo);
    expect(rows).toEqual([{ id: 'u1', displayName: 'Alice Online', isOnline: true }]);
  });

  it('falls back to "Unknown User" when neither online list nor directory has the id', () => {
    const rows = buildBlockedRows(['ghost'], [], undefined);
    expect(rows).toEqual([{ id: 'ghost', displayName: 'Unknown User', isOnline: false }]);
  });

  it('excludes non-blocked users entirely', () => {
    const users: OnlineUser[] = [
      { id: 'u1', displayName: 'Alice', avatarUrl: null },
      { id: 'u2', displayName: 'Bob', avatarUrl: null },
    ];
    const rows = buildBlockedRows(['u2'], users, () => undefined);
    expect(rows).toEqual([{ id: 'u2', displayName: 'Bob', isOnline: true }]);
  });

  it('sorts blocked rows by resolved display name', () => {
    const users: OnlineUser[] = [{ id: 'u2', displayName: 'Zeta', avatarUrl: null }];
    const getUserInfo = (id: string): UserInfo | undefined =>
      id === 'u1' ? { id: 'u1', displayName: 'Alpha', avatarUrl: null } : undefined;
    const rows = buildBlockedRows(['u2', 'u1'], users, getUserInfo);
    expect(rows.map((r) => r.id)).toEqual(['u1', 'u2']);
  });
});
