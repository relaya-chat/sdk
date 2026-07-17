// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * WebSocket message handler factory for useRelayaChat (React Native)
 *
 * Extracted to keep useRelayaChat.ts under the project's file-size threshold.
 * All mutable state is accessed via refs; the factory returns a stable handler
 * that can be wrapped in useCallback([loadMessages]).
 *
 * Mirrors packages/react/src/hooks/chatWsHandlers.ts, minus the web-only
 * mention/channel notification sound refs (host app manages audio on RN).
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import {
  deduplicateMessages,
  removeReconciledOptimistic,
  markOptimisticFailed,
} from '@relaya-chat/core';
import type {
  UserInfo,
  AvatarChange,
  WsServerMessage,
} from '@relaya-chat/core';
import type { RelayaChatState } from './useRelayaChat';

// ── Constants ──────────────────────────────────────────────
export const MAX_MESSAGES = 150;
export const MAX_AVATAR_HISTORY = 20;

// ── Ref bundle passed into the factory ────────────────────
export interface WsHandlerRefs {
  userDirectory: MutableRefObject<Map<string, UserInfo>>;
  avatarHistory: MutableRefObject<Map<string, AvatarChange[]>>;
  newestMessageIdRef: MutableRefObject<string | undefined>;
  oldestMessageIdRef: MutableRefObject<string | undefined>;
  /** Callback to refresh sticker list after stickers:updated WS event. Set by host app via useRelayaChat options. */
  onStickersUpdatedRef: MutableRefObject<(() => void) | undefined>;
  /** Mutable set of user IDs blocked by the current user (updated by blockUser/unblockUser). */
  blockedUserIdsRef: MutableRefObject<Set<string>>;
  /** Called when the server sends a mention:notification for the current user. Host app plays audio. */
  onMentionNotificationRef: MutableRefObject<(() => void) | undefined>;
  /** Called when the server sends a channel:notification (@channel mention). Host app plays audio. */
  onChannelNotificationRef: MutableRefObject<(() => void) | undefined>;
}

/**
 * Returns a WebSocket message handler that closes over the provided refs,
 * setState dispatcher, and loadMessages callback.
 *
 * Designed to be used as the body of a useCallback([loadMessages]) so that
 * the handler is recreated only when loadMessages changes.
 */
export function createWsMessageHandler(
  refs: WsHandlerRefs,
  setState: Dispatch<SetStateAction<RelayaChatState>>,
  loadMessages: (opts?: { after?: string }) => Promise<void>
): (msg: WsServerMessage) => void {
  return (msg: WsServerMessage) => {
    switch (msg.type) {
      case 'auth:success': {
        // Populate user directory
        refs.userDirectory.current.clear();
        refs.avatarHistory.current.clear();

        msg.users.forEach((user) => {
          refs.userDirectory.current.set(user.id, {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
          if (user.avatarUrl !== null) {
            refs.avatarHistory.current.set(user.id, [{ url: user.avatarUrl, changedAt: new Date(0) }]);
          }
        });

        // Populate block list from auth:success
        const authMsg = msg as typeof msg & { blockedUserIds?: string[] };
        refs.blockedUserIdsRef.current = new Set(authMsg.blockedUserIds ?? []);
        setState((prev) => ({
          ...prev,
          blockedUserIds: authMsg.blockedUserIds ?? [],
        }));

        // Fresh connect: load initial messages. Reconnect: catch-up already in flight.
        if (!refs.newestMessageIdRef.current) {
          setState((prev) => ({ ...prev, loadingInitial: true }));
          loadMessages();
        }
        break;
      }

      case 'message:broadcast': {
        const { message, clientId } = msg;
        // Silently drop messages from blocked users
        if (refs.blockedUserIdsRef.current.has(message.user_id)) break;
        setState((prev) => {
          const deduped = deduplicateMessages([...prev.messages, message]);
          const newMessages =
            deduped.length > MAX_MESSAGES
              ? deduped.slice(deduped.length - MAX_MESSAGES)
              : deduped;
          const newOptimistic = removeReconciledOptimistic(prev.optimistic, clientId);
          refs.newestMessageIdRef.current = message.id;
          if (newMessages.length > 0) {
            refs.oldestMessageIdRef.current = newMessages[0].id;
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
          refs.userDirectory.current.set(user.id, {
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
        const existing = refs.userDirectory.current.get(updatedUserId);
        refs.userDirectory.current.set(updatedUserId, {
          id: updatedUserId,
          displayName: updates.displayName ?? existing?.displayName ?? 'Unknown User',
          avatarUrl:
            updates.avatarUrl !== undefined
              ? updates.avatarUrl
              : (existing?.avatarUrl ?? null),
        });

        if (updates.avatarUrl !== undefined) {
          const history = refs.avatarHistory.current.get(updatedUserId) || [];
          history.push({ url: updates.avatarUrl, changedAt: new Date(timestamp) });
          const capped =
            history.length > MAX_AVATAR_HISTORY
              ? history.slice(history.length - MAX_AVATAR_HISTORY)
              : history;
          refs.avatarHistory.current.set(updatedUserId, capped);
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

      case 'stickers:updated':
        // Server notifies all connected clients that the sticker library changed.
        // Host app refreshes its local sticker list via the onStickersUpdated callback.
        refs.onStickersUpdatedRef.current?.();
        break;

      case 'mention:notification':
        refs.onMentionNotificationRef.current?.();
        break;

      case 'channel:notification':
        refs.onChannelNotificationRef.current?.();
        break;

      default:
        break;
    }
  };
}
