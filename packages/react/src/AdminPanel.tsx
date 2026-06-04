// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * AdminPanel — full-page admin popup rendered when ?admin=true is in the URL.
 *
 * Opens in a separate browser window/tab via the gear icon in ChatWindow.
 * Self-contained: calls useRelayaAuth independently and verifies admin/moderator
 * permissions before rendering. Inherits the Relaya session cookie (same-origin)
 * so no extra login is required.
 *
 * All moderation and admin surfaces are rendered as scrollable page sections
 * (no accordion toggles, no "go back" buttons — the whole window is admin-only).
 */

import React, { useEffect, useState } from 'react';
import { useRelayaAuth } from './hooks/useRelayaAuth.js';
import { applyDbTheme } from './hooks/useSpaceTheme.js';
import { getSpaceTheme, applySpaceTheme } from './spaceThemes.js';
import { appConfig } from './config.js';
import { PERMISSIONS } from '@relaya-chat/core';

import ReportReview from './components/ReportReview.js';
import BanManagement from './components/BanManagement.js';
import AdminSettings from './components/AdminSettings.js';
import StickerAdminPage from './components/StickerAdminPage.js';
import ThemeAdminPage from './components/ThemeAdminPage.js';
import ExportAdminPage from './components/ExportAdminPage.js';
import GeoRestrictionsAdmin from './components/GeoRestrictionsAdmin.js';
import ModeratorAdminPage from './components/ModeratorAdminPage.js';
import SpaceHeaderNameAdmin from './components/SpaceHeaderNameAdmin.js';

export interface AdminPanelProps {
  /** Additional CSS class applied alongside relaya-root on the wrapper element. */
  className?: string;
  /** Space slug supplied by embedding host (e.g. account dashboard). Falls back to URL/module config. */
  spaceSlug?: string;
  /** Base URL for API calls. `""` = same-origin; `"https://api.relaya.chat"` = Relaya SaaS. Defaults to same-origin. */
  serverUrl?: string;
  /** One-time magic-link token supplied by embedding host for auto-auth handoff. */
  token?: string;
  /**
   * Whether the widget owns its own refresh-token persistence. See
   * `RelayaChatProps.manageOwnRefreshToken` for the full contract; default
   * is `true` (standalone behavior). The /account dashboard passes `false`
   * to keep the admin panel's RT in memory only.
   */
  manageOwnRefreshToken?: boolean;
  /** Called when the auth session ends. See `RelayaChatProps.onSessionEnded`. */
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}

