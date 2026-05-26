// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useCallback, useRef } from 'react';

interface PaneDividerProps {
  /** Called continuously during drag with the new desired sidebar width in px. */
  onResize: (newWidth: number) => void;
  /** The container element whose width bounds the drag (the .chat-body div). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Minimum sidebar width in pixels. */
  minWidth?: number;
  /** Maximum sidebar width as a fraction of the container (0–1). */
  maxFraction?: number;
}

export default function PaneDivider({
  onResize,
  containerRef,
  minWidth = 120,
  maxFraction = 0.5,
}: PaneDividerProps) {
  const dragging = useRef(false);

  const startDrag = useCallback(
    (startX: number) => {
      dragging.current = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMove = (clientX: number) => {
        if (!dragging.current || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const maxWidth = containerRect.width * maxFraction;
        // Sidebar is on the right; distance from right edge of container to cursor.
        const newWidth = containerRect.right - clientX;
        onResize(Math.min(maxWidth, Math.max(minWidth, newWidth)));
      };

      const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length > 0) onMove(e.touches[0].clientX);
      };

      const stopDrag = () => {
        dragging.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', stopDrag);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', stopDrag);
      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', stopDrag);
    },
    [containerRef, minWidth, maxFraction, onResize],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startDrag(e.clientX);
    },
    [startDrag],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length > 0) startDrag(e.touches[0].clientX);
    },
    [startDrag],
  );

  return (
    <div
      className="pane-divider"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      aria-hidden="true"
    />
  );
}
