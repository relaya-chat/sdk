// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useEffect, useRef, useState } from 'react';
import type { Message, StickerListing, UserInfo } from '@relaya-chat/core';
import type { OptimisticMessage } from '@relaya-chat/core';
import MessageItem from './MessageItem.js';
import type { DisplayMessage } from './MessageItem.js';

interface MessageListProps {
  messages: Message[];
  optimistic: OptimisticMessage[];
  stickers: StickerListing[];
  currentUserId: string;
  currentUserPermissions: string[];
  stationSlug: string;
  getToken: () => string | null;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasOlderMessages: boolean;
  /** ISO 8601 string — show retention boundary notice when the oldest message
   *  in the current view is at or near this cutoff. Null = no boundary shown. */
  retentionCutoff: string | null;
  onLoadOlder: () => Promise<void>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onBan: (userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>;
  onReport: (messageId: string, reason: string, details?: string) => Promise<void>;
  onReply: (messageId: string, authorName: string, content: string) => void;
  onRetry: (clientId: string) => void;
  getUserInfo: (userId: string) => UserInfo | undefined;
  getAvatarForMessage: (userId: string, messageTime: Date) => string | null;
}

export default function MessageList({
  messages,
  optimistic,
  stickers,
  currentUserId,
  currentUserPermissions,
  stationSlug,
  getToken,
  loadingInitial,
  loadingOlder,
  hasOlderMessages,
  retentionCutoff,
  onLoadOlder,
  onEdit,
  onDelete,
  onBan,
  onReport,
  onReply,
  onRetry,
  getUserInfo,
  getAvatarForMessage,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isInitializing = useRef(true);

  // Auto-scroll to bottom on new messages, unless user has scrolled up.
  // Skip during initial load to prevent conflicts with the initial scroll effect.
  useEffect(() => {
    if (autoScroll && !isInitializing.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, optimistic.length, autoScroll]);

  // Scroll to bottom on initial load (after messages arrive).
  // Use double requestAnimationFrame to ensure layout is complete before
  // measuring scrollHeight. scrollTop= is used (not scrollTo({behavior:'smooth'}))
  // so the initial jump is always instant — CSS scroll-behavior:smooth is
  // intentionally absent from .message-list to prevent it from animating
  // this assignment and firing intermediate handleScroll events.
  useEffect(() => {
    if (!loadingInitial && messages.length > 0 && isInitializing.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
            isInitializing.current = false;
          }
        });
      });
    }
  }, [loadingInitial, messages.length]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 80;
    setAutoScroll(atBottom);
    setShowScrollBtn(!atBottom);
  }

  function scrollToBottom() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setAutoScroll(true);
    setShowScrollBtn(false);
  }

  // Build display items: interleave server messages and optimistic ones in time order.
  // Optimistic messages always appear after confirmed messages.
  const displayItems: DisplayMessage[] = [
    ...messages.map((msg): DisplayMessage => ({ kind: 'server', msg })),
    ...optimistic.map((msg): DisplayMessage => ({ kind: 'optimistic', msg })),
  ];

  // Show the retention boundary notice when:
  // - retentionCutoff is known, AND
  // - there are no more older messages to load (we've reached the archive boundary)
  const showRetentionBoundary = !hasOlderMessages && retentionCutoff !== null;
  const retentionBoundaryDate = retentionCutoff
    ? new Date(retentionCutoff).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  if (loadingInitial) {
    return (
      <div className="message-list-container">
        <div className="messages-empty">
          <span className="connection-spinner" /> Loading messages…
        </div>
      </div>
    );
  }

  return (
    <div className="message-list-container">
      {hasOlderMessages && (
        <div className="load-older-btn">
          <button onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Loading…' : '↑ Load older messages'}
          </button>
        </div>
      )}

      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {showRetentionBoundary && retentionBoundaryDate && (
          <div className="retention-boundary">
            Chat history before {retentionBoundaryDate} is not available on this plan.
          </div>
        )}

        {displayItems.length === 0 && !showRetentionBoundary && (
          <div className="messages-empty">
            No messages yet. Be the first to say something! 👋
          </div>
        )}

        {displayItems.map((item) => (
          <MessageItem
            key={item.kind === 'server' ? item.msg.id : `opt-${item.msg.clientId}`}
            item={item}
            stickers={stickers}
            currentUserId={currentUserId}
            currentUserPermissions={currentUserPermissions}
            stationSlug={stationSlug}
            getToken={getToken}
            onEdit={onEdit}
            onDelete={onDelete}
            onBan={onBan}
            onReport={onReport}
            onReply={onReply}
            onRetry={onRetry}
            getUserInfo={getUserInfo}
            getAvatarForMessage={getAvatarForMessage}
          />
        ))}
      </div>

      {showScrollBtn && (
        <button className="scroll-to-bottom" onClick={scrollToBottom} title="Scroll to latest">
          ↓
        </button>
      )}
    </div>
  );
}
