// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaChat — WebSocket + REST chat state for React Native / Expo.
 *
 * Mirrors the web useRelayaChat hook but:
 * - Accepts authState, getToken, and ensureFreshToken from useRelayaAuth
 * - Awaits ensureFreshToken() before authenticated WebSocket creation
 * - URL factory reads the token from a ref so internal ChatConnection reconnects
 *   always supply the freshest AT (avoids stale-token reconnects)
 * - Uses AppState (not browser visibility APIs) for background/foreground handling
 * - Delays WebSocket disconnect on background; cancels timer on quick foreground return
 * - Suppresses anonymous connections when allowAnonymous === false
 * - Builds the WS URL from serverUrl + spaceSlug props (no config.ts)
 * - Wires onAuthRevoked so server-side force_logout / 4001 resets connRef
 * - Has no NotificationMuteContext dependency (host app manages audio)
 *
 * Responsibilities:
 * - Open and manage a ChatConnection WebSocket instance
 * - Load initial messages via REST on connect (auth:success)
 * - Catch up missed messages via REST on reconnect (cursor-based)
 * - Load older messages on demand (scroll-up / load more)
 * - Handle optimistic message sending with clientId reconciliation
 * - Expose online users list from presence:update messages
 * - Dispatch moderator REST actions (delete, ban)
 * - Dispatch report REST action
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
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
import type { RelayaAuthState, RelayaAuthActions } from './useRelayaAuth';
import { buildRnWsUrl } from '../utils/buildRnWsUrl';
import { createWsMessageHandler } from './chatWsHandlers';
import type { WsHandlerRefs } from './chatWsHandlers';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnlineUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RelayaChatOptions {
/** Relaya SaaS endpoint — always 'https://api.relaya.chat' */
  serverUrl: string;
  /** Your space slug — e.g. 'your-space-slug' */
  spaceSlug: string;
  /** Auth state from useRelayaAuth */
  authState: RelayaAuthState;
  /** Token getter from useRelayaAuth — called synchronously for API requests */
  getToken: RelayaAuthActions['getToken'];
  /** Token freshness ensurer from useRelayaAuth — awaited before WS creation */
  ensureFreshToken: RelayaAuthActions['ensureFreshToken'];
  /**
   * Default true: anonymous/read-only users may connect and read chat.
   * Set to false to suppress any WebSocket connection until the user authenticates.
   */
  allowAnonymous?: boolean;
  /** Milliseconds to wait after backgrounding before closing WS. Default: 3 minutes. */
  backgroundDisconnectDelayMs?: number;
  /**
   * Optional per-space API key (generated in the space admin panel, Native tab).
   * When provided:
   * - Sent as `X-Relaya-Api-Key` on all REST requests
   * - Appended as `?apiKey=` on the WebSocket upgrade URL
   */
  apiKey?: string;
  /** Called when the server notifies that the sticker library changed (stickers:updated WS event). */
  onStickersUpdated?: () => void;
}

export interface RelayaChatState {
  messages: Message[];
  optimistic: OptimisticMessage[];
  users: OnlineUser[];
  userCount: number;
  totalCount: number;
  connectionStatus: ConnectionStatus;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  /** IDs of users blocked by the current user in this space. Empty for anonymous users. */
  blockedUserIds: string[];
  error: string | null;
}

export interface ReplyData {
  messageId: string;
  authorName: string;
  excerpt: string;
}

