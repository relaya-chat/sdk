// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * RelayaChat — drop-in compound component for embedding Relaya chat.
 *
 * This is a thin orchestrator: it initializes auth, applies station theming,
 * and renders the appropriate screen based on auth state. It mirrors what
 * `App.tsx` in `apps/chat-web` does today, but accepts explicit props instead
 * of reading URL params.
 *
 * Usage:
 *
 *   // External SDK embedding (Relaya SaaS)
 *   <RelayaChat serverUrl="https://api.relaya.chat" spaceSlug="my-station" />
 *
 *   // Relaya-hosted iframe (apps/chat-web)
 *   <RelayaChat serverUrl="" spaceSlug={config.spaceSlug} />
 *
 * Props:
 *   serverUrl  — Base URL for API calls. Pass `""` for same-origin (Vite proxy in dev /
 *                the Relaya-hosted iframe where client and server share the same origin).
 *                Pass `"https://api.relaya.chat"` for the Relaya SaaS endpoint.
 *   spaceSlug  — Your space slug, assigned by Relaya.
 *   token      — (future) Pre-issued JWT for token delegation. Not yet used.
 *   className  — Additional CSS class applied to the outermost `.relaya-root` wrapper.
 *
 * Note: theme (light/dark) may be passed as an optional `theme` prop. When omitted,
 * the active mode is auto-detected from `prefers-color-scheme`. The `?theme=` URL
 * param is also supported for iframe backward compat.
 */

import React, { useEffect, useState } from 'react';
import { injectRelayaStyles } from './styles/inject.js';
import { useRelayaAuth } from './hooks/useRelayaAuth.js';
import { applyDbTheme } from './hooks/useSpaceTheme.js';
import { getSpaceTheme, applySpaceTheme } from './spaceThemes.js';
import { NotificationMuteProvider } from './contexts/NotificationMuteContext.js';
import { appConfig } from './config.js';
import { RelayaServerProvider } from './contexts/RelayaServerContext.js';
import ChatWindow from './components/ChatWindow.js';
import TermsAcceptanceScreen from './components/TermsAcceptanceScreen.js';

export interface RelayaChatProps {
  /** Base URL for API calls. `""` = same-origin; `"https://api.relaya.chat"` = Relaya SaaS. */
  serverUrl: string;
  /** Your space slug, assigned by Relaya. */
  spaceSlug: string;
  /**
   * Pre-issued one-time token used for host-to-widget auth handoff.
   * Pass a fresh token on every mount when `manageOwnRefreshToken` is `false`.
   */
  token?: string;
  /** Additional CSS class applied alongside `relaya-root` on the wrapper element. */
  className?: string;
  /**
   * Whether the widget owns its own refresh-token persistence.
   *
   *  - `true` (default) — standalone widget; the widget reads, writes, and
   *    clears `localStorage.relaya_refresh_token` and can resume a session
   *    after a page reload.
   *  - `false` — host application owns the session. The widget keeps its
   *    refresh token in memory only and never touches `localStorage`. The
   *    host is responsible for providing a fresh `token` on every mount,
   *    rendering its own sign-out UI, and handling the `onSessionEnded`
   *    callback.
   *
   * If omitted, this prop defaults to the inverse of the `?managed=host`
   * URL parameter so iframe-hosted widgets pick up host-managed mode from
   * the embed URL automatically. Explicitly passing the prop always wins.
   */
  manageOwnRefreshToken?: boolean;
  /**
   * Called when the widget's auth session ends — whether because the user
   * signed out via the widget UI (`'logout'`) or because an automatic
   * refresh-token refresh failed (`'refresh-failed'`). Host applications
   * subscribe to redirect to their own sign-in surface.
   */
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
  /**
   * Explicitly suppress the widget's built-in Sign Out button. Defaults to
   * the inverse of `manageOwnRefreshToken` — i.e. host-managed sessions
   * hide the widget Sign Out by default since the host is expected to
   * render its own. Pass `false` explicitly to override.
   */
  hideSignOut?: boolean;
  /**
   * Light/dark theme override. When provided, overrides auto-detection
   * (which falls back to `prefers-color-scheme`). Pass the resolved value
   * from your app's theme context — e.g. `resolvedTheme` from next-themes —
   * to keep the widget in sync with the host page's theme switching.
   */
  theme?: 'light' | 'dark';
  /**
   * Optional per-space API key (generated in the space admin panel, Native tab).
   * When provided:
   * - Sent as `X-Relaya-Api-Key` on all REST requests
   * - Appended as `?apiKey=` on the WebSocket upgrade URL
   *
   * Omit for spaces that have not yet configured key enforcement.
   */
  apiKey?: string;
}


/**
 * Outer wrapper — wraps with RelayaServerProvider so all hooks and components
 * in the tree can access serverUrl via useServerUrl() without prop drilling.
 */
export function RelayaChat(props: RelayaChatProps) {
  return (
    <RelayaServerProvider serverUrl={props.serverUrl}>
      <ChatView {...props} />
    </RelayaServerProvider>
  );
}

