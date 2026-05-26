// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import type { OnlineUser } from './hooks/useRelayaChat.js';

export interface ActiveMentionQuery {
  query: string;
  start: number; // index of the '@' character in the text
  end: number;   // caret position (exclusive end of typed query)
}

/**
 * Detect an active @mention query at the current caret position.
 *
 * Rules (mirrors findActiveShortcodeQuery in stickerInputUtils):
 * - Scans backward from caret over [a-zA-Z0-9_-] characters
 * - Active if the preceding character is '@' AND that '@' is at start-of-string
 *   or preceded by whitespace (prevents false-positives on email addresses)
 * - A space typed without selecting from the strip causes the scan to stop at
 *   the space, returning null — which naturally closes the strip.
 */
export function findActiveMentionQuery(
  text: string,
  caretPosition: number
): ActiveMentionQuery | null {
  if (caretPosition <= 0 || caretPosition > text.length) return null;

  let cursor = caretPosition - 1;
  while (cursor >= 0 && /[a-zA-Z0-9_-]/.test(text[cursor] ?? '')) {
    cursor -= 1;
  }

  if (text[cursor] !== '@') return null;

  // Prevent matching inside email addresses (e.g. user@example.com)
  const beforeAt = cursor > 0 ? text[cursor - 1] : '';
  if (beforeAt && !/\s/.test(beforeAt)) return null;

  const query = text.slice(cursor + 1, caretPosition);

  return {
    query: query.toLowerCase(),
    start: cursor,
    end: caretPosition,
  };
}

/**
 * Filter and rank online users matching the typed query.
 * Matches against displayName (which reflects chat name when set).
 * Excludes the current user so you can't @mention yourself.
 */
export function getMentionSuggestions(
  users: OnlineUser[],
  query: string,
  currentUserId?: string,
  limit = 8
): OnlineUser[] {
  const normalized = query.trim().toLowerCase();

  return users
    .filter((u) => u.id !== currentUserId)
    .filter(
      (u) =>
        !normalized ||
        u.displayName.toLowerCase().startsWith(normalized) ||
        u.displayName.toLowerCase().includes(normalized)
    )
    .sort((a, b) => {
      if (!normalized) return a.displayName.localeCompare(b.displayName);
      const aStarts = a.displayName.toLowerCase().startsWith(normalized) ? 0 : 1;
      const bStarts = b.displayName.toLowerCase().startsWith(normalized) ? 0 : 1;
      return aStarts - bStarts || a.displayName.localeCompare(b.displayName);
    })
    .slice(0, limit);
}

/**
 * When space is about to be typed, check if the @word immediately before the caret
 * is an exact (case-insensitive) match for exactly one online user whose display
 * name is a single word (no spaces). If so, return the user and the range to
 * replace so the caller can auto-upgrade it to a structured token.
 *
 * Only single-word names are eligible — multi-word names cannot be fully typed
 * without using the picker anyway, so there's no ambiguity to resolve there.
 */
export function resolveSpaceCompletion(
  text: string,
  caretPosition: number,
  onlineUsers: OnlineUser[],
  currentUserId?: string
): { user: OnlineUser; start: number; end: number } | null {
  if (caretPosition <= 0) return null;

  const textBefore = text.slice(0, caretPosition);
  // Match @word at the very end of the typed text (preceded by start or whitespace)
  const match = textBefore.match(/(?:^|(?<=\s))@([a-zA-Z0-9_-]+)$/);
  if (!match) return null;

  const word = match[1].toLowerCase();
  const end = caretPosition;
  const start = end - match[0].length; // includes the @ char

  // Only consider single-word display names (names without spaces)
  const candidates = onlineUsers
    .filter((u) => u.id !== currentUserId)
    .filter((u) => !u.displayName.includes(' '))
    .filter((u) => u.displayName.toLowerCase() === word);

  if (candidates.length !== 1) return null;
  return { user: candidates[0], start, end };
}

/**
 * Insert a structured mention token into text, replacing the active @query range.
 *
 * Token format written into content: @[Display Name|userId]
 * The server extracts userId directly from this token for notification dispatch.
 * The renderer parses this token to display a styled mention chip.
 */
export function insertMentionToken(
  text: string,
  start: number,
  end: number,
  user: { id: string; displayName: string }
): { nextText: string; caretPosition: number } {
  const insertion = `@[${user.displayName}|${user.id}] `;
  const nextText = `${text.slice(0, start)}${insertion}${text.slice(end)}`;
  return {
    nextText,
    caretPosition: start + insertion.length,
  };
}
