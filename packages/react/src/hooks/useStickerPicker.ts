// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * useStickerPicker — manages sticker picker open/close state, refs, and effects.
 *
 * Extracted from MessageInput.tsx to keep that file under 400 lines.
 * The picker dialog JSX lives in StickerPickerDialog.tsx.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseStickerPickerOptions {
  isConnected: boolean;
  stationSlug: string;
  onRefreshStickers?: () => Promise<void>;
}

export function useStickerPicker({
  isConnected,
  stationSlug,
  onRefreshStickers,
}: UseStickerPickerOptions) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const stickerBtnRef = useRef<HTMLButtonElement>(null);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const togglePicker = useCallback(() => {
    if (!isConnected) return;
    setPickerOpen((open) => !open);
  }, [isConnected]);

  // Refresh sticker list when picker opens
  useEffect(() => {
    if (!pickerOpen) return;

    async function refreshPicker() {
      if (!onRefreshStickers) return;
      setPickerLoading(true);
      setPickerError(null);
      try {
        await onRefreshStickers();
      } catch {
        setPickerError('Could not load stickers right now.');
      } finally {
        setPickerLoading(false);
      }
    }

    refreshPicker().catch(() => undefined);
  }, [pickerOpen, onRefreshStickers, stationSlug]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!pickerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker();
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const clickedInsidePicker = pickerRef.current?.contains(target) ?? false;
      const clickedPickerBtn = stickerBtnRef.current?.contains(target) ?? false;
      if (!clickedInsidePicker && !clickedPickerBtn) {
        closePicker();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [pickerOpen, closePicker]);

  // Close picker when connection drops
  useEffect(() => {
    if (!isConnected && pickerOpen) {
      closePicker();
    }
  }, [isConnected, pickerOpen, closePicker]);

  return {
    pickerOpen,
    pickerLoading,
    pickerError,
    pickerRef,
    stickerBtnRef,
    closePicker,
    togglePicker,
  };
}
