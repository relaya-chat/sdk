// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Avatar preference utilities for React Native host apps.
 *
 * These functions wrap the Relaya avatar preference REST endpoint so that host
 * apps never need to construct Gravatar URLs client-side. This matters because:
 *
 * - Gravatar's v3 REST API returns gallery image URLs with MD5 hashes
 * - The Relaya server builds avatar URLs using SHA-256 hashes (from the user's email)
 * - These are two different hash values for the same email address
 * - A URL constructed client-side from a gallery hash will show a different image
 *   than one built server-side from the email hash
 *
 * Always use setAvatarPreferenceStyle (not a client-constructed URL) when the
 * user selects a generated Gravatar style. The server builds the correct URL.
 *
 * All functions hit:
 *   PATCH {serverUrl}/api/chat/{spaceSlug}/me/avatar/preference
 */

/** A single entry returned by the gravatar gallery endpoint. */
export interface GravatarGalleryEntry {
  url: string;
  /** Human-readable label for the image (e.g. the photo title from gravatar.com). */
  alt?: string;
  /** Present for default-style entries (e.g. 'mp', 'identicon', 'retro', ...). */
  style?: string;
}

// ── Internal helper ────────────────────────────────────────────────────────────

async function patchAvatarPreference(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null,
  body: Record<string, unknown>
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(
    `${serverUrl}/api/chat/${spaceSlug}/me/avatar/preference`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to update avatar preference (${res.status})`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Set the user's avatar to a Gravatar-generated style.
 *
 * Sends the bare style code to the server (e.g. 'identicon', 'retro').
 * The server builds the correct Gravatar URL using the user's email and
 * SHA-256 hash. Do NOT construct a Gravatar URL client-side and pass it
 * here -- that would use the wrong hash (see module-level comment).
 *
 * Valid style codes: 'identicon' | 'monsterid' | 'retro' | 'wavatar' | 'robohash' | 'mp'
 */
export async function setAvatarPreferenceStyle(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null,
  styleId: string
): Promise<void> {
  return patchAvatarPreference(serverUrl, spaceSlug, getToken, {
    preference: 'gravatar',
    style: styleId,
  });
}

/**
 * Set the user's avatar to a specific photo from their gravatar.com gallery.
 *
 * Use the URL as returned by fetchGravatarGallery -- do not modify it.
 * This path is for uploaded photos only, not for generated styles.
 */
export async function setAvatarPreferenceGravatarPhoto(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null,
  photoUrl: string
): Promise<void> {
  return patchAvatarPreference(serverUrl, spaceSlug, getToken, {
    preference: 'gravatar',
    avatarUrl: photoUrl,
  });
}

/**
 * Set the user's avatar to their default gravatar image.
 * The server resolves the gravatar hash from the user's email.
 */
export async function setAvatarPreferenceDefault(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null
): Promise<void> {
  return patchAvatarPreference(serverUrl, spaceSlug, getToken, {
    preference: 'default',
  });
}

/**
 * Clear the user's avatar so initials are shown instead.
 */
export async function setAvatarPreferenceInitials(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null
): Promise<void> {
  return patchAvatarPreference(serverUrl, spaceSlug, getToken, {
    preference: null,
  });
}

/**
 * Fetch the user's gravatar gallery (uploaded photos from gravatar.com).
 *
 * Returns only the user's uploaded photos. Use the returned URLs directly
 * with setAvatarPreferenceGravatarPhoto -- do not extract the hash from
 * these URLs to construct generated-style URLs. Gallery URLs use MD5 hashes
 * while the server uses SHA-256, so extracted hashes will produce wrong images.
 */
export async function fetchGravatarGallery(
  serverUrl: string,
  spaceSlug: string,
  getToken: () => string | null
): Promise<GravatarGalleryEntry[]> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(
    `${serverUrl}/api/chat/${spaceSlug}/me/gravatar/gallery`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch gravatar gallery (${res.status})`);
  }

  const data = await res.json();
  return (data.gallery as GravatarGalleryEntry[]) ?? [];
}
