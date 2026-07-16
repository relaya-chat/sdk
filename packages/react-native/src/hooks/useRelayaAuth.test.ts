// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Focused unit tests for the React Native AT/RT auth hook using fake storage,
 * fake fetch, and mocked React / React Native entry points.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactHookMock = vi.hoisted(() => {
  let current: { useState: Function; useEffect: Function; useCallback: Function; useRef: Function } | null = null;
  return {
    setCurrent(runtime: typeof current) { current = runtime; },
    clearCurrent() { current = null; },
    useState(initial: unknown) { return current!.useState(initial); },
    useEffect(effect: Function, deps?: unknown[]) { return current!.useEffect(effect, deps); },
    useCallback(callback: Function, deps?: unknown[]) { return current!.useCallback(callback, deps); },
    useRef(initial: unknown) { return current!.useRef(initial); },
  };
});

const appStateMock = vi.hoisted(() => {
  const listeners = new Set<(state: string) => void>();
  const addEventListener = vi.fn((_event: string, listener: (state: string) => void) => {
    listeners.add(listener);
    return { remove: vi.fn(() => listeners.delete(listener)) };
  });
  return {
    AppState: { addEventListener },
    emit(state: string) { for (const listener of [...listeners]) listener(state); },
    reset() { listeners.clear(); addEventListener.mockClear(); },
  };
});

vi.mock('react', () => ({
  useState: reactHookMock.useState,
  useEffect: reactHookMock.useEffect,
  useCallback: reactHookMock.useCallback,
  useRef: reactHookMock.useRef,
}));

vi.mock('react-native', () => ({ AppState: appStateMock.AppState }));

import { inFlightRefreshMap, useRelayaAuth } from './useRelayaAuth';
import type { RelayaTokenStorage } from './useRelayaAuth';

const SERVER_URL = 'https://api.test';
const SPACE_SLUG = 'test-space';
const RT_KEY = 'relaya_refresh_token';
const NOW = new Date('2026-01-01T12:00:00Z').getTime();
type AuthResult = ReturnType<typeof useRelayaAuth>;
type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FakeFetch = ReturnType<typeof vi.fn<(url: string, init?: FetchInit) => Promise<Response>>>;

class HookRuntime {
  result!: AuthResult;
  dirty = false;
  private index = 0;
  private slots: unknown[] = [];
  private pending: Array<{ index: number; effect: Function; deps?: unknown[] }> = [];

  constructor(private readonly hook: () => AuthResult) {}

