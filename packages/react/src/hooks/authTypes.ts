// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk

import type { AuthVerifyResponse } from '@relaya-chat/core';

export type AuthStatus =
  | 'loading'         // initial check in progress
  | 'unauthenticated' // no session, show login form (used for error states)
  | 'anonymous'       // no session, but can view read-only
  | 'magic-link-sent' // legacy — kept for API compat; not used in popup flow
  | 'authenticated';  // AT valid, enter chat

export interface AuthUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  permissions: string[];
  roles: Array<{ id: string; name: string; priority: number }>;
  chatName: string | null;
}

export interface AuthStation {
  id: string;
  name: string;
  slug: string;
  /** Cosmetic header display name. Null = use the official name. */
  headerName?: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null; // AT (in memory); exposed for WS URL construction
  station: AuthStation | null;
  stationSlug: string;
  error: string | null;
}

export interface AuthActions {
  login: (email?: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  onOtpVerified: (data: AuthVerifyResponse) => void;
  /**
   * Checks whether the in-memory AT is expired or expiring within 2 minutes, and if
   * so triggers a silent refresh before returning. Call before opening a WebSocket
   * connection to avoid connecting with a stale token. Returns the current AT, or
   * null if no authenticated session exists.
   */
  ensureFreshToken: () => Promise<string | null>;
}

export interface UseRelayaAuthOptions {
  /** Explicit space slug supplied by SDK consumers. Falls back to URL-derived appConfig.spaceSlug. */
  spaceSlug?: string;
  /**
   * Base URL for all REST API calls. Pass `"https://api.relaya.chat"` for Relaya SaaS,
   * or `""` for same-origin (iframe / Vite-proxy dev). Defaults to same-origin.
   */
  serverUrl?: string;
  /** One-time magic-link token supplied by SDK consumers for auto-auth handoff. */
  initialToken?: string | null;
  /**
   * Whether the widget owns its own refresh-token persistence.
   *
   *  - `true` (default) — widget reads, writes, and clears
   *    `localStorage.relaya_refresh_token` and recovers a session on reload.
   *  - `false` — host application owns the session. The widget keeps its RT
   *    in memory only and never touches localStorage. The host is responsible
   *    for providing a fresh `initialToken` on every mount and for ending the
   *    session (subscribe to `onSessionEnded`).
   */
  manageOwnRefreshToken?: boolean;
  /**
   * Called when the widget's auth session ends — whether because the user
   * clicked the widget's Sign Out (`reason: 'logout'`) or because an
   * automatic refresh failed (`reason: 'refresh-failed'`). Embedders use this
   * to redirect to their own sign-in surface.
   */
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}