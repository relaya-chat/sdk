// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState } from 'react';

interface SpaceSetupAdminProps {
  stationSlug: string;
  serverUrl?: string;
  getToken: () => string | null;
  /** Current header name from the server (null = using official space name). */
  initialHeaderName: string | null;
  /** Called after a successful save or clear so the parent can update its state. */
  onHeaderNameSaved?: (newHeaderName: string | null) => void;
  /** Current sign-in button label from the server (null = using default 'Sign in'). */
  initialSignInLabel: string | null;
  /** Called after a successful save or clear so the parent can update its state. */
  onSignInLabelSaved?: (newLabel: string | null) => void;
  /** Current hide-deleted-messages setting from the server. */
  initialHideDeletedMessages: boolean;
  /** Called after a successful save so the parent can update its state. */
  onHideDeletedMessagesSaved?: (hide: boolean) => void;
}


/**
 * Admin section for editing per-space header bar settings:
 *   - Cosmetic chat header display name override
 *   - Sign-in button label override
 *
 * Both fields are optional overrides that default to standard values when left blank.
 * Each field saves independently via PATCH /api/chat/:stationSlug/station.
 */
export default function SpaceSetupAdmin({
  stationSlug,
  serverUrl = '',
  getToken,
  initialHeaderName,
  onHeaderNameSaved,
  initialSignInLabel,
  onSignInLabelSaved,
  initialHideDeletedMessages,
  onHideDeletedMessagesSaved,
}: SpaceSetupAdminProps) {

  // ── Header name field state ──────────────────────────────────────────────
  const [headerValue, setHeaderValue] = useState(initialHeaderName ?? '');
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [headerSuccess, setHeaderSuccess] = useState(false);

  // ── Sign-in label field state ─────────────────────────────────────────────
  const [labelValue, setLabelValue] = useState(initialSignInLabel ?? '');
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelSuccess, setLabelSuccess] = useState(false);

  // ── Hide-deleted-messages toggle state ────────────────────────────────────
  const [hideDeleted, setHideDeleted] = useState(initialHideDeletedMessages);
  const [hideDeletedSaving, setHideDeletedSaving] = useState(false);
  const [hideDeletedError, setHideDeletedError] = useState<string | null>(null);

  // ── Shared PATCH helper ───────────────────────────────────────────────────

  const patchStation = async (
    body: Record<string, string | boolean | null>
  ): Promise<Record<string, string | boolean | null>> => {

    const token = getToken();
    const res = await fetch(
      `${serverUrl}/api/chat/${encodeURIComponent(stationSlug)}/station`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
    }

    return res.json() as Promise<Record<string, string | null>>;
  };

  // ── Header name handlers ──────────────────────────────────────────────────

  const handleHeaderSave = async () => {
    setHeaderError(null);
    setHeaderSuccess(false);
    setHeaderSaving(true);

    const trimmed = headerValue.trim();
    const newName = trimmed.length === 0 ? null : trimmed;

    try {
      const data = await patchStation({ headerName: newName });
      const saved = (data.headerName as string | null) ?? null;

      setHeaderValue(saved ?? '');
      setHeaderSuccess(true);
      onHeaderNameSaved?.(saved);
      setTimeout(() => setHeaderSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setHeaderError(apiErr?.message ?? 'Failed to save header name');
    } finally {
      setHeaderSaving(false);
    }
  };

  const handleHeaderClear = async () => {
    setHeaderError(null);
    setHeaderSuccess(false);
    setHeaderSaving(true);

    try {
      await patchStation({ headerName: null });
      setHeaderValue('');
      setHeaderSuccess(true);
      onHeaderNameSaved?.(null);
      setTimeout(() => setHeaderSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setHeaderError(apiErr?.message ?? 'Failed to clear header name');
    } finally {
      setHeaderSaving(false);
    }
  };

  // ── Sign-in label handlers ────────────────────────────────────────────────

  const handleLabelSave = async () => {
    setLabelError(null);
    setLabelSuccess(false);
    setLabelSaving(true);

    const trimmed = labelValue.trim();
    const newLabel = trimmed.length === 0 ? null : trimmed;

    try {
      const data = await patchStation({ signInLabel: newLabel });
      const saved = (data.signInLabel as string | null) ?? null;

      setLabelValue(saved ?? '');
      setLabelSuccess(true);
      onSignInLabelSaved?.(saved);
      setTimeout(() => setLabelSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setLabelError(apiErr?.message ?? 'Failed to save sign-in label');
    } finally {
      setLabelSaving(false);
    }
  };

  const handleLabelClear = async () => {
    setLabelError(null);
    setLabelSuccess(false);
    setLabelSaving(true);

    try {
      await patchStation({ signInLabel: null });
      setLabelValue('');
      setLabelSuccess(true);
      onSignInLabelSaved?.(null);
      setTimeout(() => setLabelSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setLabelError(apiErr?.message ?? 'Failed to clear sign-in label');
    } finally {
      setLabelSaving(false);
    }
  };

  // ── Hide-deleted-messages handler ─────────────────────────────────────────

  const handleHideDeletedToggle = async (next: boolean) => {
    setHideDeletedError(null);
    setHideDeletedSaving(true);
    // Optimistic update; reverted on error.
    setHideDeleted(next);

    try {
      const data = await patchStation({ hideDeletedMessages: next });
      const saved = (data.hideDeletedMessages as boolean) ?? next;
      setHideDeleted(saved);
      onHideDeletedMessagesSaved?.(saved);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setHideDeleted(!next);
      setHideDeletedError(apiErr?.message ?? 'Failed to update setting');
    } finally {
      setHideDeletedSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────


  return (
    <div className="space-setup-admin">

      {/* Header display name */}
      <div className="space-setup-admin__section">
        <p className="space-setup-admin__description">
          Override the name shown in the chat header bar. Leave blank to use the
          official space name. Maximum 100 characters.
        </p>

        <div className="space-setup-admin__field">
          <label htmlFor="header-name-input" className="space-setup-admin__label">
            Header display name
          </label>
          <input
            id="header-name-input"
            type="text"
            className="space-setup-admin__input"
            value={headerValue}
            onChange={(e) => {
              setHeaderValue(e.target.value);
              setHeaderSuccess(false);
            }}
            maxLength={100}
            placeholder="(uses official space name)"
            disabled={headerSaving}
          />
          <div className="space-setup-admin__char-count">
            {headerValue.length}/100
          </div>
        </div>

        {headerError && (
          <p className="space-setup-admin__error">{headerError}</p>
        )}
        {headerSuccess && (
          <p className="space-setup-admin__success">Saved.</p>
        )}

        <div className="space-setup-admin__actions">
          <button
            className="btn btn--primary"
            onClick={handleHeaderSave}
            disabled={headerSaving}
          >
            {headerSaving ? 'Saving…' : 'Save'}
          </button>
          {headerValue.trim().length > 0 && (
            <button
              className="btn btn--secondary"
              onClick={handleHeaderClear}
              disabled={headerSaving}
            >
              Clear (use official name)
            </button>
          )}
        </div>
      </div>

      {/* Sign-in button label */}
      <div className="space-setup-admin__section">
        <p className="space-setup-admin__description">
          Customize the text on the sign-in button in the chat header bar.
          Leave blank to use the default ("Sign in"). Maximum 50 characters.
          Examples: "Say hi", "Join the chat".
        </p>

        <div className="space-setup-admin__field">
          <label htmlFor="sign-in-label-input" className="space-setup-admin__label">
            Sign-in button label
          </label>
          <input
            id="sign-in-label-input"
            type="text"
            className="space-setup-admin__input"
            value={labelValue}
            onChange={(e) => {
              setLabelValue(e.target.value);
              setLabelSuccess(false);
            }}
            maxLength={50}
            placeholder='(uses default "Sign in")'
            disabled={labelSaving}
          />
          <div className="space-setup-admin__char-count">
            {labelValue.length}/50
          </div>
        </div>

        {labelError && (
          <p className="space-setup-admin__error">{labelError}</p>
        )}
        {labelSuccess && (
          <p className="space-setup-admin__success">Saved.</p>
        )}

        <div className="space-setup-admin__actions">
          <button
            className="btn btn--primary"
            onClick={handleLabelSave}
            disabled={labelSaving}
          >
            {labelSaving ? 'Saving…' : 'Save'}
          </button>
          {labelValue.trim().length > 0 && (
            <button
              className="btn btn--secondary"
              onClick={handleLabelClear}
              disabled={labelSaving}
            >
              Clear (use default)
            </button>
          )}
        </div>
      </div>

      {/* Deleted message visibility */}
      <div className="space-setup-admin__section">
        <p className="space-setup-admin__description">
          Choose what happens when a message is deleted. By default, a
          "Message removed" placeholder is shown in its place. Turn this on to
          remove deleted messages from the chat history entirely. Moderators
          always continue to see the placeholder. Messages are never permanently
          erased on the server.
        </p>

        <div className="space-setup-admin__field space-setup-admin__field--inline">
          <label className="space-setup-admin__label" htmlFor="hide-deleted-toggle">
            Hide deleted messages
          </label>
          <input
            id="hide-deleted-toggle"
            type="checkbox"
            checked={hideDeleted}
            disabled={hideDeletedSaving}
            onChange={(e) => handleHideDeletedToggle(e.target.checked)}
          />
        </div>

        {hideDeletedError && (
          <p className="space-setup-admin__error">{hideDeletedError}</p>
        )}
      </div>

    </div>
  );
}

