// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useEffect, useRef, useState } from 'react';
import { ApiClient, PERMISSIONS } from '@relaya-chat/core';
import type { AdminMember } from '@relaya-chat/core';
import { API_BASE_URL } from '../config.js';
import type { AuthActions, AuthUser } from '../hooks/useRelayaAuth.js';

interface ModeratorAdminPageProps {
  stationSlug: string;
  user: AuthUser;
  getToken: AuthActions['getToken'];
}

function memberLabel(m: AdminMember): string {
  return m.email ? `${m.displayName} (${m.email})` : m.displayName;
}

function quotaLabel(used: number, limit: number | null): string {
  if (limit === null) {
    return `${used} moderator${used === 1 ? '' : 's'} — unlimited slots`;
  }
  return `${used} of ${limit} moderator slot${limit === 1 ? '' : 's'} used`;
}

export default function ModeratorAdminPage({
  stationSlug,
  user,
  getToken,
}: ModeratorAdminPageProps) {
  const api = useRef(new ApiClient(API_BASE_URL, getToken)).current;

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);
  const [demoting, setDemoting] = useState<string | null>(null);

  const canManage = user.permissions.includes(PERMISSIONS.MANAGE_ROLES);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMembersAdmin(stationSlug);
      setMembers(result.members);
      setQuota(result.quota);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load moderators.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) return;
    loadMembers().catch(() => undefined);
  }, [canManage, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canManage) return null;

  // Derived lists
  const currentModerators = members.filter((m) => m.roles.includes('moderator'));
  const nonModerators = members.filter(
    (m) => !m.roles.includes('moderator') && !m.roles.includes('station_admin')
  );

  const filterLower = filter.trim().toLowerCase();
  const filteredNonModerators =
    filterLower === ''
      ? nonModerators
      : nonModerators.filter(
          (m) =>
            m.displayName.toLowerCase().includes(filterLower) ||
            (m.email ?? '').toLowerCase().includes(filterLower)
        );

  const atLimit =
    quota !== null && quota.limit !== null && quota.used >= quota.limit;
  const isBusy = promoting !== null || demoting !== null;

  async function handlePromote(userId: string) {
    setPromoting(userId);
    setError(null);
    try {
      await api.patchMemberRoles(stationSlug, userId, { add: ['moderator'] });
      await loadMembers();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to promote member.');
    } finally {
      setPromoting(null);
    }
  }

  async function handleDemote(userId: string) {
    setDemoting(userId);
    setError(null);
    try {
      await api.patchMemberRoles(stationSlug, userId, { remove: ['moderator'] });
      await loadMembers();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to demote moderator.');
    } finally {
      setDemoting(null);
    }
  }

  return (
    <div className="moderator-admin-page">
      <div className="moderator-admin-page__topbar">
        <div className="moderator-admin-page__title-row">
          <h2 className="moderator-admin-page__title">Moderators</h2>
          {quota && (
            <span className="sticker-admin-page__count">
              {quotaLabel(quota.used, quota.limit)}
            </span>
          )}
        </div>
      </div>

      {error && <div className="sticker-admin-page__error">{error}</div>}

      {loading ? (
        <div className="sticker-admin-page__state">Loading moderators…</div>
      ) : (
        <>
          {/* Current moderators */}
          <div className="moderator-admin-page__section">
            <h3 className="moderator-admin-page__section-title">Current moderators</h3>
            <hr className="moderator-admin-page__divider" />
            {currentModerators.length === 0 ? (
              <div className="sticker-admin-page__state">No moderators assigned yet.</div>
            ) : (
              <ul className="moderator-admin-page__list">
                {currentModerators.map((m) => (
                  <li key={m.userId} className="moderator-admin-page__item">
                    <button
                      className="moderator-admin-page__demote-link"
                      onClick={() => handleDemote(m.userId)}
                      disabled={isBusy}
                    >
                      {demoting === m.userId ? 'Demoting…' : 'Demote'}
                    </button>
                    <span className="moderator-admin-page__member-label">
                      {memberLabel(m)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add a moderator */}
          <div className="moderator-admin-page__section">
            <h3 className="moderator-admin-page__section-title">Add a moderator</h3>
            <hr className="moderator-admin-page__divider" />
            <input
              className="moderator-admin-page__filter"
              type="text"
              placeholder="Filter by name or email"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <p className="moderator-admin-page__list-hint">Recent users</p>
            {filteredNonModerators.length === 0 ? (
              <div className="sticker-admin-page__state">
                {filter
                  ? 'No members match that filter.'
                  : 'No members available to promote.'}
              </div>
            ) : (
              <ul className="moderator-admin-page__list">
                {filteredNonModerators.map((m) => (
                  <li key={m.userId} className="moderator-admin-page__item">
                    <button
                      className="moderator-admin-page__promote-link"
                      onClick={() => handlePromote(m.userId)}
                      disabled={atLimit || isBusy}
                      title={
                        atLimit
                          ? 'Moderator limit reached for your plan'
                          : undefined
                      }
                    >
                      {promoting === m.userId ? 'Promoting…' : 'Promote'}
                    </button>
                    <span className="moderator-admin-page__member-label">
                      {memberLabel(m)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
