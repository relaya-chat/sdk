// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRelayaChat } from '../hooks/useRelayaChat.js';
import { PERMISSIONS, ApiClient } from '@relaya-chat/core';
import type { StationSoundsResponse } from '@relaya-chat/core';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';
import MessageList from './MessageList.js';
import MessageInput from './MessageInput.js';
import UserList from './UserList.js';
import ConnectionStatus from './ConnectionStatus.js';
import ChatNameEditor from './ChatNameEditor.js';
import UserListModal from './UserListModal.js';
import AuthModal from './AuthModal.js';
import AudioNotification from './AudioNotification.js';
import MuteToggle from './MuteToggle.js';
import PaneDivider from './PaneDivider.js';
import type { AuthState, AuthActions } from '../hooks/useRelayaAuth.js';
import type { ReplyingTo } from './MessageInput.js';
import { API_BASE_URL, appConfig } from '../config.js';

interface ChatWindowProps {
  auth: AuthState & AuthActions;
  showBranding?: boolean;
  serverUrl?: string;
  /**
   * Suppress the widget's built-in Sign Out button. Set to true when a host
   * application provides its own sign-out UI (e.g. the relaya.chat /account
   * dashboard) — the widget cannot actually end a host-owned session and a
   * widget-rendered Sign Out would be misleading in that mode.
   */
  hideSignOut?: boolean;
  /**
   * Suppress the admin gear icon. Set to true when a host application already
   * provides access to the admin panel (e.g. the relaya.chat /account dashboard
   * renders AdminPanel in the right pane — the gear icon is redundant there).
   */
  hideAdmin?: boolean;
}

const SIDEBAR_WIDTH_KEY = 'relaya_sidebar_width';
const SIDEBAR_BREAKPOINT = 768;
const SIDEBAR_DEFAULT_WIDTH = 220;

