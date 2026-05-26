// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import type { StickerListing } from '@relaya-chat/core';

export function reorderStickersByFilename(
  stickers: StickerListing[],
  draggedFilename: string,
  targetFilename: string
): StickerListing[] {
  const sourceIndex = stickers.findIndex((sticker) => sticker.filename === draggedFilename);
  const targetIndex = stickers.findIndex((sticker) => sticker.filename === targetFilename);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return stickers;
  }

  const next = [...stickers];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);

  return next.map((sticker, order) => ({ ...sticker, order }));
}
