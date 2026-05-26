// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for messageUtils.ts
 *
 * Pure logic tests — no I/O, no network, no DB.
 * Run with: npm test (vitest) from packages/chat-shared/
 */

import { describe, it, expect } from 'vitest';
import {
  generateClientId,
  calculateBackoff,
  buildCursorParams,
  removeReconciledOptimistic,
  markOptimisticFailed,
  deduplicateMessages,
  detectImageUrls,
  expandStickerShortcodes,
  hasStickerShortcodeToken,
  isSingleImageMessage,
  normalizeStickerShortcode,
  type OptimisticMessage,
} from './messageUtils.js';

// ==================== generateClientId ====================

describe('generateClientId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateClientId()).toBe('string');
    expect(generateClientId().length).toBeGreaterThan(0);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateClientId()));
    expect(ids.size).toBe(100);
  });

  it('contains only URL-safe characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateClientId()).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ==================== calculateBackoff ====================

describe('calculateBackoff', () => {
  it('returns baseMs for attempt 0', () => {
    expect(calculateBackoff(0, 1000, 30_000)).toBe(1000);
  });

  it('doubles on each attempt', () => {
    expect(calculateBackoff(1, 1000, 30_000)).toBe(2000);
    expect(calculateBackoff(2, 1000, 30_000)).toBe(4000);
    expect(calculateBackoff(3, 1000, 30_000)).toBe(8000);
    expect(calculateBackoff(4, 1000, 30_000)).toBe(16_000);
  });

  it('caps at maxMs', () => {
    expect(calculateBackoff(5, 1000, 30_000)).toBe(30_000);
    expect(calculateBackoff(10, 1000, 30_000)).toBe(30_000);
    expect(calculateBackoff(100, 1000, 30_000)).toBe(30_000);
  });

  it('uses default values when omitted', () => {
    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(5)).toBe(30_000);
  });

  it('respects a custom maxMs', () => {
    expect(calculateBackoff(3, 500, 5000)).toBe(4000);
    expect(calculateBackoff(4, 500, 5000)).toBe(5000); // capped at 5000, not 8000
  });
});

// ==================== buildCursorParams ====================

describe('buildCursorParams', () => {
  it('returns empty params when nothing provided', () => {
    const sp = buildCursorParams({});
    expect(sp.toString()).toBe('');
  });

  it('sets before param', () => {
    const sp = buildCursorParams({ before: 'abc-123' });
    expect(sp.get('before')).toBe('abc-123');
    expect(sp.has('after')).toBe(false);
    expect(sp.has('limit')).toBe(false);
  });

  it('sets after param', () => {
    const sp = buildCursorParams({ after: 'def-456' });
    expect(sp.get('after')).toBe('def-456');
    expect(sp.has('before')).toBe(false);
  });

  it('sets limit param', () => {
    const sp = buildCursorParams({ limit: 25 });
    expect(sp.get('limit')).toBe('25');
  });

  it('combines after + limit', () => {
    const sp = buildCursorParams({ after: 'xyz', limit: 50 });
    expect(sp.get('after')).toBe('xyz');
    expect(sp.get('limit')).toBe('50');
  });
});

// ==================== removeReconciledOptimistic ====================

const makeOptimistic = (clientId: string, status: OptimisticMessage['status'] = 'sending'): OptimisticMessage => ({
  clientId,
  content: `msg-${clientId}`,
  authorId: 'user-1',
  authorDisplayName: 'Test User',
  authorAvatarUrl: null,
  createdAt: new Date(),
  status,
});

describe('removeReconciledOptimistic', () => {
  it('removes the matching optimistic message when clientId matches', () => {
    const optimistic = [makeOptimistic('a'), makeOptimistic('b'), makeOptimistic('c')];
    const result = removeReconciledOptimistic(optimistic, 'b');
    expect(result.map((m) => m.clientId)).toEqual(['a', 'c']);
  });

  it('returns list unchanged when serverClientId is undefined', () => {
    const optimistic = [makeOptimistic('a'), makeOptimistic('b')];
    const result = removeReconciledOptimistic(optimistic, undefined);
    expect(result).toBe(optimistic); // same reference
  });

  it('returns list unchanged when clientId is not found', () => {
    const optimistic = [makeOptimistic('a'), makeOptimistic('b')];
    const result = removeReconciledOptimistic(optimistic, 'z');
    expect(result.map((m) => m.clientId)).toEqual(['a', 'b']);
  });

  it('handles empty list', () => {
    expect(removeReconciledOptimistic([], 'a')).toEqual([]);
  });
});

// ==================== markOptimisticFailed ====================

describe('markOptimisticFailed', () => {
  it('marks the matching message as failed', () => {
    const optimistic = [makeOptimistic('a'), makeOptimistic('b'), makeOptimistic('c')];
    const result = markOptimisticFailed(optimistic, 'b');
    expect(result[0].status).toBe('sending');
    expect(result[1].status).toBe('failed');
    expect(result[2].status).toBe('sending');
  });

  it('does not mutate the original array', () => {
    const optimistic = [makeOptimistic('a')];
    const result = markOptimisticFailed(optimistic, 'a');
    expect(optimistic[0].status).toBe('sending'); // original unchanged
    expect(result[0].status).toBe('failed');
  });

  it('leaves list unchanged if clientId not found', () => {
    const optimistic = [makeOptimistic('a')];
    const result = markOptimisticFailed(optimistic, 'z');
    expect(result[0].status).toBe('sending');
  });
});