/**
 * Inner chat view — all hooks called unconditionally.
 */
function ChatView({
  serverUrl,
  spaceSlug,
  token,
  className,
  manageOwnRefreshToken,
  onSessionEnded,
  hideSignOut,
  theme,
  apiKey,
}: RelayaChatProps) {
  // Default storage-ownership: explicit prop wins; otherwise derive from the
  // ?managed=host URL param so iframe embeds opt into host-managed mode
  // without needing a JS API surface. Default of `true` preserves existing
  // standalone-widget behavior (e.g. apps/chat-web, Wix embeds).
  const effectiveManageOwnRT = manageOwnRefreshToken ?? !appConfig.managed;
  // Sign-Out visibility tracks storage ownership unless the host overrides it.
  const effectiveHideSignOut = hideSignOut ?? !effectiveManageOwnRT;

  const auth = useRelayaAuth({
    spaceSlug,
    serverUrl,
    initialToken: token ?? null,
    manageOwnRefreshToken: effectiveManageOwnRT,
    onSessionEnded,
    apiKey,
  });

  // showBranding defaults to true (safe default — always show badge until server confirms otherwise)
  const [showBranding, setShowBranding] = useState(true);

  // Inject default styles on first mount. This runs once per document, even if
  // multiple RelayaChat instances are rendered. Safe in SSR — injectRelayaStyles
  // is a no-op when document is undefined.
  useEffect(() => {
    injectRelayaStyles();
  }, []);

  // Prop wins; fall back to auto-detected value from URL param / prefers-color-scheme.
  const resolvedTheme = theme ?? appConfig.theme;

  // Apply data-theme attribute and station-specific CSS custom properties,
  // then overlay any admin-saved DB theme overrides on top.
  // Re-runs when resolvedTheme changes so host-driven theme switching is reactive.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);

    const spaceTheme = getSpaceTheme(spaceSlug);
    if (spaceTheme) applySpaceTheme(spaceTheme);

    // Fetch and apply DB-persisted theme overrides (non-blocking; silent on error).
    // Uses serverUrl so the request goes to the correct origin for both same-origin
    // (iframe) and cross-origin (external SDK) deployments.
    const themeUrl = `${serverUrl}/api/chat/${spaceSlug}/theme`;
    fetch(themeUrl)
      .then((res) => (res.ok ? res.json() : { light: {}, dark: {} }))
      .then((dbTheme: { light?: Record<string, string>; dark?: Record<string, string> }) => {
        const hasOverrides =
          Object.keys(dbTheme?.light ?? {}).length > 0 ||
          Object.keys(dbTheme?.dark ?? {}).length > 0;
        if (hasOverrides) {
          applyDbTheme(
            { light: dbTheme.light ?? {}, dark: dbTheme.dark ?? {} },
            resolvedTheme
          );
        }
      })
      .catch(() => { /* ignore — theme is cosmetic, not critical */ });
  }, [serverUrl, spaceSlug, resolvedTheme]);

  // Fetch per-space branding flag from the public config endpoint.
  // Defaults to true (show badge) until the server responds.
  useEffect(() => {
    const configUrl = `${serverUrl}/api/public/config?slug=${encodeURIComponent(spaceSlug)}`;
    fetch(configUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { showBranding?: boolean } | null) => {
        if (data && typeof data.showBranding === 'boolean') {
          setShowBranding(data.showBranding);
        }
        // If showBranding is absent (e.g. server older version), keep the default (true)
      })
      .catch(() => { /* non-critical — badge defaults to visible on error */ });
  }, [serverUrl, spaceSlug]);

  // Build the root class: always includes `relaya-root` (CSS scope boundary);
  // host can optionally append their own class via the `className` prop.
  const rootClass = className ? `relaya-root ${className}` : 'relaya-root';

  if (auth.status === 'loading') {
    return (
      <div className={rootClass}>
        <div className="app">
          <div className="loading-screen">
            <div className="connection-spinner" />
            <span>Loading…</span>
          </div>
        </div>
      </div>
    );
  }

  // When the user is authenticated but has not yet accepted the current terms
  // version, show the inline terms acceptance screen before allowing chat access.
  // This closes the web bypass loophole (users cannot register via web to skip
  // mobile ToS acceptance — both surfaces enforce acceptance on their own).
  if (auth.status === 'authenticated' && !auth.termsAccepted) {
    return (
      <div className={rootClass}>
        <div className="app">
          <TermsAcceptanceScreen auth={auth} />
        </div>
      </div>
    );
  }

  // authenticated, anonymous, OR unauthenticated — all render ChatWindow.
  // ChatWindow shows the chat with an inline "Sign in" button (AuthModal) for unauthenticated users.
  return (
    <div className={rootClass}>
      <div className="app">
        <NotificationMuteProvider>
          <ChatWindow auth={auth} showBranding={showBranding} serverUrl={serverUrl} hideSignOut={effectiveHideSignOut} apiKey={apiKey} />

        </NotificationMuteProvider>
      </div>
    </div>
  );
}
