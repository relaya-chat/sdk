// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaChat — real-time chat state and actions for the Relaya web client.
 *
 * Responsibilities:
 * - Open and manage a ChatConnection WebSocket instance
 * - Load initial messages via REST on connect
 * - Catch up missed messages via REST on reconnect (after cursor)
 * - Load older messages on demand (before cursor / scroll-up)
 * - Handle optimistic message sending with clientId reconciliation
 * - Expose online users list from presence:update messages
 * - Dispatch moderator REST actions (delete, ban)
 * - Dispatch report REST action
 *
 * WebSocket message handling is delegated to chatWsHandlers.ts via
 * createWsMessageHandler() to keep this file under the 400-line threshold.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ApiClient,
  ChatConnection,
  generateClientId,
  deduplicateMessages,
} from '@relaya-chat/core';
import type {
  Message,
  UserInfo,
  AvatarChange,
  WsServerMessage,
  OptimisticMessage,
} from '@relaya-chat/core';
import type { ConnectionStatus } from '@relaya-chat/core';
import { createWsMessageHandler } from './chatWsHandlers.js';
import type { WsHandlerRefs } from './chatWsHandlers.js';
import type { AuthActions, AuthState, AuthStation, AuthUser } from './useRelayaAuth.js';
import { buildWsUrl } from '../config.js';
import { useNotificationMute } from '../contexts/NotificationMuteContext.js';

export interface RelayaChatOptions {
  onStickersUpdated?: () => void;
  /** Base URL for REST API calls. Pass `"https://api.relaya.chat"` for Relaya SaaS, or `""` for same-origin. */
  serverUrl?: string;
  /** Base URL for WebSocket connections. Empty/undefined keeps same-origin behavior. */
  wsBaseUrl?: string;
  /**
   * Called when the server forces the client to log out (e.g. demo space reset
   * removes the user while they are connected). The host should clear auth state
   * so the user is returned to the login screen.
   */
  onForcedLogout?: () => void;
  /**
   * Called before opening (or reopening) a WebSocket connection when auth status
   * is `'authenticated'`. Should refresh the AT if it is expired or expiring
   * within ~2 minutes. Pass `auth.ensureFreshToken` from `useRelayaAuth`.
   * Without this, a WS reconnect after a long absence may use a stale AT and
   * enter a reconnect loop rather than succeeding immediately.
   */
  ensureFreshToken?: () => Promise<string | null>;
  /**
   * Optional per-space API key. When provided:
   * - Sent as `X-Relaya-Api-Key` header on all REST calls via the internal ApiClient.
   * - Appended as `?apiKey=` on the WebSocket upgrade URL.
   */
  apiKey?: string;
}

function buildWsUrlWithBase(baseUrl: string | undefined, stationSlug: string, token?: string, apiKey?: string): string {
  const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
  if (!baseUrl) return buildWsUrl(stationSlug, token, apiKey);

  const base = new URL(baseUrl, window.location.href);
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const tokenParam = token ? `token=${encodeURIComponent(token)}&` : '';
  return `${protocol}//${base.host}/ws?${tokenParam}station=${encodeURIComponent(stationSlug)}${apiKeyParam}`;
}

// ── Types ────────────────────────────────────────────────────
export interface OnlineUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ChatState {
  messages: Message[];
  optimistic: OptimisticMessage[];
  users: OnlineUser[];
  userCount: number;
  totalCount: number;  // Total connections including anonymous users
  connectionStatus: ConnectionStatus;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  /** ISO 8601 date string — messages older than this are filtered by the read layer.
   *  Null until the first message fetch completes. */
  retentionCutoff: string | null;
  error: string | null;
  /** User IDs blocked by the current user in this space (from auth:success, updated optimistically). */
  blockedUserIds: string[];
}

export interface ReplyData {
  messageId: string;
  authorName: string;
  excerpt: string;
}