// ==================== deduplicateMessages ====================

describe('deduplicateMessages', () => {
  it('removes duplicate IDs, keeping first occurrence', () => {
    const messages = [
      { id: 'a', content: 'first' },
      { id: 'b', content: 'second' },
      { id: 'a', content: 'duplicate of first' },
      { id: 'c', content: 'third' },
    ];
    const result = deduplicateMessages(messages);
    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(result[0].content).toBe('first'); // first occurrence retained
  });

  it('returns the same list if no duplicates', () => {
    const messages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = deduplicateMessages(messages);
    expect(result).toEqual(messages);
  });

  it('handles empty list', () => {
    expect(deduplicateMessages([])).toEqual([]);
  });

  it('handles all-duplicate list', () => {
    const messages = [{ id: 'x' }, { id: 'x' }, { id: 'x' }];
    const result = deduplicateMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('x');
  });
});

// ==================== image URL detection ====================

describe('detectImageUrls', () => {
  it('detects allowlisted station sticker URLs', () => {
    const segments = detectImageUrls('Look /files/stations/station-1/stickers/wave.gif now');
    expect(segments).toEqual([
      { text: 'Look ', isImage: false },
      {
        text: '/files/stations/station-1/stickers/wave.gif',
        isImage: true,
        url: '/files/stations/station-1/stickers/wave.gif',
      },
      { text: ' now', isImage: false },
    ]);
  });

  it('detects allowlisted external GIF hosts', () => {
    const segments = detectImageUrls('https://media.giphy.com/media/abc123/giphy.gif');
    expect(segments).toEqual([
      {
        text: 'https://media.giphy.com/media/abc123/giphy.gif',
        isImage: true,
        url: 'https://media.giphy.com/media/abc123/giphy.gif',
      },
    ]);
  });

  it('leaves non-allowlisted URLs as plain text', () => {
    const segments = detectImageUrls('https://example.com/file.gif');
    expect(segments).toEqual([{ text: 'https://example.com/file.gif', isImage: false }]);
  });

  it('leaves allowlisted host URLs without image extension as text', () => {
    const segments = detectImageUrls('https://tenor.com/view/some-page');
    expect(segments).toEqual([{ text: 'https://tenor.com/view/some-page', isImage: false }]);
  });

  it('segments mixed text plus multiple image URLs', () => {
    const segments = detectImageUrls(
      'a /files/stations/s/stickers/one.gif b https://i.imgur.com/two.webp c'
    );

    expect(segments).toEqual([
      { text: 'a ', isImage: false },
      {
        text: '/files/stations/s/stickers/one.gif',
        isImage: true,
        url: '/files/stations/s/stickers/one.gif',
      },
      { text: ' b ', isImage: false },
      {
        text: 'https://i.imgur.com/two.webp',
        isImage: true,
        url: 'https://i.imgur.com/two.webp',
      },
      { text: ' c', isImage: false },
    ]);
  });

  it('strips trailing punctuation from detected image URLs', () => {
    const segments = detectImageUrls('wow https://i.imgur.com/two.webp!');

    expect(segments).toEqual([
      { text: 'wow ', isImage: false },
      {
        text: 'https://i.imgur.com/two.webp',
        isImage: true,
        url: 'https://i.imgur.com/two.webp',
      },
      { text: '!', isImage: false },
    ]);
  });
});

describe('sticker shortcode helpers', () => {
  const stickers = [
    { shortcode: 'viking', url: '/files/stations/s/stickers/viking.gif' },
    { shortcode: 'bal_wave', url: '/files/stations/s/stickers/bal-wave.gif' },
  ];

  it('normalizes shortcodes to lowercase trimmed form', () => {
    expect(normalizeStickerShortcode('  Viking_1  ')).toBe('viking_1');
  });

  it('expands matching shortcode tokens to sticker URLs', () => {
    expect(expandStickerShortcodes('Hello :viking: world', stickers)).toBe(
      'Hello /files/stations/s/stickers/viking.gif world'
    );
  });

  it('matches shortcodes case-insensitively', () => {
    expect(expandStickerShortcodes(':VIKING: :Bal_Wave:', stickers)).toBe(
      '/files/stations/s/stickers/viking.gif /files/stations/s/stickers/bal-wave.gif'
    );
  });

  it('leaves unknown shortcodes untouched', () => {
    expect(expandStickerShortcodes('Try :unknown:', stickers)).toBe('Try :unknown:');
  });

  it('detects when content contains a shortcode token', () => {
    expect(hasStickerShortcodeToken('test :viking:')).toBe(true);
    expect(hasStickerShortcodeToken('no shortcode here')).toBe(false);
  });
});

describe('isSingleImageMessage', () => {
  it('returns true for a single image URL', () => {
    expect(isSingleImageMessage('/files/stations/s/stickers/one.gif')).toBe(true);
  });

  it('returns true for a single image URL with surrounding whitespace', () => {
    expect(isSingleImageMessage('  https://i.giphy.com/media/x.gif  ')).toBe(true);
  });

  it('returns false for mixed text and image', () => {
    expect(isSingleImageMessage('hello /files/stations/s/stickers/one.gif')).toBe(false);
  });

  it('returns false for multiple image URLs', () => {
    expect(
      isSingleImageMessage('/files/stations/s/stickers/one.gif /files/stations/s/stickers/two.gif')
    ).toBe(false);
  });

  it('returns false for non-allowlisted URL', () => {
    expect(isSingleImageMessage('https://example.com/x.gif')).toBe(false);
  });
});
