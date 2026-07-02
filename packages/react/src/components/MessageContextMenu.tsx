// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React from 'react';

interface MessageContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  
  // Avatar options (for current user's own messages)
  showAvatarOptions?: boolean;
  hasGalleryImages?: boolean;
  onSelectGravatarPhoto?: () => void;
  onUseDefaultGravatar?: () => void;
  onUseInitials?: () => void;
  
  // Message actions
  showReply?: boolean;
  showEdit?: boolean;
  showDelete?: boolean;
  showReport?: boolean;
  showBan?: boolean;
  showBlock?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onBan?: () => void;
  onBlock?: () => void;
}

export default function MessageContextMenu({
  position,
  onClose,
  showAvatarOptions,
  hasGalleryImages,
  onSelectGravatarPhoto,
  onUseDefaultGravatar,
  onUseInitials,
  showReply,
  showEdit,
  showDelete,
  showReport,
  showBan,
  showBlock,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onBan,
  onBlock,
}: MessageContextMenuProps) {
  // Boundary-aware positioning to prevent iframe clipping
  const menuWidth = 220;
  const menuHeight = calculateMenuHeight();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Position to right by default, left if would overflow
  const x = position.x + menuWidth > viewportWidth 
    ? position.x - menuWidth 
    : position.x;
    
  // Position below by default, above if would overflow
  const y = position.y + menuHeight > viewportHeight
    ? position.y - menuHeight
    : position.y;

  function calculateMenuHeight(): number {
    let itemCount = 0;
    
    // Avatar options
    if (showAvatarOptions) {
      itemCount += 3; // Always show all 3 avatar options
    }
    
    // Message actions
    if (showReply) itemCount++;
    if (showEdit) itemCount++;
    if (showDelete) itemCount++;
    if (showReport) itemCount++;
    if (showBan) itemCount++;
    if (showBlock) itemCount++;
    
    // Each item ~40px + divider 1px + padding
    const baseHeight = itemCount * 40;
    const messageActionsExist = showReply || showEdit || showDelete || showReport || showBan || showBlock;
    const dividerHeight = showAvatarOptions && messageActionsExist ? 1 : 0;
    
    // Add divider between Reply and other message actions (for other people's messages)
    const replyDividerHeight = showReply && (showReport || showBan || showBlock || showDelete) ? 1 : 0;
    
    return baseHeight + dividerHeight + replyDividerHeight + 4;
  }

  const MenuItem = ({ onClick, children, icon, danger = false }: { 
    onClick: () => void; 
    children: React.ReactNode; 
    icon: string;
    danger?: boolean;
  }) => (
    <button
      onClick={() => {
        onClick();
        onClose();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '10px 12px',
        textAlign: 'left',
        background: 'none',
        border: 'none',
          color: danger ? 'var(--relaya-color-danger, #e74c3c)' : 'var(--relaya-color-text)',
          fontSize: 'var(--relaya-font-size-sm)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--relaya-color-surface-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      <span>{icon}</span>
      <span>{children}</span>
    </button>
  );

  const hasAnyItems = showAvatarOptions || showReply || showEdit || showDelete || showReport || showBan || showBlock;
  if (!hasAnyItems) return null;

  const showAvatarDivider = showAvatarOptions && (showReply || showEdit || showDelete || showReport || showBan || showBlock);
  const showReplyDivider = showReply && (showReport || showBan || showBlock || showDelete);

  return (
    <>
      {/* Click-outside-to-close overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
      />
      
      {/* Menu */}
      <div
        style={{
          position: 'fixed',
          top: y,
          left: x,
          zIndex: 1000,
          minWidth: '220px',
          background: 'var(--relaya-color-surface)',
          border: '1px solid var(--relaya-color-border)',
          borderRadius: 'var(--relaya-radius-md)',
          boxShadow: '0 4px 16px var(--relaya-color-shadow)',
          overflow: 'hidden',
        }}
      >
        {/* Avatar Options Section */}
        {showAvatarOptions && (
          <>
            {onSelectGravatarPhoto && (
              <MenuItem onClick={onSelectGravatarPhoto} icon="🌐">
                Select gravatar image...
              </MenuItem>
            )}
            {onUseDefaultGravatar && (
              <MenuItem onClick={onUseDefaultGravatar} icon="🌐">
                Use default Gravatar
              </MenuItem>
            )}
            {onUseInitials && (
              <MenuItem onClick={onUseInitials} icon="⭕">
                Use initials (no avatar)
              </MenuItem>
            )}
          </>
        )}

        {/* Divider between avatar and message actions */}
        {showAvatarDivider && (
          <div style={{
            height: '1px',
            background: 'var(--relaya-color-border)',
            margin: '4px 0',
          }} />
        )}

        {/* Reply action (for other people's messages) */}
        {showReply && onReply && (
          <MenuItem onClick={onReply} icon="↩️">
            Reply
          </MenuItem>
        )}

        {/* Divider between Reply and other message actions */}
        {showReplyDivider && (
          <div style={{
            height: '1px',
            background: 'var(--relaya-color-border)',
            margin: '4px 0',
          }} />
        )}

        {/* Other message actions */}
        {showEdit && onEdit && (
          <MenuItem onClick={onEdit} icon="✏️">
            Edit message
          </MenuItem>
        )}
        {showReport && onReport && (
          <MenuItem onClick={onReport} icon="🚩">
            Report
          </MenuItem>
        )}
        {showBlock && onBlock && (
          <MenuItem onClick={onBlock} icon="🚫">
            Block user
          </MenuItem>
        )}
        {showBan && onBan && (
          <MenuItem onClick={onBan} icon="🔨">
            Ban user
          </MenuItem>
        )}
        {showDelete && onDelete && (
          <MenuItem onClick={onDelete} icon="🗑" danger>
            Delete
          </MenuItem>
        )}
      </div>
    </>
  );
}