export interface ChatActions {
  sendMessage: (content: string, replyTo?: ReplyData) => void;
  loadOlderMessages: () => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  banUser: (userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>;
  reportMessage: (messageId: string, reason: string, details?: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  retryFailed: (clientId: string) => void;
  registerMentionSound: (playFn: () => void) => void;
  registerChannelSound: (playFn: () => void) => void;
  getUserInfo: (userId: string) => UserInfo | undefined;
  getAvatarForMessage: (userId: string, messageTime: Date) => string | null;
}

// Re-export types to avoid breaking imports in components that import from this file
export type { AuthState, AuthActions, AuthStation, AuthUser };

const PAGE_SIZE = 50;

export function useRelayaChat(
  auth: AuthState,
  getToken: AuthActions['getToken'],
  options?: RelayaChatOptions
): ChatState & ChatActions {
  const [state, setState] = useState<ChatState>({
    messages: [],
    optimistic: [],
    users: [],
    userCount: 0,
    totalCount: 0,
    connectionStatus: 'disconnected',
    loadingInitial: false,
    loadingOlder: false,
    hasOlderMessages: false,
    retentionCutoff: null,
    error: null,
    blockedUserIds: [],
  });

  const connRef = useRef<ChatConnection | null>(null);
  const oldestMessageIdRef = useRef<string | undefined>(undefined);
  const newestMessageIdRef = useRef<string | undefined>(undefined);
  const pendingClientIds = useRef<Map<string, string>>(new Map()); // clientId → content

  // User directory for resolving message authors (no JOIN needed)
  const userDirectory = useRef<Map<string, UserInfo>>(new Map());

  // Avatar history for temporal tracking (session-only)
  const avatarHistory = useRef<Map<string, AvatarChange[]>>(new Map());

  const api = useRef(new ApiClient(options?.serverUrl ?? '', getToken, options?.apiKey)).current;

  // Refs to hold latest callback versions (defined after callbacks below)
  const handleWsMessageRef = useRef<((msg: WsServerMessage) => void) | null>(null);
  const handleStatusChangeRef = useRef<((status: ConnectionStatus) => void) | null>(null);

  // Refs for mention sound playback functions
  const mentionSoundPlayRef = useRef<(() => void) | null>(null);
  const channelSoundPlayRef = useRef<(() => void) | null>(null);

  // Ref for sticker refresh callback (kept fresh each render; avoids stale closures)
  const onStickersUpdatedRef = useRef<(() => void) | undefined>(undefined);

  // Mutable set of blocked user IDs (populated from auth:success, updated by blockUser/unblockUser)
  const blockedUserIdsRef = useRef<Set<string>>(new Set());

  // Get mute state from context (only available for authenticated users)
  const { isMuted } = useNotificationMute();

  // Ref to hold latest mute state (prevents callback recreation on toggle)
  const isMutedRef = useRef(isMuted);

  const stationSlug = auth.stationSlug;
  const userId = auth.user?.id ?? '';

  // ── Temporal avatar resolution ─────────────────────────────
  const getAvatarForMessage = useCallback((userId: string, messageTime: Date): string | null => {
    const history = avatarHistory.current.get(userId) || [];

    // Find most recent avatar that existed at messageTime
    const historicalEntry = history
      .filter(entry => entry.changedAt <= messageTime)
      .pop();

    if (historicalEntry) {
      return historicalEntry.url;
    }

    // Fallback to current avatar from directory
    return userDirectory.current.get(userId)?.avatarUrl ?? null;
  }, []);

  // ── Load messages via REST ─────────────────────────────────
  const loadMessages = useCallback(async (opts: { after?: string } = {}) => {
    if (!stationSlug) return;
    try {
      const res = await api.getMessages(stationSlug, {
        after: opts.after,
        limit: PAGE_SIZE,
      });
      const msgs = res.messages ?? [];

      console.log(
        `[loadMessages] ${opts.after ? 'catch-up (after=' + opts.after.slice(0, 8) + '…)' : 'initial'} → ${msgs.length} messages, ` +
        `oldest=${msgs[0]?.id?.slice(0, 8) ?? 'none'}… newest=${msgs[msgs.length - 1]?.id?.slice(0, 8) ?? 'none'}…, hasMore=${res.hasMore}`
      );

      setState((prev) => {
        // Filter out messages from blocked users before storing
        const blocked = blockedUserIdsRef.current;
        const filtered = msgs.filter((m) => !blocked.has(m.user_id));

        let merged: Message[];
        if (opts.after) {
          // Catch-up: append new messages, dedup
          merged = deduplicateMessages([...prev.messages, ...filtered]);
        } else {
          // Initial load
          merged = filtered;
        }
        // Track cursor positions
        if (msgs.length > 0) {
          newestMessageIdRef.current = merged[merged.length - 1].id;
          if (!opts.after) {
            oldestMessageIdRef.current = merged[0].id;
          }
        }
        return {
          ...prev,
          messages: merged,
          hasOlderMessages: res.hasMore ?? false,
          loadingInitial: false,
          // Only update retentionCutoff on initial load (not catch-up).
          // The initial load determines which cutoff applies to the current view.
          ...(opts.after ? {} : { retentionCutoff: res.retentionCutoff ?? null }),
        };
      });
    } catch (err) {
      console.error('[loadMessages] fetch failed:', err);
      setState((prev) => ({ ...prev, loadingInitial: false }));
    }
  }, [api, stationSlug]);

  // ── WebSocket message handler (see chatWsHandlers.ts) ──────
  const wsHandlerRefs: WsHandlerRefs = {
    userDirectory,
    avatarHistory,
    newestMessageIdRef,
    oldestMessageIdRef,
    mentionSoundPlayRef,
    channelSoundPlayRef,
    onStickersUpdatedRef,
    blockedUserIdsRef,
  };
  const handleWsMessage = useCallback(
    createWsMessageHandler(wsHandlerRefs, setState, loadMessages),
    [loadMessages] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Status change handler ──────────────────────────────────
  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setState((prev) => ({ ...prev, connectionStatus: status }));

    if (status === 'connected' && newestMessageIdRef.current) {
      // Reconnected — catch up any messages we missed
      loadMessages({ after: newestMessageIdRef.current });
    }
  }, [loadMessages]);

  // ── Keep refs updated with latest callbacks ────────────────
  // Memory leak fix: Update refs on every render so WebSocket always calls
  // the latest callback version. This prevents stale closures from accumulating.
  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
    handleStatusChangeRef.current = handleStatusChange;
    isMutedRef.current = isMuted;
    onStickersUpdatedRef.current = options?.onStickersUpdated;
  });

  // ── Connect / disconnect when auth changes ─────────────────
  useEffect(() => {
    // Don't attempt to connect while auth is still being determined.
    if (!stationSlug || auth.status === 'loading') return;

    let disposed = false;
    let authRetryTimer: ReturnType<typeof setTimeout> | null = null;

    // Build a fresh ChatConnection and store it in connRef.
    // When authenticated, calls ensureFreshToken first so the WS upgrade
    // never uses a stale AT (which would cause an HTTP 401 on the upgrade
    // and put the client into a reconnect loop until the timer refreshes).
    const createConnection = async () => {
      if (auth.status === 'authenticated' && options?.ensureFreshToken) {
        const token = await options.ensureFreshToken();
        if (!token) {
          setState((prev) => ({ ...prev, connectionStatus: 'reconnecting' }));
          if (authRetryTimer === null) {
            authRetryTimer = setTimeout(() => {
              authRetryTimer = null;
              if (!disposed && !document.hidden) void createConnection();
            }, 10_000);
          }
          return null;
        }
      }
      if (disposed) return null;
      const conn = new ChatConnection(
        () => {
          // For authenticated: use latest token via getToken() (avoids stale closure)
          // For anonymous: no token (undefined)
          const currentToken = auth.status === 'authenticated'
            ? (getToken() ?? undefined)
            : undefined;
          return buildWsUrlWithBase(options?.wsBaseUrl, stationSlug, currentToken, options?.apiKey);
        },
        (msg) => handleWsMessageRef.current?.(msg),
        (status) => handleStatusChangeRef.current?.(status),
        { onAuthRevoked: options?.onForcedLogout }
      );
      connRef.current = conn;
      conn.connect();
      return conn;
    };

    void createConnection();

    // Page Visibility API: close the connection when the tab has been hidden
    // long enough to matter, and reconnect when the tab becomes visible again.
    //
    // A delay is used before closing so that brief tab switches (which fire
    // visibilitychange immediately) don't generate noisy connect/disconnect churn
    // on the server. If the tab returns within the delay window the timer is
    // cancelled and the existing connection is kept alive. The server's heartbeat
    // (60s timeout) acts as the backstop for truly abandoned connections.
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityTimer = setTimeout(() => {
          visibilityTimer = null;
          connRef.current?.close();
          connRef.current = null;
        }, 30_000);
      } else {
        if (visibilityTimer !== null) {
          // Tab returned before the timer fired — keep the live connection.
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        } else {
          // Timer already fired (tab was hidden > 30s) — need a fresh connection.
          // close() sets the `closed` flag on the old instance; createConnection()
          // builds a new one (ensuring a fresh AT first). The catch-up logic in
          // handleStatusChange fetches any messages missed while hidden.
          void createConnection();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimer !== null) {
        clearTimeout(visibilityTimer);
      }
      if (authRetryTimer !== null) {
        clearTimeout(authRetryTimer);
      }
      connRef.current?.close();
      connRef.current = null;
    };
  }, [stationSlug, auth.status, getToken, options?.ensureFreshToken, options?.onForcedLogout, options?.wsBaseUrl]);

  // ── Load older messages ────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!stationSlug || !oldestMessageIdRef.current || state.loadingOlder) return;

    setState((prev) => ({ ...prev, loadingOlder: true }));
    try {
      const res = await api.getMessages(stationSlug, {
        before: oldestMessageIdRef.current,
        limit: PAGE_SIZE,
      });
      const older = (res.messages ?? []).filter((m) => !blockedUserIdsRef.current.has(m.user_id));
      setState((prev) => {
        const merged = deduplicateMessages([...older, ...prev.messages]);
        if (older.length > 0) {
          oldestMessageIdRef.current = older[0].id;
        }
        return {
          ...prev,
          messages: merged,
          hasOlderMessages: res.hasMore ?? false,
          loadingOlder: false,
        };
      });
    } catch {
      setState((prev) => ({ ...prev, loadingOlder: false }));
    }
  }, [api, stationSlug, state.loadingOlder]);

  // ── Send message (optimistic) ──────────────────────────────
  const sendMessage = useCallback((content: string, replyTo?: ReplyData) => {
    if (!connRef.current || !auth.user) return;

    const clientId = generateClientId();
    const optimisticMsg: OptimisticMessage = {
      clientId,
      content: content.trim(),
      authorId: userId,
      authorDisplayName: auth.user.displayName,
      authorAvatarUrl: auth.user.avatarUrl,
      createdAt: new Date(),
      status: 'sending',
    };

    setState((prev) => ({ ...prev, optimistic: [...prev.optimistic, optimisticMsg] }));
    pendingClientIds.current.set(clientId, content.trim());

    connRef.current.send({
      type: 'message:send',
      content: content.trim(),
      clientId,
      replyToMessageId: replyTo?.messageId,
      replyAuthorName: replyTo?.authorName,
      replyExcerpt: replyTo?.excerpt,
    });
  }, [auth.user, userId]);

  // ── Retry failed optimistic ────────────────────────────────
  const retryFailed = useCallback((clientId: string) => {
    if (!connRef.current || !auth.user) return;

    // Remove the old failed entry and re-send with a new clientId
    const content = pendingClientIds.current.get(clientId);
    if (!content) return;

    setState((prev) => ({
      ...prev,
      optimistic: prev.optimistic.filter((m) => m.clientId !== clientId),
    }));
    pendingClientIds.current.delete(clientId);
    sendMessage(content);
  }, [auth.user, sendMessage]);

  // ── Moderator REST actions ─────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    if (!stationSlug) return;
    await api.deleteMessage(stationSlug, messageId);
    // Optimistically mark as deleted in local state
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === messageId
          ? { ...m, is_deleted: true, content: null as unknown as string }
          : m
      ),
    }));
  }, [api, stationSlug]);

  const banUser = useCallback(async (
    targetUserId: string,
    params?: { reason?: string; expiresAt?: string }
  ) => {
    if (!stationSlug) return;
    await api.createBan(stationSlug, targetUserId, params);
  }, [api, stationSlug]);

  const reportMessage = useCallback(async (
    messageId: string,
    reason: string,
    details?: string
  ) => {
    if (!stationSlug) return;
    await api.createReport(stationSlug, messageId, reason, details);
  }, [api, stationSlug]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!stationSlug) return;
    try {
      const edited = await api.editMessage(stationSlug, messageId, newContent);
      // Optimistically update local state (will be confirmed by WS broadcast)
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId ? { ...m, ...edited } : m
        ),
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: 'Failed to edit message' }));
      throw err;
    }
  }, [api, stationSlug]);

  // ── Mention sound registration ─────────────────────────────
  const registerMentionSound = useCallback((playFn: () => void) => {
    mentionSoundPlayRef.current = playFn;
  }, []);

  const registerChannelSound = useCallback((playFn: () => void) => {
    channelSoundPlayRef.current = playFn;
  }, []);

  // ── Expose user directory lookup ───────────────────────────
  const getUserInfo = useCallback((userId: string): UserInfo | undefined => {
    return userDirectory.current.get(userId);
  }, []);

  // ── Block / unblock user ───────────────────────────────────
  const blockUser = useCallback(async (targetUserId: string) => {
    if (!stationSlug) return;
    // Optimistic update: add to block list and purge that user's messages from state
    blockedUserIdsRef.current.add(targetUserId);
    setState((prev) => ({
      ...prev,
      blockedUserIds: [...prev.blockedUserIds, targetUserId],
      messages: prev.messages.filter((m) => m.user_id !== targetUserId),
    }));
    try {
      await api.blockUser(stationSlug, targetUserId);
    } catch (err) {
      // Rollback on failure
      blockedUserIdsRef.current.delete(targetUserId);
      setState((prev) => ({
        ...prev,
        blockedUserIds: prev.blockedUserIds.filter((id) => id !== targetUserId),
      }));
      throw err;
    }
  }, [api, stationSlug]);

  const unblockUser = useCallback(async (targetUserId: string) => {
    if (!stationSlug) return;
    // Optimistic update
    blockedUserIdsRef.current.delete(targetUserId);
    setState((prev) => ({
      ...prev,
      blockedUserIds: prev.blockedUserIds.filter((id) => id !== targetUserId),
    }));
    try {
      await api.unblockUser(stationSlug, targetUserId);
    } catch (err) {
      // Rollback on failure
      blockedUserIdsRef.current.add(targetUserId);
      setState((prev) => ({
        ...prev,
        blockedUserIds: [...prev.blockedUserIds, targetUserId],
      }));
      throw err;
    }
  }, [api, stationSlug]);

  return {
    ...state,
    sendMessage,
    loadOlderMessages,
    editMessage,
    deleteMessage,
    banUser,
    reportMessage,
    blockUser,
    unblockUser,
    retryFailed,
    registerMentionSound,
    registerChannelSound,
    getUserInfo,
    getAvatarForMessage,
  };
}
