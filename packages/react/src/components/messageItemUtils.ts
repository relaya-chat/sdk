// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { detectImageUrls, isSingleImageMessage } from '@relaya-chat/core';

/**
 * Format a timestamp for display in the message name-row.
 * - Today: show time only (e.g., "10:30 AM")
 * - Other days: show abbreviated date + time (e.g., "Mar 25, 10:30 AM")
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return timeStr;

  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr}`;
}

/**
 * Check if a message is within the 15-minute edit window.
 */
export function isWithinEditWindow(createdAt: Date | string): boolean {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  return created > fifteenMinutesAgo;
}

export function getSingleImageUrl(content: string): string | null {
  if (!isSingleImageMessage(content)) return null;
  const image = detectImageUrls(content).find((segment) => segment.isImage && segment.url);
  return image?.url ?? null;
}

export function imageAltFromUrl(url: string): string {
  const base = url.split('/').pop() ?? 'image';
  const noQuery = base.split('?')[0] ?? base;
  const decoded = decodeURIComponent(noQuery);
  return decoded.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'Sticker image';
}
