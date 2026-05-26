// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for buildRnWsUrl.
 *
 * Verifies protocol conversion (http→ws, https→wss), correct query parameter
 * construction, URI encoding of tokens and slugs, and anonymous (no-token) behaviour.
 *
 * Zero platform dependencies — runs in any Node.js / Vitest environment.
 */

import { describe, it, expect } from 'vitest';
import { buildRnWsUrl } from './buildRnWsUrl';

describe('buildRnWsUrl', () => {
  // ── Protocol conversion ──────────────────────────────────────────────────

  it('converts http:// to ws://', () => {
    const url = buildRnWsUrl('http://api.relaya.chat', 'balearic-fm');
    expect(url.startsWith('ws://')).toBe(true);
  });

  it('converts https:// to wss://', () => {
    const url = buildRnWsUrl('https://api.relaya.chat', 'balearic-fm');
    expect(url.startsWith('wss://')).toBe(true);
  });

  // ── Station slug ─────────────────────────────────────────────────────────

  it('appends station slug as a query parameter', () => {
    const url = buildRnWsUrl('https://api.relaya.chat', 'balearic-fm');
    expect(url).toBe('wss://api.relaya.chat/ws?station=balearic-fm');
  });

  it('URI-encodes a slug containing spaces or special characters', () => {
    const url = buildRnWsUrl('https://api.relaya.chat', 'my station & more');
    expect(url).toContain('station=my%20station%20%26%20more');
  });

  // ── Token handling ────────────────────────────────────────────────────────

  it('omits token param when token is undefined (anonymous connection)', () => {
    const url = buildRnWsUrl('https://api.relaya.chat', 'balearic-fm', undefined);
    expect(url).toBe('wss://api.relaya.chat/ws?station=balearic-fm');
    expect(url).not.toContain('token=');
  });

  it('includes token param before station when token is provided', () => {
    const url = buildRnWsUrl('https://api.relaya.chat', 'balearic-fm', 'mytoken123');
    expect(url).toBe('wss://api.relaya.chat/ws?token=mytoken123&station=balearic-fm');
  });

  it('URI-encodes a JWT token containing +, /, and = characters', () => {
    // Base64 tokens commonly contain these characters
    const token = 'abc+def/ghi=jkl';
    const url = buildRnWsUrl('https://api.relaya.chat', 'balearic-fm', token);
    expect(url).toContain('token=abc%2Bdef%2Fghi%3Djkl');
    // Ensure raw special characters are NOT present in the token portion
    expect(url).not.toContain('token=abc+');
  });
});
