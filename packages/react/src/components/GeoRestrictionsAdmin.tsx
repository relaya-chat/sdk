// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * GeoRestrictionsAdmin — country restrictions + IP ban management.
 *
 * Admin-only (MANAGE_ROLES). Rendered inside a collapsible wrapper in AdminPanel.
 * Fetches geo config on open; shows "not available" if tier is embed (TIER_LIMIT).
 *
 * UX:
 *  - Country restrictions: searchable combobox to add, chips with × to remove.
 *  - IP bans: filterable list + collapsible "Add IP ban" form.
 */

import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config.js';
import type { AuthActions } from '../hooks/useRelayaAuth.js';
import { SORTED_COUNTRIES, countryChipLabel, countryLabel } from './countryNames.js';

interface GeoRestrictionsAdminProps {
  stationSlug: string;
  getToken: AuthActions['getToken'];
}

interface GeoConfig {
  mode: 'allowlist' | 'blocklist' | null;
  countries: string[];
}

interface IpBan {
  id: string;
  ipAddress: string;
  reason: string | null;
  expiresAt: string | null;
  isPermanent: boolean;
  createdAt: string;
}

function authHeaders(getToken: AuthActions['getToken']): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatExpiry(ban: IpBan): string {
  if (ban.isPermanent || !ban.expiresAt) return 'Permanent';
  const d = new Date(ban.expiresAt);
  if (d < new Date()) return 'Expired';
  return `Until ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function GeoRestrictionsAdmin({ stationSlug, getToken }: GeoRestrictionsAdminProps) {
  const base = `${API_BASE_URL}/api/chat/${stationSlug}`;

  // ── state ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [tierLimited, setTierLimited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoConfig>({ mode: null, countries: [] });
  const [ipBans, setIpBans] = useState<IpBan[]>([]);

  // country combobox
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // ip ban list
  const [banFilter, setBanFilter] = useState('');
  const [addBanOpen, setAddBanOpen] = useState(false);
  const [banIp, setBanIp] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const hdrs = { ...authHeaders(getToken), 'Content-Type': 'application/json' };
        const [geoRes, bansRes] = await Promise.all([
          fetch(`${base}/geo/config`, { credentials: 'include', headers: hdrs }),
          fetch(`${base}/ip-bans`,   { credentials: 'include', headers: hdrs }),
        ]);

        if (geoRes.status === 403) {
          let d: any = {};
          try { d = await geoRes.json(); } catch { /* ignore */ }
          if (typeof d.error === 'object' && d.error?.code === 'TIER_LIMIT') {
            setTierLimited(true);
            setLoading(false);
            return;
          }
        }

        if (!geoRes.ok) throw new Error('Failed to load geo config');
        if (!bansRes.ok) throw new Error('Failed to load IP bans');

        const geoData = await geoRes.json();
        const bansData = await bansRes.json();
        setGeo({ mode: geoData.mode ?? null, countries: geoData.countries ?? [] });
        setIpBans(bansData.bans ?? []);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load geo restriction settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // close combobox dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────
  async function apiPost(path: string, body: object): Promise<any> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST', credentials: 'include',
      headers: { ...authHeaders(getToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = 'Request failed';
      try { const d = await res.json(); msg = d?.error?.message ?? d?.error ?? msg; } catch { /* ignore */ }
      throw new Error(typeof msg === 'string' ? msg : 'Request failed');
    }
    return res.json();
  }

  async function apiDelete(path: string): Promise<any> {
    const res = await fetch(`${base}${path}`, {
      method: 'DELETE', credentials: 'include',
      headers: authHeaders(getToken),
    });
    if (!res.ok) {
      let msg = 'Request failed';
      try { const d = await res.json(); msg = d?.error?.message ?? d?.error ?? msg; } catch { /* ignore */ }
      throw new Error(typeof msg === 'string' ? msg : 'Request failed');
    }
    return res.json();
  }

  // ── geo mode ───────────────────────────────────────────────────────────────
  async function handleModeChange(newMode: string) {
    setActionError(null);
    const mode = newMode === 'none' ? null : (newMode as 'allowlist' | 'blocklist');
    try {
      const updated = await apiPost('/geo/config', { mode });
      setGeo({ mode: updated.mode ?? null, countries: updated.countries ?? [] });
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to update mode');
    }
  }

  // ── country add / remove ───────────────────────────────────────────────────
  async function handleAddCountry(cc: string) {
    setActionError(null);
    setSearch('');
    setDropdownOpen(false);
    try {
      const updated = await apiPost('/geo/countries', { countryCode: cc });
      setGeo({ mode: updated.mode ?? null, countries: updated.countries ?? [] });
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to add country');
    }
  }

  async function handleRemoveCountry(cc: string) {
    setActionError(null);
    try {
      const updated = await apiDelete(`/geo/countries/${cc}`);
      setGeo({ mode: updated.mode ?? null, countries: updated.countries ?? [] });
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to remove country');
    }
  }

  // ── ip bans ────────────────────────────────────────────────────────────────
  async function handleLiftBan(id: string) {
    setActionError(null);
    try {
      await apiDelete(`/ip-bans/${id}`);
      setIpBans((prev) => prev.filter((b) => b.id !== id));
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to lift ban');
    }
  }

  async function handleAddBan(e: React.FormEvent) {
    e.preventDefault();
    if (!banIp.trim()) return;
    setActionError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ipAddress: banIp.trim() };
      if (banReason.trim()) body.reason = banReason.trim();
      if (banDuration.trim()) {
        const mins = parseInt(banDuration, 10);
        if (!isNaN(mins) && mins > 0) body.durationMinutes = mins;
      }
      const ban = await apiPost('/ip-bans', body);
      setIpBans((prev) => [
        { id: ban.id, ipAddress: ban.ipAddress, reason: ban.reason ?? null,
          expiresAt: ban.expiresAt ?? null, isPermanent: ban.isPermanent, createdAt: ban.createdAt },
        ...prev,
      ]);
      setBanIp(''); setBanReason(''); setBanDuration('');
      setAddBanOpen(false);
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to add IP ban');
    } finally {
      setSaving(false);
    }
  }

  // ── render states ──────────────────────────────────────────────────────────
  if (loading) return <div className="geo-admin__status">Loading…</div>;

  if (tierLimited) {
    return (
      <div className="geo-admin__status geo-admin__status--unavailable">
        Geo restrictions and IP bans are available on the Community plan and above.
      </div>
    );
  }

  if (error) return <div className="geo-admin__status geo-admin__status--error">{error}</div>;

  // country combobox filtered list
  const q = search.trim().toLowerCase();
  const filteredCountries = q
    ? SORTED_COUNTRIES.filter(
        (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
      ).slice(0, 12)
    : SORTED_COUNTRIES.slice(0, 12);

  // filter out already-added countries from dropdown
  const addableCountries = filteredCountries.filter((c) => !geo.countries.includes(c.code));

  // ip ban list filter
  const visibleBans = banFilter.trim()
    ? ipBans.filter(
        (b) =>
          b.ipAddress.includes(banFilter.trim()) ||
          (b.reason ?? '').toLowerCase().includes(banFilter.trim().toLowerCase())
      )
    : ipBans;

  return (
    <div className="geo-admin">
      {actionError && <div className="geo-admin__action-error">{actionError}</div>}

      {/* ── Country Restrictions ── */}
      <div className="geo-admin__section">
        <h4 className="geo-admin__section-title">Country Restrictions</h4>

        <div className="geo-admin__field">
          <label className="geo-admin__label">Restriction mode</label>
          <select
            className="geo-admin__select"
            value={geo.mode ?? 'none'}
            onChange={(e) => handleModeChange(e.target.value)}
          >
            <option value="none">None (unrestricted)</option>
            <option value="blocklist">Blocklist — block listed countries</option>
            <option value="allowlist">Allowlist — only listed countries</option>
          </select>
        </div>

        {geo.mode && (
          <>
            <p className="geo-admin__hint">
              {geo.mode === 'blocklist'
                ? 'Users from these countries will be blocked from posting.'
                : 'Only users from these countries can post.'}
            </p>

            {/* Current country chips */}
            {geo.countries.length > 0 ? (
              <div className="geo-admin__chips">
                {geo.countries.map((cc) => (
                  <span key={cc} className="geo-admin__chip">
                    {countryChipLabel(cc)}
                    <button
                      className="geo-admin__chip-remove"
                      onClick={() => handleRemoveCountry(cc)}
                      title={`Remove ${cc}`}
                      aria-label={`Remove ${cc}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="geo-admin__hint geo-admin__hint--empty">No countries in list yet.</p>
            )}

            {/* Searchable combobox */}
            <div className="geo-admin__combobox" ref={comboRef}>
              <input
                className="geo-admin__combobox-input"
                type="text"
                placeholder="Search country to add…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setDropdownOpen(false); setSearch(''); }
                  if (e.key === 'Enter' && addableCountries.length === 1) {
                    handleAddCountry(addableCountries[0].code);
                  }
                }}
              />
              {dropdownOpen && addableCountries.length > 0 && (
                <ul className="geo-admin__combobox-list">
                  {addableCountries.map((c) => (
                    <li key={c.code}>
                      <button
                        className="geo-admin__combobox-item"
                        onMouseDown={(e) => { e.preventDefault(); handleAddCountry(c.code); }}
                      >
                        {countryLabel(c.code)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {dropdownOpen && search.trim() && addableCountries.length === 0 && (
                <div className="geo-admin__combobox-empty">No matching countries</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── IP Bans ── */}
      <div className="geo-admin__section">
        <h4 className="geo-admin__section-title">
          IP Bans
          {ipBans.length > 0 && (
            <span className="geo-admin__badge">{ipBans.length}</span>
          )}
        </h4>

        {ipBans.length > 4 && (
          <input
            className="geo-admin__filter-input"
            type="text"
            placeholder="Filter by IP or reason…"
            value={banFilter}
            onChange={(e) => setBanFilter(e.target.value)}
          />
        )}

        {visibleBans.length === 0 && ipBans.length === 0 ? (
          <p className="geo-admin__hint">No active IP bans.</p>
        ) : visibleBans.length === 0 ? (
          <p className="geo-admin__hint">No bans match your filter.</p>
        ) : (
          <div className="geo-admin__ban-list">
            {visibleBans.map((ban) => (
              <div key={ban.id} className="geo-admin__ban-row">
                <div className="geo-admin__ban-info">
                  <span className="geo-admin__ban-ip">{ban.ipAddress}</span>
                  {ban.reason && <span className="geo-admin__ban-reason">{ban.reason}</span>}
                  <span className="geo-admin__ban-expiry">{formatExpiry(ban)}</span>
                </div>
                <button
                  className="btn btn--ghost geo-admin__lift-btn"
                  onClick={() => handleLiftBan(ban.id)}
                >
                  Lift ban
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add IP ban */}
        <button
          className="geo-admin__add-toggle"
          onClick={() => setAddBanOpen((o) => !o)}
        >
          {addBanOpen ? '▼' : '▶'} Add IP ban
        </button>

        {addBanOpen && (
          <form className="geo-admin__add-ban-form" onSubmit={handleAddBan}>
            <div className="geo-admin__field">
              <label className="geo-admin__label">IP address or CIDR range *</label>
              <input
                className="geo-admin__input"
                type="text"
                placeholder="e.g. 1.2.3.4 or 1.2.0.0/16"
                value={banIp}
                onChange={(e) => setBanIp(e.target.value)}
                required
              />
            </div>
            <div className="geo-admin__field">
              <label className="geo-admin__label">Reason (optional)</label>
              <input
                className="geo-admin__input"
                type="text"
                placeholder="Reason for ban"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            <div className="geo-admin__field">
              <label className="geo-admin__label">Duration in minutes (blank = permanent)</label>
              <input
                className="geo-admin__input"
                type="number"
                min="1"
                placeholder="e.g. 1440 for 24 hours"
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={saving || !banIp.trim()}>
              {saving ? 'Adding…' : 'Add IP ban'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
