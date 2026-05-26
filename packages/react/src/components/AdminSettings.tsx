// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useEffect } from 'react';
import { useModerationConfig } from '../hooks/useModerationConfig.js';
import { usePresenceConfig } from '../hooks/usePresenceConfig.js';
import type { AuthActions, AuthUser } from '../hooks/useRelayaAuth.js';

interface AdminSettingsProps {
  stationSlug: string;
  user: AuthUser;
  getToken: AuthActions['getToken'];
  onOpenStickerAdmin?: () => void;
  onOpenThemeAdmin?: () => void;
}

export default function AdminSettings({
  stationSlug,
  user,
  getToken,
  onOpenStickerAdmin,
  onOpenThemeAdmin,
}: AdminSettingsProps) {
  const [open, setOpen] = useState(false);

  // ---- Moderation config ----
  const { config, loading, saving, error, note, loadConfig, updateConfig } = useModerationConfig(
    stationSlug,
    user,
    getToken
  );

  const [draft, setDraft] = useState<{
    rateLimitWindowMs: string;
    rateLimitMaxMessages: string;
    duplicateWindowMs: string;
  } | null>(null);

  // ---- Presence config ----
  const {
    config: presenceConfig,
    loading: presenceLoading,
    saving: presenceSaving,
    error: presenceError,
    loadConfig: loadPresenceConfig,
    updateConfig: updatePresenceConfig,
  } = usePresenceConfig(stationSlug, user, getToken);

  // Display value is in minutes; storage value is in ms.
  const [presenceMinutesDraft, setPresenceMinutesDraft] = useState<string>('');

  // Load both configs when panel is first opened
  useEffect(() => {
    if (open) {
      if (!config && !loading) loadConfig();
      if (!presenceConfig && !presenceLoading) loadPresenceConfig();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate moderation draft when config is loaded
  useEffect(() => {
    if (config && !draft) {
      setDraft({
        rateLimitWindowMs: String(config.rateLimitWindowMs),
        rateLimitMaxMessages: String(config.rateLimitMaxMessages),
        duplicateWindowMs: String(config.duplicateWindowMs),
      });
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate presence draft when config is loaded
  useEffect(() => {
    if (presenceConfig && presenceMinutesDraft === '') {
      // Convert ms → minutes, show up to 1 decimal place
      const mins = presenceConfig.presenceGracePeriodMs / 60000;
      setPresenceMinutesDraft(String(Number(mins.toFixed(1))));
    }
  }, [presenceConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!draft) return;
    await updateConfig({
      rateLimitWindowMs: parseInt(draft.rateLimitWindowMs, 10),
      rateLimitMaxMessages: parseInt(draft.rateLimitMaxMessages, 10),
      duplicateWindowMs: parseInt(draft.duplicateWindowMs, 10),
    });
  }

  async function handlePresenceSave() {
    const mins = parseFloat(presenceMinutesDraft);
    if (isNaN(mins) || mins < 0 || mins > 15) return;
    // Convert minutes → ms, rounded to nearest second
    const ms = Math.round(mins * 60000 / 1000) * 1000;
    await updatePresenceConfig({ presenceGracePeriodMs: ms });
  }

  return (
    <div className="admin-settings">
      <button className="admin-settings__toggle" onClick={() => setOpen((o) => !o)}>
        <span>{open ? '▼' : '▶'}</span>
        <span>Moderation settings</span>
      </button>

      {open && (
        <div className="admin-settings__panel">
          {/* Sticker library launcher */}
          {onOpenStickerAdmin && (
            <div className="admin-settings__section">
              <div className="admin-settings__section-copy">
                <strong>Sticker library</strong>
                <span>Upload stickers, assign shortcodes, and control picker order.</span>
              </div>
              <button
                className="btn btn--ghost"
                style={{ width: 'auto', padding: '6px 16px' }}
                onClick={onOpenStickerAdmin}
              >
                Open sticker manager
              </button>
            </div>
          )}

          {/* Colour theme launcher */}
          {onOpenThemeAdmin && (
            <div className="admin-settings__section">
              <div className="admin-settings__section-copy">
                <strong>Colour theme</strong>
                <span>Customise the chat colours to match your brand.</span>
              </div>
              <button
                className="btn btn--ghost"
                style={{ width: 'auto', padding: '6px 16px' }}
                onClick={onOpenThemeAdmin}
              >
                Open theme editor
              </button>
            </div>
          )}

          <div className="admin-settings__notice">
            ⚠️ Changes apply immediately but revert to environment defaults on server restart.
            {note && <><br />{note}</>}
          </div>

          {loading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>}
          {error && <p style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error}</p>}

          {draft && (
            <>
              <div className="admin-settings__grid">
                <div className="admin-settings__field">
                  <label htmlFor="rl-window">Rate-limit window (ms)</label>
                  <input
                    id="rl-window"
                    type="number"
                    min={1000}
                    value={draft.rateLimitWindowMs}
                    onChange={(e) => setDraft((d) => d ? { ...d, rateLimitWindowMs: e.target.value } : d)}
                  />
                </div>
                <div className="admin-settings__field">
                  <label htmlFor="rl-max">Max messages per window</label>
                  <input
                    id="rl-max"
                    type="number"
                    min={1}
                    value={draft.rateLimitMaxMessages}
                    onChange={(e) => setDraft((d) => d ? { ...d, rateLimitMaxMessages: e.target.value } : d)}
                  />
                </div>
                <div className="admin-settings__field">
                  <label htmlFor="dup-window">Duplicate burst window (ms)</label>
                  <input
                    id="dup-window"
                    type="number"
                    min={0}
                    value={draft.duplicateWindowMs}
                    onChange={(e) => setDraft((d) => d ? { ...d, duplicateWindowMs: e.target.value } : d)}
                  />
                </div>
              </div>

              <button
                className="btn btn--primary"
                style={{ width: 'auto', padding: '6px 16px' }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Apply changes'}
              </button>
            </>
          )}

          {/* ---- Presence / online-status grace period ---- */}
          <div className="admin-settings__divider" style={{ marginTop: 20, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Online status grace period</strong>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 10 }}>
              How long a user stays visible in the online list after their browser disconnects.
              Use 0 for immediate removal. Saved to the database — persists across restarts.
            </p>
            {presenceLoading && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>}
            {presenceError && <p style={{ fontSize: 13, color: 'var(--color-danger)' }}>{presenceError}</p>}
            {presenceConfig !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="presence-grace"
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={presenceMinutesDraft}
                  onChange={(e) => setPresenceMinutesDraft(e.target.value)}
                  style={{ width: 80 }}
                />
                <label htmlFor="presence-grace" style={{ fontSize: 13 }}>minutes</label>
                <button
                  className="btn btn--primary"
                  style={{ width: 'auto', padding: '6px 16px' }}
                  onClick={handlePresenceSave}
                  disabled={presenceSaving}
                >
                  {presenceSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
