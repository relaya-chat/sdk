// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * ExportAdminPage — Chat history export for the per-space admin panel.
 *
 * Tier behaviour:
 *   - Community / Developer: show full export form
 *   - Embed: show disabled state (inferred from 403 TIER_LIMIT response)
 */

import React, { useState } from 'react';
import { API_BASE_URL } from '../config.js';
import type { AuthActions } from '../hooks/useRelayaAuth.js';

interface ExportAdminPageProps {
  stationSlug: string;
  getToken: AuthActions['getToken'];
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultDates() {
  const today = new Date();
  return {
    from: toDateStr(new Date(today.getTime() - 90 * 86400000)),
    to: toDateStr(today),
    excludeReportedBefore: toDateStr(new Date(today.getTime() - 365 * 86400000)),
  };
}

const EXCLUDE_REQUIRED_MSG =
  'A date is required — reported messages are kept indefinitely for compliance. ' +
  'Choose a date to limit how far back they appear in this export.';

export default function ExportAdminPage({ stationSlug, getToken }: ExportAdminPageProps) {
  const defaults = defaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [excludeReportedBefore, setExcludeReportedBefore] = useState(defaults.excludeReportedBefore);
  const [excludeError, setExcludeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierLimited, setTierLimited] = useState(false);

  function handleExcludeBlur() {
    setExcludeError(!excludeReportedBefore ? EXCLUDE_REQUIRED_MSG : null);
  }

  async function handleDownload() {
    if (!excludeReportedBefore) { setExcludeError(EXCLUDE_REQUIRED_MSG); return; }
    setExcludeError(null);
    setError(null);
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from + 'T00:00:00Z');
      if (to) params.set('to', to + 'T23:59:59Z');
      params.set('excludeReportedBefore', excludeReportedBefore + 'T00:00:00Z');
      const url = `${API_BASE_URL}/api/chat/${stationSlug}/export/messages?${params.toString()}`;
      const token = getToken();
      const hdrs: Record<string, string> = {};
      if (token) hdrs['Authorization'] = `Bearer ${token}`;
      const response = await fetch(url, { credentials: 'include', headers: hdrs });
      if (response.ok) {
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match ? match[1] : `${stationSlug}-export.csv`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        return;
      }
      type ErrData = { error?: { code?: string; message?: string } | string; retryAfter?: number };
      let data: ErrData = {};
      try { data = await response.json(); } catch { /* ignore */ }
      if (response.status === 403) {
        const errObj = data.error;
        if (typeof errObj === 'object' && errObj?.code === 'TIER_LIMIT') { setTierLimited(true); return; }
        setError('You do not have permission to export chat history for this space.');
        return;
      }
      if (response.status === 429) {
        const mins = Math.ceil((data.retryAfter ?? 3600) / 60);
        setError(`Export rate limit reached — you can export once per hour. Try again in ${mins} minutes.`);
        return;
      }
      if (response.status === 413) {
        setError('Too many messages in this date range. Please narrow the date range and try again.');
        return;
      }
      const msg = typeof data.error === 'object' ? data.error?.message
        : typeof data.error === 'string' ? data.error : undefined;
      setError(msg ?? 'Export failed. Please try again.');
    } catch {
      setError('Export failed due to a network error. Please try again.');
    } finally {
      setExporting(false);
    }
  }


  if (tierLimited) {
    return (
      <div className="export-admin-page">
        <p className="export-admin-page__unavailable">
          Chat history export is not available on your current plan.
        </p>
      </div>
    );
  }

  return (
    <div className="export-admin-page">
      <p className="export-admin-page__notice">
        Exports contain user display names and message content. Handle in accordance with your privacy policy.
      </p>

      {error && <div className="export-admin-page__error">{error}</div>}

      <div className="export-admin-page__form">
        <div className="export-admin-page__date-row">
          <label className="export-admin-page__label">
            From:
            <input type="date" className="export-admin-page__date-input"
              value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="export-admin-page__label">
            To:
            <input type="date" className="export-admin-page__date-input"
              value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="export-admin-page__exclude-row">
          <label className="export-admin-page__label">
            Exclude reported messages older than:
            <input type="date" className="export-admin-page__date-input"
              value={excludeReportedBefore}
              onChange={(e) => { setExcludeReportedBefore(e.target.value); setExcludeError(null); }}
              onBlur={handleExcludeBlur}
              required
            />
          </label>
          {excludeError && <p className="export-admin-page__field-error">{excludeError}</p>}
        </div>

        <button className="btn btn--primary export-admin-page__btn"
          onClick={handleDownload} disabled={exporting}>
          {exporting ? 'Preparing\u2026' : 'Download CSV \u2192'}
        </button>

        <p className="export-admin-page__hint">
          Export is limited to the space&rsquo;s retention window. Rate limited: 1 export per hour.
        </p>
      </div>
    </div>
  );
}
