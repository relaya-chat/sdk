// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * REST API client for the Relaya chat system.
 *
 * Fetch-based, works in both browser and React Native environments.
 * All methods throw an ApiError on non-2xx responses.
 */

import type {
  MessageWithAuthor,
  Ban,
  MessageReport,
  Station,
  Permission,
  Role,
  StickerListing,
} from './types.js';

// ==================== RESPONSE TYPES ====================

/**
 * Wave 6: AT/RT auth overhaul.
 * POST /auth/verify-code now returns { accessToken, refreshToken, user, station }.
 * No cookie is set; tokens are managed entirely client-side.
 */
export interface AuthVerifyResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    permissions: Permission[];
    roles: Role[];
  };
  station: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface AuthRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MessagesResponse {
  messages: MessageWithAuthor[];
  hasMore: boolean;
  /** ISO 8601 date string — messages older than this are filtered by the read layer.
   *  Determined by the space's subscription tier (retentionDays in TIER_LIMITS).
   *  The client uses this to display a "chat history before [date] is not available on this plan" notice. */
  retentionCutoff?: string;
}

export interface ReportWithDetails {
  reportId: string;
  messageId: string;
  messageContent: string | null;
  messageIsDeleted: boolean;
  messageAuthor: {
    userId: string;
    displayName: string;
  };
  reporter: {
    userId: string;
    displayName: string;
  };
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: string;
}

export interface ModerationConfig {
  rateLimitWindowMs: number;
  rateLimitMaxMessages: number;
  duplicateWindowMs: number;
}

export interface ModerationConfigResponse {
  config: ModerationConfig;
  note: string;
}

export interface PresenceConfig {
  presenceGracePeriodMs: number;
}

export interface PresenceConfigResponse {
  config: PresenceConfig;
}

export interface BanWithUser extends Ban {
  bannedUser?: { id: string; displayName: string };
}

export interface MemberWithRoles {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  permissions: Permission[];
  roles: Role[];
  maxPriority: number;
  joinedAt: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export interface ThemeByMode {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface StationSoundsResponse {
  mentionSoundUrl: string | null;
  channelSoundUrl: string | null;
}

export interface AdminMember {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  roles: string[];
  joinedAt: string;
  isOnline: boolean;
}

export interface GetMembersAdminResponse {
  members: AdminMember[];
  quota: { used: number; limit: number | null };
}

// ==================== CLIENT ====================

export class ApiClient {
  /**
   * @param baseUrl   - Base URL for all requests (e.g. '' for same-origin in browser,
   *                    or 'http://localhost:9000' for direct connection)
   * @param getToken  - Callback that returns the current JWT (or null if unauthenticated)
   */
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null
  ) {}

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { ...this.authHeaders() };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as unknown as T;

    if (!res.ok) {
      let errBody: Record<string, unknown> = {};
      try {
        errBody = (await res.json()) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }
      const errObj = errBody?.error as Record<string, unknown> | string | undefined;
      const err: ApiError = {
        status: res.status,
        code: (typeof errObj === 'object' ? errObj?.code : undefined) as string ?? 'API_ERROR',
        message:
          (typeof errObj === 'object' ? errObj?.message : errObj) as string ?? res.statusText,
      };
      throw err;
    }

    return res.json() as Promise<T>;
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as unknown as T;

    if (!res.ok) {
      let errBody: Record<string, unknown> = {};
      try {
        errBody = (await res.json()) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }
      const errObj = errBody?.error as Record<string, unknown> | string | undefined;
      const err: ApiError = {
        status: res.status,
        code: (typeof errObj === 'object' ? errObj?.code : undefined) as string ?? 'API_ERROR',
        message:
          (typeof errObj === 'object' ? errObj?.message : errObj) as string ?? res.statusText,
      };
      throw err;
    }

    return res.json() as Promise<T>;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, stationSlug: string): Promise<{ message: string; expiresIn: number }> {
    return this.request('POST', '/auth/login', { email, stationSlug });
  }

  /**
   * Request a 6-digit OTP code to be sent to the provided email
   * Returns pending_id for use in verifyCode()
   */
  async requestCode(email: string, stationSlug: string): Promise<{ message: string; pendingId: string; expiresIn: number }> {
    return this.request('POST', '/auth/request-code', { email, stationSlug });
  }

