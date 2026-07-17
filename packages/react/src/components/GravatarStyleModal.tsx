// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import React, { useState, useEffect } from 'react';
import { useServerUrl } from '../contexts/RelayaServerContext.js';

interface GravatarGalleryImage {
  url: string;
  alt?: string;
}

interface GravatarStyleModalProps {
  stationSlug: string;
  getToken: () => string | null;
  onClose: () => void;
  onSelect: (avatarUrl: string, preference: 'gravatar' | 'default') => Promise<void>;
  currentAvatarUrl: string | null;
}

const GENERATED_STYLES = [
  { id: 'identicon', label: 'Identicon', icon: '🔷' },
  { id: 'monsterid', label: 'Monster', icon: '👾' },
  { id: 'retro', label: 'Retro', icon: '🎮' },
  { id: 'wavatar', label: 'Wavatar', icon: '🌊' },
  { id: 'robohash', label: 'Robohash', icon: '🤖' },
  { id: 'mp', label: 'Mystery Person', icon: '👤' },
];

export default function GravatarStyleModal({
  stationSlug,
  getToken,
  onClose,
  onSelect,
  currentAvatarUrl,
}: GravatarStyleModalProps) {
  const serverUrl = useServerUrl();
  const [gallery, setGallery] = useState<GravatarGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(currentAvatarUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const token = getToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${serverUrl}/api/chat/${stationSlug}/me/gravatar/gallery`, { headers });

        if (!response.ok) {
          throw new Error('Failed to fetch gallery');
        }

        const data = await response.json();
        setGallery(data.gallery || []);
      } catch (err) {
        console.error('Error fetching Gravatar gallery:', err);
        setError('Failed to load Gravatar gallery');
        setGallery([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, [stationSlug, getToken]);

  const handleSelectImage = async () => {
    if (!selectedUrl) return;

    setSaving(true);
    try {
      await onSelect(selectedUrl, 'gravatar');
      onClose();
    } catch (err) {
      setError('Failed to update avatar');
      setSaving(false);
    }
  };

  const handleImageClick = (url: string) => {
    setSelectedUrl(url);
  };

  const handleGeneratedStyleClick = (styleId: string) => {
    // TODO: Construct Gravatar URL with ?d=styleId parameter
    const styleUrl = `https://www.gravatar.com/avatar/HASH?d=${styleId}&s=96`;
    setSelectedUrl(styleUrl);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal gravatar-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select Gravatar Image"
      >
        {/* Header */}
        <div className="modal__title gravatar-modal__header">
          <span>Select Gravatar Image</span>
          <button
            className="btn btn--icon"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal__body gravatar-modal__body">
          {loading && <p>Loading...</p>}

          {error && (
            <p style={{ color: 'var(--relaya-color-danger)', marginBottom: 'var(--spacing-md)' }}>
              {error}
            </p>
          )}

          {!loading && (
            <>
              {/* Gallery Images Section */}
              <div className="gravatar-modal__section">
                <p className="gravatar-modal__section-title">
                  Your Uploaded Images (from gravatar.com)
                </p>
                {gallery.length > 0 ? (
                  <div className="gravatar-modal__grid">
                    {gallery.map((image, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleImageClick(image.url)}
                        className={`gravatar-modal__thumb${selectedUrl === image.url ? ' gravatar-modal__thumb--selected' : ''}`}
                      >
                        <img
                          src={image.url}
                          alt={image.alt || 'Gallery image'}
                          className="gravatar-modal__img"
                        />
                        {image.alt && (
                          <div className="gravatar-modal__img-label">{image.alt}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>
                    Upload some images to your Gravatar <strong><em>photos</em></strong> section to show them here
                  </p>
                )}
              </div>

              {/* Generated Styles Section */}
              <div className="gravatar-modal__section">
                <p className="gravatar-modal__section-title">
                  {gallery.length > 0 ? 'Generated Alternatives' : 'Gravatar Generated Styles'}
                </p>
                <div className="gravatar-modal__grid">
                  {GENERATED_STYLES.map((style) => (
                    <div
                      key={style.id}
                      onClick={() => handleGeneratedStyleClick(style.id)}
                      className="gravatar-modal__style-option"
                    >
                      <div className="gravatar-modal__style-icon">{style.icon}</div>
                      <div className="gravatar-modal__style-label">{style.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSelectImage}
            disabled={!selectedUrl || saving}
            style={{ width: 'auto' }}
          >
            {saving ? 'Saving...' : 'Select Image'}
          </button>
        </div>
      </div>
    </div>
  );
}