export interface RelayaChatActions {
  sendMessage: (content: string, replyTo?: ReplyData) => void;
  loadOlderMessages: () => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  banUser: (userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>;
  reportMessage: (messageId: string, reason: string, details?: string) => Promise<void>;
  /** Block a user in this space. Optimistically removes their messages; rolls back on failure. */
  blockUser: (userId: string) => Promise<void>;
  /** Unblock a previously blocked user. Optimistically removes them from the block list. */
  unblockUser: (userId: string) => Promise<void>;
  getUserInfo: (userId: string) => UserInfo | undefined;
  getAvatarForMessage: (userId: string, messageTime: Date) => string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelayaChat(options: RelayaChatOptions): RelayaChatState & RelayaChatActions {
  const {
    serverUrl,
    spaceSlug,
    authState,
    getToken,
    ensureFreshToken,
    allowAnonymous = true,
    backgroundDisconnectDelayMs = 3 * 60 * 1000,
    apiKey,
  } = options;

  // Internal alias: server API still uses stationSlug terminology
  const stationSlug = spaceSlug;

  const [state, setState] = useState<RelayaChatState>({
    messages: [],
    optimistic: [],
    users: [],
    userCount: 0,
    totalCount: 0,
    connectionStatus: 'disconnected',
    loadingInitial: false,
    loadingOlder: false,
    hasOlderMessages: false,
    blockedUserIds: [],
    error: null,
  });

  const connRef = useRef<ChatConnection | null>(null);
  const oldestMessageIdRef = useRef<string | undefined>(undefined);
  const newestMessageIdRef = useRef<string | undefined>(undefined);
  const pendingClientIds = useRef<Map<string, string>>(new Map());
  // Mutable set of blocked user IDs (populated from auth:success, updated by blockUser/unblockUser)
  const blockedUserIdsRef = useRef<Set<string>>(new Set());
  // Latest onStickersUpdated callback from options, refreshed every render
  const onStickersUpdatedRef = useRef<(() => void) | undefined>(options.onStickersUpdated);

  // Ref-backed guard for loadOlderMessages — avoids stale closure behavior
  const loadingOlderRef = useRef(false);

  // Background disconnect timer
  const bgDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Holds the token that the WS URL factory will use on every (re)connect.
  // Updated immediately before each connect attempt so that internal ChatConnection
  // reconnects (after network drops) always supply the freshest AT rather than the
  // stale value captured at construction time.
  const currentTokenRef = useRef<string | undefined>(undefined);

  // User directory for resolving message authors
  const userDirectory = useRef<Map<string, UserInfo>>(new Map());

  // Avatar history for temporal tracking (session-only)
  const avatarHistory = useRef<Map<string, AvatarChange[]>>(new Map());

  const api = useRef(new ApiClient(serverUrl, getToken, apiKey)).current;

  // Stable refs for callbacks — prevents stale closures in long-lived WS handlers
  const handleWsMessageRef = useRef<((msg: WsServerMessage) => void) | null>(null);
  const handleStatusChangeRef = useRef<((status: ConnectionStatus) => void) | null>(null);

  const userId = authState.user?.id ?? '';

  // ── Temporal avatar resolution ─────────────────────────────────────────────

  const getAvatarForMessage = useCallback(
    (userId: string, messageTime: Date): string | null => {
      const history = avatarHistory.current.get(userId) || [];

      // Find most recent avatar that existed at messageTime
      const historicalEntry = history
        .filter((entry) => entry.changedAt <= messageTime)
        .pop();

      if (historicalEntry) {
        return historicalEntry.url;
      }

      return userDirectory.current.get(userId)?.avatarUrl ?? null;
    },
    []
  );

  // ── Load messages via REST ─────────────────────────────────────────────────

  const loadMessages = useCallback(
    async (opts: { after?: string } = {}): Promise<void> => {
      if (!stationSlug) return;
      try {
        const res = await api.getMessages(stationSlug, {
          after: opts.after,
          limit: PAGE_SIZE,
        });
        const msgs = res.messages ?? [];

        setState((prev) => {
          // Filter out messages from blocked users before storing
          const blocked = blockedUserIdsRef.current;
          const filtered = msgs.filter((m) => !blocked.has(m.user_id));

          let merged: Message[];
          if (opts.after) {
            merged = deduplicateMessages([...prev.messages, ...filtered]);
          } else {
            merged = filtered;
          }
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
          };
        });
      } catch (err) {
        console.error('[useRelayaChat] loadMessages failed:', err);
        setState((prev) => ({ ...prev, loadingInitial: false }));
      }
    },
    [api, stationSlug]
  );

  // ── WebSocket message handler ──────────────────────────────────────────────

  const wsHandlerRefs: WsHandlerRefs = {
    userDirectory,
    avatarHistory,
    newestMessageIdRef,
    oldestMessageIdRef,
    onStickersUpdatedRef,
    blockedUserIdsRef,
  };

  const handleWsMessage = useCallback(
    createWsMessageHandler(wsHandlerRefs, setState, loadMessages),
    [loadMessages]
  );

  // ── Status change handler ──────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    (status: ConnectionStatus): void => {
      setState((prev) => ({ ...prev, connectionStatus: status }));

      if (status === 'connected' && newestMessageIdRef.current) {
        // Reconnected — catch up any messages we missed
        loadMessages({ after: newestMessageIdRef.current });
      }
    },
    [loadMessages]
  );

  // ── Keep refs updated with latest callbacks ────────────────────────────────

  useEffect(() => {
    handleWsMessageRef.current = handleWsMessage;
    handleStatusChangeRef.current = handleStatusChange;
    onStickersUpdatedRef.current = options.onStickersUpdated;
  });

  // ── Connect / disconnect when auth changes ─────────────────────────────────

  useEffect(() => {
    // Don't connect while auth is still being determined
    if (!stationSlug || authState.status === 'loading') return;

    // authState.status === 'otp-sent' falls through: anonymous connection is
    // appropriate while the user is mid-login (they can read but not post).

    // Suppress all connections when allowAnonymous is explicitly false and the
    // user is not yet authenticated.
    if (authState.status !== 'authenticated' && allowAnonymous === false) return;

    let cancelled = false;

    async function openConnection(): Promise<void> {
      let token: string | undefined;

      if (authState.status === 'authenticated') {
        const freshToken = await ensureFreshToken();
        if (cancelled) return;

        if (freshToken === null) {
          // ensureFreshToken returned null. Two possible causes:
          // (a) Confirmed auth failure: useRelayaAuth has already cleared state and
          //     authState.status will transition to 'anonymous', re-triggering this
          //     effect automatically.
          // (b) Transient network error: useRelayaAuth preserves the RT and schedules
          //     its own 10-second retry, which will eventually call ensureFreshToken
          //     and result in a status change that re-triggers this effect.
          // In both cases the correct response is to show 'reconnecting' and wait.
          setState((prev) => ({ ...prev, connectionStatus: 'reconnecting' }));
          return;
        }
        token = freshToken;
      }

      if (cancelled) return;

      // Store token in ref so the URL factory always reads the latest value on
      // every internal ChatConnection reconnect attempt (network drop, etc.).
      currentTokenRef.current = token;

      const conn = new ChatConnection(
        () => buildRnWsUrl(serverUrl, stationSlug, currentTokenRef.current, apiKey),
        (msg) => handleWsMessageRef.current?.(msg),
        (status) => handleStatusChangeRef.current?.(status),
        {
          onAuthRevoked: () => {
            // Server sent force_logout or closed with 4001. The ChatConnection has
            // permanently stopped — null the ref so the AppState handler doesn't
            // try to reuse it, and let the caller's onSessionEnded handle UI.
            connRef.current = null;
          },
        }
      );

      connRef.current = conn;
      conn.connect();
    }

    openConnection().catch(() => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      }
    });

    return () => {
      cancelled = true;
      connRef.current?.close();
      connRef.current = null;
    };
  }, [authState.status, stationSlug, serverUrl, ensureFreshToken, allowAnonymous]);

  // ── AppState: background/foreground handling ───────────────────────────────

  useEffect(() => {
    // cancelled prevents a connection created by ensureFreshToken().then(...)
    // from landing after this effect has been torn down and re-run.
    let cancelled = false;

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          // Schedule WebSocket close after the delay
          if (!bgDisconnectTimerRef.current) {
            bgDisconnectTimerRef.current = setTimeout(() => {
              bgDisconnectTimerRef.current = null;
              connRef.current?.close();
              connRef.current = null;
            }, backgroundDisconnectDelayMs);
          }
        } else if (nextState === 'active') {
          if (bgDisconnectTimerRef.current) {
            // Quick foreground return — cancel timer, keep existing connection
            clearTimeout(bgDisconnectTimerRef.current);
            bgDisconnectTimerRef.current = null;
          } else if (!connRef.current) {
            // Long background: connection was closed — reconnect with fresh token
            if (authState.status === 'authenticated') {
              ensureFreshToken().then((freshToken) => {
                if (cancelled || !freshToken) return;
                currentTokenRef.current = freshToken;
                const conn = new ChatConnection(
                  () => buildRnWsUrl(serverUrl, stationSlug, currentTokenRef.current, apiKey),
                  (msg) => handleWsMessageRef.current?.(msg),
                  (status) => handleStatusChangeRef.current?.(status),
                  {
                    onAuthRevoked: () => {
                      connRef.current = null;
                    },
                  }
                );
                connRef.current = conn;
                conn.connect();
              }).catch(() => {
                // ensureFreshToken failure handled inside the auth hook
              });
            } else if (allowAnonymous !== false) {
              if (cancelled) return;
              currentTokenRef.current = undefined;
              const conn = new ChatConnection(
                () => buildRnWsUrl(serverUrl, stationSlug, currentTokenRef.current, apiKey),
                (msg) => handleWsMessageRef.current?.(msg),
                (status) => handleStatusChangeRef.current?.(status)
              );
              connRef.current = conn;
              conn.connect();
            }
          }
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.remove();
      if (bgDisconnectTimerRef.current) {
        clearTimeout(bgDisconnectTimerRef.current);
        bgDisconnectTimerRef.current = null;
      }
    };
  }, [authState.status, stationSlug, serverUrl, ensureFreshToken, allowAnonymous, backgroundDisconnectDelayMs]);

  // ── Load older messages ────────────────────────────────────────────────────

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (!stationSlug || !oldestMessageIdRef.current || loadingOlderRef.current) return;

    loadingOlderRef.current = true;
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
    } finally {
      loadingOlderRef.current = false;
    }
  }, [api, stationSlug]);

  // ── Send message (optimistic) ──────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string, replyTo?: ReplyData): void => {
      if (!connRef.current || !authState.user) return;

      const clientId = generateClientId();
      const optimisticMsg: OptimisticMessage = {
        clientId,
        content: content.trim(),
        authorId: userId,
        authorDisplayName: authState.user.displayName,
        authorAvatarUrl: authState.user.avatarUrl,
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
    },
    [authState.user, userId]
  );

  // ── Moderator REST actions ─────────────────────────────────────────────────

  const deleteMessage = useCallback(
    async (messageId: string): Promise<void> => {
      if (!stationSlug) return;
      await api.deleteMessage(stationSlug, messageId);
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId
            ? { ...m, is_deleted: true, content: null as unknown as string }
            : m
        ),
      }));
    },
    [api, stationSlug]
  );

  const banUser = useCallback(
    async (
      targetUserId: string,
      params?: { reason?: string; expiresAt?: string }
    ): Promise<void> => {
      if (!stationSlug) return;
      await api.createBan(stationSlug, targetUserId, params);
    },
    [api, stationSlug]
  );

  const reportMessage = useCallback(
    async (messageId: string, reason: string, details?: string): Promise<void> => {
      if (!stationSlug) return;
      await api.createReport(stationSlug, messageId, reason, details);
    },
    [api, stationSlug]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string): Promise<void> => {
      if (!stationSlug) return;
      try {
        const edited = await api.editMessage(stationSlug, messageId, newContent);
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
    },
    [api, stationSlug]
  );

  // ── Block / unblock user ───────────────────────────────────────────────────

  const blockUser = useCallback(async (targetUserId: string): Promise<void> => {
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

  const unblockUser = useCallback(async (targetUserId: string): Promise<void> => {
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

  // ── Expose user directory lookup ───────────────────────────────────────────

  const getUserInfo = useCallback(
    (userId: string): UserInfo | undefined => userDirectory.current.get(userId),
    []
  );

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
    getUserInfo,
    getAvatarForMessage,
  };
}
