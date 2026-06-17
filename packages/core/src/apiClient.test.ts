// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for ApiClient — apiKey header wiring.
 *
 * Verifies that X-Relaya-Api-Key is included on REST requests when an apiKey
 * is provided, and absent when it is not. Uses a fetch spy so no network is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './apiClient';

// ── Fetch mock helpers ────────────────────────────────────────────────────────

/** Captures every fetch call's Request (or URL + init) for assertion. */
function makeFetchSpy(responseBody: unknown = {}) {
  const calls: { url: string | URL | Request; init?: RequestInit }[] = [];
  const spy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { spy, calls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiClient — X-Relaya-Api-Key header', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends X-Relaya-Api-Key header when apiKey is provided', async () => {
    const { spy, calls } = makeFetchSpy({ stationSlug: 'my-space', name: 'My Space' });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at', 'rlk_live_abc123');
    // Use getStation — a simple authenticated GET that exercises the header path
    await client.getStation('my-space').catch(() => { /* ignore shape errors */ });

    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];

    // Headers may come through as a plain object on the init, or as a Headers instance
    const headers = lastCall.init?.headers;
    const headerValue =
      headers instanceof Headers
        ? headers.get('X-Relaya-Api-Key')
        : (headers as Record<string, string>)?.['X-Relaya-Api-Key'];

    expect(headerValue).toBe('rlk_live_abc123');
  });

  it('does not send X-Relaya-Api-Key header when no apiKey is provided', async () => {
    const { spy, calls } = makeFetchSpy({ stationSlug: 'my-space', name: 'My Space' });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at');
    await client.getStation('my-space').catch(() => { /* ignore shape errors */ });

    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];

    const headers = lastCall.init?.headers;
    const headerValue =
      headers instanceof Headers
        ? headers.get('X-Relaya-Api-Key')
        : (headers as Record<string, string>)?.['X-Relaya-Api-Key'];

    expect(headerValue).toBeUndefined();
  });
});
