// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * StickerPickerDialog — presentational sticker picker modal.
 *
 * Extracted from MessageInput.tsx. State and effects live in useStickerPicker.ts.
 */

import React from 'react';
import type { StickerListing } from '@relaya-chat/core';

function stickerAlt(filename: string): string {
  const noExt = filename.replace(/\.[^.]+$/, '');
  return noExt.replace(/[-_]+/g, ' ') || 'Sticker';
}

interface StickerPickerDialogProps {
  pickerRef: React.RefObject<HTMLDivElement>;
  pickerLoading: boolean;
  pickerError: string | null;
  pickerStickers: (StickerListing & { shortcode: string })[];
  onClose: () => void;
  onInsert: (sticker: StickerListing) => void;
}

export function StickerPickerDialog({
  pickerRef,
  pickerLoading,
  pickerError,
  pickerStickers,
  onClose,
  onInsert,
}: StickerPickerDialogProps) {
  return (
    <>
      <div className="sticker-picker__overlay" onClick={onClose} />
      <div className="sticker-picker" ref={pickerRef} role="dialog" aria-label="Sticker picker">
        <div className="sticker-picker__header">
          <span>Stickers</span>
          <button
            type="button"
            className="btn btn--icon sticker-picker__close"
            onClick={onClose}
            aria-label="Close sticker picker"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="sticker-picker__body">
          {pickerLoading && (
            <div className="sticker-picker__state">Loading stickers…</div>
          )}

          {!pickerLoading && pickerError && (
            <div className="sticker-picker__state">{pickerError}</div>
          )}

          {!pickerLoading && !pickerError && pickerStickers.length === 0 && (
            <div className="sticker-picker__state">
              No stickers are available yet. Ask a station admin to upload them in the sticker manager.
            </div>
          )}

          {!pickerLoading && !pickerError && pickerStickers.length > 0 && (
            <div className="sticker-picker__grid">
              {pickerStickers.map((sticker) => (
                <button
                  type="button"
                  key={sticker.filename}
                  className="sticker-picker__item"
                  onClick={() => onInsert(sticker)}
                  title={`:${sticker.shortcode}:`}
                  aria-label={`Insert sticker ${stickerAlt(sticker.filename)}`}
                >
                  <img src={sticker.url} alt={stickerAlt(sticker.filename)} loading="lazy" />
                  <span className="sticker-picker__item-label">
                    :{sticker.shortcode}:
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
