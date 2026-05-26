// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useEffect, useRef, useState } from 'react';
import { ApiClient, PERMISSIONS, type StickerListing } from '@relaya-chat/core';
import { API_BASE_URL } from '../config.js';
import type { AuthActions, AuthUser } from '../hooks/useRelayaAuth.js';
import { reorderStickersByFilename } from '../stickerAdminUtils.js';

interface StickerAdminPageProps {
  stationSlug: string;
  user: AuthUser;
  getToken: AuthActions['getToken'];
  /** Called when the user clicks the back/close button. Optional: not needed in admin popup. */
  onClose?: () => void;
  /** Called after a sticker mutation so callers can refresh their local copy. Optional in admin popup (WS push handles it). */
  onLibraryChanged?: () => Promise<void> | void;
}

const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION_PX = 310;

function stickerLabel(sticker: StickerListing): string {
  return sticker.shortcode ? `:${sticker.shortcode}:` : sticker.filename;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Unable to read image dimensions'));
      next.src = objectUrl;
    });

    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function StickerAdminPage({
  stationSlug,
  user,
  getToken,
  onClose,
  onLibraryChanged,
}: StickerAdminPageProps) {
  const api = useRef(new ApiClient(API_BASE_URL, getToken)).current;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stickers, setStickers] = useState<StickerListing[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draggedFilename, setDraggedFilename] = useState<string | null>(null);
  const [dropTargetFilename, setDropTargetFilename] = useState<string | null>(null);

  const canManage = user.permissions.includes(PERMISSIONS.MANAGE_ROLES);

  async function loadStickers() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.getStickers(stationSlug);
      setStickers(result.stickers ?? []);
      setQuota(result.quota ?? null);
      setDirty(false);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load sticker library.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canManage) return;
    loadStickers().catch(() => undefined);
  }, [canManage, stationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notice !== 'Sticker order saved.') return;

    const timeout = window.setTimeout(() => {
      setNotice((current) => (current === 'Sticker order saved.' ? null : current));
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (!canManage) return null;

  function clearDragState() {
    setDraggedFilename(null);
    setDropTargetFilename(null);
  }

  function handleDragStart(event: React.DragEvent<HTMLDivElement>, filename: string) {
    if (saving || uploading || deletingFilename) {
      event.preventDefault();
      return;
    }

    setDraggedFilename(filename);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', filename);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, filename: string) {
    if (!draggedFilename || draggedFilename === filename) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTargetFilename !== filename) {
      setDropTargetFilename(filename);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, filename: string) {
    event.preventDefault();

    const sourceFilename = draggedFilename || event.dataTransfer.getData('text/plain');
    if (!sourceFilename || sourceFilename === filename) {
      clearDragState();
      return;
    }

    const nextStickers = reorderStickersByFilename(stickers, sourceFilename, filename);
    if (nextStickers === stickers) {
      clearDragState();
      return;
    }

    setStickers(nextStickers);
    setDirty(true);
    setNotice(null);
    clearDragState();

    void persistManifest(nextStickers, 'Sticker order saved.');
  }

  function updateShortcode(filename: string, value: string) {
    setStickers((prev) => prev.map((sticker) => (
      sticker.filename === filename
        ? { ...sticker, shortcode: value }
        : sticker
    )));
    setDirty(true);
    setNotice(null);
  }

  async function persistManifest(nextStickers: StickerListing[], successMessage: string) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await api.updateStickerManifest(
        stationSlug,
        nextStickers.map((sticker) => ({
          filename: sticker.filename,
          shortcode: sticker.shortcode?.trim() || null,
        }))
      );

      setStickers(result.stickers ?? []);
      setDirty(false);
      setNotice(successMessage);
      await onLibraryChanged?.();
      return result.stickers ?? [];
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save sticker metadata.');
      setDirty(true);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveChanges() {
    await persistManifest(stickers, 'Sticker metadata saved.');
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (dirty) {
      setError('Save or discard your existing sticker edits before uploading a new file.');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError('Sticker files must be 2MB or smaller.');
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      if (Math.max(dimensions.width, dimensions.height) > MAX_DIMENSION_PX) {
        setError(`Sticker dimensions must be ${MAX_DIMENSION_PX}px or smaller on the longest side.`);
        return;
      }
    } catch {
      setError('Could not read the selected image.');
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await api.uploadSticker(stationSlug, file, file.name);
      setStickers((prev) => [...prev, result.sticker].sort((a, b) => a.order - b.order || a.filename.localeCompare(b.filename)));
      setQuota(result.quota ?? null);
      setNotice('Sticker uploaded. Assign a shortcode and save when you are ready.');
      await onLibraryChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to upload sticker.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(filename: string) {
    if (dirty) {
      setError('Save or discard your existing sticker edits before deleting a file.');
      return;
    }

    if (!window.confirm(`Delete ${filename}? This removes the sticker file and its shortcode mapping.`)) {
      return;
    }

    setDeletingFilename(filename);
    setError(null);
    setNotice(null);
    try {
      await api.deleteSticker(stationSlug, filename);
      await loadStickers();
      setNotice('Sticker deleted.');
      await onLibraryChanged?.();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to delete sticker.');
    } finally {
      setDeletingFilename(null);
    }
  }

  return (
    <div className="sticker-admin-page">
      <div className="sticker-admin-page__topbar">
        <div className="sticker-admin-page__title-group">
          <div className="sticker-admin-page__title-row">
            {onClose && (
              <button className="btn btn--ghost sticker-admin-page__back" onClick={onClose}>
                ← Back
              </button>
            )}
            <h2 className="sticker-admin-page__title">Sticker library</h2>
            <span className="sticker-admin-page__count">
              {quota
                ? `${quota.used} sticker${quota.used === 1 ? '' : 's'} of ${quota.limit >= 9999 ? 'unlimited' : quota.limit} slots available`
                : `${stickers.length} sticker${stickers.length === 1 ? '' : 's'}`}
            </span>
            {notice && <div className="sticker-admin-page__status-inline">{notice}</div>}
          </div>
          <p className="sticker-admin-page__subtitle">
            Upload stickers, assign shortcodes, and order the picker.
          </p>
        </div>

        <div className="sticker-admin-page__header-actions">
          <button
            className="btn btn--ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving || loading}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => loadStickers()}
            disabled={loading || saving || uploading}
          >
            Reload
          </button>
          <button
            className="btn btn--primary"
            onClick={saveChanges}
            disabled={!dirty || saving || loading || uploading}
          >
            {saving ? 'Saving…' : 'Save shortcodes'}
          </button>
        </div>
      </div>

      <div className="sticker-admin-page__notice">
        <strong>Rules:</strong> unique per station, max 12 chars, lowercase letters/numbers/hyphens/underscores only. Blank shortcode fields auto-generate from the filename. Uploads ≤2MB and ≤310px. Drag tiles to reorder.
      </div>

      {error && <div className="sticker-admin-page__error">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/gif,image/png,image/jpeg,image/webp"
        hidden
        onChange={handleFileSelected}
      />

      {loading ? (
        <div className="sticker-admin-page__state">Loading sticker library…</div>
      ) : stickers.length === 0 ? (
        <div className="sticker-admin-page__state">No stickers uploaded yet.</div>
      ) : (
        <div className="sticker-admin-grid">
          {stickers.map((sticker, index) => {
            const deleting = deletingFilename === sticker.filename;
            const isDragging = draggedFilename === sticker.filename;
            const isDropTarget = dropTargetFilename === sticker.filename && draggedFilename !== sticker.filename;

            return (
              <div
                className={[
                  'sticker-admin-card',
                  isDragging ? 'sticker-admin-card--dragging' : '',
                  isDropTarget ? 'sticker-admin-card--drop-target' : '',
                ].filter(Boolean).join(' ')}
                key={sticker.filename}
                onDragOver={(event) => handleDragOver(event, sticker.filename)}
                onDrop={(event) => handleDrop(event, sticker.filename)}
              >
                <div
                  className="sticker-admin-card__preview sticker-admin-card__preview--draggable"
                  draggable={!saving && !uploading && !deletingFilename}
                  onDragStart={(event) => handleDragStart(event, sticker.filename)}
                  onDragEnd={clearDragState}
                  title="Drag to reorder"
                >
                  <img src={sticker.url} alt={stickerLabel(sticker)} loading="lazy" draggable={false} />
                  <span className="sticker-admin-card__drag-badge" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        fill="currentColor"
                        d="M11 23v-3.17l-1.41 1.41-1.42-1.41L12 16l3.83 3.83-1.42 1.41L13 19.83V23h-2Zm-3-7-3.83-3.83 3.83-3.83 1.42 1.41L8.01 11H11v2H8.01l1.41 1.41L8 16Zm8 0-1.41-1.41L15.99 13H13v-2h2.99l-1.4-1.42L16 8.17 19.83 12 16 15.83ZM12 8 8.17 4.17l1.42-1.41L11 4.17V1h2v3.17l1.41-1.41 1.42 1.41L12 8Z"
                      />
                    </svg>
                    <span>Drag to reorder</span>
                  </span>
                </div>

                <div className="sticker-admin-card__body">
                  <div className="sticker-admin-card__filename" title={sticker.filename}>
                    {sticker.filename}
                  </div>

                  <label className="sticker-admin-card__field">
                    <div className="sticker-admin-card__shortcode-input">
                      <span>:</span>
                      <input
                        type="text"
                        value={sticker.shortcode ?? ''}
                        placeholder="viking"
                        maxLength={12}
                        aria-label={`Shortcode for ${sticker.filename}`}
                        onChange={(event) => updateShortcode(sticker.filename, event.target.value.toLowerCase())}
                      />
                      <span>:</span>
                    </div>
                  </label>

                  <div className="sticker-admin-card__actions">
                    <button
                      className="btn btn--danger"
                      onClick={() => handleDelete(sticker.filename)}
                      disabled={deleting || saving || uploading}
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}