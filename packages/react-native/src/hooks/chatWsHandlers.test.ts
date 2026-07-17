// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for createWsMessageHandler notification dispatch cases.
 *
 * createWsMessageHandler is a pure factory (no React runtime needed): it
 * closes over plain ref objects and a setState dispatcher, so these tests
 * construct minimal refs directly rather than using a hook test harness.
 */

import { describe, expect, it, vi } from 'vitest';
import { createWsMessageHandler } from './chatWsHandlers';
import type { WsHandlerRefs } from './chatWsHandlers';
import type { WsServerMessage } from '@relaya-chat/core';

function makeRefs(overrides: Partial<WsHandlerRefs> = {}): WsHandlerRefs {
  return {
    userDirectory: { current: new Map() },
    avatarHistory: { current: new Map() },
    newestMessageIdRef: { current: undefined },
    oldestMessageIdRef: { current: undefined },
    onStickersUpdatedRef: { current: undefined },
    blockedUserIdsRef: { current: new Set() },
    onMentionNotificationRef: { current: undefined },
    onChannelNotificationRef: { current: undefined },
    ...overrides,
  };
}

describe('createWsMessageHandler: stickers:updated', () => {
  it('calls onStickersUpdatedRef.current when a stickers:updated message arrives', () => {
    const onStickersUpdated = vi.fn();
    const refs = makeRefs({ onStickersUpdatedRef: { current: onStickersUpdated } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);
    handler({ type: 'stickers:updated', stationId: 'station-1' } as WsServerMessage);

    expect(onStickersUpdated).toHaveBeenCalledTimes(1);
    expect(setState).not.toHaveBeenCalled();
  });

  it('does not throw when no onStickersUpdated callback is registered', () => {
    const refs = makeRefs({ onStickersUpdatedRef: { current: undefined } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);

    expect(() =>
      handler({ type: 'stickers:updated', stationId: 'station-1' } as WsServerMessage)
    ).not.toThrow();
  });
});

describe('createWsMessageHandler: mention:notification', () => {
  it('calls onMentionNotificationRef.current when a mention:notification message arrives', () => {
    const onMentionNotification = vi.fn();
    const refs = makeRefs({ onMentionNotificationRef: { current: onMentionNotification } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);
    handler({
      type: 'mention:notification',
      messageId: 'msg-1',
      mentionedBy: { id: 'user-1', displayName: 'Alice' },
      excerpt: 'hello @you',
    } as WsServerMessage);

    expect(onMentionNotification).toHaveBeenCalledTimes(1);
    expect(setState).not.toHaveBeenCalled();
  });

  it('does not throw when no onMentionNotification callback is registered', () => {
    const refs = makeRefs({ onMentionNotificationRef: { current: undefined } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);

    expect(() =>
      handler({
        type: 'mention:notification',
        messageId: 'msg-1',
        mentionedBy: { id: 'user-1', displayName: 'Alice' },
        excerpt: 'hello @you',
      } as WsServerMessage)
    ).not.toThrow();
  });
});

describe('createWsMessageHandler: channel:notification', () => {
  it('calls onChannelNotificationRef.current when a channel:notification message arrives', () => {
    const onChannelNotification = vi.fn();
    const refs = makeRefs({ onChannelNotificationRef: { current: onChannelNotification } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);
    handler({
      type: 'channel:notification',
      messageId: 'msg-2',
      mentionedBy: { id: 'user-1', displayName: 'Alice' },
      excerpt: 'hey @channel',
    } as WsServerMessage);

    expect(onChannelNotification).toHaveBeenCalledTimes(1);
    expect(setState).not.toHaveBeenCalled();
  });

  it('does not throw when no onChannelNotification callback is registered', () => {
    const refs = makeRefs({ onChannelNotificationRef: { current: undefined } });
    const setState = vi.fn();
    const loadMessages = vi.fn(async () => {});

    const handler = createWsMessageHandler(refs, setState, loadMessages);

    expect(() =>
      handler({
        type: 'channel:notification',
        messageId: 'msg-2',
        mentionedBy: { id: 'user-1', displayName: 'Alice' },
        excerpt: 'hey @channel',
      } as WsServerMessage)
    ).not.toThrow();
  });
});