export function AdminPanel({ className, spaceSlug, serverUrl = '', token, manageOwnRefreshToken, onSessionEnded }: AdminPanelProps) {
  // Same default-derivation as RelayaChat — explicit prop wins; otherwise
  // honor the ?managed=host URL param so iframe-hosted admin panels pick up
  // host-managed mode automatically.
  const effectiveManageOwnRT = manageOwnRefreshToken ?? !appConfig.managed;
  const auth = useRelayaAuth({
    spaceSlug,
    serverUrl,
    initialToken: token ?? null,
    manageOwnRefreshToken: effectiveManageOwnRT,
    onSessionEnded,
  });

  const { user, station, stationSlug, getToken } = auth;

  // Apply station theme and DB theme overrides — mirrors what ChatView does in RelayaChat.tsx.
  useEffect(() => {
    if (!stationSlug) return;

    document.documentElement.setAttribute('data-theme', appConfig.theme);

    const spaceTheme = getSpaceTheme(stationSlug);
    if (spaceTheme) applySpaceTheme(spaceTheme);

    const themeUrl = `${serverUrl}/api/chat/${stationSlug}/theme`;
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
      .catch(() => { /* theme is cosmetic, not critical */ });
  }, [stationSlug, serverUrl]);

  // Toggle state for collapsible admin-only sections
  const [stickerOpen, setStickerOpen] = useState(false);
  const [headerNameOpen, setHeaderNameOpen] = useState(false);
  const [headerName, setHeaderName] = useState<string | null>(station?.headerName ?? null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [moderatorsOpen, setModeratorsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [geoOpen, setGeoOpen] = useState(false);

  const rootClass = className ? `relaya-root ${className}` : 'relaya-root';

  // Loading state
  if (auth.status === 'loading') {
    return (
      <div className={rootClass}>
        <div className="admin-panel">
          <div className="admin-panel__loading">
            <div className="connection-spinner" />
            <span>Loading…</span>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (auth.status !== 'authenticated' || !user) {
    return (
      <div className={rootClass}>
        <div className="admin-panel">
          <div className="admin-panel__unauthorized">
            <h2>Sign in required</h2>
            <p>You must be signed in to access the admin panel.</p>
          </div>
        </div>
      </div>
    );
  }

  const canModerate = user.permissions.includes(PERMISSIONS.DELETE_ANY);
  const isAdmin = user.permissions.includes(PERMISSIONS.MANAGE_ROLES);

  // No admin or moderation permissions
  if (!canModerate && !isAdmin) {
    return (
      <div className={rootClass}>
        <div className="admin-panel">
          <div className="admin-panel__unauthorized">
            <h2>Access denied</h2>
            <p>You do not have admin or moderation permissions for this space.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="admin-panel">
        <div className="admin-panel__header">
          <h1 className="admin-panel__title">
            {station?.name ?? stationSlug
              .split('-')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')}{' '}
            — Admin
          </h1>
          <p className="admin-panel__subtitle">
            Moderation and administration for this space.
          </p>
        </div>

        <div className="admin-panel__sections">
          {/* Sticker library — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setStickerOpen((o) => !o)}>
                  <span>{stickerOpen ? '▼' : '▶'}</span>
                  <span>Sticker library</span>
                </button>
                {stickerOpen && (
                  <div className="admin-settings__panel">
                    <StickerAdminPage
                      stationSlug={stationSlug}
                      user={user}
                      getToken={getToken}
                      // No onClose (no "back" button needed — this is a dedicated panel)
                      // No onLibraryChanged (WS stickers:updated event handles chat window refresh)
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Space display name — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setHeaderNameOpen((o) => !o)}>
                  <span>{headerNameOpen ? '▼' : '▶'}</span>
                  <span>Space display name</span>
                </button>
                {headerNameOpen && (
                  <div className="admin-settings__panel">
                    <SpaceHeaderNameAdmin
                      stationSlug={stationSlug}
                      serverUrl={serverUrl}
                      getToken={getToken}
                      initialHeaderName={headerName}
                      onSaved={(newName) => setHeaderName(newName)}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Theme — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setThemeOpen((o) => !o)}>
                  <span>{themeOpen ? '▼' : '▶'}</span>
                  <span>Theme</span>
                </button>
                {themeOpen && (
                  <div className="admin-settings__panel">
                    <ThemeAdminPage
                      stationSlug={stationSlug}
                      getToken={getToken}
                      // No onClose (no "back" button needed — this is a dedicated panel)
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Reports — visible to moderators and admins */}
          {canModerate && (
            <section className="admin-panel__section">
              <ReportReview
                stationSlug={stationSlug}
                user={user}
                getToken={getToken}
              />
            </section>
          )}

          {/* Bans — visible to moderators and admins */}
          {canModerate && (
            <section className="admin-panel__section">
              <BanManagement
                stationSlug={stationSlug}
                user={user}
                getToken={getToken}
              />
            </section>
          )}

          {/* Moderator management — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setModeratorsOpen((o) => !o)}>
                  <span>{moderatorsOpen ? '▼' : '▶'}</span>
                  <span>Moderator management</span>
                </button>
                {moderatorsOpen && (
                  <div className="admin-settings__panel">
                    <ModeratorAdminPage
                      stationSlug={stationSlug}
                      user={user}
                      getToken={getToken}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Moderation settings — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <AdminSettings
                stationSlug={stationSlug}
                user={user}
                getToken={getToken}
                // No onOpenStickerAdmin / onOpenThemeAdmin — those sections are
                // rendered directly above; the buttons in AdminSettings are hidden
                // when these callbacks are not passed.
              />
            </section>
          )}

          {/* Geo restrictions & IP bans — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setGeoOpen((o) => !o)}>
                  <span>{geoOpen ? '▼' : '▶'}</span>
                  <span>Geo restrictions &amp; IP bans</span>
                </button>
                {geoOpen && (
                  <div className="admin-settings__panel">
                    <GeoRestrictionsAdmin
                      stationSlug={stationSlug}
                      getToken={getToken}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Chat history export — admins only */}
          {isAdmin && (
            <section className="admin-panel__section">
              <div className="admin-settings">
                <button className="admin-settings__toggle" onClick={() => setExportOpen((o) => !o)}>
                  <span>{exportOpen ? '▼' : '▶'}</span>
                  <span>Chat history export</span>
                </button>
                {exportOpen && (
                  <div className="admin-settings__panel">
                    <ExportAdminPage
                      stationSlug={stationSlug}
                      getToken={getToken}
                    />
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
