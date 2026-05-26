// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * UserListModal — shows the full list of online users in a modal dialog.
 *
 * Opened by tapping the listener-count icon in the header. Useful at narrow
 * widths where the sidebar user list is hidden.
 *
 * Dismiss by: clicking the backdrop, the ✕ button, or pressing Escape.
 */

import React, { useEffect, useCallback } from 'react';
import type { OnlineUser } from '../hooks/useRelayaChat.js';

interface UserListModalProps {
  users: OnlineUser[];
  currentUserId: string;
  onClose: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UserListModal({ users, currentUserId, onClose }: UserListModalProps) {
  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal user-list-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="modal__title user-list-modal__header">
          <span>Online — {users.length}</span>
          <button
            className="btn btn--icon user-list-modal__close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── User list ── */}
        <div className="modal__body user-list-modal__body">
          {users.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>No listeners online.</p>
          ) : (
            users.map((user) => (
              <div key={user.id} className="user-list__item user-list-modal__item">
                <div className="user-list__avatar">{getInitials(user.displayName)}</div>
                <span className="user-list__name">{user.displayName}</span>
                {user.id === currentUserId && (
                  <span className="user-list__self-badge">you</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
