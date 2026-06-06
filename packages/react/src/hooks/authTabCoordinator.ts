// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Cross-tab refresh coordination for Relaya auth.
 *
 * Problem: multiple browser tabs share one localStorage refresh token but each
 * runs independent refresh timers. When two tabs refresh simultaneously with
 * the same RT, one wins and the other gets a 401. Thread B (authRefresh.ts)
 * made the loser non-destructive (guarded storage clear), but the loser tab
 * still degrades to anonymous because its 401 may return before the winner's
 * storage write lands. Thread C prevents the race at its source: only one tab
 * (the "leader") fires a scheduled refresh; followers suppress their request
 * and receive the new AT+RT via BroadcastChannel instead.
 *
 * Leader election uses a short-lived localStorage lease that records which tab
 * ID currently owns the next refresh. Any tab that sees an active lease from a
 * different tab skips its timer-based refresh and waits for the broadcast. The
 * lease expires after LEASE_DURATION_MS so that if the leader closes mid-refresh
 * without broadcasting, followers schedule a failover retry and reclaim
 * leadership after the lease expires.
 *
 * This module is only active when manageOwnRefreshToken=true. Host-managed
 * widgets don't share localStorage RT storage and should not participate.
 */

const LEADER_LEASE_KEY = 'relaya_refresh_leader';

/**
 * How long (ms) a claimed lease suppresses other tabs from refreshing.
 * Must exceed the round-trip time for a /auth/refresh call plus broadcast
 * delivery. 30s is conservative; typical refreshes complete in < 2s.
 */
export const LEASE_DURATION_MS = 30_000;

/**
 * Briefly let concurrent lease contenders settle before starting the HTTP
 * refresh. localStorage has no compare-and-swap operation; write-then-verify
 * after one event-loop turn makes simultaneous timer firings converge on the
 * last visible claimant instead of letting every tab proceed immediately.
 */
const LEASE_SETTLE_MS = 25;

/** Stable per-tab identity for this page load; not persisted. */
const TAB_ID = Math.random().toString(36).slice(2);

interface LeaderLease {
  tabId: string;
  claimedAt: number;
  nonce: string;
}

export interface ActiveOtherLease {
  retryAfterMs: number;
}

function readLease(): LeaderLease | null {
  try {
    const raw = localStorage.getItem(LEADER_LEASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeaderLease>;
    if (
      typeof parsed.tabId !== 'string' ||
      typeof parsed.claimedAt !== 'number' ||
      typeof parsed.nonce !== 'string'
    ) return null;
    return parsed as LeaderLease;
  } catch { return null; }
}

function writeLease(lease: LeaderLease): boolean {
  try {
    localStorage.setItem(LEADER_LEASE_KEY, JSON.stringify(lease));
    return true;
  } catch {
    return false;
  }
}

function isActiveLease(lease: LeaderLease): boolean {
  return Date.now() - lease.claimedAt <= LEASE_DURATION_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => { window.setTimeout(resolve, ms); });
}

/**
 * Returns the remaining lifetime for another tab's active lease, if present.
 * Callers use retryAfterMs to schedule failover if no token-rotated broadcast
 * arrives before the leader lease expires.
 */
export function getActiveOtherLease(): ActiveOtherLease | null {
  const lease = readLease();
  if (!lease) return null;
  if (lease.tabId === TAB_ID) return null;

  const ageMs = Date.now() - lease.claimedAt;
  if (ageMs > LEASE_DURATION_MS) return null;

  return { retryAfterMs: Math.max(0, LEASE_DURATION_MS - ageMs) };
}

/**
 * Returns true if another tab holds an unexpired lease — meaning this tab
 * should skip its scheduled refresh and wait for the leader's broadcast.
 *
 * Returns false (this tab is free to lead) when:
 * - no lease exists (first tab, or all previous leases expired)
 * - the lease belongs to this tab (we are already the leader)
 * - the lease has expired (leader closed before broadcasting)
 */
export function isLeaseHeldByOther(): boolean {
  return getActiveOtherLease() !== null;
}

/**
 * Best-effort pre-flight leadership claim.
 *
 * Returns false if another tab already holds an active lease, or if this tab's
 * write is immediately overwritten by a concurrent contender. Returns true if
 * this tab should proceed with /auth/refresh.
 *
 * If localStorage is unavailable, returns true: there is no shared lease to
 * coordinate through, so the caller falls back to same-realm dedupe + Thread B
 * race recovery behavior.
 */
export async function tryClaimRefreshLease(): Promise<boolean> {
  if (getActiveOtherLease()) return false;

  const lease: LeaderLease = {
    tabId: TAB_ID,
    claimedAt: Date.now(),
    nonce: Math.random().toString(36).slice(2),
  };

  if (!writeLease(lease)) return true;

  await delay(LEASE_SETTLE_MS);

  const current = readLease();
  return Boolean(
    current &&
    current.tabId === lease.tabId &&
    current.claimedAt === lease.claimedAt &&
    current.nonce === lease.nonce &&
    isActiveLease(current)
  );
}

// ── BroadcastChannel ──────────────────────────────────────────────────────────

type TokenRotatedMessage = {
  type: 'relaya:token-rotated';
  accessToken: string;
  refreshToken: string;
};

export interface TabCoordinator {
  /** True when token rotation broadcasts can be delivered to follower tabs. */
  canBroadcast: boolean;
  /** Broadcast a new AT+RT pair to all other open same-origin tabs. */
  broadcast(accessToken: string, refreshToken: string): void;
  /** Release the BroadcastChannel. Call on hook unmount. */
  dispose(): void;
}

/** No-op coordinator returned when BroadcastChannel is unavailable. */
const noopCoordinator: TabCoordinator = {
  canBroadcast: false,
  broadcast: () => {},
  dispose: () => {},
};

/**
 * Creates a BroadcastChannel listener that calls onTokenRotated whenever
 * another tab successfully refreshes its AT+RT pair. Returns a TabCoordinator
 * whose broadcast() method notifies other tabs after this tab completes a
 * refresh, so they can update their in-memory tokens without a server call.
 *
 * Falls back to a no-op coordinator when BroadcastChannel is unavailable
 * (old browsers, SSR) — callers need no feature-detection guards.
 */
export function createTabCoordinator(
  onTokenRotated: (accessToken: string, refreshToken: string) => void
): TabCoordinator {
  if (typeof BroadcastChannel === 'undefined') return noopCoordinator;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel('relaya_auth');
  } catch {
    return noopCoordinator;
  }

  channel.onmessage = (event: MessageEvent<TokenRotatedMessage>) => {
    if (event.data?.type === 'relaya:token-rotated') {
      onTokenRotated(event.data.accessToken, event.data.refreshToken);
    }
  };

  return {
    canBroadcast: true,
    broadcast(accessToken: string, refreshToken: string): void {
      const msg: TokenRotatedMessage = {
        type: 'relaya:token-rotated',
        accessToken,
        refreshToken,
      };
      channel.postMessage(msg);
    },
    dispose(): void {
      channel.close();
    },
  };
}
