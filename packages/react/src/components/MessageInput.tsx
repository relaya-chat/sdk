// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, KeyboardEvent as ReactKeyboardEvent, useRef, useEffect } from 'react';
import type { StickerListing } from '@relaya-chat/core';
import type { ConnectionStatus } from '@relaya-chat/core';
import {
  findActiveShortcodeQuery,
  getStickerSuggestions,
  insertStickerShortcode,
} from '../stickerInputUtils.js';
import {
  findActiveMentionQuery,
  resolveSpaceCompletion,
  insertMentionToken,
} from '../mentionInputUtils.js';
import type { OnlineUser } from '../hooks/useRelayaChat.js';
import { useStickerPicker } from '../hooks/useStickerPicker.js';
import { useMentionSuggestions } from '../hooks/useMentionSuggestions.js';
import { StickerPickerDialog } from './StickerPickerDialog.js';

export interface ReplyingTo {
  messageId: string;
  authorName: string;
  excerpt: string;
}

interface MessageInputProps {
  onSend: (content: string) => void;
  connectionStatus: ConnectionStatus;
  canPost: boolean;
  onRequestAuth: () => void;
  stationSlug: string;
  getToken: () => string | null;
  stickers: StickerListing[];
  onRefreshStickers?: () => Promise<void>;
  replyingTo: ReplyingTo | null;
  onCancelReply: () => void;
  onlineUsers?: OnlineUser[];
  currentUserId?: string;
}

