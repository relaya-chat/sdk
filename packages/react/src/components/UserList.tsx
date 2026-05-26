// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';
import type { OnlineUser } from '../hooks/useRelayaChat.js';

interface UserListProps {
  users: OnlineUser[];
  currentUserId: string;
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

export default function UserList({ users, currentUserId, style }: UserListProps) {
  return (
    <div className="user-list" style={style}>
      <div className="user-list__title">Online — {users.length}</div>
      {users.map((user) => (
        <div key={user.id} className="user-list__item">
          <div className="user-list__avatar">{getInitials(user.displayName)}</div>
          <span className="user-list__name">{user.displayName}</span>
          {user.id === currentUserId && (
            <span className="user-list__self-badge">you</span>
          )}
        </div>
      ))}
    </div>
  );
}
