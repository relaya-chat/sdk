// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useRef } from 'react';
import type { Message, StickerListing, UserInfo } from '@relaya-chat/core';
import { PERMISSIONS, detectImageUrls, expandStickerShortcodes } from '@relaya-chat/core';
import type { OptimisticMessage } from '@relaya-chat/core';
import ReportModal from './ReportModal.js';
import BanModal from './BanModal.js';
import MessageAvatar from './MessageAvatar.js';
import MessageContextMenu from './MessageContextMenu.js';
import GravatarStyleModal from './GravatarStyleModal.js';
import OptimisticMessageItem from './OptimisticMessageItem.js';
import MessageEditForm from './MessageEditForm.js';
import ChatImage from './ChatImage.js';
import { RenderMessageContent } from './MentionRenderer.js';
import { formatTime, isWithinEditWindow, getSingleImageUrl } from './messageItemUtils.js';
import { useServerUrl } from '../contexts/RelayaServerContext.js';
// Either a server-confirmed message or an optimistic pending one
export type DisplayMessage =
  | { kind: 'server'; msg: Message }
  | { kind: 'optimistic'; msg: OptimisticMessage };

interface MessageItemProps {
  item: DisplayMessage;
  stickers: StickerListing[];
  currentUserId: string;
  currentUserPermissions: string[];
  blockedUserIds: string[];
  stationSlug: string;
  getToken: () => string | null;
  onDelete: (messageId: string) => Promise<void>;
  onBan: (userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>;
  onReport: (messageId: string, reason: string, details?: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  onReply: (messageId: string, authorName: string, content: string) => void;
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
  onRetry?: (clientId: string) => void;
  getUserInfo: (userId: string) => UserInfo | undefined;
  getAvatarForMessage: (userId: string, messageTime: Date) => string | null;
}

export default function MessageItem({
  item,
  stickers,
  currentUserId,
  currentUserPermissions,
  blockedUserIds,
  stationSlug,
  getToken,
  onDelete,
  onBan,
  onReport,
  onBlock,
  onReply,
  onEdit,
  onRetry,
  getUserInfo,
  getAvatarForMessage,
}: MessageItemProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Avatar management state
  const [showGravatarModal, setShowGravatarModal] = useState(false);
  const [hasGalleryImages, setHasGalleryImages] = useState(false);
  const [galleryFetched, setGalleryFetched] = useState(false);

  // Ref used to calculate fixed-position dropdown coordinates for mobile kebab
  const kebabBtnRef = useRef<HTMLButtonElement>(null);

  // Refs for long-press detection on other users' messages (mobile)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const serverUrl = useServerUrl();

  const canDeleteAny = currentUserPermissions.includes(PERMISSIONS.DELETE_ANY);
  const canBan = currentUserPermissions.includes(PERMISSIONS.BAN_USER);
  const canReport = currentUserPermissions.includes(PERMISSIONS.REPORT);
  const canEdit = currentUserPermissions.includes(PERMISSIONS.EDIT_OWN);

  // ── Optimistic (sending / failed) message ──────────────────────────────────
  if (item.kind === 'optimistic') {
    return (
      <OptimisticMessageItem
        msg={item.msg}
        stickers={stickers}
        currentUserId={currentUserId}
        onRetry={onRetry}
      />
    );
  }

  // ── Server-confirmed message ───────────────────────────────────────────────
  const msg = item.msg;
  const isOwn = msg.user_id === currentUserId;
  const isDeleted = msg.is_deleted;
  const authorId = msg.user_id;

  // Resolve user data from directory
  const userInfo = getUserInfo(authorId);
  const authorName = userInfo?.displayName ?? 'Unknown User';
  const isMod = userInfo?.isModerator ?? false;
  const authorAvatar = getAvatarForMessage(authorId, new Date(msg.created_at));

  const content = msg.content ?? '';
  const expandedContent = !isDeleted ? expandStickerShortcodes(content, stickers) : content;
  const hasImageContent = !isDeleted && detectImageUrls(expandedContent).some((segment) => segment.isImage);
  const bareImageUrl = !isDeleted ? getSingleImageUrl(expandedContent) : null;
  const isBareImageMessage = !!bareImageUrl;
  const isOtherUser = authorId !== currentUserId;

  const showEdit = !isDeleted && isOwn && canEdit && (msg.edit_count ?? 0) < 2 && isWithinEditWindow(msg.created_at) && !!onEdit;
  const showDelete = !isDeleted && (canDeleteAny || (currentUserPermissions.includes(PERMISSIONS.DELETE_OWN) && isOwn));
  const showBan = !isDeleted && canBan && isOtherUser;
  const showReport = !isDeleted && canReport && isOtherUser;
  // Block: authenticated other users only; hide if already blocked (menu becomes Unblock in UserList instead)
  const isAlreadyBlocked = blockedUserIds.includes(authorId);
  const showBlock = !isDeleted && isOtherUser && !!currentUserId && !isAlreadyBlocked;
  const showReply = !isDeleted && isOtherUser;
  const hasActions = showEdit || showDelete || showBan || showReport || showBlock || isOwn || showReply;

  const fetchGallery = async () => {
    if (galleryFetched) return;
    try {
      const token = getToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${serverUrl}/api/chat/${stationSlug}/me/gravatar/gallery`, { headers });
      if (response.ok) {
        const data = await response.json();
        setHasGalleryImages((data.gallery || []).length > 0);
      }
    } catch (err) {
      console.error('Failed to fetch Gravatar gallery:', err);
    }
    setGalleryFetched(true);
  };

  const openContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOwn) await fetchGallery();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  const openKebab = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOwn) await fetchGallery();
    const rect = kebabBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenuPos({
        x: rect.right,
        y: rect.bottom + 2,
      });
    }
    setContextMenuOpen(true);
  };

  const closeContextMenu = () => {
    setContextMenuOpen(false);
    setContextMenuPos(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isOwn || isDeleted) return; // Long-press only for other users' non-deleted messages
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuPos({ x: touch.clientX, y: touch.clientY });
      setContextMenuOpen(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleEditClick = () => {
    setEditContent(content);
    setEditError(null);
    setEditMode(true);
    closeContextMenu();
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditContent('');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!onEdit) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError('Message cannot be empty');
      return;
    }
    if (trimmed.length > 2000) {
      setEditError('Message exceeds 2000 characters');
      return;
    }
    try {
      await onEdit(msg.id, trimmed);
      setEditMode(false);
      setEditContent('');
      setEditError(null);
    } catch (err) {
      setEditError('Failed to edit message');
    }
  };

  // Display time with "Edited: " prefix if message has been edited
  const displayTime = msg.edited_at || msg.created_at;
  const timePrefix = msg.edited_at ? 'Edited: ' : '';
  const timeStr = formatTime(displayTime);

  return (
    <>
      <div
        className={[
          'message-item',
          isOwn ? 'message-item--own' : 'message-item--other',
          hasImageContent ? 'message-item--has-image' : '',
          isBareImageMessage ? 'message-item--image' : '',
          isDeleted ? 'message-item--deleted' : '',
        ].filter(Boolean).join(' ')}
        onContextMenu={!isDeleted && hasActions ? openContextMenu : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {isOwn && !isDeleted && (
          <MessageAvatar displayName={authorName} avatarUrl={authorAvatar} />
        )}
        {!isOwn && (
          <div className="message-item__avatar-column">
            <MessageAvatar displayName={authorName} avatarUrl={authorAvatar} />
          </div>
        )}
        <div className="message-item__bubble-wrap">
          {/* Name row: author (other only) + time + optional kebab (right) */}
          <div className="message-item__name-row">
            {!isOwn && !isDeleted && (
              <span className={`message-item__author${isMod ? ' message-item__author--mod' : ''}`}>{authorName}</span>
            )}
            <span className="message-item__time">{timePrefix}{timeStr}</span>

            {/* Kebab ⋮ button — only visible on narrow screens via CSS; opens dropdown */}
            {hasActions && (
              <button
                ref={kebabBtnRef}
                className="message-item__kebab-btn"
                onClick={openKebab}
                aria-label="Message actions"
              >
                ⋮
              </button>
            )}
          </div>

          {isDeleted ? (
            <div className="message-item__bubble">Message removed</div>
          ) : editMode ? (
            <MessageEditForm
              editContent={editContent}
              editError={editError}
              onChange={setEditContent}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : isBareImageMessage && bareImageUrl ? (
            <div className="message-item__bare-image-wrap">
              <ChatImage url={bareImageUrl} bare />
            </div>
          ) : (
            <div className="message-item__bubble">
              {msg.reply_excerpt && (
                <div className="message-reply-bubble">
                  <div className="message-reply-bubble__text">
                    <div className="message-reply-bubble__author">{msg.reply_author_name}</div>
                    <div className="message-reply-bubble__excerpt">{msg.reply_excerpt}</div>
                  </div>
                </div>
              )}
              <RenderMessageContent
                content={expandedContent}
                stickers={stickers}
                currentUserId={currentUserId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Unified Context Menu — both desktop right-click and mobile kebab */}
      {contextMenuOpen && contextMenuPos && !isDeleted && hasActions && (
        <MessageContextMenu
          position={contextMenuPos}
          onClose={closeContextMenu}
          showAvatarOptions={isOwn}
          hasGalleryImages={hasGalleryImages}
          onSelectGravatarPhoto={() => {
            closeContextMenu();
            setShowGravatarModal(true);
          }}
          onUseDefaultGravatar={async () => {
            try {
              const token = getToken();
              const response = await fetch(`${serverUrl}/api/chat/${stationSlug}/me/avatar/preference`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ preference: 'default' }),
              });
              if (!response.ok) throw new Error('Failed to update avatar preference');
              closeContextMenu();
            } catch (err) {
              console.error('Failed to set default Gravatar:', err);
              alert('Failed to update avatar. Please try again.');
            }
          }}
          onUseInitials={async () => {
            try {
              const token = getToken();
              const response = await fetch(`${serverUrl}/api/chat/${stationSlug}/me/avatar/preference`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ preference: null }),
              });
              if (!response.ok) throw new Error('Failed to update avatar preference');
              closeContextMenu();
            } catch (err) {
              console.error('Failed to clear avatar:', err);
              alert('Failed to update avatar. Please try again.');
            }
          }}
          showReply={showReply}
          showEdit={showEdit}
          showDelete={showDelete}
          showReport={showReport}
          showBlock={showBlock}
          showBan={showBan}
          onReply={() => {
            closeContextMenu();
            onReply(msg.id, authorName, content);
          }}
          onEdit={handleEditClick}
          onDelete={() => {
            closeContextMenu();
            onDelete(msg.id);
          }}
          onReport={() => {
            closeContextMenu();
            setReportOpen(true);
          }}
          onBlock={() => {
            closeContextMenu();
            onBlock(authorId).catch((err) => {
              console.error('Failed to block user:', err);
            });
          }}
          onBan={() => {
            closeContextMenu();
            setBanOpen(true);
          }}
        />
      )}

      {showGravatarModal && (
        <GravatarStyleModal
          stationSlug={stationSlug}
          getToken={getToken}
          onClose={() => setShowGravatarModal(false)}
          onSelect={async (avatarUrl: string, preference: 'gravatar' | 'default') => {
            try {
              const token = getToken();
              const isGalleryImage = avatarUrl.startsWith('https://');
              const body = isGalleryImage
                ? { preference: 'gravatar', avatarUrl }
                : { preference: 'gravatar', style: avatarUrl.split('d=')[1]?.split('&')[0] };

              const response = await fetch(`${serverUrl}/api/chat/${stationSlug}/me/avatar/preference`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify(body),
              });

              if (!response.ok) throw new Error('Failed to update avatar preference');
              setShowGravatarModal(false);
            } catch (err) {
              console.error('Failed to select avatar:', err);
              throw err;
            }
          }}
          currentAvatarUrl={authorAvatar}
        />
      )}

      {reportOpen && (
        <ReportModal
          messageId={msg.id}
          authorName={authorName}
          onReport={onReport}
          onClose={() => setReportOpen(false)}
        />
      )}

      {banOpen && (
        <BanModal
          userId={authorId}
          displayName={authorName}
          onBan={onBan}
          onClose={() => setBanOpen(false)}
        />
      )}
    </>
  );
}
