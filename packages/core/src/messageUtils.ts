// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Pure utility functions for the Relaya chat system.
 * No I/O, no side effects — safe to import in any environment.
 */

// ==================== CLIENT ID ====================

/**
 * Generate a unique client-side message ID for optimistic rendering.
 * Format: timestamp (base-36) + random suffix, both URL-safe.
 */
export function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ==================== RECONNECT BACKOFF ====================

/**
 * Calculate exponential backoff delay for reconnection attempts.
 *
 * @param attempt - Zero-indexed reconnect attempt number
 * @param baseMs  - Base delay in milliseconds (default 1000)
 * @param maxMs   - Maximum delay cap in milliseconds (default 30000)
 * @returns Delay in milliseconds
 *
 * Examples (baseMs=1000, maxMs=30000):
 *   attempt 0 → 1000ms
 *   attempt 1 → 2000ms
 *   attempt 2 → 4000ms
 *   attempt 3 → 8000ms
 *   attempt 4 → 16000ms
 *   attempt 5+ → 30000ms (capped)
 */
export function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const delay = baseMs * Math.pow(2, attempt);
  return Math.min(delay, maxMs);
}

// ==================== CURSOR HELPERS ====================

/**
 * Build URLSearchParams for message cursor pagination.
 * `before` and `after` are mutually exclusive; the server enforces this.
 */
export function buildCursorParams(params: {
  before?: string;
  after?: string;
  limit?: number;
}): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.before) sp.set('before', params.before);
  if (params.after) sp.set('after', params.after);
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  return sp;
}

// ==================== OPTIMISTIC MESSAGES ====================

/**
 * A client-side pending message created before server confirmation.
 * Rendered in the UI immediately; replaced by the server's authoritative
 * copy once a matching `message:broadcast` arrives.
 */
export interface OptimisticMessage {
  clientId: string;
  content: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  createdAt: Date;
  status: 'sending' | 'sent' | 'failed';
  /** Server-provided error message when status is 'failed'. */
  errorMessage?: string;
}

/**
 * Remove the optimistic message that has been reconciled by a server broadcast.
 * When the server echoes back a `message:broadcast` with a matching `clientId`,
 * the optimistic copy is no longer needed — the server message is used instead.
 *
 * @param optimistic     - Current list of optimistic messages
 * @param serverClientId - The clientId echoed back by the server, if any
 * @returns Updated optimistic list with the reconciled message removed
 */
export function removeReconciledOptimistic(
  optimistic: OptimisticMessage[],
  serverClientId: string | undefined
): OptimisticMessage[] {
  if (!serverClientId) return optimistic;
  return optimistic.filter((m) => m.clientId !== serverClientId);
}

/**
 * Mark an optimistic message as failed.
 * Called when a WS `error` response arrives that can be tied back to a clientId,
 * or when the connection drops before the server echoes the message back.
 *
 * @param errorMessage - Optional server-provided message to display to the user.
 */
export function markOptimisticFailed(
  optimistic: OptimisticMessage[],
  clientId: string,
  errorMessage?: string
): OptimisticMessage[] {
  return optimistic.map((m) =>
    m.clientId === clientId ? { ...m, status: 'failed' as const, errorMessage } : m
  );
}

// ==================== DEDUPLICATION ====================

/**
 * Remove duplicate messages from a list, keeping the first occurrence.
 * Used when merging REST catch-up results with already-received WS messages
 * after a reconnect.
 */
