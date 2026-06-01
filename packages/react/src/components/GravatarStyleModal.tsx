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
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          width: '90%',
          maxWidth: '600px',
          maxHeight: '80vh',
          background: 'var(--relaya-color-input-bg)',
          border: '1px solid var(--relaya-color-border)',
          borderRadius: 'var(--relaya-radius-lg)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--relaya-color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 'var(--relaya-font-size-lg)', fontWeight: 600 }}>
            Select Gravatar Image
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--relaya-color-text-muted)',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {loading && <div>Loading...</div>}
          
          {error && (
            <div style={{ color: 'var(--relaya-color-danger)', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {!loading && (
            <>
              {/* Gallery Images Section */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: 'var(--relaya-font-size-sm)', fontWeight: 600, marginBottom: '12px', color: 'var(--relaya-color-text-muted)' }}>
                  Your Uploaded Images (from gravatar.com)
                </h4>
                {gallery.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px' }}>
                    {gallery.map((image, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleImageClick(image.url)}
                        style={{
                          cursor: 'pointer',
                          border: selectedUrl === image.url ? '2px solid var(--relaya-color-accent)' : '2px solid transparent',
                          borderRadius: 'var(--relaya-radius-sm)',
                          padding: '4px',
                        }}
                      >
                        <img
                          src={image.url}
                          alt={image.alt || 'Gallery image'}
                          style={{
                            width: '100%',
                            height: 'auto',
                          borderRadius: 'var(--relaya-radius-sm)',
                          display: 'block',
                          }}
                        />
                        {image.alt && (
                          <div style={{ fontSize: '10px', color: 'var(--relaya-color-text-muted)', marginTop: '4px', textAlign: 'center' }}>
                            {image.alt}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--relaya-font-size-sm)', color: 'var(--relaya-color-text-muted)', padding: '12px 0' }}>
                    Upload some images to your Gravatar <strong><em>photos</em></strong> section to show them here
                  </div>
                )}
              </div>

              {/* Generated Styles Section */}
              <div>
                <h4 style={{ fontSize: 'var(--relaya-font-size-sm)', fontWeight: 600, marginBottom: '12px', color: 'var(--relaya-color-text-muted)' }}>
                  {gallery.length > 0 ? 'Generated Alternatives' : 'Gravatar Generated Styles'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px' }}>
                  {GENERATED_STYLES.map((style) => (
                    <div
                      key={style.id}
                      onClick={() => handleGeneratedStyleClick(style.id)}
                      style={{
                        cursor: 'pointer',
                        border: '2px solid transparent',
                          borderRadius: 'var(--relaya-radius-sm)',
                        padding: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '32px', marginBottom: '4px' }}>
                        {style.icon}
                      </div>
                          <div style={{ fontSize: '11px', color: 'var(--relaya-color-text-muted)' }}>
                        {style.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--relaya-color-border)',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--relaya-radius-sm)',
              border: '1px solid var(--relaya-color-border)',
              background: 'var(--relaya-color-input-bg)',
              color: 'var(--relaya-color-text)',
              cursor: 'pointer',
              fontSize: 'var(--relaya-font-size-sm)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSelectImage}
            disabled={!selectedUrl || saving}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--relaya-radius-sm)',
              border: 'none',
              background: selectedUrl && !saving ? 'var(--relaya-color-accent)' : 'var(--relaya-color-surface-2)',
              color: selectedUrl && !saving ? '#ffffff' : 'var(--relaya-color-text-muted)',
              cursor: selectedUrl && !saving ? 'pointer' : 'not-allowed',
              fontSize: 'var(--relaya-font-size-sm)',
            }}
          >
            {saving ? 'Saving...' : 'Select Image'}
          </button>
        </div>
      </div>
    </>
  );
}
