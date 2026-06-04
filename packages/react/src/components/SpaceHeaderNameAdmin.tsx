// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState } from 'react';

interface SpaceHeaderNameAdminProps {
  stationSlug: string;
  serverUrl?: string;
  getToken: () => string | null;
  /** Current header name from the server (null = using official space name). */
  initialHeaderName: string | null;
  /** Called after a successful save or clear so the parent can update its state. */
  onSaved?: (newHeaderName: string | null) => void;
}

/**
 * Admin section for editing the cosmetic chat header display name.
 *
 * The header name is a short, optional override shown in the chat window title
 * bar. It does not affect the official space name, slug, or any billing records.
 * Leaving it empty reverts the header to the official space name.
 */
export default function SpaceHeaderNameAdmin({
  stationSlug,
  serverUrl = '',
  getToken,
  initialHeaderName,
  onSaved,
}: SpaceHeaderNameAdminProps) {
  const [value, setValue] = useState(initialHeaderName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const patchHeaderName = async (headerName: string | null): Promise<string | null> => {
    const token = getToken();
    const res = await fetch(
      `${serverUrl}/api/chat/${encodeURIComponent(stationSlug)}/station`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ headerName }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
    }

    const data = await res.json() as { headerName: string | null };
    return data.headerName;
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const trimmed = value.trim();
    const newName = trimmed.length === 0 ? null : trimmed;

    try {
      const saved = await patchHeaderName(newName);
      setValue(saved ?? '');
      setSuccess(true);
      onSaved?.(saved);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message ?? 'Failed to save header name');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await patchHeaderName(null);
      setValue('');
      setSuccess(true);
      onSaved?.(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message ?? 'Failed to clear header name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-header-name-admin">
      <p className="space-header-name-admin__description">
        Override the name shown in the chat header bar. Leave blank to use the
        official space name. Maximum 100 characters.
      </p>

      <div className="space-header-name-admin__field">
        <label htmlFor="header-name-input" className="space-header-name-admin__label">
          Header display name
        </label>
        <input
          id="header-name-input"
          type="text"
          className="space-header-name-admin__input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuccess(false);
          }}
          maxLength={100}
          placeholder="(uses official space name)"
          disabled={saving}
        />
        <div className="space-header-name-admin__char-count">
          {value.length}/100
        </div>
      </div>

      {error && (
        <p className="space-header-name-admin__error">{error}</p>
      )}

      {success && (
        <p className="space-header-name-admin__success">Saved.</p>
      )}

      <div className="space-header-name-admin__actions">
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {value.trim().length > 0 && (
          <button
            className="btn btn--secondary"
            onClick={handleClear}
            disabled={saving}
          >
            Clear (use official name)
          </button>
        )}
      </div>
    </div>
  );
}
