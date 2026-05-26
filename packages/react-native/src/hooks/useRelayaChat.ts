// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useRelayaChat — WebSocket + REST chat state for React Native / Expo.
 *
 * Mirrors the web useRelayaChat hook but:
 * - Accepts a getToken callback instead of using cookies
 * - Builds the WS URL from serverUrl + stationSlug props (no config.ts)
 * - Has no NotificationMuteContext dependency (host app manages audio)
 * - Has no sticker system (mobile UI handles stickers independently)
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
import {
  ApiClient,
  ChatConnection,
  generateClientId,
  deduplicateMessages,
  removeReconciledOptimistic,
  markOptimisticFailed,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const MAX_MESSAGES = 150;
const MAX_AVATAR_HISTORY = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnlineUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RelayaChatOptions {
  /** Relaya SaaS endpoint — always 'https://api.relaya.chat' */
  serverUrl: string;
  /** Your space slug — e.g. 'balearic-fm' */
  stationSlug: string;
  /** Auth state from useRelayaAuth */
  authState: RelayaAuthState;
  /** Token getter from useRelayaAuth — called on every WS connect and API request */
  getToken: RelayaAuthActions['getToken'];
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
  getUserInfo: (userId: string) => UserInfo | undefined;
  getAvatarForMessage: (userId: string, messageTime: Date) => string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelayaChat(options: RelayaChatOptions): RelayaChatState & RelayaChatActions {
  const { serverUrl, stationSlug, authState, getToken } = options;

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
    error: null,
  });

  const connRef = useRef<ChatConnection | null>(null);
  const oldestMessageIdRef = useRef<string | undefined>(undefined);
  const newestMessageIdRef = useRef<string | undefined>(undefined);
  const pendingClientIds = useRef<Map<string, string>>(new Map());

  // User directory for resolving message authors
  const userDirectory = useRef<Map<string, UserInfo>>(new Map());

  // Avatar history for temporal tracking (session-only)
  const avatarHistory = useRef<Map<string, AvatarChange[]>>(new Map());

  const api = useRef(new ApiClient(serverUrl, getToken)).current;

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
          let merged: Message[];
          if (opts.after) {
            merged = deduplicateMessages([...prev.messages, ...msgs]);
          } else {
            merged = msgs;
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

  const handleWsMessage = useCallback(
    (msg: WsServerMessage): void => {
      switch (msg.type) {
        case 'auth:success': {
          // Populate user directory
          userDirectory.current.clear();
          avatarHistory.current.clear();

          msg.users.forEach((user) => {
            userDirectory.current.set(user.id, {
              id: user.id,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            });
            if (user.avatarUrl !== null) {
              avatarHistory.current.set(user.id, [{ url: user.avatarUrl, changedAt: new Date(0) }]);
            }
          });

          // Fresh connect: load initial messages. Reconnect: catch-up already in flight.
          if (!newestMessageIdRef.current) {
            setState((prev) => ({ ...prev, loadingInitial: true }));
            loadMessages();
          }
          break;
        }

        case 'message:broadcast': {
          const { message, clientId } = msg;
          setState((prev) => {
            const deduped = deduplicateMessages([...prev.messages, message]);
            const newMessages =
              deduped.length > MAX_MESSAGES
                ? deduped.slice(deduped.length - MAX_MESSAGES)
                : deduped;
            const newOptimistic = removeReconciledOptimistic(prev.optimistic, clientId);
            newestMessageIdRef.current = message.id;
            if (newMessages.length > 0) {
              oldestMessageIdRef.current = newMessages[0].id;
            }
            return { ...prev, messages: newMessages, optimistic: newOptimistic };
          });
          break;
        }

        case 'message:deleted': {
          const { messageId } = msg;
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId
                ? { ...m, is_deleted: true, content: null as unknown as string }
                : m
            ),
          }));
          break;
        }

        case 'message:edited': {
          const { message } = msg;
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) => (m.id === message.id ? message : m)),
          }));
          break;
        }

        case 'presence:update': {
          msg.users.forEach((user) => {
            userDirectory.current.set(user.id, {
              id: user.id,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            });
          });
          setState((prev) => ({
            ...prev,
            users: msg.users.map((u) => ({
              id: u.id,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl,
            })),
            userCount: msg.userCount,
            totalCount: msg.totalCount,
          }));
          break;
        }

        case 'user:update': {
          const { userId: updatedUserId, updates, timestamp } = msg;
          const existing = userDirectory.current.get(updatedUserId);
          userDirectory.current.set(updatedUserId, {
            id: updatedUserId,
            displayName: updates.displayName ?? existing?.displayName ?? 'Unknown User',
            avatarUrl:
              updates.avatarUrl !== undefined
                ? updates.avatarUrl
                : (existing?.avatarUrl ?? null),
          });

          if (updates.avatarUrl !== undefined) {
            const history = avatarHistory.current.get(updatedUserId) || [];
            history.push({ url: updates.avatarUrl, changedAt: new Date(timestamp) });
            const capped =
              history.length > MAX_AVATAR_HISTORY
                ? history.slice(history.length - MAX_AVATAR_HISTORY)
                : history;
            avatarHistory.current.set(updatedUserId, capped);
          }

          setState((prev) => ({
            ...prev,
            users: prev.users.map((u) =>
              u.id === updatedUserId ? { ...u, ...updates } : u
            ),
          }));
          break;
        }

        case 'error': {
          setState((prev) => {
            const pending = prev.optimistic.filter((m) => m.status === 'sending');
            if (pending.length === 1) {
              return {
                ...prev,
                optimistic: markOptimisticFailed(prev.optimistic, pending[0].clientId),
                error: msg.message,
              };
            }
            return { ...prev, error: msg.message };
          });
          break;
        }

        // mention:notification and channel:notification — host app handles audio
        case 'mention:notification':
        case 'channel:notification':
        case 'stickers:updated':
        default:
          break;
      }
    },
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
  });

  // ── Connect / disconnect when auth changes ─────────────────────────────────

  useEffect(() => {
    // Don't connect while auth is still being determined
    if (!stationSlug || authState.status === 'loading') return;

    const conn = new ChatConnection(
      () => {
        const token =
          authState.status === 'authenticated' ? (getToken() ?? undefined) : undefined;
        return buildRnWsUrl(serverUrl, stationSlug, token);
      },
      (msg) => handleWsMessageRef.current?.(msg),
      (status) => handleStatusChangeRef.current?.(status)
    );

    connRef.current = conn;
    conn.connect();

    return () => {
      conn.close();
      connRef.current = null;
    };
  }, [authState.status, stationSlug, serverUrl, getToken]);

  // ── Load older messages ────────────────────────────────────────────────────

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (!stationSlug || !oldestMessageIdRef.current || state.loadingOlder) return;

    setState((prev) => ({ ...prev, loadingOlder: true }));
    try {
      const res = await api.getMessages(stationSlug, {
        before: oldestMessageIdRef.current,
        limit: PAGE_SIZE,
      });
      const older = res.messages ?? [];
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
    getUserInfo,
    getAvatarForMessage,
  };
}