export function deduplicateMessages<T extends { id: string }>(messages: T[]): T[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// ==================== IMAGE URL DETECTION ====================

export interface ImageSegment {
  text: string;
  isImage: boolean;
  url?: string;
}

export interface StickerShortcodeEntry {
  shortcode: string | null;
  url: string;
}

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp']);

/**
 * Host/path allowlist for inline image rendering in chat messages.
 *
 * Notes:
 * - The station sticker path is allowlisted by pathname prefix so both
 *   relative and absolute URLs can be rendered.
 * - External hosts are intentionally constrained to known GIF/image providers.
 */
export const IMAGE_URL_ALLOWLIST = {
  pathPrefixes: ['/files/stations/'],
  hosts: [
    'tenor.com',
    'media.tenor.com',
    'giphy.com',
    'media.giphy.com',
    'i.giphy.com',
    'editablegifs.com',
    'imgur.com',
    'i.imgur.com',
  ],
} as const;

const URL_TOKEN_REGEX = /(https?:\/\/[^\s]+|\/files\/stations\/[^\s]+)/gi;
const SHORTCODE_TOKEN_REGEX = /:([a-z0-9_-]{1,64}):/gi;

export function normalizeStickerShortcode(shortcode: string): string {
  return shortcode.trim().toLowerCase();
}

export function buildStickerShortcodeMap(
  stickers: StickerShortcodeEntry[]
): Record<string, string> {
  return stickers.reduce<Record<string, string>>((acc, sticker) => {
    if (!sticker.shortcode) return acc;
    acc[normalizeStickerShortcode(sticker.shortcode)] = sticker.url;
    return acc;
  }, {});
}

export function expandStickerShortcodes(
  content: string,
  stickers: StickerShortcodeEntry[]
): string {
  const shortcodeMap = buildStickerShortcodeMap(stickers);

  return content.replace(SHORTCODE_TOKEN_REGEX, (fullMatch, rawShortcode: string) => {
    const resolved = shortcodeMap[normalizeStickerShortcode(rawShortcode)];
    return resolved ?? fullMatch;
  });
}

export function hasStickerShortcodeToken(content: string): boolean {
  SHORTCODE_TOKEN_REGEX.lastIndex = 0;
  return SHORTCODE_TOKEN_REGEX.test(content);
}

function hasAllowedImageExtension(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) return true;
  }
  return false;
}

function hostIsAllowlisted(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return IMAGE_URL_ALLOWLIST.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function splitTrailingPunctuation(token: string): { core: string; trailing: string } {
  const match = token.match(/[\],.!?:;]+$/);
  if (!match) return { core: token, trailing: '' };
  const trailing = match[0];
  return { core: token.slice(0, -trailing.length), trailing };
}

function pushTextSegment(segments: ImageSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && !last.isImage) {
    last.text += text;
    return;
  }
  segments.push({ text, isImage: false });
}

function isAllowlistedImageUrl(url: string): boolean {
  try {
    // Relative station sticker path
    if (url.startsWith('/')) {
      return IMAGE_URL_ALLOWLIST.pathPrefixes.some((prefix) => url.startsWith(prefix))
        && hasAllowedImageExtension(url.split('?')[0] ?? url);
    }

    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const pathname = parsed.pathname;
    const isStickerPath = IMAGE_URL_ALLOWLIST.pathPrefixes.some((prefix) => pathname.startsWith(prefix));
    const isExternalHost = hostIsAllowlisted(parsed.hostname);

    if (!isStickerPath && !isExternalHost) return false;

    return hasAllowedImageExtension(pathname);
  } catch {
    return false;
  }
}

/**
 * Segment message content into plain-text and allowlisted image URL spans.
 */
export function detectImageUrls(content: string): ImageSegment[] {
  const segments: ImageSegment[] = [];
  let cursor = 0;

  for (const match of content.matchAll(URL_TOKEN_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;

    if (start > cursor) {
      pushTextSegment(segments, content.slice(cursor, start));
    }

    const { core, trailing } = splitTrailingPunctuation(raw);

    if (isAllowlistedImageUrl(core)) {
      segments.push({ text: core, isImage: true, url: core });
      pushTextSegment(segments, trailing);
    } else {
      pushTextSegment(segments, raw);
    }

    cursor = end;
  }

  if (cursor < content.length) {
    pushTextSegment(segments, content.slice(cursor));
  }

  return segments;
}

/**
 * True when content is a single image URL plus optional surrounding whitespace.
 */
export function isSingleImageMessage(content: string): boolean {
  const segments = detectImageUrls(content);
  const imageCount = segments.filter((s) => s.isImage).length;
  if (imageCount !== 1) return false;

  return segments.every((segment) => segment.isImage || segment.text.trim() === '');
}
