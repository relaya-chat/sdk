// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Focused tests for useRelayaChat Step 2A behaviors.
 *
 * Uses the same HookRuntime pattern as useRelayaAuth.test.ts — mocks React
 * hooks and React Native modules directly so no DOM renderer is required.
 *
 * Tests:
 * 1. allowAnonymous: false — no WebSocket opened when unauthenticated
 * 2. Background-disconnect timer cancel — quick foreground return keeps connection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared hook runtime (mirrors useRelayaAuth.test.ts approach) ──────────────

const reactHookMock = vi.hoisted(() => {
  type HookHost = {
    useState: (initial: unknown) => [unknown, (v: unknown) => void];
    useEffect: (effect: () => unknown, deps?: unknown[]) => void;
    useCallback: (cb: Function, deps?: unknown[]) => Function;
    useRef: (initial: unknown) => { current: unknown };
    useMemo: (factory: () => unknown, deps?: unknown[]) => unknown;
  };
  let current: HookHost | null = null;
  return {
    setCurrent(host: HookHost | null) { current = host; },
    useState(initial: unknown) { return current!.useState(initial); },
    useEffect(effect: () => unknown, deps?: unknown[]) { return current!.useEffect(effect, deps); },
    useCallback(cb: Function, deps?: unknown[]) { return current!.useCallback(cb, deps); },
    useRef(initial: unknown) { return current!.useRef(initial); },
    useMemo(factory: () => unknown, deps?: unknown[]) { return current!.useMemo(factory, deps); },
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
    emit(state: string) { for (const l of [...listeners]) l(state); },
    reset() { listeners.clear(); addEventListener.mockClear(); },
  };
});

vi.mock('react', () => ({
  useState: reactHookMock.useState,
  useEffect: reactHookMock.useEffect,
  useCallback: reactHookMock.useCallback,
  useRef: reactHookMock.useRef,
  useMemo: reactHookMock.useMemo,
}));

vi.mock('react-native', () => ({ AppState: appStateMock.AppState }));

// ── ChatConnection / ApiClient mocks ─────────────────────────────────────────

const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock('@relaya-chat/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@relaya-chat/core')>();
  // Must use function/class syntax (not arrow function) when mocking a constructor.
  // mockConnect/mockClose are captured via the outer hoisted closures in the module.
  const ChatConnectionMock = vi.fn(function MockChatConnectionImpl(
    this: { connect: () => void; close: () => void; send: () => void }
  ) {
    this.connect = function() { mockConnect(); };
    this.close = function() { mockClose(); };
    this.send = function() {};
  });
  return { ...original, ChatConnection: ChatConnectionMock };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import { useRelayaChat } from './useRelayaChat';
import type { RelayaChatOptions } from './useRelayaChat';
import type { RelayaAuthState } from './useRelayaAuth';

// ── HookRuntime ───────────────────────────────────────────────────────────────

function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  return !prev || !next || prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]));
}

class HookRuntime {
  result!: ReturnType<typeof useRelayaChat>;
  dirty = false;
  private index = 0;
  private slots: unknown[] = [];
  private pending: Array<{ index: number; effect: () => unknown; deps?: unknown[] }> = [];

  constructor(private readonly hook: () => ReturnType<typeof useRelayaChat>) {}

  render(): void {
    this.index = 0;
    this.dirty = false;
    reactHookMock.setCurrent(this as unknown as Parameters<typeof reactHookMock.setCurrent>[0]);
    this.result = this.hook();
    reactHookMock.setCurrent(null);
    const effects = this.pending.splice(0);
    for (const item of effects) {
      const record = this.slots[item.index] as { cleanup?: () => void; deps?: unknown[] };
      record.cleanup?.();
      const cleanup = item.effect();
      record.cleanup = typeof cleanup === 'function' ? (cleanup as () => void) : undefined;
    }
  }

  unmount(): void {
    for (const slot of this.slots) {
      (slot as { cleanup?: () => void } | undefined)?.cleanup?.();
    }
  }

  useState(initial: unknown): [unknown, (v: unknown) => void] {
    const i = this.index++;
    if (this.slots[i] === undefined) this.slots[i] = initial;
    return [
      this.slots[i],
      (value: unknown) => {
        this.slots[i] = typeof value === 'function' ? (value as (p: unknown) => unknown)(this.slots[i]) : value;
        this.dirty = true;
      },
    ];
  }

  useRef(initial: unknown): { current: unknown } {
    const i = this.index++;
    if (this.slots[i] === undefined) this.slots[i] = { current: initial };
    return this.slots[i] as { current: unknown };
  }

