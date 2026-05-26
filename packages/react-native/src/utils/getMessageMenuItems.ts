// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * getMessageMenuItems — pure moderation decision utility.
 *
 * Determines which context menu / action sheet items to show for a given
 * message, based on ownership, permissions, and message state.
 *
 * This function is intentionally pure (no side effects, no platform deps)
 * so it can be unit-tested without a React Native environment and shared
 * across web and mobile surfaces to prevent moderation UX drift.
 */

import type { Message, Permission } from '@relaya-chat/core';

export interface MessageMenuItems {
  showReply: boolean;
  showEdit: boolean;
  showDelete: boolean;
  showReport: boolean;
  showBan: boolean;
  /** Avatar options — only shown on the current user's own messages */
  showAvatarOptions: boolean;
}

export interface MessageMenuOpts {
  message: Message;
  currentUserId: string | null;       // null = anonymous
  currentUserPermissions: Permission[];
  currentUserPriority: number;        // role priority (0 = listener)
  messageAuthorPriority: number;      // for ban eligibility check
}

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_EDITS = 2;

export function getMessageMenuItems(opts: MessageMenuOpts): MessageMenuItems {
  const {
    message,
    currentUserId,
    currentUserPermissions,
    currentUserPriority,
    messageAuthorPriority,
  } = opts;

  const isOwn = !!currentUserId && message.user_id === currentUserId;
  const isAnonymous = !currentUserId;
  const isDeleted = message.is_deleted;

  const hasPermission = (p: Permission): boolean =>
    currentUserPermissions.includes(p);

  const withinEditWindow =
    !isDeleted &&
    Date.now() - new Date(message.created_at).getTime() < EDIT_WINDOW_MS;

  const editCountOk = (message.edit_count ?? 0) < MAX_EDITS;

  // Ban is only available when the target has lower priority than the actor
  const canBanTarget = messageAuthorPriority < currentUserPriority;

  return {
    showReply: !isAnonymous && !isDeleted,
    showEdit:
      isOwn &&
      withinEditWindow &&
      editCountOk &&
      hasPermission('chat.edit_own'),
    showDelete:
      !isDeleted && (isOwn || hasPermission('chat.delete_any')),
    showReport: !isOwn && !isAnonymous && !isDeleted,
    showBan:
      !isOwn &&
      !isAnonymous &&
      hasPermission('chat.ban_user') &&
      canBanTarget,
    showAvatarOptions: isOwn,
  };
}
