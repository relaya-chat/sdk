// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * WebSocket message handler factory for useRelayaChat
 *
 * Extracted to keep useRelayaChat.ts under the 400-line size threshold.
 * All mutable state is accessed via refs; the factory returns a stable handler
 * that can be wrapped in useCallback([loadMessages]).
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
import type { ChatState } from './useRelayaChat.js';

// ── Constants ──────────────────────────────────────────────
export const MAX_MESSAGES = 150;
export const MAX_AVATAR_HISTORY = 20;

// ── Ref bundle passed into the factory ────────────────────
export interface WsHandlerRefs {
  userDirectory: MutableRefObject<Map<string, UserInfo>>;
  avatarHistory: MutableRefObject<Map<string, AvatarChange[]>>;
  newestMessageIdRef: MutableRefObject<string | undefined>;
  oldestMessageIdRef: MutableRefObject<string | undefined>;
  mentionSoundPlayRef: MutableRefObject<(() => void) | null>;
  channelSoundPlayRef: MutableRefObject<(() => void) | null>;
  /** Callback to refresh sticker list after stickers:updated WS event. Set by ChatWindow via useRelayaChat options. */
  onStickersUpdatedRef: MutableRefObject<(() => void) | undefined>;
  /** Mutable set of user IDs blocked by the current user (updated by blockUser/unblockUser). */
  blockedUserIdsRef: MutableRefObject<Set<string>>;
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
  setState: Dispatch<SetStateAction<ChatState>>,
  loadMessages: (opts?: { after?: string }) => Promise<void>
): (msg: WsServerMessage) => void {
  return (msg: WsServerMessage) => {
    switch (msg.type) {
      case 'auth:success': {
        // Populate user directory from auth:success
        refs.userDirectory.current.clear();
        refs.avatarHistory.current.clear();

        msg.users.forEach(user => {
          refs.userDirectory.current.set(user.id, {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });

          // Initialize avatar history with baseline entry.
          // Use epoch so all existing messages find this baseline.
          if (user.avatarUrl !== null) {
            refs.avatarHistory.current.set(user.id, [{
              url: user.avatarUrl,
              changedAt: new Date(0),
            }]);
          }
        });

        // Populate block list from auth:success (server delivers canonical list at connect time).
        // Cast needed because WsServerMessage type predates this field.
        const authMsg = msg as typeof msg & { blockedUserIds?: string[] };
        refs.blockedUserIdsRef.current = new Set(authMsg.blockedUserIds ?? []);
        setState((prev) => ({
          ...prev,
          blockedUserIds: authMsg.blockedUserIds ?? [],
        }));

        // On fresh initial connect (no cursor yet), do a full history load.
        // On reconnect, handleStatusChange('connected') already triggered
        // a catch-up load. Don't overwrite that with a full reset here.
        if (!refs.newestMessageIdRef.current) {
          console.log('[auth:success] fresh connect — loading initial messages');
          setState((prev) => ({ ...prev, loadingInitial: true }));
          loadMessages();
        } else {
          console.log('[auth:success] reconnect — skipping full reload (catch-up already in flight)');
        }
        break;
      }

      case 'message:broadcast': {
        const { message, clientId } = msg;
        // Silently drop messages from blocked users
        if (refs.blockedUserIdsRef.current.has(message.user_id)) break;
        setState((prev) => {
          const deduped = deduplicateMessages([...prev.messages, message]);
          // Ring buffer: drop oldest messages when we exceed MAX_MESSAGES
          const newMessages = deduped.length > MAX_MESSAGES
            ? deduped.slice(deduped.length - MAX_MESSAGES)
            : deduped;
          const newOptimistic = removeReconciledOptimistic(prev.optimistic, clientId);
          refs.newestMessageIdRef.current = message.id;
          // Keep oldestMessageIdRef pointing at the actual oldest in memory
          // so that "load older" continues to work correctly after eviction
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
          messages: prev.messages.map((m) =>
            m.id === message.id ? message : m
          ),
        }));
        break;
      }

      case 'mention:notification': {
        const { mentionedBy, excerpt } = msg;
        // @mention always punches through mute — this is a direct personal alert
        if (refs.mentionSoundPlayRef.current) {
          refs.mentionSoundPlayRef.current();
        }
        console.log(`[Mention] @${mentionedBy.displayName}: ${excerpt}`);
        break;
      }

      case 'channel:notification': {
        const { mentionedBy, excerpt } = msg;
        // @channel always punches through mute — admin-only, treated as important
        if (refs.channelSoundPlayRef.current) {
          refs.channelSoundPlayRef.current();
        }
        console.log(`[Channel] @channel by ${mentionedBy.displayName}: ${excerpt}`);
        break;
      }

      case 'presence:update':
        // Update user directory with any new online users
        msg.users.forEach(user => {
          refs.userDirectory.current.set(user.id, {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
        });

        setState((prev) => ({
          ...prev,
          users: msg.users.map(u => ({
            id: u.id,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
          })),
          userCount: msg.userCount,
          totalCount: msg.totalCount,
        }));
        break;

      case 'user:update': {
        const { userId: updatedUserId, updates, timestamp } = msg;

        // Update user directory (create if doesn't exist)
        const existing = refs.userDirectory.current.get(updatedUserId);
        refs.userDirectory.current.set(updatedUserId, {
          id: updatedUserId,
          displayName: updates.displayName ?? existing?.displayName ?? 'Unknown User',
          avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : (existing?.avatarUrl ?? null),
        });

        // Track avatar changes in history for temporal resolution
        if (updates.avatarUrl !== undefined) {
          const history = refs.avatarHistory.current.get(updatedUserId) || [];
          history.push({
            url: updates.avatarUrl,
            changedAt: new Date(timestamp),
          });
          // Ring buffer: evict oldest entries beyond cap
          const capped = history.length > MAX_AVATAR_HISTORY
            ? history.slice(history.length - MAX_AVATAR_HISTORY)
            : history;
          refs.avatarHistory.current.set(updatedUserId, capped);
        }

        // Update online users list if user is currently online
        setState((prev) => ({
          ...prev,
          users: prev.users.map(u =>
            u.id === updatedUserId
              ? { ...u, ...updates }
              : u
          ),
        }));
        break;
      }

      case 'error': {
        // If we can correlate the error to a pending clientId, mark it failed.
        // The server doesn't echo clientId on errors, so we mark the most recently
        // sent pending optimistic as failed if there is exactly one pending.
        setState((prev) => {
          const pending = prev.optimistic.filter((m) => m.status === 'sending');
          if (pending.length === 1) {
            return {
              ...prev,
              optimistic: markOptimisticFailed(prev.optimistic, pending[0].clientId, msg.message),
              error: msg.message,
            };
          }
          return { ...prev, error: msg.message };
        });
        break;
      }

      case 'stickers:updated':
        // Server notifies all connected clients that the sticker library changed.
        // ChatWindow refreshes its local sticker list via the onStickersUpdated callback.
        refs.onStickersUpdatedRef.current?.();
        break;

      default:
        break;
    }
  };
}
