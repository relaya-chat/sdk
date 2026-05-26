// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import type { StickerListing } from '@relaya-chat/core';

export interface ActiveShortcodeQuery {
  query: string;
  start: number;
  end: number;
}

export function findActiveShortcodeQuery(
  text: string,
  caretPosition: number
): ActiveShortcodeQuery | null {
  if (caretPosition <= 0 || caretPosition > text.length) return null;

  let cursor = caretPosition - 1;
  while (cursor >= 0 && /[A-Za-z0-9_-]/.test(text[cursor] ?? '')) {
    cursor -= 1;
  }

  if (text[cursor] !== ':') return null;

  const beforeColon = cursor > 0 ? text[cursor - 1] : '';
  if (beforeColon && !/\s/.test(beforeColon)) return null;

  const query = text.slice(cursor + 1, caretPosition);
  if (!/^[A-Za-z0-9_-]*$/.test(query)) return null;

  return {
    query: query.toLowerCase(),
    start: cursor,
    end: caretPosition,
  };
}

export function insertStickerShortcode(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  shortcode: string
): { nextText: string; caretPosition: number } {
  const insertion = `:${shortcode}: `;
  const nextText = `${text.slice(0, selectionStart)}${insertion}${text.slice(selectionEnd)}`;
  return {
    nextText,
    caretPosition: selectionStart + insertion.length,
  };
}

export function getStickerSuggestions(
  stickers: StickerListing[],
  query: string,
  limit = 6
): StickerListing[] {
  const normalized = query.trim().toLowerCase();

  return stickers
    .filter((sticker) => !!sticker.shortcode)
    .filter((sticker) => !normalized || sticker.shortcode!.startsWith(normalized) || sticker.shortcode!.includes(normalized))
    .sort((a, b) => {
      const aStarts = a.shortcode!.startsWith(normalized) ? 0 : 1;
      const bStarts = b.shortcode!.startsWith(normalized) ? 0 : 1;
      return aStarts - bStarts || a.order - b.order || a.filename.localeCompare(b.filename);
    })
    .slice(0, limit);
}
