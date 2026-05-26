// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * BanManagement — collapsible panel listing active bans with a Lift button.
 *
 * Accessible to any user with BAN_USER permission (moderator+).
 * Loads the active ban list when the panel is first opened and reloads
 * automatically after each lift action.
 */

import React, { useState, useEffect } from 'react';
import { PERMISSIONS } from '@relaya-chat/core';
import { useBans } from '../hooks/useBans.js';
import type { AuthActions, AuthUser } from '../hooks/useRelayaAuth.js';

interface BanManagementProps {
  stationSlug: string;
  user: AuthUser;
  getToken: AuthActions['getToken'];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExpiry(expiresAt: string | null, isPermanent: boolean): string {
  if (isPermanent || !expiresAt) return 'Permanent';
  const d = new Date(expiresAt);
  const now = new Date();
  if (d < now) return 'Expired';
  return `Expires ${formatTimestamp(expiresAt)}`;
}

export default function BanManagement({ stationSlug, user, getToken }: BanManagementProps) {
  const [open, setOpen] = useState(false);

  const { bans, loading, lifting, error, loadBans, liftBan } = useBans(
    stationSlug,
    user,
    getToken
  );

  // Load the list when the panel is first opened.
  // Must come before any conditional return (Rules of Hooks).
  useEffect(() => {
    if (open) {
      loadBans();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canModerate = user.permissions.includes(PERMISSIONS.BAN_USER);
  if (!canModerate) return null;

  return (
    <div className="ban-management">
      <button
        className="ban-management__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>
          Active bans
          {bans.length > 0 && (
            <span
              className="ban-management__badge"
              aria-label={`${bans.length} active bans`}
            >
              {bans.length}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="ban-management__panel">
          {error && <p className="ban-management__error">{error}</p>}

          {loading && <p className="ban-management__loading">Loading…</p>}

          {!loading && bans.length === 0 && (
            <p className="ban-management__empty">No active bans. ✓</p>
          )}

          {bans.map((ban) => {
            const isLifting = lifting === ban.banId;
            return (
              <div key={ban.banId} className="ban-card">
                <div className="ban-card__header">
                  <span className="ban-card__user">{ban.user.displayName}</span>
                  <span
                    className={`ban-card__expiry${ban.isPermanent ? ' ban-card__expiry--permanent' : ''}`}
                  >
                    {formatExpiry(ban.expiresAt, ban.isPermanent)}
                  </span>
                </div>

                <div className="ban-card__details">
                  {ban.reason && (
                    <span>
                      <strong>Reason:</strong> {ban.reason}
                    </span>
                  )}
                  <span>
                    <strong>Banned by:</strong> {ban.bannedBy.displayName}
                  </span>
                  <span>
                    <strong>Banned at:</strong> {formatTimestamp(ban.createdAt)}
                  </span>
                </div>

                <div className="ban-card__actions">
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 12, padding: '3px 10px' }}
                    onClick={() => liftBan(ban.banId)}
                    disabled={isLifting}
                    title="Remove this ban and allow the user to rejoin"
                  >
                    {isLifting ? '…' : 'Lift ban'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
