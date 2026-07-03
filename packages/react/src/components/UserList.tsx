// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import type { UserInfo } from '@relaya-chat/core';
import type { OnlineUser } from '../hooks/useRelayaChat.js';
import { buildBlockedRows } from './userListUtils.js';

interface UserListProps {
  users: OnlineUser[];
  currentUserId: string;
  blockedUserIds?: string[];
  onUnblock?: (userId: string) => Promise<void>;
  /** Resolves a user's directory entry (from useRelayaChat), used to look up
   *  display names for blocked users who aren't currently online. */
  getUserInfo?: (userId: string) => UserInfo | undefined;
  style?: React.CSSProperties;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UserList({
  users,
  currentUserId,
  blockedUserIds = [],
  onUnblock,
  getUserInfo,
  style,
}: UserListProps) {
  const cmpName = (a: OnlineUser, b: OnlineUser) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base', numeric: true });

  const blockedIdSet = new Set(blockedUserIds);
  const unblockedUsers = users.filter((u) => !blockedIdSet.has(u.id)).sort(cmpName);

  // Built from blockedUserIds directly (not filtered from the online-only
  // `users` list) so a blocked user who is offline still appears with an
  // actionable Unblock control.
  const blockedRows = buildBlockedRows(blockedUserIds, users, getUserInfo);

  return (
    <div className="user-list" style={style}>
      <div className="user-list__title">Online — {users.length}</div>
      {unblockedUsers.map((user) => (
        <div key={user.id} className="user-list__item">
          <div className="user-list__avatar">{getInitials(user.displayName)}</div>
          <span className="user-list__name">{user.displayName}</span>
          {user.id === currentUserId && (
            <span className="user-list__self-badge">you</span>
          )}
        </div>
      ))}
      {blockedRows.length > 0 && (
        <>
          {blockedRows.map((row, index) => (
            <div
              key={row.id}
              className="user-list__item user-list__item--blocked"
              style={index === 0 ? { marginTop: '12px' } : undefined}
            >
              <div className="user-list__avatar user-list__avatar--blocked">{getInitials(row.displayName)}</div>
              <span
                className={
                  row.isOnline
                    ? 'user-list__name'
                    : 'user-list__name user-list__name--blocked'
                }
              >
                {row.displayName}
              </span>
              {onUnblock && (
                <button
                  className="user-list__unblock-btn"
                  onClick={() => {
                    onUnblock(row.id).catch((err) => {
                      console.error('Failed to unblock user:', err);
                    });
                  }}
                  title={`Unblock ${row.displayName}`}
                >
                  Unblock
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
