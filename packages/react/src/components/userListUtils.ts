// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import type { UserInfo } from '@relaya-chat/core';
import type { OnlineUser } from '../hooks/useRelayaChat.js';

export interface BlockedRow {
  id: string;
  displayName: string;
  /** True when this blocked user is currently in the online presence list. */
  isOnline: boolean;
}

/**
 * Builds the rows shown in the "blocked users" section of UserList, sourced
 * from blockedUserIds directly (not filtered from the online-only users list)
 * so a blocked user who is offline (or was never seen this session) still
 * appears with an actionable Unblock control.
 *
 * Display name resolution order: the online users list (freshest data for
 * currently-connected users), then the session user directory (getUserInfo),
 * then a fallback for a user blocked in a prior session who hasn't been seen
 * this session at all.
 */
export function buildBlockedRows(
  blockedUserIds: string[],
  users: OnlineUser[],
  getUserInfo?: (userId: string) => UserInfo | undefined
): BlockedRow[] {
  const onlineById = new Map(users.map((u) => [u.id, u]));

  const rows = blockedUserIds.map((id) => {
    const onlineUser = onlineById.get(id);
    const displayName =
      onlineUser?.displayName ?? getUserInfo?.(id)?.displayName ?? 'Unknown User';
    return { id, displayName, isOnline: onlineUser !== undefined };
  });

  return rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base', numeric: true })
  );
}
