// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * ChatNameEditor — lets the authenticated user set or update their chat display name.
 *
 * Renders as a single compact button in the header:
 *   - No name set:  shows "Set name"
 *   - Name set:     shows the name itself (hover tooltip hints it's clickable)
 *
 * Clicking the button opens a modal dialog with a text input and Save/Cancel.
 * This keeps the header minimal at all container widths while keeping the
 * feature fully accessible.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ApiClient } from '@relaya-chat/core';
import { useServerUrl } from '../contexts/RelayaServerContext.js';

interface ChatNameEditorProps {
  stationSlug: string;
  initialChatName: string | null;
  getToken: () => string | null;
  /** Called after a successful save so the parent can refresh displayName state */
  onUpdated?: (chatName: string | null, displayName: string) => void;
}

export default function ChatNameEditor({
  stationSlug,
  initialChatName,
  getToken,
  onUpdated,
}: ChatNameEditorProps) {
  const [chatName, setChatName] = useState<string | null>(initialChatName);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const serverUrl = useServerUrl();
  const api = useRef(new ApiClient(serverUrl, getToken)).current;

  // Sync when the parent loads the actual chat name after mounting
  // (e.g. from GET /me). useState(initialChatName) only reads the prop once;
  // this effect propagates later updates without clobbering an in-progress edit.
  useEffect(() => {
    if (!modalOpen) {
      setChatName(initialChatName);
    }
  }, [initialChatName]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = useCallback(() => {
    setDraft(chatName ?? '');
    setError(null);
    setModalOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [chatName]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length > 40) {
      setError('Name must be 40 characters or fewer');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await api.updateChatName(stationSlug, trimmed.length === 0 ? null : trimmed);
      setChatName(result.chatName);
      setModalOpen(false);
      onUpdated?.(result.chatName, result.displayName);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to save chat name';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [api, draft, stationSlug, onUpdated]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') closeModal();
  }, [save, closeModal]);

  const titleHint = chatName ? 'Change your display name' : 'Set your display name';

  return (
    <>
      {/* ── Header button ── */}
      <button
        className="btn btn--ghost chat-name-btn"
        onClick={openModal}
        title={titleHint}
        aria-label={chatName ? `Display name: ${chatName}. Click to change.` : 'Set your display name'}
      >
        <span className="chat-name-btn__label">{chatName ?? 'Set name'}</span>
      </button>

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">
              {chatName ? 'Change display name' : 'Set display name'}
            </div>
            <div className="modal__body">
              <p>This is how other listeners will see you in chat.</p>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={40}
                placeholder="Your chat name (max 40 characters)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                aria-label="Chat display name"
              />
              {error && (
                <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-xs)' }}>
                  {error}
                </p>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={save}
                disabled={saving}
                style={{ width: 'auto' }}
              >
                {saving ? '…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
