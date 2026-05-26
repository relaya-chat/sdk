// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState } from 'react';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'offensive_content', label: 'Offensive or hateful content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Other' },
];

interface ReportModalProps {
  messageId: string;
  authorName: string;
  onReport: (messageId: string, reason: string, details?: string) => Promise<void>;
  onClose: () => void;
}

export default function ReportModal({ messageId, authorName, onReport, onClose }: ReportModalProps) {
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onReport(messageId, reason, details.trim() || undefined);
      setDone(true);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Report message">
        <h2 className="modal__title">Report message</h2>

        {done ? (
          <div className="modal__body">
            <p>
              ✅ Your report has been submitted. Our moderators will review it shortly.
            </p>
          </div>
        ) : (
          <div className="modal__body">
            <p>Report a message from <strong>{authorName}</strong>.</p>

            <label htmlFor="report-reason">Reason</label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
            >
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label htmlFor="report-details">Additional details (optional)</label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe the issue…"
              disabled={submitting}
              maxLength={500}
            />

            {error && <p style={{ color: 'var(--color-danger)', marginTop: 8 }}>{error}</p>}
          </div>
        )}

        <div className="modal__footer">
          {done ? (
            <button className="btn btn--primary" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>Cancel</button>
              <button className="btn btn--danger" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
