// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for authTabCoordinator.ts — cross-tab refresh leader election.
 *
 * Scope: the deterministic localStorage lease primitives and the
 * BroadcastChannel availability fallback. The multi-tab broadcast *delivery*
 * path is integration behavior that can't be exercised meaningfully in a single
 * process and is intentionally not covered here.
 *
 * No DOM environment is required: a minimal in-memory localStorage and a window
 * alias are stubbed per-test, and the lease settle delay is driven with vitest
 * fake timers so the write-then-verify contention case is deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEASE_DURATION_MS,
  createTabCoordinator,
  getActiveOtherLease,
  isLeaseHeldByOther,
  releaseRefreshLease,
  tryClaimRefreshLease,
} from './authTabCoordinator.js';


const LEASE_KEY = 'relaya_refresh_leader';
// Mirrors LEASE_SETTLE_MS in authTabCoordinator.ts (not exported from the module).
const SETTLE_MS = 25;

// Minimal in-memory localStorage + a window alias so the lease primitives can be
// exercised in a plain node environment without a DOM library. window === globalThis
// means window.setTimeout (used by the settle delay) is the same function vitest
// fake timers patch on globalThis.
function installBrowserGlobals(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
  vi.stubGlobal('window', globalThis);
}

// Writes a lease owned by a different tab ID directly into storage.
function writeForeignLease(claimedAt: number): void {
  localStorage.setItem(
    LEASE_KEY,
    JSON.stringify({ tabId: 'other-tab', claimedAt, nonce: 'foreign-nonce' }),
  );
}

// Runs a claim under fake timers and advances past the settle window. The
// optional duringSettle hook runs after this tab writes its own lease but before
// the verify re-read, simulating a concurrent contender.
async function claimWithSettle(duringSettle?: () => void): Promise<boolean> {
  vi.useFakeTimers();
  try {
    const claim = tryClaimRefreshLease();
    duringSettle?.();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 5);
    return await claim;
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  installBrowserGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getActiveOtherLease', () => {
  it('returns null when no lease is stored', () => {
    expect(getActiveOtherLease()).toBeNull();
  });

  it('reports remaining lifetime for an active foreign lease', () => {
    writeForeignLease(Date.now());
    const lease = getActiveOtherLease();
    expect(lease).not.toBeNull();
    expect(lease!.retryAfterMs).toBeGreaterThan(0);
    expect(lease!.retryAfterMs).toBeLessThanOrEqual(LEASE_DURATION_MS);
  });

  it('returns null once a foreign lease has aged past its duration', () => {
    writeForeignLease(Date.now() - (LEASE_DURATION_MS + 1));
    expect(getActiveOtherLease()).toBeNull();
  });

  it('ignores a malformed lease payload', () => {
    localStorage.setItem(LEASE_KEY, 'not json');
    expect(getActiveOtherLease()).toBeNull();

    localStorage.setItem(LEASE_KEY, JSON.stringify({ tabId: 123, claimedAt: 'x' }));
    expect(getActiveOtherLease()).toBeNull();
  });

  it("does not treat this tab's own lease as a foreign lease", async () => {
    expect(await claimWithSettle()).toBe(true);
    expect(getActiveOtherLease()).toBeNull();
  });
});

describe('isLeaseHeldByOther', () => {
  it('is true while a foreign active lease exists', () => {
    writeForeignLease(Date.now());
    expect(isLeaseHeldByOther()).toBe(true);
  });

  it('is false when no lease exists', () => {
    expect(isLeaseHeldByOther()).toBe(false);
  });
});

describe('tryClaimRefreshLease', () => {
  it('claims leadership when no lease exists', async () => {
    expect(await claimWithSettle()).toBe(true);
    // After claiming, this tab owns the lease, so no *other* tab holds it.
    expect(isLeaseHeldByOther()).toBe(false);
  });

  it('refuses to claim while another tab holds an active lease', async () => {
    writeForeignLease(Date.now());
    // Early-return path: resolves without entering the settle delay.
    expect(await tryClaimRefreshLease()).toBe(false);
  });

  it('reclaims leadership after a foreign lease has expired', async () => {
    writeForeignLease(Date.now() - (LEASE_DURATION_MS + 1000));
    expect(await claimWithSettle()).toBe(true);
  });

  it('loses the claim if a concurrent contender overwrites during the settle window', async () => {
    const result = await claimWithSettle(() => {
      // Another tab wins the write race after our claim, before our verify.
      writeForeignLease(Date.now());
    });
    expect(result).toBe(false);
  });
});

describe('releaseRefreshLease', () => {
  it('removes the lease this tab owns so a quick reload does not wait out the TTL', async () => {
    expect(await claimWithSettle()).toBe(true);
    expect(localStorage.getItem(LEASE_KEY)).not.toBeNull();

    releaseRefreshLease();

    expect(localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it('does not delete a lease owned by another tab', () => {
    writeForeignLease(Date.now());
    releaseRefreshLease();
    // Foreign lease must survive — releasing is ownership-checked.
    expect(localStorage.getItem(LEASE_KEY)).not.toBeNull();
    expect(isLeaseHeldByOther()).toBe(true);
  });

  it('is a no-op when no lease is stored', () => {
    expect(() => releaseRefreshLease()).not.toThrow();
    expect(localStorage.getItem(LEASE_KEY)).toBeNull();
  });
});

describe('createTabCoordinator', () => {
  it('returns a no-op coordinator when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    const coordinator = createTabCoordinator(() => {});
    expect(coordinator.canBroadcast).toBe(false);
    // No-op methods must not throw so callers need no feature-detection guards.
    expect(() => coordinator.broadcast('at', 'rt')).not.toThrow();
    expect(() => coordinator.dispose()).not.toThrow();
  });

  it('returns a broadcasting coordinator when BroadcastChannel is available', () => {
    if (typeof BroadcastChannel === 'undefined') return; // environment guard
    const coordinator = createTabCoordinator(() => {});
    try {
      expect(coordinator.canBroadcast).toBe(true);
    } finally {
      coordinator.dispose();
    }
  });

  it('stops broadcasting and never throws after dispose (StrictMode/unmount safety)', () => {
    if (typeof BroadcastChannel === 'undefined') return; // environment guard
    const coordinator = createTabCoordinator(() => {});
    coordinator.dispose();
    // A refresh that resolves after the hook unmounts (or a stale coordinator
    // left by a StrictMode remount) must degrade to a no-op, not throw
    // "channel is closed" and abort the caller's token-application path.
    expect(coordinator.canBroadcast).toBe(false);
    expect(() => coordinator.broadcast('at', 'rt')).not.toThrow();
    // dispose is idempotent.
    expect(() => coordinator.dispose()).not.toThrow();
  });
});

