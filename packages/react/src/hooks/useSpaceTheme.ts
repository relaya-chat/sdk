// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useSpaceTheme
 *
 * Fetches the persisted admin theme for the current space, applies it to
 * the document root, and exposes save / reset functions for the theme admin panel.
 *
 * Theme is stored as { light: {...}, dark: {...} } — only overridden keys per mode.
 * applyDbTheme applies the sub-object matching the active display mode.
 */

import { useState, useCallback, useRef } from 'react';
import { ApiClient } from '@relaya-chat/core';
import type { ThemeByMode } from '@relaya-chat/core';
import { useServerUrl } from '../contexts/RelayaServerContext.js';

// ── Constants ──────────────────────────────────────────────────────────────

const KNOWN_KEYS = [
  '--relaya-color-bg',
  '--relaya-color-message-bg',
  '--relaya-color-message-own-bg',
  '--relaya-color-text',
  '--relaya-color-text-secondary',
  '--relaya-color-input-bg',
  '--relaya-color-input-text',
  '--relaya-color-btn-bg',
  '--relaya-color-btn-text',
  '--relaya-color-name-mod',
  '--relaya-color-link',
  '--relaya-color-link-active',
] as const;

const EMPTY_THEME: ThemeByMode = { light: {}, dark: {} };

// ── applyDbTheme ──────────────────────────────────────────────────────────

/**
 * Apply saved theme overrides to the document root for the active mode.
 * Clears all previously applied overrides first, then applies the sub-object
 * matching `mode` ('light' | 'dark').
 *
 * Call with EMPTY_THEME to clear all overrides.
 */
export function applyDbTheme(theme: ThemeByMode, mode: 'light' | 'dark'): void {
  const root = document.documentElement;

  // Clear any previously applied DB overrides
  KNOWN_KEYS.forEach((k) => root.style.removeProperty(k));

  // Apply the overrides for the active mode
  const overrides = theme[mode] ?? {};
  Object.entries(overrides).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// ==================== HOOK ====================

interface UseSpaceThemeResult {
  theme: ThemeByMode;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Load theme from server (call on panel open) */
  loadTheme: () => Promise<void>;
  /** Save new theme overrides and re-apply them to the document */
  saveTheme: (overrides: ThemeByMode, activeMode: 'light' | 'dark') => Promise<void>;
  /** Clear all stored overrides and revert to CSS defaults */
  resetTheme: (activeMode: 'light' | 'dark') => Promise<void>;
}

export function useSpaceTheme(
  stationSlug: string,
  getToken: () => string | null
): UseSpaceThemeResult {
  const [theme, setTheme] = useState<ThemeByMode>(EMPTY_THEME);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverUrl = useServerUrl();
  const clientRef = useRef(new ApiClient(serverUrl, getToken));

  const loadTheme = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await clientRef.current.getSpaceTheme(stationSlug);
      setTheme(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load theme');
    } finally {
      setLoading(false);
    }
  }, [stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTheme = useCallback(
    async (overrides: ThemeByMode, activeMode: 'light' | 'dark') => {
      setSaving(true);
      setError(null);
      try {
        const saved = await clientRef.current.saveSpaceTheme(stationSlug, overrides);
        setTheme(saved);
        applyDbTheme(saved, activeMode);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to save theme');
      } finally {
        setSaving(false);
      }
    },
    [stationSlug] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const resetTheme = useCallback(
    async (activeMode: 'light' | 'dark') => {
      setSaving(true);
      setError(null);
      try {
        await clientRef.current.saveSpaceTheme(stationSlug, EMPTY_THEME);
        setTheme(EMPTY_THEME);
        applyDbTheme(EMPTY_THEME, activeMode);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to reset theme');
      } finally {
        setSaving(false);
      }
    },
    [stationSlug] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { theme, loading, saving, error, loadTheme, saveTheme, resetTheme };
}
