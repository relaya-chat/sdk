// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * ThemeAdminPage — full-page colour theme editor for station admins.
 *
 * Mirrors the StickerAdminPage layout: topbar with ← Back + action buttons,
 * then a Light/Dark tab selector, then a scrollable list of colour-picker rows.
 * Opens via page-swap in ChatWindow.
 *
 * Each mode (light / dark) has independent colour overrides stored in
 * theme.json as { light: {...}, dark: {...} }.
 */

import React, { useEffect, useState } from 'react';
import { useSpaceTheme } from '../hooks/useSpaceTheme.js';
import type { ThemeByMode } from '@relaya-chat/core';
import type { AuthActions } from '../hooks/useRelayaAuth.js';
import { appConfig } from '../config.js';

interface ThemeAdminPageProps {
  stationSlug: string;
  getToken: AuthActions['getToken'];
  /** Called when the user clicks the back/close button. Optional: not needed in admin popup. */
  onClose?: () => void;
}

// ── Variable definitions ───────────────────────────────────────────────────

const THEME_FIELDS: Array<{
  key: string;
  label: string;
  hint: string;
  lightDefault: string;
  darkDefault: string;
}> = [
  { key: '--relaya-color-bg',             label: 'Chat background',           hint: 'Outermost container background',          lightDefault: '#f0f2f5', darkDefault: '#0d1117' },
  { key: '--relaya-color-message-bg',     label: "Others' message bubbles",   hint: 'Bubble background for received messages', lightDefault: '#e9ecef', darkDefault: '#21262d' },
  { key: '--relaya-color-message-own-bg', label: 'Your message bubbles',      hint: 'Bubble background for sent messages',     lightDefault: '#007aff', darkDefault: '#1f6feb' },
  { key: '--relaya-color-text',           label: 'Body text',                 hint: 'Primary text colour',                     lightDefault: '#1a1a2e', darkDefault: '#e6edf3' },
  { key: '--relaya-color-text-secondary', label: 'Secondary / muted text',    hint: 'Timestamps, labels',                      lightDefault: '#6c757d', darkDefault: '#8b949e' },
  { key: '--relaya-color-input-bg',       label: 'Message input background',  hint: 'Text-entry field background',             lightDefault: '#f8f9fa', darkDefault: '#21262d' },
  { key: '--relaya-color-input-text',     label: 'Message input text',        hint: 'Text typed in the input',                 lightDefault: '#1a1a2e', darkDefault: '#e6edf3' },
  { key: '--relaya-color-btn-bg',         label: 'Send button background',    hint: 'Primary action button background',        lightDefault: '#007aff', darkDefault: '#1f6feb' },
  { key: '--relaya-color-btn-text',       label: 'Send button icon',          hint: 'Icon colour on the send button',          lightDefault: '#ffffff', darkDefault: '#ffffff' },
  { key: '--relaya-color-name-mod',       label: 'Moderator name colour',     hint: 'Display name colour for moderators',      lightDefault: '#007aff', darkDefault: '#58a6ff' },
  { key: '--relaya-color-link',           label: 'Link colour',               hint: 'Hyperlink default state',                 lightDefault: '#007aff', darkDefault: '#58a6ff' },
  { key: '--relaya-color-link-active',    label: 'Link hover/active colour',  hint: 'Hyperlink hover/active state',            lightDefault: '#0062cc', darkDefault: '#79b8ff' },
];

const EMPTY_COLORS: Record<string, string> = {};

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normaliseHex(value: string): string {
  const v = value.trim();
  // Bare 6-char hex — prepend #
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  // Short 3-char hex with # — expand to 6
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return v;
}

// ==================== COMPONENT ====================

