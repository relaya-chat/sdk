// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Client-side configuration derived from URL parameters.
 *
 * Supported URL params:
 *   ?space=my-space       — space slug (preferred; maps to stationSlug internally)
 *   ?theme=dark           — UI theme ('light' | 'dark'; defaults to system preference)
 *   ?embed=true           — indicates iframe embed context
 *   ?managed=host         — host application owns the session (RT + sign-out)

 *
 * The space slug and theme values are stable for the lifetime of the page.
 */

export type Theme = 'light' | 'dark';

export interface AppConfig {
  spaceSlug: string;
  theme: Theme;
  /**
   * Whether the chat is being rendered inside an iframe (e.g. Wix embed).
   * When true: admin/moderation panels are hidden and a pop-out icon is shown.
   * Set via ?embed=true in the URL — more reliable than window.self !== window.top
   * detection, which can be blocked by browser policies.
   */
  embed: boolean;
  /**
   * Whether to render the admin popup panel instead of the chat window.
   * Set via ?admin=true in the URL — the gear icon in ChatWindow opens this URL.
   * The admin panel is self-contained: it calls useRelayaAuth independently and
   * verifies admin/moderator permissions before rendering.
   */
  admin: boolean;
  /**
   * Whether the host application manages the user session — when true, the
   * widget does NOT read/write/clear `localStorage.relaya_refresh_token` and
   * suppresses its built-in Sign Out button. Set via `?managed=host` in the
   * iframe URL by hosts (such as the relaya.chat /account dashboard) that
   * own their own auth UX. Equivalent to passing
   * `manageOwnRefreshToken={false}` to `<RelayaChat>` in React contexts.
   */
  managed: boolean;
}


export function parseConfig(): AppConfig {
  const params = new URLSearchParams(window.location.search);

  // ?space= is the primary param (SDK public API); ?station= is the legacy fallback
  // so that existing deployed iframes continue to work without changes.
  const spaceSlug = params.get('space') ?? params.get('station') ?? '';

  const themeParam = params.get('theme');
  const theme: Theme =
    themeParam === 'dark' ? 'dark'
    : themeParam === 'light' ? 'light'
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  const embed = params.get('embed') === 'true';
  const admin = params.get('admin') === 'true';
  const managed = params.get('managed') === 'host';

  return { spaceSlug, theme, embed, admin, managed };
}


export const appConfig = typeof window !== 'undefined' ? parseConfig() : {
  spaceSlug: '',
  theme: 'light' as Theme,
  embed: false,
  admin: false,
  managed: false,
};

/**
 * Build the WebSocket URL for a given station and optional token.
 *
 * **Same-origin / iframe use only.** This helper builds a WS URL from
 * `window.location` and is designed for the chat-web iframe app (Vite dev
 * proxy, LAN dev, and same-origin production). It is NOT suitable for
 * cross-origin React SDK consumers — they should derive the WS URL directly
 * from their `serverUrl` prop (e.g. replace `https://` with `wss://`).
 *
 * In dev, Vite proxies /ws → ws://localhost:9000/ws (for localhost access).
 * In production (same host), uses ws:// or wss:// based on the current protocol.
 * If no token is provided, creates an anonymous connection.
 *
 * LAN dev caveat: Vite 8's WS proxy is unreliable for non-localhost clients
 * (e.g. a physical iPhone/iPad on the LAN). When the page is loaded via a LAN
 * IP address on port 5173, bypass the proxy and connect the WebSocket directly
 * to the chat server on port 9000, which binds to 0.0.0.0 and is directly
 * reachable from other devices on the same network.
 */
export function buildWsUrl(stationSlug: string, token?: string, apiKey?: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const tokenParam = token ? `token=${encodeURIComponent(token)}&` : '';
  const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';

  // Detect "Vite dev server accessed from a LAN IP" scenario:
  // port 5173 = Vite dev, non-localhost hostname = external device on the LAN.
  // In that case, connect the WS directly to the chat server (port 9000).
  const isViteDevLan =
    window.location.port === '5173' && window.location.hostname !== 'localhost';
  const host = isViteDevLan
    ? `${window.location.hostname}:9000`
    : window.location.host;

  return `${protocol}//${host}/ws?${tokenParam}station=${encodeURIComponent(stationSlug)}${apiKeyParam}`;
}
