// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState } from 'react';

interface BanModalProps {
  userId: string;
  displayName: string;
  onBan: (userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>;
  onClose: () => void;
}

const DURATION_OPTIONS = [
  { value: '', label: 'Permanent' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

function durationToExpiresAt(duration: string): string | undefined {
  if (!duration) return undefined;
  const now = Date.now();
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const ms = map[duration];
  return ms ? new Date(now + ms).toISOString() : undefined;
}

export default function BanModal({ userId, displayName, onBan, onClose }: BanModalProps) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBan() {
    setSubmitting(true);
    setError(null);
    try {
      await onBan(userId, {
        reason: reason.trim() || undefined,
        expiresAt: durationToExpiresAt(duration),
      });
      onClose();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to ban user.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ban user">
        <h2 className="modal__title">Ban user</h2>

        <div className="modal__body">
          <p>
            You are about to ban <strong>{displayName}</strong> from this station's chat.
            They will be immediately disconnected and will not be able to rejoin.
          </p>

          <label htmlFor="ban-duration">Duration</label>
          <select
            id="ban-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={submitting}
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>

          <label htmlFor="ban-reason">Reason (optional)</label>
          <textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this user being banned?"
            disabled={submitting}
            maxLength={500}
          />

          {error && <p style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn--danger" onClick={handleBan} disabled={submitting}>
            {submitting ? 'Banning…' : 'Confirm ban'}
          </button>
        </div>
      </div>
    </div>
  );
}
