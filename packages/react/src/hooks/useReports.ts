// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useReports — fetch and action on pending reports for moderators.
 *
 * Provides paginated loading of pending reports and three review actions:
 * - dismissReport: mark as dismissed, no further action
 * - deleteMessageAndReview: delete the flagged message then mark reviewed
 * - banAndReview: ban the message author then mark reviewed
 *
 * Uses a ref for the current offset to avoid stale-closure issues when
 * actions trigger an automatic reload after updating state.
 */

import { useState, useCallback, useRef } from 'react';
import { ApiClient, PERMISSIONS } from '@relaya-chat/core';
import type { ReportWithDetails } from '@relaya-chat/core';
import type { AuthActions, AuthUser } from './useRelayaAuth.js';
import { API_BASE_URL } from '../config.js';

export const REPORTS_PAGE_LIMIT = 20;

export interface ReportsState {
  reports: ReportWithDetails[];
  total: number;
  loading: boolean;
  /** reportId currently being actioned (used to disable per-row buttons) */
  actioning: string | null;
  error: string | null;
  offset: number;
}

export interface ReportsActions {
  /** Load (or reload) the pending report queue. Pass an explicit offset to paginate. */
  loadReports: (offset?: number) => Promise<void>;
  /** Dismiss a report without taking action on the message or its author. */
  dismissReport: (reportId: string) => Promise<void>;
  /**
   * Delete the flagged message and mark the report as reviewed.
   * Tolerates a 404 (message already deleted) — still marks the report reviewed.
   */
  deleteMessageAndReview: (reportId: string, messageId: string) => Promise<void>;
  /**
   * Ban the message author and mark the report as reviewed.
   * Tolerates a 409 (user already banned) — still marks the report reviewed.
   */
  banAndReview: (
    reportId: string,
    userId: string,
    params?: { reason?: string; expiresAt?: string }
  ) => Promise<void>;
}

export function useReports(
  stationSlug: string,
  user: AuthUser | null,
  getToken: AuthActions['getToken']
): ReportsState & ReportsActions {
  const [state, setState] = useState<ReportsState>({
    reports: [],
    total: 0,
    loading: false,
    actioning: null,
    error: null,
    offset: 0,
  });

  // Ref tracks the active offset so loadReports() can always use the latest
  // value without it needing to be a useCallback dependency.
  const offsetRef = useRef(0);

  const canModerate = user?.permissions.includes(PERMISSIONS.DELETE_ANY) ?? false;

  // Create a stable ApiClient instance. We pass getToken as a callback so the
  // client always picks up the latest token without being recreated on every render.
  const apiRef = useRef(new ApiClient(API_BASE_URL, getToken));

  const loadReports = useCallback(async (offset?: number) => {
    if (!canModerate || !stationSlug) return;
    const targetOffset = offset !== undefined ? offset : offsetRef.current;
    offsetRef.current = targetOffset;

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiRef.current.getReports(stationSlug, {
        status: 'pending',
        limit: REPORTS_PAGE_LIMIT,
        offset: targetOffset,
      });
      setState((s) => ({
        ...s,
        reports: res.reports,
        total: res.total,
        loading: false,
        offset: targetOffset,
      }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as { message?: string })?.message ?? 'Failed to load reports',
      }));
    }
  }, [canModerate, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissReport = useCallback(async (reportId: string) => {
    if (!canModerate) return;
    setState((s) => ({ ...s, actioning: reportId, error: null }));
    try {
      await apiRef.current.updateReport(stationSlug, reportId, { status: 'dismissed' });
      setState((s) => ({ ...s, actioning: null }));
      await loadReports();
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        actioning: null,
        error: (err as { message?: string })?.message ?? 'Failed to dismiss report',
      }));
      throw err;
    }
  }, [canModerate, stationSlug, loadReports]);

  const deleteMessageAndReview = useCallback(
    async (reportId: string, messageId: string) => {
      if (!canModerate) return;
      setState((s) => ({ ...s, actioning: reportId, error: null }));
      try {
        // Delete the message — a 404 means it was already deleted, which is fine.
        try {
          await apiRef.current.deleteMessage(stationSlug, messageId);
        } catch (err: unknown) {
          const apiErr = err as { status?: number };
          if (apiErr.status !== 404) throw err;
        }
        await apiRef.current.updateReport(stationSlug, reportId, { status: 'reviewed' });
        setState((s) => ({ ...s, actioning: null }));
        await loadReports();
      } catch (err: unknown) {
        setState((s) => ({
          ...s,
          actioning: null,
          error: (err as { message?: string })?.message ?? 'Failed to delete message',
        }));
        throw err;
      }
    },
    [canModerate, stationSlug, loadReports]
  );

  const banAndReview = useCallback(
    async (
      reportId: string,
      userId: string,
      params?: { reason?: string; expiresAt?: string }
    ) => {
      if (!canModerate) return;
      setState((s) => ({ ...s, actioning: reportId, error: null }));
      try {
        // Ban the user — a 409 means they are already banned, which is fine.
        try {
          await apiRef.current.createBan(stationSlug, userId, params);
        } catch (err: unknown) {
          const apiErr = err as { status?: number };
          if (apiErr.status !== 409) throw err;
        }
        await apiRef.current.updateReport(stationSlug, reportId, { status: 'reviewed' });
        setState((s) => ({ ...s, actioning: null }));
        await loadReports();
      } catch (err: unknown) {
        setState((s) => ({
          ...s,
          actioning: null,
          error: (err as { message?: string })?.message ?? 'Failed to ban user',
        }));
        throw err;
      }
    },
    [canModerate, stationSlug, loadReports]
  );

  return { ...state, loadReports, dismissReport, deleteMessageAndReview, banAndReview };
}
