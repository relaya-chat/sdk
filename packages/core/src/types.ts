// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Shared types for Relaya chat system
 */

// ==================== DATABASE ENTITIES ====================

export interface Station {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  /** How long (ms) a user stays in the online list after their WS closes. Default 120 000. */
  presence_grace_period_ms: number;
}

export interface User {
  id: string;
  display_name: string;
  email: string | null;
  identity_hash: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StationMembership {
  id: string;
  station_id: string;
  user_id: string;
  joined_at: Date;
  is_active: boolean;
  chat_name?: string | null;
}

export interface Role {
  id: string;
  station_id: string;
  name: string;
  description: string | null;
  priority: number;
  is_default: boolean;
  created_at: Date;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission: string;
}

export interface MembershipRole {
  id: string;
  membership_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by: string | null;
}

export interface Message {
  id: string;
  station_id: string;
  user_id: string;
  content: string;
  is_deleted: boolean;
  deleted_by: string | null;
  deleted_at: Date | null;
  edited_at?: Date | null;
  edit_count?: number;
  reply_to_message_id?: string | null;
  reply_author_name?: string | null;
  reply_excerpt?: string | null;
  created_at: Date;
}

export interface MessageReport {
  id: string;
  station_id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

export interface Ban {
  id: string;
  station_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
  lifted_at: Date | null;
  lifted_by: string | null;
}

export interface MagicLinkToken {
  id: string;
  station_id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
  attempts?: number; // For OTP verification rate limiting
}

// ==================== PERMISSIONS ====================

export const PERMISSIONS = {
  READ: 'chat.read',
  POST: 'chat.post',
  EDIT_OWN: 'chat.edit_own',
  DELETE_OWN: 'chat.delete_own',
  DELETE_ANY: 'chat.delete_any',
  REPORT: 'chat.report',
  BAN_USER: 'chat.ban_user',
  MANAGE_ROLES: 'chat.manage_roles',
  MENTION_CHANNEL: 'chat.mention_channel',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ==================== API TYPES ====================

export interface UserWithPermissions extends User {
  permissions: Permission[];
  roles: Role[];
  maxPriority: number;
  chatName: string | null;
}

/**
 * User information for client-side directory.
 * Used to resolve user data for messages without JOINs.
 */
export interface UserInfo {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when the user has an elevated (moderator/admin) role at this station. */
  isModerator?: boolean;
}

/**
 * Temporal tracking for avatar changes.
 * Used to show historical avatars within a session.
 */
export interface AvatarChange {
  url: string | null;
  changedAt: Date;
}

/**
 * DEPRECATED: MessageWithAuthor is being phased out.
 * Messages now contain only user_id; clients resolve user data from directory.
 * Kept temporarily for compatibility during migration.
 */
export interface MessageWithAuthor extends Message {
  author: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface StickerManifestEntry {
  filename: string;
  shortcode: string | null;
  order: number;
}

export interface StickerListing extends StickerManifestEntry {
  url: string;
}

// ==================== WEBSOCKET PROTOCOL ====================

/**
 * Messages sent from the client to the server.
 *
 * The protocol is intentionally narrow:
 * - message:send  — post a new chat message (with optional reply data)
 * - pong          — heartbeat response to a server ping
 */
export type WsClientMessage =
  | { 
      type: 'message:send'; 
      content: string; 
      clientId: string;
      replyToMessageId?: string;
      replyAuthorName?: string;
      replyExcerpt?: string;
    }
  | { type: 'pong' };

/**
 * Messages sent from the server to the client.
 *
 * - auth:success       — connection accepted; includes user identity + permissions + user directory
 * - message:broadcast  — a message was persisted and should be rendered
 * - presence:update    — number of unique online users changed
 * - user:update        — a user's display name or avatar changed
 * - ping               — heartbeat probe; client must reply with pong
 * - error              — a client-triggered operation failed
 */
export type WsServerMessage =
  | {
      type: 'auth:success';
      userId: string | null;  // null for anonymous users
      stationId: string;
      displayName: string;
      chatName: string | null;
      permissions: Permission[];
      users: UserInfo[];  // User directory for all authors in initial message window
    }
  | {
      type: 'message:broadcast';
      message: Message;  // No longer includes author; client resolves from directory
      clientId?: string;
    }
  | {
      type: 'presence:update';
      userCount: number;
      totalCount: number;  // Total connections including anonymous users
      users: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
    }
  | {
      type: 'user:update';
      userId: string;
      updates: {
        displayName?: string;
        avatarUrl?: string | null;
      };
      timestamp: string;  // ISO 8601 timestamp
    }
  | { type: 'message:deleted'; messageId: string; deletedBy: string }
  | { type: 'message:edited'; message: Message }  // No longer includes author
  | {
      type: 'mention:notification';
      messageId: string;
      mentionedBy: {
        id: string;
        displayName: string;
      };
      excerpt: string;
    }
  | {
      type: 'channel:notification';
      messageId: string;
      mentionedBy: {
        id: string;
        displayName: string;
      };
      excerpt: string;
    }
  | { type: 'ping' }
  | { type: 'error'; code: string; message: string }
  | { type: 'stickers:updated'; stationId: string }
  | { type: 'force_logout'; reason: string };

// ==================== REQUEST/RESPONSE TYPES ====================

export interface CreateUserParams {
  display_name: string;
  email: string;
  identity_hash: string;
  avatar_url?: string | null;
}

export interface CreateMessageParams {
  station_id: string;
  user_id: string;
  content: string;
  reply_to_message_id?: string;
  reply_author_name?: string;
  reply_excerpt?: string;
}

export interface CreateBanParams {
  station_id: string;
  user_id: string;
  banned_by: string;
  reason?: string;
  expires_at?: Date;
}

export interface CreateReportParams {
  station_id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  details?: string;
}

export interface CreateMagicLinkParams {
  station_id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
}
