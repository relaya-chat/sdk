// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * ReportReview — collapsible report queue panel for moderators and admins.
 *
 * Accessible to any user with the DELETE_ANY permission (moderator+).
 *
 * Per-report actions:
 *   Dismiss          — mark report as dismissed with no further action
 *   Delete message   — soft-delete the flagged message, mark report reviewed
 *   Ban author       — open the BanModal for the message's author,
 *                      then mark report reviewed on confirmation
 *
 * Pagination: 20 reports per page using offset-based navigation.
 */

import React, { useState, useEffect } from 'react';
import { PERMISSIONS } from '@relaya-chat/core';
import { useReports, REPORTS_PAGE_LIMIT } from '../hooks/useReports.js';
import BanModal from './BanModal.js';
import type { AuthActions, AuthUser } from '../hooks/useRelayaAuth.js';

interface ReportReviewProps {
  stationSlug: string;
  user: AuthUser;
  getToken: AuthActions['getToken'];
}

interface BanTarget {
  reportId: string;
  userId: string;
  displayName: string;
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

function formatReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}

export default function ReportReview({ stationSlug, user, getToken }: ReportReviewProps) {
  const [open, setOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<BanTarget | null>(null);

  const {
    reports,
    total,
    loading,
    actioning,
    error,
    offset,
    loadReports,
    dismissReport,
    deleteMessageAndReview,
    banAndReview,
  } = useReports(stationSlug, user, getToken);

  // Load the queue when the panel is first opened.
  // This must come before any conditional return to respect the Rules of Hooks.
  useEffect(() => {
    if (open) {
      loadReports(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canModerate = user.permissions.includes(PERMISSIONS.DELETE_ANY);
  if (!canModerate) return null;

  const hasPrev = offset > 0;
  const hasNext = offset + REPORTS_PAGE_LIMIT < total;

  return (
    <div className="report-review">
      <button
        className="report-review__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>
          Report queue
          {total > 0 && (
            <span className="report-review__badge" aria-label={`${total} pending reports`}>
              {total}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="report-review__panel">
          {error && (
            <p className="report-review__error">{error}</p>
          )}

          {loading && (
            <p className="report-review__loading">Loading…</p>
          )}

          {!loading && reports.length === 0 && (
            <p className="report-review__empty">No pending reports. ✓</p>
          )}

          {reports.map((report) => {
            const isActioning = actioning === report.reportId;
            return (
              <div key={report.reportId} className="report-card">
                <div className="report-card__meta">
                  <span className="report-card__reason">{formatReason(report.reason)}</span>
                  <span className="report-card__time">{formatTimestamp(report.createdAt)}</span>
                </div>

                <div className="report-card__message">
                  {report.messageIsDeleted ? (
                    <em className="report-card__deleted">[message already deleted]</em>
                  ) : (
                    <span>{report.messageContent ?? ''}</span>
                  )}
                </div>

                <div className="report-card__details">
                  <span>
                    <strong>Author:</strong> {report.messageAuthor.displayName}
                  </span>
                  <span>
                    <strong>Reported by:</strong> {report.reporter.displayName}
                  </span>
                  {report.details && (
                    <span>
                      <strong>Note:</strong> {report.details}
                    </span>
                  )}
                </div>

                <div className="report-card__actions">
                  <button
                    className="btn btn--ghost"
                    style={{ fontSize: 12, padding: '3px 10px' }}
                    onClick={() => dismissReport(report.reportId)}
                    disabled={isActioning}
                    title="Dismiss this report — no action taken"
                  >
                    {isActioning ? '…' : 'Dismiss'}
                  </button>

                  {!report.messageIsDeleted && (
                    <button
                      className="btn btn--ghost"
                      style={{ fontSize: 12, padding: '3px 10px' }}
                      onClick={() =>
                        deleteMessageAndReview(report.reportId, report.messageId)
                      }
                      disabled={isActioning}
                      title="Delete the reported message and mark this report reviewed"
                    >
                      {isActioning ? '…' : 'Delete message'}
                    </button>
                  )}

                  <button
                    className="btn btn--danger"
                    style={{ fontSize: 12, padding: '3px 10px' }}
                    onClick={() =>
                      setBanTarget({
                        reportId: report.reportId,
                        userId: report.messageAuthor.userId,
                        displayName: report.messageAuthor.displayName,
                      })
                    }
                    disabled={isActioning}
                    title="Ban this message's author and mark this report reviewed"
                  >
                    Ban author
                  </button>
                </div>
              </div>
            );
          })}

          {(hasPrev || hasNext) && (
            <div className="report-review__pagination">
              <button
                className="btn btn--ghost"
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => loadReports(offset - REPORTS_PAGE_LIMIT)}
                disabled={!hasPrev || loading}
              >
                ← Previous
              </button>
              <span className="report-review__page-info">
                {offset + 1}–{Math.min(offset + REPORTS_PAGE_LIMIT, total)} of {total}
              </span>
              <button
                className="btn btn--ghost"
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => loadReports(offset + REPORTS_PAGE_LIMIT)}
                disabled={!hasNext || loading}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ban modal: opened by "Ban author" button; onBan resolves then BanModal calls onClose */}
      {banTarget && (
        <BanModal
          userId={banTarget.userId}
          displayName={banTarget.displayName}
          onBan={async (userId, params) => {
            await banAndReview(banTarget.reportId, userId, params);
          }}
          onClose={() => setBanTarget(null)}
        />
      )}
    </div>
  );
}
