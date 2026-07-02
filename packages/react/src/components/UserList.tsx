// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import type { OnlineUser } from '../hooks/useRelayaChat.js';

interface UserListProps {
  users: OnlineUser[];
  currentUserId: string;
  blockedUserIds?: string[];
  onUnblock?: (userId: string) => Promise<void>;
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

export default function UserList({ users, currentUserId, blockedUserIds = [], onUnblock, style }: UserListProps) {
  // Find blocked users who have a known displayName from the online user directory
  // (they may not be online — we use a separate map built from blockedUserIds + getUserInfo)
  // For simplicity, we show any online user who is blocked, so the list is actionable.
  const cmpName = (a: OnlineUser, b: OnlineUser) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base', numeric: true });

  const blockedOnlineUsers = users.filter((u) => blockedUserIds.includes(u.id)).sort(cmpName);
  const unblockedUsers = users.filter((u) => !blockedUserIds.includes(u.id)).sort(cmpName);

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
      {blockedOnlineUsers.length > 0 && (
        <>
          {blockedOnlineUsers.map((user, index) => (
            <div key={user.id} className="user-list__item user-list__item--blocked" style={index === 0 ? { marginTop: '12px' } : undefined}>
              <div className="user-list__avatar user-list__avatar--blocked">{getInitials(user.displayName)}</div>
              <span className="user-list__name user-list__name--blocked">{user.displayName}</span>
              {onUnblock && (
                <button
                  className="user-list__unblock-btn"
                  onClick={() => {
                    onUnblock(user.id).catch((err) => {
                      console.error('Failed to unblock user:', err);
                    });
                  }}
                  title={`Unblock ${user.displayName}`}
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
