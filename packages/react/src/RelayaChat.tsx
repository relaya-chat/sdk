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
 * Note: theme (light/dark) is NOT a prop. `useSpaceTheme` detects the active mode
 * via `prefers-color-scheme` and re-applies when the OS preference changes. The
 * `?theme=` URL param is parsed by `parseConfig()` for iframe backward compat but is
 * not a developer-facing prop.
 */

import React, { useEffect, useState } from 'react';
import { injectRelayaStyles } from './styles/inject.js';
import { useRelayaAuth } from './hooks/useRelayaAuth.js';
import { applyDbTheme } from './hooks/useSpaceTheme.js';
import { getSpaceTheme, applySpaceTheme } from './spaceThemes.js';
import { NotificationMuteProvider } from './contexts/NotificationMuteContext.js';
import { appConfig } from './config.js';
import { AdminPanel } from './AdminPanel.js';
import LoginScreen from './components/LoginScreen.js';
import MagicLinkSent from './components/MagicLinkSent.js';
import ChatWindow from './components/ChatWindow.js';
import AuthSuccess from './components/AuthSuccess.js';

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
   * Suppress the admin gear icon in the chat header. Set to true when a host
   * application already provides access to the admin panel (e.g. the
   * relaya.chat /account dashboard renders AdminPanel in the right pane).
   */
  hideAdmin?: boolean;
}


/**
 * Outer router — no hooks here so the early-return for admin mode is safe.
 * appConfig.admin is a module-level constant (set once from URL params at load time).
 */
export function RelayaChat(props: RelayaChatProps) {
  // Admin popup mode: render the self-contained admin panel instead of the chat window.
  // appConfig.admin is set by ?admin=true in the URL; the gear icon in ChatWindow opens it.
  if (appConfig.admin) {
    return (
      <AdminPanel
        className={props.className}
        spaceSlug={props.spaceSlug}
        serverUrl={props.serverUrl}
        token={props.token}
        manageOwnRefreshToken={props.manageOwnRefreshToken}
        onSessionEnded={props.onSessionEnded}
      />
    );
  }
  return <ChatView {...props} />;
}

/**
 * Inner chat view — all hooks called unconditionally.
 * Only rendered when appConfig.admin is false.
 */
function ChatView({
  serverUrl,
  spaceSlug,
  token,
  className,
  manageOwnRefreshToken,
  onSessionEnded,
  hideSignOut,
  hideAdmin,
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
  });

  const [justAuthenticated, setJustAuthenticated] = useState(false);
  // showBranding defaults to true (safe default — always show badge until server confirms otherwise)
  const [showBranding, setShowBranding] = useState(true);

  // Inject default styles on first mount. This runs once per document, even if
  // multiple RelayaChat instances are rendered. Safe in SSR — injectRelayaStyles
  // is a no-op when document is undefined.
  useEffect(() => {
    injectRelayaStyles();
  }, []);

  // Apply data-theme attribute and station-specific CSS custom properties,
  // then overlay any admin-saved DB theme overrides on top.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appConfig.theme);

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
            appConfig.theme
          );
        }
      })
      .catch(() => { /* ignore — theme is cosmetic, not critical */ });
  }, [serverUrl, spaceSlug]);

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

  // Detect magic link authentication (new tab opened from email).
  // appConfig.magicLinkToken is populated from the ?token= URL param by parseConfig().
  useEffect(() => {
    if (appConfig.magicLinkToken && auth.status === 'authenticated') {
      setJustAuthenticated(true);
    }
  }, [auth.status]);

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

  if (auth.status === 'magic-link-sent') {
    return (
      <div className={rootClass}>
        <div className="app">
          <MagicLinkSent onBack={auth.logout} />
        </div>
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    return (
      <div className={rootClass}>
        <div className="app">
          <LoginScreen
            onLogin={auth.login}
            error={auth.error}
            stationSlug={spaceSlug}
          />
        </div>
      </div>
    );
  }

  // Magic link just completed — show success confirmation before entering chat.
  // Skip in iframe contexts: "close this tab" doesn't apply when auto-authenticating
  // an embedded widget (e.g., the account dashboard passes ?token= to the iframe).
  const inIframe = window.self !== window.top;
  if (auth.status === 'authenticated' && justAuthenticated && !inIframe) {
    return (
      <div className={rootClass}>
        <div className="app">
          <AuthSuccess
            stationSlug={auth.stationSlug}
            userDisplayName={auth.user?.displayName ?? 'there'}
          />
        </div>
      </div>
    );
  }

  // authenticated OR anonymous — both show ChatWindow.
  return (
    <div className={rootClass}>
      <div className="app">
        <NotificationMuteProvider>
          <ChatWindow auth={auth} showBranding={showBranding} serverUrl={serverUrl} hideSignOut={effectiveHideSignOut} hideAdmin={hideAdmin} />

        </NotificationMuteProvider>
      </div>
    </div>
  );
}