export default function MessageInput({
  onSend,
  connectionStatus,
  canPost,
  onRequestAuth,
  stationSlug,
  getToken: _getToken,
  stickers,
  onRefreshStickers,
  replyingTo,
  onCancelReply,
  onlineUsers = [],
  currentUserId,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [caretPosition, setCaretPosition] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isConnected = connectionStatus === 'connected';

  // ── Sticker picker (state, refs, effects) ─────────────────
  const {
    pickerOpen,
    pickerLoading,
    pickerError,
    pickerRef,
    stickerBtnRef,
    closePicker,
    togglePicker,
  } = useStickerPicker({ isConnected, stationSlug, onRefreshStickers });

  // ── Computed sticker values ────────────────────────────────
  const activeShortcode = findActiveShortcodeQuery(text, caretPosition);
  const suggestions = activeShortcode
    ? getStickerSuggestions(stickers, activeShortcode.query)
    : [];
  const pickerStickers = stickers.filter(
    (sticker): sticker is StickerListing & { shortcode: string } => !!sticker.shortcode
  );

  // ── Text insertion helper ──────────────────────────────────
  function applyInsertedText(nextText: string, caret: number) {
    setText(nextText);
    closePicker();

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      setCaretPosition(caret);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }

  // ── Mention suggestions (state, computed, logic) ───────────
  const activeMention = findActiveMentionQuery(text, caretPosition);
  const {
    mentionSuggestions,
    mentionHighlight,
    setMentionHighlight,
    setMentionStripDismissed,
    mentionStripVisible,
    mentionStripWidth,
    insertMention,
  } = useMentionSuggestions(
    text,
    caretPosition,
    onlineUsers,
    currentUserId,
    activeMention,
    pickerOpen,
    applyInsertedText
  );

  function send() {
    const trimmed = text.trim();
    if (!trimmed || !isConnected) return;

    if (!canPost) {
      onRequestAuth();
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    // --- Mention strip keyboard navigation ---
    if (mentionStripVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight((i) =>
          i <= 0 ? mentionSuggestions.length - 1 : i - 1
        );
        return;
      }
      // Escape dismisses the strip; cursor stays in the textarea
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionHighlight(-1);
        setMentionStripDismissed(true);
        return;
      }
      // Enter selects the highlighted item (does NOT send the message)
      if (e.key === 'Enter' && mentionHighlight >= 0) {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionHighlight]);
        return;
      }
    }

    // Tab auto-completes when exactly one mention suggestion remains
    if (e.key === 'Tab' && mentionSuggestions.length === 1) {
      e.preventDefault();
      insertMention(mentionSuggestions[0]);
      return;
    }
    // Space auto-upgrades a completed @word to a structured token when it
    // exactly matches one online user with a single-word display name
    if (e.key === ' ') {
      const resolved = resolveSpaceCompletion(text, caretPosition, onlineUsers, currentUserId);
      if (resolved) {
        e.preventDefault();
        const result = insertMentionToken(text, resolved.start, resolved.end, resolved.user);
        applyInsertedText(result.nextText, result.caretPosition);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function insertStickerText(sticker: StickerListing) {
    const textarea = textareaRef.current;
    const insertion = sticker.shortcode ? `:${sticker.shortcode}: ` : `${sticker.url} `;

    if (!textarea) {
      const next = `${text}${insertion}`;
      applyInsertedText(next, next.length);
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;

    const before = text.slice(0, start);
    const after = text.slice(end);
    const next = `${before}${insertion}${after}`;
    applyInsertedText(next, start + insertion.length);
  }

  function insertSuggestion(shortcode: string) {
    const textarea = textareaRef.current;
    const selectionStart = activeShortcode?.start ?? (textarea?.selectionStart ?? text.length);
    const selectionEnd = activeShortcode?.end ?? (textarea?.selectionEnd ?? text.length);
    const result = insertStickerShortcode(text, selectionStart, selectionEnd, shortcode);
    applyInsertedText(result.nextText, result.caretPosition);
  }

  // Handle Escape key to cancel reply
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && replyingTo && !pickerOpen) {
        onCancelReply();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [replyingTo, pickerOpen, onCancelReply]);

  // Auto-focus textarea when reply starts
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const placeholder = isConnected ? 'Message…' : 'Connecting…';

  return (
    <div className="message-input-container">
      {replyingTo && (
        <div className="reply-preview">
          <div className="reply-preview__content">
            <div className="reply-preview__line" />
            <div className="reply-preview__text">
              <div className="reply-preview__author">{replyingTo.authorName}</div>
              <div className="reply-preview__excerpt">{replyingTo.excerpt}</div>
            </div>
          </div>
          <button
            type="button"
            className="reply-preview__cancel"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            title="Cancel reply (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      <div className="message-input-bar">
        <button
          type="button"
          ref={stickerBtnRef}
          className="sticker-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={togglePicker}
          disabled={!isConnected}
          title="Open sticker picker"
          aria-label="Open sticker picker"
        >
          ☺
        </button>

        <textarea
          ref={textareaRef}
          className="message-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaretPosition(e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onClick={(e) => setCaretPosition(e.currentTarget.selectionStart ?? text.length)}
          onKeyUp={(e) => setCaretPosition(e.currentTarget.selectionStart ?? text.length)}
          onSelect={(e) => setCaretPosition(e.currentTarget.selectionStart ?? text.length)}
          placeholder={placeholder}
          disabled={!isConnected}
          rows={1}
          maxLength={2000}
        />
        <button
          type="button"
          className="send-btn"
          onClick={send}
          disabled={!isConnected || !text.trim()}
          title="Send (Enter)"
          aria-label="Send message"
        >
          ↑
        </button>

        {mentionStripVisible && (
          <div
            className="mention-suggestions"
            role="listbox"
            aria-label="Mention suggestions"
            style={mentionStripWidth ? { width: mentionStripWidth } : undefined}
          >
            {mentionSuggestions.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                className={`mention-suggestions__item${idx === mentionHighlight ? ' mention-suggestions__item--highlighted' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(user)}
              >
                <span className="mention-suggestions__at">@</span>
                <span className="mention-suggestions__name">{user.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {!pickerOpen && activeShortcode && suggestions.length > 0 && (
          <div className="sticker-suggestions" role="listbox" aria-label="Sticker shortcode suggestions">
            {suggestions.map((sticker) => (
              <button
                key={sticker.filename}
                type="button"
                className="sticker-suggestions__item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSuggestion(sticker.shortcode!)}
              >
                <img src={sticker.url} alt={sticker.shortcode ?? ''} loading="lazy" />
                <span className="sticker-suggestions__code">:{sticker.shortcode}:</span>
              </button>
            ))}
          </div>
        )}

        {pickerOpen && (
          <StickerPickerDialog
            pickerRef={pickerRef}
            pickerLoading={pickerLoading}
            pickerError={pickerError}
            pickerStickers={pickerStickers}
            onClose={closePicker}
            onInsert={insertStickerText}
          />
        )}
      </div>
    </div>
  );
}