  render(): void {
    this.index = 0;
    this.dirty = false;
    reactHookMock.setCurrent(this);
    this.result = this.hook();
    reactHookMock.clearCurrent();
    const effects = this.pending;
    this.pending = [];
    for (const item of effects) {
      const record = this.slots[item.index] as { cleanup?: Function; deps?: unknown[] };
      record.cleanup?.();
      const cleanup = item.effect();
      record.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  }

  unmount(): void {
    for (const slot of this.slots) {
      (slot as { cleanup?: Function } | undefined)?.cleanup?.();
    }
  }

  useState(initial: unknown): [unknown, (value: unknown) => void] {
    const i = this.index++;
    if (this.slots[i] === undefined) this.slots[i] = initial;
    return [
      this.slots[i],
      (value: unknown) => {
        this.slots[i] = typeof value === 'function' ? (value as Function)(this.slots[i]) : value;
        this.dirty = true;
      },
    ];
  }

  useRef(initial: unknown): { current: unknown } {
    const i = this.index++;
    if (this.slots[i] === undefined) this.slots[i] = { current: initial };
    return this.slots[i] as { current: unknown };
  }

  useCallback(callback: Function, deps?: unknown[]): Function {
    const i = this.index++;
    const record = this.slots[i] as { callback: Function; deps?: unknown[] } | undefined;
    if (!record || depsChanged(record.deps, deps)) this.slots[i] = { callback, deps };
    return (this.slots[i] as { callback: Function }).callback;
  }

  useEffect(effect: Function, deps?: unknown[]): void {
    const i = this.index++;
    const record = this.slots[i] as { cleanup?: Function; deps?: unknown[] } | undefined;
    if (!record || depsChanged(record.deps, deps)) {
      this.slots[i] = { cleanup: record?.cleanup, deps };
      this.pending.push({ index: i, effect, deps });
    }
  }
}

function depsChanged(previous: unknown[] | undefined, next: unknown[] | undefined): boolean {
  return !previous || !next || previous.length !== next.length || previous.some((value, i) => !Object.is(value, next[i]));
}
function makeStorage(initialRt?: string): RelayaTokenStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (initialRt) values.set(RT_KEY, initialRt);
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); }),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body } as Response;
}
function jwt(expOffsetMs: number): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor((NOW + expOffsetMs) / 1000) })}.sig`;
}

const user = { id: 'user-1', displayName: 'Test User', avatarUrl: null, permissions: ['chat.read'], roles: [] };
const station = { id: 'station-1', name: 'Test Space', slug: SPACE_SLUG };
function installFetch(handler: (path: string, init: FetchInit) => Promise<Response> | Response): FakeFetch {
  const fetchMock = vi.fn<(url: string, init?: FetchInit) => Promise<Response>>(async (url, init = {}) => handler(url.replace(SERVER_URL, ''), init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function refreshCalls(fetchMock: FakeFetch) {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'));
}
async function flush(runtime: HookRuntime, cycles = 30): Promise<void> {
  for (let i = 0; i < cycles; i += 1) {
    await Promise.resolve();
    if (runtime.dirty) runtime.render();
  }
}

async function waitFor(runtime: HookRuntime, predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await flush(runtime, 1);
    if (predicate()) return;
  }
  throw new Error(`Timed out waiting for hook state. Last status: ${runtime.result.status}`);
}
async function signInWithCode(runtime: HookRuntime, accessToken: string): Promise<void> {
  await runtime.result.verifyCode('pending-1', '123456');
  await flush(runtime);
  expect(runtime.result.getToken()).toBe(accessToken);
  expect(runtime.result.status).toBe('authenticated');
  expect(runtime.result.station?.slug).toBe(SPACE_SLUG);
  expect(runtime.result.user?.id).toBe(user.id);
}

function renderAuth(storage: RelayaTokenStorage, onSessionEnded = vi.fn()): HookRuntime {
  const runtime = new HookRuntime(() => useRelayaAuth({ serverUrl: SERVER_URL, spaceSlug: SPACE_SLUG, tokenStorage: storage, onSessionEnded }));
  runtime.render();
  return runtime;
}
let runtimes: HookRuntime[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  appStateMock.reset();
  inFlightRefreshMap.clear();
  runtimes = [];
});
afterEach(() => {
  for (const runtime of runtimes) runtime.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  inFlightRefreshMap.clear();
});

describe('useRelayaAuth', () => {
  it("sets anonymous without refreshing when no refresh token is stored", async () => {
    const storage = makeStorage();
    const fetchMock = installFetch(() => { throw new Error('unexpected fetch'); });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);

    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    expect(runtime.result.user).toBeNull();
    expect(runtime.result.station).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes a stored RT, keeps AT in memory, rotates RT in storage, and authenticates', async () => {
    const storage = makeStorage('rt-old');
    const at = jwt(30 * 60_000);
    const fetchMock = installFetch((path, init) => {
      if (path === '/auth/refresh') return jsonResponse({ accessToken: at, refreshToken: 'rt-new' });
      if (path === `/api/chat/${SPACE_SLUG}/me`) return jsonResponse({ userId: user.id, displayName: user.displayName, permissions: user.permissions, roles: user.roles });
      if (path === `/api/chat/stations/${SPACE_SLUG}`) return jsonResponse(station);
      throw new Error(`unexpected ${init.method} ${path}`);
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);

    await waitFor(runtime, () => runtime.result.status === 'authenticated');

    expect(JSON.parse(refreshCalls(fetchMock)[0][1]?.body ?? '{}')).toEqual({ refreshToken: 'rt-old' });
    expect(runtime.result.getToken()).toBe(at);
    expect(storage.values.get(RT_KEY)).toBe('rt-new');
    expect(runtime.result.user?.id).toBe(user.id);
    expect(refreshCalls(fetchMock)).toHaveLength(1);
  });

  it('verifyCode stores only the RT, keeps AT in memory, and authenticates', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    installFetch((path) => path === '/auth/verify-code' ? jsonResponse({ accessToken: at, refreshToken: 'rt-verified', user, station }) : jsonResponse({}));
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await signInWithCode(runtime, at);

    expect(storage.values.get(RT_KEY)).toBe('rt-verified');
    expect([...storage.values.values()]).not.toContain(at);
  });

  it('ensureFreshToken returns a fresh in-memory AT without refreshing', async () => {
    const storage = makeStorage();
    const at = jwt(10 * 60_000);
    const fetchMock = installFetch((path) => path === '/auth/verify-code' ? jsonResponse({ accessToken: at, refreshToken: 'rt-verified', user, station }) : jsonResponse({}));
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    await signInWithCode(runtime, at);

    await expect(runtime.result.ensureFreshToken()).resolves.toBe(at);

    expect(refreshCalls(fetchMock)).toHaveLength(0);
  });

  it.each([['expired', -1_000], ['near expiry', 119_000]])('ensureFreshToken refreshes when the AT is %s', async (_label, expOffsetMs) => {
    const storage = makeStorage();
    const atOld = jwt(expOffsetMs);
    const atNew = jwt(30 * 60_000);
    const fetchMock = installFetch((path) => {
      if (path === '/auth/verify-code') return jsonResponse({ accessToken: atOld, refreshToken: 'rt-current', user, station });
      if (path === '/auth/refresh') return jsonResponse({ accessToken: atNew, refreshToken: 'rt-rotated' });
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    await signInWithCode(runtime, atOld);

    await expect(runtime.result.ensureFreshToken()).resolves.toBe(atNew);

    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(storage.values.get(RT_KEY)).toBe('rt-rotated');
  });

  it('deduplicates concurrent ensureFreshToken refreshes for the same RT', async () => {
    const storage = makeStorage();
    const atOld = jwt(-1_000);
    const atNew = jwt(30 * 60_000);
    let resolveRefresh!: (value: Response) => void;
    const fetchMock = installFetch((path) => {
      if (path === '/auth/verify-code') return jsonResponse({ accessToken: atOld, refreshToken: 'rt-current', user, station });
      if (path === '/auth/refresh') return new Promise<Response>((resolve) => { resolveRefresh = resolve; });
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    await signInWithCode(runtime, atOld);

    const first = runtime.result.ensureFreshToken();
    const second = runtime.result.ensureFreshToken();
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    resolveRefresh(jsonResponse({ accessToken: atNew, refreshToken: 'rt-rotated' }));

    await expect(Promise.all([first, second])).resolves.toEqual([atNew, atNew]);
    expect(storage.values.get(RT_KEY)).toBe('rt-rotated');
  });

  it('preserves RT, schedules one 10-second retry, and does not end session after transient refresh failure', async () => {
    const storage = makeStorage('rt-stored');
    const onSessionEnded = vi.fn();
    let refreshCount = 0;
    const atRetry = jwt(30 * 60_000);
    const fetchMock = installFetch((path) => {
      if (path === '/auth/refresh') {
        refreshCount += 1;
        if (refreshCount === 1) throw new Error('network down');
        return jsonResponse({ accessToken: atRetry, refreshToken: 'rt-after-retry' });
      }
      if (path === `/api/chat/${SPACE_SLUG}/me`) return jsonResponse({ userId: user.id, displayName: user.displayName, permissions: user.permissions, roles: user.roles });
      if (path === `/api/chat/stations/${SPACE_SLUG}`) return jsonResponse(station);
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage, onSessionEnded);
    runtimes.push(runtime);

    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    expect(storage.values.get(RT_KEY)).toBe('rt-stored');
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(refreshCalls(fetchMock)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await waitFor(runtime, () => runtime.result.status === 'authenticated');

    expect(refreshCalls(fetchMock)).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(storage.values.get(RT_KEY)).toBe('rt-after-retry');
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it.each([401, 403])('clears RT, ends session, and becomes anonymous after refresh returns %s', async (status) => {
    const storage = makeStorage('rt-stored');
    const onSessionEnded = vi.fn();
    installFetch((path) => path === '/auth/refresh' ? jsonResponse({ error: { message: 'denied' } }, status) : jsonResponse({}));
    const runtime = renderAuth(storage, onSessionEnded);
    runtimes.push(runtime);

    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    expect(storage.values.has(RT_KEY)).toBe(false);
    expect(runtime.result.getToken()).toBeNull();
    expect(onSessionEnded).toHaveBeenCalledExactlyOnceWith('refresh-failed');
  });

  it('logout posts the RT in the body, clears storage, becomes anonymous, and calls onSessionEnded', async () => {
    const storage = makeStorage();
    const onSessionEnded = vi.fn();
    const at = jwt(30 * 60_000);
    const fetchMock = installFetch((path) => {
      if (path === '/auth/verify-code') return jsonResponse({ accessToken: at, refreshToken: 'rt-verified', user, station });
      if (path === '/auth/logout') return jsonResponse({ ok: true });
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage, onSessionEnded);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    await signInWithCode(runtime, at);

    await runtime.result.logout();
    await flush(runtime);

    const logoutCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/logout'))!;
    expect(JSON.parse(logoutCall[1]?.body ?? '{}')).toEqual({ refreshToken: 'rt-verified' });
    expect(storage.values.has(RT_KEY)).toBe(false);
    expect(runtime.result.status).toBe('anonymous');
    expect(runtime.result.getToken()).toBeNull();
    expect(onSessionEnded).toHaveBeenCalledExactlyOnceWith('logout');
  });

  it('calls ensureFreshToken on AppState active when authenticated', async () => {
    const storage = makeStorage();
    const atOld = jwt(119_000);
    const atNew = jwt(30 * 60_000);
    const fetchMock = installFetch((path) => {
      if (path === '/auth/verify-code') return jsonResponse({ accessToken: atOld, refreshToken: 'rt-current', user, station });
      if (path === '/auth/refresh') return jsonResponse({ accessToken: atNew, refreshToken: 'rt-rotated' });
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');
    await signInWithCode(runtime, atOld);

    appStateMock.emit('active');
    await flush(runtime);

    expect(refreshCalls(fetchMock)).toHaveLength(1);
    expect(runtime.result.getToken()).toBe(atNew);
  });
});

describe('useRelayaAuth — terms acceptance', () => {
  it('exposes termsAccepted=false and termsUrl from verifyCode response when space requires terms', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    installFetch((path) =>
      path === '/auth/verify-code'
        ? jsonResponse({
            accessToken: at,
            refreshToken: 'rt-verified',
            user,
            station,
            termsAccepted: false,
            termsUrl: 'https://example.com/terms',
            termsVersion: '2026-07',
          })
        : jsonResponse({})
    );
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await runtime.result.verifyCode('pending-1', '123456');
    await flush(runtime);

    expect(runtime.result.status).toBe('authenticated');
    expect(runtime.result.termsAccepted).toBe(false);
    expect(runtime.result.termsUrl).toBe('https://example.com/terms');
    expect(runtime.result.termsVersion).toBe('2026-07');
  });

  it('exposes termsAccepted=true when space does not require terms', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    installFetch((path) =>
      path === '/auth/verify-code'
        ? jsonResponse({
            accessToken: at,
            refreshToken: 'rt-verified',
            user,
            station,
            termsAccepted: true,
            termsUrl: null,
            termsVersion: null,
          })
        : jsonResponse({})
    );
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await runtime.result.verifyCode('pending-1', '123456');
    await flush(runtime);

    expect(runtime.result.termsAccepted).toBe(true);
    expect(runtime.result.termsUrl).toBeNull();
    expect(runtime.result.termsVersion).toBeNull();
  });

  it('defaults termsAccepted=true when server omits terms fields (backward compat)', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    installFetch((path) =>
      path === '/auth/verify-code'
        ? jsonResponse({ accessToken: at, refreshToken: 'rt-verified', user, station })
        : jsonResponse({})
    );
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await runtime.result.verifyCode('pending-1', '123456');
    await flush(runtime);

    expect(runtime.result.termsAccepted).toBe(true);
  });

  it('re-evaluates terms on AT refresh and flips termsAccepted to false when admin bumps version', async () => {
    // Start with a near-expired AT from mount-restore so AppState active triggers a real refresh
    const storage = makeStorage('rt-old');
    const atNearExpiry = jwt(119_000); // within 2-min threshold — treated as stale
    const atFresh = jwt(30 * 60_000);
    let refreshCount = 0;
    installFetch((path) => {
      if (path === '/auth/refresh') {
        refreshCount += 1;
        if (refreshCount === 1) {
          // Mount-restore: authenticated with termsAccepted=true, near-expired AT
          return jsonResponse({
            accessToken: atNearExpiry,
            refreshToken: 'rt-new',
            termsAccepted: true,
            termsUrl: 'https://example.com/terms',
            termsVersion: '2026-07',
          });
        }
        // AppState-triggered refresh: admin bumped termsVersion
        return jsonResponse({
          accessToken: atFresh,
          refreshToken: 'rt-new-2',
          termsAccepted: false,
          termsUrl: 'https://example.com/terms',
          termsVersion: '2026-08',
        });
      }
      if (path === `/api/chat/${SPACE_SLUG}/me`) return jsonResponse({ userId: user.id, displayName: user.displayName, permissions: user.permissions, roles: user.roles });
      if (path === `/api/chat/stations/${SPACE_SLUG}`) return jsonResponse(station);
      throw new Error(`unexpected ${path}`);
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);

    await waitFor(runtime, () => runtime.result.status === 'authenticated');
    expect(runtime.result.termsAccepted).toBe(true);

    // AppState active fires ensureFreshToken; AT is near-expired so a refresh is triggered
    appStateMock.emit('active');
    await flush(runtime);

    // After second refresh, terms state is updated from the response
    expect(runtime.result.termsAccepted).toBe(false);
    expect(runtime.result.termsVersion).toBe('2026-08');
  });

  it('acceptTerms() POSTs to the server and flips termsAccepted to true in state', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    const fetchMock = installFetch((path) => {
      if (path === '/auth/verify-code')
        return jsonResponse({
          accessToken: at,
          refreshToken: 'rt-verified',
          user,
          station,
          termsAccepted: false,
          termsUrl: 'https://example.com/terms',
          termsVersion: '2026-07',
        });
      if (path === `/${SPACE_SLUG}/terms/accept` || path.endsWith('/terms/accept'))
        return jsonResponse({ ok: true });
      return jsonResponse({});
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await runtime.result.verifyCode('pending-1', '123456');
    await flush(runtime);
    expect(runtime.result.termsAccepted).toBe(false);

    await runtime.result.acceptTerms();
    await flush(runtime);

    expect(runtime.result.termsAccepted).toBe(true);
    const acceptCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/terms/accept'));
    expect(acceptCall).toBeDefined();
    expect(acceptCall![1]?.method).toBe('POST');
  });

  it('acceptTerms() throws when the server returns an error', async () => {
    const storage = makeStorage();
    const at = jwt(30 * 60_000);
    installFetch((path) => {
      if (path === '/auth/verify-code')
        return jsonResponse({
          accessToken: at,
          refreshToken: 'rt-verified',
          user,
          station,
          termsAccepted: false,
          termsUrl: 'https://example.com/terms',
          termsVersion: '2026-07',
        });
      if (path.endsWith('/terms/accept'))
        return jsonResponse({ error: { message: 'Not configured' } }, 400);
      return jsonResponse({});
    });
    const runtime = renderAuth(storage);
    runtimes.push(runtime);
    await waitFor(runtime, () => runtime.result.status === 'anonymous');

    await runtime.result.verifyCode('pending-1', '123456');
    await flush(runtime);

    await expect(runtime.result.acceptTerms()).rejects.toThrow();
    // State should not flip when server returns an error
    expect(runtime.result.termsAccepted).toBe(false);
  });
});
