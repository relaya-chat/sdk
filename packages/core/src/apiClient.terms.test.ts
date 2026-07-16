// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for ApiClient.acceptTerms().
 *
 * Verifies that the method POSTs to the correct URL with Authorization
 * and Content-Type headers, and propagates errors correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './apiClient';

function makeFetchSpy(responseBody: unknown = { ok: true }, status = 200) {
  const calls: { url: string | URL | Request; init?: RequestInit }[] = [];
  const spy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { spy, calls };
}

describe('ApiClient.acceptTerms()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/chat/:stationSlug/terms/accept', async () => {
    const { spy, calls } = makeFetchSpy({ ok: true });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at');
    await client.acceptTerms('my-space');

    expect(calls).toHaveLength(1);
    const [url, init] = [String(calls[0].url), calls[0].init];
    expect(url).toBe('https://api.relaya.chat/api/chat/my-space/terms/accept');
    expect(init?.method).toBe('POST');
  });

  it('sends Authorization: Bearer <AT> header', async () => {
    const { spy, calls } = makeFetchSpy({ ok: true });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'my-access-token');
    await client.acceptTerms('my-space');

    const headers = calls[0].init?.headers as Record<string, string> | Headers;
    const authHeader =
      headers instanceof Headers
        ? headers.get('Authorization')
        : (headers as Record<string, string>)['Authorization'];
    expect(authHeader).toBe('Bearer my-access-token');
  });

  it('URL-encodes special characters in the space slug', async () => {
    const { spy, calls } = makeFetchSpy({ ok: true });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at');
    await client.acceptTerms('space/with spaces');

    expect(String(calls[0].url)).toContain(encodeURIComponent('space/with spaces'));
  });

  it('resolves with { ok: true } on success', async () => {
    const { spy } = makeFetchSpy({ ok: true });
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at');
    const result = await client.acceptTerms('my-space');

    expect(result).toEqual({ ok: true });
  });

  it('throws on a non-2xx response', async () => {
    const { spy } = makeFetchSpy({ error: { message: 'Not found' } }, 404);
    vi.stubGlobal('fetch', spy);

    const client = new ApiClient('https://api.relaya.chat', () => 'test-at');
    await expect(client.acceptTerms('nonexistent-space')).rejects.toThrow();
  });
});