  useCallback(cb: Function, deps?: unknown[]): Function {
    const i = this.index++;
    const record = this.slots[i] as { callback: Function; deps?: unknown[] } | undefined;
    if (!record || depsChanged(record.deps, deps)) this.slots[i] = { callback: cb, deps };
    return (this.slots[i] as { callback: Function }).callback;
  }

  useMemo(factory: () => unknown, deps?: unknown[]): unknown {
    const i = this.index++;
    const record = this.slots[i] as { value: unknown; deps?: unknown[] } | undefined;
    if (!record || depsChanged(record.deps, deps)) {
      this.slots[i] = { value: factory(), deps };
    }
    return (this.slots[i] as { value: unknown }).value;
  }

  useEffect(effect: () => unknown, deps?: unknown[]): void {
    const i = this.index++;
    const record = this.slots[i] as { cleanup?: () => void; deps?: unknown[] } | undefined;
    if (!record || depsChanged(record.deps, deps)) {
      this.slots[i] = { cleanup: record?.cleanup, deps };
      this.pending.push({ index: i, effect, deps });
    }
  }
}

async function flush(runtime: HookRuntime, cycles = 20): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await Promise.resolve();
    if (runtime.dirty) runtime.render();
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const anonymousAuthState: RelayaAuthState = {
  status: 'anonymous', user: null, station: null, error: null,
};

function makeOptions(overrides: Partial<RelayaChatOptions> = {}): RelayaChatOptions {
  return {
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'test-station',
    authState: anonymousAuthState,
    getToken: vi.fn(() => null),
    ensureFreshToken: vi.fn(async () => null),
    allowAnonymous: true,
    backgroundDisconnectDelayMs: 500,
    ...overrides,
  };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockConnect.mockReset();
  mockClose.mockReset();
  appStateMock.reset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ messages: [], hasMore: false }) })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Test: allowAnonymous: false ───────────────────────────────────────────────

describe('allowAnonymous: false', () => {
  it('does not open a WebSocket when auth is anonymous and allowAnonymous is false', async () => {
    const options = makeOptions({ authState: anonymousAuthState, allowAnonymous: false });
    const runtime = new HookRuntime(() => useRelayaChat(options));
    runtime.render();
    await flush(runtime);

    expect(mockConnect).not.toHaveBeenCalled();

    runtime.unmount();
  });

  it('opens a WebSocket when auth is anonymous and allowAnonymous is true', async () => {
    const options = makeOptions({ authState: anonymousAuthState, allowAnonymous: true });
    const runtime = new HookRuntime(() => useRelayaChat(options));
    runtime.render();
    await flush(runtime);

    expect(mockConnect).toHaveBeenCalledTimes(1);

    runtime.unmount();
  });
});

// ── Test: background-disconnect timer cancel ──────────────────────────────────

describe('background-disconnect timer cancel', () => {
  it('cancels the disconnect timer on quick foreground return', async () => {
    vi.useFakeTimers();
    const DELAY_MS = 500;
    const options = makeOptions({ allowAnonymous: true, backgroundDisconnectDelayMs: DELAY_MS });
    const runtime = new HookRuntime(() => useRelayaChat(options));
    runtime.render();
    await flush(runtime);
    expect(mockConnect).toHaveBeenCalledTimes(1);

    // Background the app — starts the disconnect timer
    appStateMock.emit('background');
    await flush(runtime);

    // Return quickly before timer fires — should cancel timer
    appStateMock.emit('active');
    await flush(runtime);

    // Advance past delay — timer should have been cancelled
    vi.advanceTimersByTime(DELAY_MS + 100);
    await flush(runtime);

    // Connection should NOT have been closed
    expect(mockClose).not.toHaveBeenCalled();

    runtime.unmount();
  });

  it('closes the connection after delay fires during long background', async () => {
    vi.useFakeTimers();
    const DELAY_MS = 500;
    const options = makeOptions({ allowAnonymous: true, backgroundDisconnectDelayMs: DELAY_MS });
    const runtime = new HookRuntime(() => useRelayaChat(options));
    runtime.render();
    await flush(runtime);
    expect(mockConnect).toHaveBeenCalledTimes(1);

    // Background app without returning to foreground
    appStateMock.emit('background');
    await flush(runtime);

    // Advance past delay — timer fires, connection should close
    vi.advanceTimersByTime(DELAY_MS + 100);
    await flush(runtime);

    expect(mockClose).toHaveBeenCalledTimes(1);

    runtime.unmount();
  });
});