export default function ChatWindow({ auth, showBranding = true, serverUrl, hideSignOut = false, hideAdmin = false }: ChatWindowProps) {

  const { user, station, stationSlug, getToken } = auth;

  const [chatName, setChatName] = useState<string | null>(user?.chatName ?? null);
  const [showUserListModal, setShowUserListModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [stickers, setStickers] = useState([] as Awaited<ReturnType<ApiClient['getStickers']>>['stickers']);
  const [soundUrls, setSoundUrls] = useState<StationSoundsResponse>({ mentionSoundUrl: null, channelSoundUrl: null });
  const apiRef = useRef(new ApiClient(serverUrl ?? API_BASE_URL, getToken));

  // ── Sidebar resize state ──────────────────────────────────────────────────
  const chatBodyRef = useRef<HTMLDivElement>(null);

  const [isSidebarVisible, setIsSidebarVisible] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= SIDEBAR_BREAKPOINT
  );

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return stored ? parseInt(stored, 10) : SIDEBAR_DEFAULT_WIDTH;
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SIDEBAR_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsSidebarVisible(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleSidebarResize = useCallback((newWidth: number) => {
    setSidebarWidth(newWidth);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(newWidth)));
    } catch { /* non-critical */ }
  }, []);

  const sidebarStyle = useMemo<React.CSSProperties>(
    () => ({ width: sidebarWidth }),
    [sidebarWidth]
  );

  const refreshStickers = useCallback(async () => {
    try {
      const result = await apiRef.current.getStickers(stationSlug);
      setStickers(result.stickers ?? []);
    } catch {
      // non-critical — sticker rendering simply falls back to raw text when metadata is unavailable
    }
  }, [stationSlug]);

  // Wire sticker refresh into useRelayaChat so stickers:updated WS events trigger a reload.
  // Wire forced-logout so a server-initiated removal (e.g. demo space reset) returns the
  // user to the login screen immediately without requiring a page reload.
  const chat = useRelayaChat(auth, getToken, {
    onStickersUpdated: refreshStickers,
    serverUrl: serverUrl,
    wsBaseUrl: serverUrl,
    onForcedLogout: auth.logout,
  });

  useEffect(() => {
    if (auth.status === 'authenticated' && user) {
      apiRef.current.getMe(stationSlug)
        .then((me) => setChatName(me.chatName))
        .catch(() => { /* non-critical — falls back to null */ });
    }
    refreshStickers().catch(() => undefined);

    apiRef.current.getSounds(stationSlug)
      .then((result) => setSoundUrls(result))
      .catch(() => { /* non-critical — audio notifications simply won't play */ });
  }, [stationSlug, auth.status, user]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshStickers().catch(() => undefined);
    }, 60_000);

    const handleFocus = () => {
      refreshStickers().catch(() => undefined);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [refreshStickers]);

  const canPost = auth.status === 'authenticated' && (user?.permissions.includes(PERMISSIONS.POST) ?? false);
  const canModerate = user?.permissions.includes(PERMISSIONS.DELETE_ANY) ?? false;
  const isAdmin = user?.permissions.includes(PERMISSIONS.MANAGE_ROLES) ?? false;

  // Embed mode: set by ?embed=true URL param
  const isEmbedded = appConfig.embed;

  const stationLabel = station?.name || stationSlug
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  /** URL for the pop-out link — same page without ?embed=true. */
  const popOutUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('embed');
    return url.toString();
  })();

  /** URL for the admin popup — same page with ?admin=true, without ?embed. */
  const adminUrl = (() => {
    const url = new URL(window.location.href);
    url.searchParams.set('admin', 'true');
    url.searchParams.delete('embed');
    return url.toString();
  })();

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__title">{stationLabel}</div>

        {/* Mute toggle — only shown for authenticated users */}
        {auth.status === 'authenticated' && <MuteToggle />}

        {/* Tapping the listener count opens a user-list modal */}
        <button
          className="chat-header__online"
          onClick={() => setShowUserListModal(true)}
          title={`${chat.totalCount} listener${chat.totalCount === 1 ? '' : 's'} online — tap to see who's here`}
          aria-label={`${chat.totalCount} listeners online. Tap to see list.`}
        >
          <svg
            width="18" height="14" viewBox="0 0 24 24"
            fill="currentColor" aria-hidden="true"
          >
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
          {chat.totalCount}
        </button>

        {/* Chat name editor — authenticated users only */}
        {auth.status === 'authenticated' && (
          <ChatNameEditor
            stationSlug={stationSlug}
            initialChatName={chatName}
            getToken={getToken}
            onUpdated={(newChatName) => setChatName(newChatName)}
          />
        )}

        {/* Pop-out link: only shown in embed mode */}
        {isEmbedded && (
          <a
            href={popOutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost chat-header__popout"
            title="Open in new window"
            aria-label="Open chat in new window"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
              <path d="M9 1h4v4l-1.5-1.5L8 7 7 6l3.5-3.5L9 1zM2 3h5v1H3v7h7V8h1v3a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z"/>
            </svg>
          </a>
        )}

        {/* Sign in / Sign out — the Sign Out button is suppressed when the
            host application owns the session (hideSignOut). The host is
            expected to render its own sign-out UI in that mode. */}
        {auth.status === 'anonymous' ? (
          <button
            className="btn btn--primary chat-header__signin"
            onClick={() => setShowAuthModal(true)}
            title="Sign in"
          >
            Sign in
          </button>
        ) : !hideSignOut ? (
          <button
            className="btn btn--ghost chat-header__signout"
            onClick={auth.logout}
            title="Sign out"
          >
            Sign out
          </button>
        ) : null}


        {/* Admin gear icon — rightmost; opens admin popup in a new tab; visible to admin/moderators only.
            Suppressed when the host already provides admin access (hideAdmin). */}
        {!hideAdmin && (isAdmin || canModerate) && (
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost chat-header__admin"
            title="Open admin panel"
            aria-label="Open admin panel in new window"
          >
            <HiOutlineCog6Tooth className="chat-header__admin-icon" aria-hidden="true" />
          </a>
        )}
      </div>

      {/* Connection status bar (hidden when connected) */}
      <ConnectionStatus status={chat.connectionStatus} />

      {/* Body: messages + sidebar */}
      <div className="chat-body" ref={chatBodyRef}>
        <MessageList
          messages={chat.messages}
          optimistic={chat.optimistic}
          stickers={stickers}
          currentUserId={user?.id ?? ''}
          currentUserPermissions={user?.permissions ?? []}
          stationSlug={stationSlug}
          getToken={getToken}
          loadingInitial={chat.loadingInitial}
          loadingOlder={chat.loadingOlder}
          hasOlderMessages={chat.hasOlderMessages}
          retentionCutoff={chat.retentionCutoff}
          onLoadOlder={chat.loadOlderMessages}
          onEdit={chat.editMessage}
          onDelete={chat.deleteMessage}
          onBan={chat.banUser}
          onReport={chat.reportMessage}
          onRetry={chat.retryFailed}
          onReply={(messageId, authorName, content) => {
            const excerpt = content.length > 60 ? content.substring(0, 60) + '…' : content;
            setReplyingTo({ messageId, authorName, excerpt });
          }}
          getUserInfo={chat.getUserInfo}
          getAvatarForMessage={chat.getAvatarForMessage}
        />

        {isSidebarVisible && (
          <PaneDivider
            onResize={handleSidebarResize}
            containerRef={chatBodyRef}
          />
        )}

        <UserList users={chat.users} currentUserId={user?.id ?? ''} style={sidebarStyle} />
      </div>

      {/* Message input */}
      <MessageInput
        onSend={(content) => {
          chat.sendMessage(content, replyingTo || undefined);
          setReplyingTo(null);
        }}
        connectionStatus={chat.connectionStatus}
        canPost={canPost}
        onRequestAuth={() => setShowAuthModal(true)}
        stationSlug={stationSlug}
        getToken={getToken}
        stickers={stickers}
        onRefreshStickers={refreshStickers}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onlineUsers={chat.users}
        currentUserId={user?.id}
      />

      {/* Powered by Relaya badge — shown for embed-tier and expired spaces */}
      {showBranding && (
        <div className="relaya-branding">
          <a href="https://relaya.chat?ref=powered-by" target="_blank" rel="noopener noreferrer">
            Powered by Relaya™
          </a>
        </div>
      )}

      {/* User list modal */}
      {showUserListModal && (
        <UserListModal
          users={chat.users}
          currentUserId={user?.id ?? ''}
          onClose={() => setShowUserListModal(false)}
        />
      )}

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          console.log('[ChatWindow] Closing AuthModal');
          setShowAuthModal(false);
        }}
        onRequestCode={async (email: string) => {
          const result = await apiRef.current.requestCode(email, stationSlug);
          return { pendingId: result.pendingId };
        }}
        onVerifyCode={async (pendingId: string, code: string) => {
          const data = await apiRef.current.verifyCode(pendingId, code, stationSlug);
          auth.onOtpVerified(data);
          setShowAuthModal(false);
        }}
        stationSlug={stationSlug}
        error={auth.error}
      />

      {/* Audio notification handler - no visual UI */}
      {auth.status === 'authenticated' && (
        <AudioNotification
          onMention={chat.registerMentionSound}
          onChannel={chat.registerChannelSound}
          mentionSoundUrl={soundUrls.mentionSoundUrl}
          channelSoundUrl={soundUrls.channelSoundUrl}
        />
      )}
    </div>
  );
}
