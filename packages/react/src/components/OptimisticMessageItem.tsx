// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import type { OptimisticMessage, StickerListing } from '@relaya-chat/core';
import { expandStickerShortcodes, detectImageUrls } from '@relaya-chat/core';
import MessageAvatar from './MessageAvatar.js';
import ChatImage from './ChatImage.js';
import { RenderMessageContent } from './MentionRenderer.js';
import { formatTime, getSingleImageUrl } from './messageItemUtils.js';

interface OptimisticMessageItemProps {
  msg: OptimisticMessage;
  stickers: StickerListing[];
  currentUserId: string;
  onRetry?: (clientId: string) => void;
}

export default function OptimisticMessageItem({
  msg,
  stickers,
  currentUserId,
  onRetry,
}: OptimisticMessageItemProps) {
  const expandedContent = expandStickerShortcodes(msg.content, stickers);
  const isOwn = msg.authorId === currentUserId;
  const hasImageContent = detectImageUrls(expandedContent).some((segment) => segment.isImage);
  const bareImageUrl = getSingleImageUrl(expandedContent);
  const isBareImageMessage = !!bareImageUrl;
  const statusLabel =
    msg.status === 'sending' ? 'Sending…' : msg.status === 'failed' ? '⚠ Failed' : '';

  return (
    <div
      className={[
        'message-item',
        isOwn ? 'message-item--own' : 'message-item--other',
        hasImageContent ? 'message-item--has-image' : '',
        isBareImageMessage ? 'message-item--image' : '',
        `message-item--${msg.status === 'failed' ? 'failed' : 'optimistic'}`,
      ].join(' ')}
    >
      {isOwn && (
        <MessageAvatar
          displayName={msg.authorDisplayName}
          avatarUrl={msg.authorAvatarUrl}
        />
      )}
      {!isOwn && (
        <div className="message-item__avatar-column">
          <span className="message-item__author">{msg.authorDisplayName}</span>
          <MessageAvatar
            displayName={msg.authorDisplayName}
            avatarUrl={msg.authorAvatarUrl}
          />
        </div>
      )}
      <div className="message-item__bubble-wrap">
        <div className="message-item__name-row">
          <span className="message-item__time">{formatTime(msg.createdAt)}</span>
        </div>

        {isBareImageMessage && bareImageUrl ? (
          <div className="message-item__bare-image-wrap">
            <ChatImage url={bareImageUrl} bare />
          </div>
        ) : (
          <div className="message-item__bubble">
            <RenderMessageContent
              content={expandedContent}
              stickers={stickers}
              currentUserId={currentUserId}
            />
          </div>
        )}

        {statusLabel && (
          <div className="message-item__status-row">
            <span className="message-item__status">{statusLabel}</span>
            {msg.status === 'failed' && onRetry && (
              <button
                style={{ fontSize: 11, color: 'var(--color-accent)' }}
                onClick={() => onRetry(msg.clientId)}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