  /**
   * Verify OTP code and obtain session
   */
  async verifyCode(pendingId: string, code: string, stationSlug: string): Promise<AuthVerifyResponse> {
    return this.request('POST', '/auth/verify-code', { pendingId, code, stationSlug });
  }

  async verify(token: string, stationSlug: string): Promise<AuthVerifyResponse> {
    return this.request(
      'GET',
      `/auth/verify?token=${encodeURIComponent(token)}&station=${encodeURIComponent(stationSlug)}`
    );
  }

  /**
   * Exchange a refresh token for a new access token + rotated refresh token.
   * Wave 6: accepts refreshToken in body (no cookie).
   */
  async refresh(refreshToken: string): Promise<AuthRefreshResponse> {
    return this.request('POST', '/auth/refresh', { refreshToken });
  }

  // ── Station ───────────────────────────────────────────────────────────────

  async getStation(slug: string): Promise<Station> {
    return this.request('GET', `/api/chat/stations/${encodeURIComponent(slug)}`);
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async getMessages(
    stationSlug: string,
    params?: { before?: string; after?: string; limit?: number }
  ): Promise<MessagesResponse> {
    const qs = new URLSearchParams();
    if (params?.before) qs.set('before', params.before);
    if (params?.after) qs.set('after', params.after);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request('GET', `/api/chat/${stationSlug}/messages${query}`);
  }

  async deleteMessage(stationSlug: string, messageId: string): Promise<void> {
    return this.request('DELETE', `/api/chat/${stationSlug}/messages/${messageId}`);
  }

  async editMessage(
    stationSlug: string,
    messageId: string,
    content: string
  ): Promise<MessageWithAuthor> {
    return this.request('PATCH', `/api/chat/${stationSlug}/messages/${messageId}`, { content });
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async createReport(
    stationSlug: string,
    messageId: string,
    reason: string,
    details?: string
  ): Promise<MessageReport> {
    return this.request('POST', `/api/chat/${stationSlug}/messages/${messageId}/report`, {
      reason,
      details,
    });
  }

  async getReports(
    stationSlug: string,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ reports: ReportWithDetails[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request('GET', `/api/chat/${stationSlug}/reports${query}`);
  }

  async updateReport(
    stationSlug: string,
    reportId: string,
    update: { status: 'reviewed' | 'dismissed' }
  ): Promise<{ reportId: string; status: string; reviewedBy: string; reviewedAt: string }> {
    return this.request('PATCH', `/api/chat/${stationSlug}/reports/${reportId}`, update);
  }

  // ── Bans ──────────────────────────────────────────────────────────────────

  async createBan(
    stationSlug: string,
    userId: string,
    params?: { reason?: string; expiresAt?: string }
  ): Promise<BanWithUser> {
    return this.request('POST', `/api/chat/${stationSlug}/bans`, { userId, ...params });
  }

  async liftBan(stationSlug: string, banId: string): Promise<void> {
    return this.request('DELETE', `/api/chat/${stationSlug}/bans/${banId}`);
  }

  async getBans(stationSlug: string, activeOnly = true): Promise<{ bans: BanWithUser[] }> {
    const qs = activeOnly ? '?active=true' : '';
    return this.request('GET', `/api/chat/${stationSlug}/bans${qs}`);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async getMembers(stationSlug: string): Promise<{ members: MemberWithRoles[] }> {
    return this.request('GET', `/api/chat/${stationSlug}/members`);
  }

  /** Admin-only: returns member list with email addresses and moderator quota. */
  async getMembersAdmin(stationSlug: string): Promise<GetMembersAdminResponse> {
    return this.request('GET', `/api/chat/${stationSlug}/members/admin`);
  }

  async updateMemberRole(
    stationSlug: string,
    userId: string,
    roleId: string
  ): Promise<MemberWithRoles> {
    return this.request('PATCH', `/api/chat/${stationSlug}/members/${userId}/roles`, { roleId });
  }

  /** Assign or remove named roles for a member (admin-only). */
  async patchMemberRoles(
    stationSlug: string,
    userId: string,
    changes: { add?: string[]; remove?: string[] }
  ): Promise<{ userId: string; roles: string[] }> {
    return this.request('PATCH', `/api/chat/${stationSlug}/members/${userId}/roles`, changes);
  }

  // ── Profile (Me) ──────────────────────────────────────────────────────────

  async getMe(stationSlug: string): Promise<{ 
    userId: string; 
    displayName: string; 
    chatName: string | null;
    permissions: Permission[];
    roles: Role[];
  }> {
    return this.request('GET', `/api/chat/${stationSlug}/me`);
  }

  async updateChatName(
    stationSlug: string,
    chatName: string | null
  ): Promise<{ chatName: string | null; displayName: string }> {
    return this.request('PATCH', `/api/chat/${stationSlug}/me`, { chatName });
  }

  // ── Moderation Config ─────────────────────────────────────────────────────

  async getModerationConfig(stationSlug: string): Promise<ModerationConfigResponse> {
    return this.request('GET', `/api/chat/${stationSlug}/moderation/config`);
  }

  async updateModerationConfig(
    stationSlug: string,
    updates: Partial<ModerationConfig>
  ): Promise<ModerationConfigResponse> {
    return this.request('PATCH', `/api/chat/${stationSlug}/moderation/config`, updates);
  }

  // ── Presence Config ───────────────────────────────────────────────────────

  async getPresenceConfig(stationSlug: string): Promise<PresenceConfigResponse> {
    return this.request('GET', `/api/chat/${stationSlug}/presence/config`);
  }

  async updatePresenceConfig(
    stationSlug: string,
    updates: Partial<PresenceConfig>
  ): Promise<PresenceConfigResponse> {
    return this.request('PATCH', `/api/chat/${stationSlug}/presence/config`, updates);
  }

  // ── Stickers ──────────────────────────────────────────────────────────────

  async getStickers(stationSlug: string): Promise<{ stickers: StickerListing[]; quota: { used: number; limit: number } }> {
    const result = await this.request<{ stickers: StickerListing[]; quota: { used: number; limit: number } }>('GET', `/api/chat/${stationSlug}/stickers`);
    // Sticker URLs from the server are relative paths (/files/stations/…/stickers/…).
    // When the chat widget is embedded cross-origin (e.g. www on port 3000, server on port 9000),
    // the browser would resolve them against the wrong origin. Prepend baseUrl to make them absolute.
    if (this.baseUrl) {
      result.stickers = result.stickers.map((s) =>
        s.url.startsWith('/') ? { ...s, url: `${this.baseUrl}${s.url}` } : s
      );
    }
    return result;
  }

  async uploadSticker(
    stationSlug: string,
    file: Blob,
    filename: string
  ): Promise<{ sticker: StickerListing; quota: { used: number; limit: number } }> {
    const res = await fetch(`${this.baseUrl}/api/chat/${stationSlug}/stickers/upload`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': (file as File).type || 'application/octet-stream',
        'X-Sticker-Filename': encodeURIComponent(filename),
      },
      body: file,
    });

    return this.parseResponse(res);
  }

  async updateStickerManifest(
    stationSlug: string,
    stickers: Array<{ filename: string; shortcode: string | null }>
  ): Promise<{ stickers: StickerListing[] }> {
    return this.request('PUT', `/api/chat/${stationSlug}/stickers/manifest`, { stickers });
  }

  async deleteSticker(stationSlug: string, filename: string): Promise<void> {
    return this.request('DELETE', `/api/chat/${stationSlug}/stickers/${encodeURIComponent(filename)}`);
  }

  // ── Station Sounds ────────────────────────────────────────────────────────

  /** Returns the per-station audio notification URLs, or null values if none configured. */
  async getSounds(stationSlug: string): Promise<StationSoundsResponse> {
    return this.request('GET', `/api/chat/${encodeURIComponent(stationSlug)}/sounds`);
  }

  // ── Space Theme ───────────────────────────────────────────────────────────

  /** Returns the stored theme overrides for a space, or { light:{}, dark:{} } if none saved. */
  async getSpaceTheme(stationSlug: string): Promise<ThemeByMode> {
    return this.request('GET', `/api/chat/${stationSlug}/theme`);
  }

  /**
   * Saves theme overrides for a space (admin-only).
   * Pass { light:{}, dark:{} } to clear all overrides.
   */
  async saveSpaceTheme(
    stationSlug: string,
    theme: ThemeByMode
  ): Promise<ThemeByMode> {
    return this.request('PUT', `/api/chat/${stationSlug}/theme`, theme);
  }
}
