// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for withFreshToken.ts
 *
 * Pure logic tests - no I/O, no network, no DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { withFreshToken } from './withFreshToken.js';

describe('withFreshToken', () => {
  it('awaits ensureFreshToken before running the action', async () => {
    const calls: string[] = [];
    const ensureFreshToken = vi.fn(async () => {
      calls.push('ensureFreshToken');
      return 'new-token';
    });
    const action = vi.fn(async () => {
      calls.push('action');
      return 'result';
    });

    const result = await withFreshToken(ensureFreshToken, action);

    expect(calls).toEqual(['ensureFreshToken', 'action']);
    expect(result).toBe('result');
  });

  it('runs the action immediately when ensureFreshToken is not provided', async () => {
    const action = vi.fn(async () => 'result');

    const result = await withFreshToken(undefined, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('propagates the action rejection', async () => {
    const ensureFreshToken = vi.fn(async () => 'token');
    const action = vi.fn(async () => {
      throw new Error('api failed');
    });

    await expect(withFreshToken(ensureFreshToken, action)).rejects.toThrow('api failed');
  });

  it('propagates an ensureFreshToken rejection without running the action', async () => {
    const ensureFreshToken = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const action = vi.fn(async () => 'result');

    await expect(withFreshToken(ensureFreshToken, action)).rejects.toThrow('refresh failed');
    expect(action).not.toHaveBeenCalled();
  });
});