export default function ThemeAdminPage({ stationSlug, getToken, onClose }: ThemeAdminPageProps) {
  const { theme, loading, saving, error, loadTheme, saveTheme, resetTheme } =
    useSpaceTheme(stationSlug, getToken);

  // Default to the current app mode so the admin sees the mode they're looking at
  const [activeMode, setActiveMode] = useState<'light' | 'dark'>(appConfig.theme);
  const [draft, setDraft] = useState<ThemeByMode>({ light: {}, dark: {} });
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Computed CSS defaults for the *current* app mode — resolved from the live cascade on mount.
  // Uses a hidden probe element so chained var() references (e.g. --color-bg: var(--color-surface))
  // are fully resolved to actual hex values rather than returned as raw "var(...)" strings.
  const [computedDefaults, setComputedDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.display = 'none';
    document.documentElement.appendChild(probe);

    const result: Record<string, string> = {};
    for (const { key } of THEME_FIELDS) {
      probe.style.setProperty('background-color', `var(${key})`);
      const raw = getComputedStyle(probe).backgroundColor;
      // getComputedStyle returns "rgb(r, g, b)" — convert to #rrggbb
      const m = raw.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (m) {
        result[key] =
          '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
      }
    }

    document.documentElement.removeChild(probe);
    setComputedDefaults(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadTheme();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDraft({ light: { ...theme.light }, dark: { ...theme.dark } });
    setDirty(false);
  }, [theme]);

  function setValue(key: string, value: string) {
    const normalised = normaliseHex(value);
    setDraft((d: ThemeByMode) => ({
      ...d,
      [activeMode]: { ...d[activeMode], [key]: normalised },
    }));
    setDirty(true);
    setNotice(null);
  }

  async function handleSave() {
    // Build sanitised copy for each mode
    const toSave: ThemeByMode = { light: {}, dark: {} };
    for (const mode of ['light', 'dark'] as const) {
      for (const [k, v] of Object.entries(draft[mode])) {
        if (v && isValidHex(v)) toSave[mode][k] = v;
      }
    }
    await saveTheme(toSave, activeMode);
    setDirty(false);
    setNotice('Theme saved.');
  }

  async function handleReset() {
    if (!confirm('Remove all saved colour overrides and revert to the default theme?')) return;
    await resetTheme(activeMode);
    setDirty(false);
    setNotice('Theme reset to defaults.');
  }

  const modeColors = draft[activeMode] ?? EMPTY_COLORS;

  return (
    <div className="theme-admin-page">
      {/* ── Topbar ── */}
      <div className="theme-admin-page__topbar">
        <div className="theme-admin-page__title-group">
          <div className="theme-admin-page__title-row">
            {onClose && (
              <button className="btn btn--ghost theme-admin-page__back" onClick={onClose}>
                ← Back
              </button>
            )}
            <h2 className="theme-admin-page__title">Colour theme</h2>
            {notice && <div className="theme-admin-page__status-inline">{notice}</div>}
          </div>
          <p className="theme-admin-page__subtitle">
            Override the default colours for this space. Only saved values are stored; unset fields fall back to the default theme.
          </p>
        </div>

        <div className="theme-admin-page__header-actions">
          <button
            className="btn btn--ghost"
            onClick={handleReset}
            disabled={saving || loading}
          >
            Reset to defaults
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving || loading || !dirty}
          >
            {saving ? 'Saving…' : 'Save colours'}
          </button>
        </div>
      </div>

      {/* ── Status messages ── */}
      {error && <div className="theme-admin-page__error">{error}</div>}

      {/* ── Mode tabs ── */}
      <div className="theme-admin-page__tabs">
        <button
          className={`theme-admin-page__tab${activeMode === 'light' ? ' theme-admin-page__tab--active' : ''}`}
          onClick={() => setActiveMode('light')}
        >
          ☀ Light
        </button>
        <button
          className={`theme-admin-page__tab${activeMode === 'dark' ? ' theme-admin-page__tab--active' : ''}`}
          onClick={() => setActiveMode('dark')}
        >
          ☾ Dark
        </button>
      </div>

      {/* ── Colour list ── */}
      {loading ? (
        <div className="theme-admin-page__state">Loading theme…</div>
      ) : (
        <div className="theme-admin-list">
          {THEME_FIELDS.map(({ key, label, hint, lightDefault, darkDefault }) => {
            // For the currently-active app mode, use the live computed value (reflects
            // any station-specific overrides). For the other mode, fall back to hardcoded.
            const modeDefault =
              activeMode === appConfig.theme
                ? (computedDefaults[key] ?? (activeMode === 'light' ? lightDefault : darkDefault))
                : (activeMode === 'light' ? lightDefault : darkDefault);
            const rawVal = modeColors[key] ?? '';
            const resolvedColour = rawVal ? normaliseHex(rawVal) : modeDefault;
            const invalid = rawVal !== '' && !isValidHex(rawVal);

            return (
              <div key={key} className="theme-admin-row" title={hint}>
                {/* Colour swatch picker */}
                <input
                  type="color"
                  className="theme-admin-row__swatch"
                  value={isValidHex(resolvedColour) ? resolvedColour : modeDefault}
                  onChange={(e) => setValue(key, e.target.value)}
                  title={label}
                />

                {/* Label */}
                <label className="theme-admin-row__label">{label}</label>

                {/* Hex text input */}
                <input
                  type="text"
                  className={`theme-admin-row__hex${invalid ? ' theme-admin-row__hex--invalid' : ''}`}
                  value={rawVal}
                  placeholder={modeDefault}
                  maxLength={9}
                  onChange={(e) => setValue(key, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
