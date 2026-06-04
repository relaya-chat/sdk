// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Space Theming System
 *
 * Defines per-space visual configuration. Each entry in the SPACE_THEMES registry maps a
 * space slug (matching the slug in the database) to a set of theme values that control the
 * chat window appearance.
 *
 * The applySpaceTheme() function injects these as CSS custom properties on the document root,
 * where main.css picks them up. Defaults defined in main.css :root ensure the UI degrades
 * gracefully for spaces without a custom theme.
 */

export interface SpaceTheme {
  // ── Title / header section ─────────────────────────────────────────────────
  /** T1: Header background color */
  titleBg: string;
  /** T2: Space name text color (used when showing text, not logo) */
  spaceNameColor: string;
  /** T3: Space name font family */
  spaceNameFontFamily: string;
  /** T4: Font family for all remaining header UI text (cascades to other areas too) */
  uiFontFamily: string;
  /** T5: Text color for "N online" count */
  onlineTextColor: string;
  /** T7: Text color for "No display name" / chat-name prompt */
  noNameTextColor: string;
  /** T6: Icon/button color for controls in the header bar (e.g. mute toggle).
   *  Defaults to white so icons are visible on dark header bars.
   *  Set to a dark value when using a light-coloured header background. */
  headerIconColor?: string;
  /** T10: Header button border color; use 'transparent' for borderless */
  buttonBorderColor: string;
  /** T11: Header button interior/background color */
  buttonBg: string;
  /** T12: Header button text color */
  buttonTextColor: string;
  // ── Messages ───────────────────────────────────────────────────────────────
  /** M1: Avatar circle background color (also applies to online-users list avatars) */
  avatarBg: string;
  /** M2: Avatar circle initials/text color (also applies to online-users list avatars) */
  avatarTextColor: string;
  /** M10: Message bubble background for messages from others (undefined = keep default) */
  otherMsgBg?: string;
  /** M11: Message text color for messages from others (undefined = keep default) */
  otherMsgText?: string;
  /** M12: Message bubble background for own messages */
  ownMsgBg: string;
  /** M13: Message text color for own messages */
  ownMsgText: string;
  /** M14: Message body font family (undefined = inherit uiFontFamily) */
  msgFontFamily?: string;
  /** M15: Message body font size (undefined = keep default) */
  msgFontSize?: string;
  /** M16: Timestamp label color (undefined = keep default) */
  timeLabelColor?: string;

  // ── Send button ────────────────────────────────────────────────────────────
  /**
   * S1: Send button background color.
   * Defaults to own-message bubble bg (--sp-own-msg-bg) so avatar, bubbles, and
   * send button all share the same accent color without needing an explicit value.
   */
  sendButtonBg?: string;
  /**
   * S2: Send button icon/text color.
   * Defaults to own-message text color (--sp-own-msg-text).
   */
  sendButtonText?: string;
}

// ── Shared constants ──────────────────────────────────────────────────────────

const GEIST = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const DEFAULT_ACCENT = '#7391A7';

/**
 * Default theme applied to any space that has no custom entry in SPACE_THEMES.
 * These colors were chosen as generally pleasing defaults for the installable package.
 */
export const DEFAULT_THEME: SpaceTheme = {
  titleBg:              DEFAULT_ACCENT,
  spaceNameColor:       'white',
  spaceNameFontFamily:  GEIST,
  uiFontFamily:         GEIST,
  onlineTextColor:      'white',
  noNameTextColor:      'white',
  buttonBorderColor:    'transparent',
  buttonBg:             'white',
  buttonTextColor:      'black',
  avatarBg:             DEFAULT_ACCENT,
  avatarTextColor:      'white',
  ownMsgBg:             DEFAULT_ACCENT,
  ownMsgText:           'white',
  msgFontFamily:        GEIST,
};

// ── Space theme registry ──────────────────────────────────────────────────────

/**
 * Keyed by space slug (same value used in the database, JWT, and API routes).
 * Add per-space theme overrides here as spaces are onboarded.
 * When a slug is not found, DEFAULT_THEME is returned as the fallback.
 * Example:
 *   'my-space': { ...DEFAULT_THEME, titleBg: '#1a2b3c' }
 */
const SPACE_THEMES: Record<string, SpaceTheme> = {
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the theme for a space slug, or DEFAULT_THEME if no entry is registered.
 * Never returns null — every space gets at least the default colors.
 */
export function getSpaceTheme(spaceSlug: string): SpaceTheme {
  return SPACE_THEMES[spaceSlug] ?? DEFAULT_THEME;
}

/**
 * Injects a space's theme as CSS custom properties on `document.documentElement`.
 * Only properties with defined values are set; undefined values fall back to the
 * CSS defaults declared in main.css :root.
 */
export function applySpaceTheme(theme: SpaceTheme): void {
  const root = document.documentElement;
  const set = (prop: string, val: string | undefined) => {
    if (val !== undefined) root.style.setProperty(prop, val);
  };

  // Title section
  set('--sp-title-bg',      theme.titleBg);
  set('--sp-name-color',    theme.spaceNameColor);
  set('--sp-name-font',     theme.spaceNameFontFamily);
  set('--sp-ui-font',       theme.uiFontFamily);
  set('--sp-online-color',  theme.onlineTextColor);
  set('--sp-no-name-color', theme.noNameTextColor);
  set('--sp-btn-border',        theme.buttonBorderColor);
  set('--sp-btn-bg',            theme.buttonBg);
  set('--sp-btn-text',          theme.buttonTextColor);
  set('--sp-header-icon-color', theme.headerIconColor);

  // Messages
  set('--sp-avatar-bg',        theme.avatarBg);
  set('--sp-avatar-text',      theme.avatarTextColor);
  set('--sp-other-msg-bg',     theme.otherMsgBg);
  set('--sp-other-msg-text',   theme.otherMsgText);
  set('--sp-own-msg-bg',       theme.ownMsgBg);
  set('--sp-own-msg-text',     theme.ownMsgText);
  set('--sp-msg-font',         theme.msgFontFamily ?? theme.uiFontFamily);
  set('--sp-msg-font-size',    theme.msgFontSize);
  set('--sp-time-color',       theme.timeLabelColor);

  // Send button (S1/S2 — undefined = CSS default which already matches own-msg bg/text)
  set('--sp-send-btn-bg',      theme.sendButtonBg);
  set('--sp-send-btn-text',    theme.sendButtonText);
}
