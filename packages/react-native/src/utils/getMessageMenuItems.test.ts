// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * Unit tests for getMessageMenuItems.
 *
 * Covers all permission/ownership combinations deterministically.
 * Zero platform dependencies — runs in any Node.js environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMessageMenuItems } from './getMessageMenuItems';
import type { MessageMenuOpts } from './getMessageMenuItems';
import type { Message, Permission } from '@relaya-chat/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T12:00:00Z').getTime();
const RECENT = new Date('2026-01-01T11:55:00Z').toISOString(); // 5 min ago — within edit window
const OLD = new Date('2026-01-01T11:00:00Z').toISOString();    // 60 min ago — outside edit window

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    station_id: 'station-1',
    user_id: 'user-other',
    content: 'Hello world',
    is_deleted: false,
    deleted_by: null,
    deleted_at: null,
    edited_at: null,
    edit_count: 0,
    reply_to_message_id: null,
    reply_author_name: null,
    reply_excerpt: null,
    created_at: new Date(RECENT),
    ...overrides,
  };
}

const ALL_PERMISSIONS: Permission[] = [
  'chat.read',
  'chat.post',
  'chat.edit_own',
  'chat.delete_own',
  'chat.delete_any',
  'chat.report',
  'chat.ban_user',
  'chat.manage_roles',
  'chat.mention_channel',
];

const LISTENER_PERMISSIONS: Permission[] = ['chat.read', 'chat.post', 'chat.edit_own'];

function makeOpts(overrides: Partial<MessageMenuOpts> = {}): MessageMenuOpts {
  return {
    message: makeMessage(),
    currentUserId: 'user-me',
    currentUserPermissions: LISTENER_PERMISSIONS,
    currentUserPriority: 1,
    messageAuthorPriority: 1,
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Anonymous user ────────────────────────────────────────────────────────────

describe('anonymous user (currentUserId = null)', () => {
  it('shows nothing except delete_any if they had it (they never do)', () => {
    const result = getMessageMenuItems(makeOpts({ currentUserId: null, currentUserPermissions: [] }));
    expect(result.showReply).toBe(false);
    expect(result.showEdit).toBe(false);
    expect(result.showDelete).toBe(false);
    expect(result.showReport).toBe(false);
    expect(result.showBan).toBe(false);
    expect(result.showAvatarOptions).toBe(false);
  });
});

// ── Own message ───────────────────────────────────────────────────────────────

describe('own message', () => {
  const ownMessage = makeMessage({ user_id: 'user-me', created_at: new Date(RECENT) });

  it('shows reply, delete, avatarOptions; not report or ban', () => {
    const result = getMessageMenuItems(makeOpts({ message: ownMessage }));
    expect(result.showReply).toBe(true);
    expect(result.showDelete).toBe(true);
    expect(result.showAvatarOptions).toBe(true);
    expect(result.showReport).toBe(false);
    expect(result.showBan).toBe(false);
  });

  it('shows edit when within window, edit_count < 2, and has chat.edit_own', () => {
    const result = getMessageMenuItems(makeOpts({
      message: ownMessage,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(true);
  });

  it('hides edit when outside the 15-minute window', () => {
    const oldMessage = makeMessage({ user_id: 'user-me', created_at: new Date(OLD) });
    const result = getMessageMenuItems(makeOpts({
      message: oldMessage,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(false);
  });

  it('hides edit when edit_count has reached MAX_EDITS (2)', () => {
    const editedMessage = makeMessage({ user_id: 'user-me', created_at: new Date(RECENT), edit_count: 2 });
    const result = getMessageMenuItems(makeOpts({
      message: editedMessage,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(false);
  });

  it('hides edit when edit_count is 1 (still under limit)', () => {
    const editedOnce = makeMessage({ user_id: 'user-me', created_at: new Date(RECENT), edit_count: 1 });
    const result = getMessageMenuItems(makeOpts({
      message: editedOnce,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(true);
  });

  it('hides edit when missing chat.edit_own permission', () => {
    const result = getMessageMenuItems(makeOpts({
      message: ownMessage,
      currentUserPermissions: ['chat.read', 'chat.post'],
    }));
    expect(result.showEdit).toBe(false);
  });

  it('hides edit when message is deleted', () => {
    const deletedMessage = makeMessage({ user_id: 'user-me', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({
      message: deletedMessage,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(false);
  });

  it('hides delete when message is already deleted', () => {
    const deletedMessage = makeMessage({ user_id: 'user-me', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({ message: deletedMessage }));
    expect(result.showDelete).toBe(false);
  });

  it('hides reply when message is deleted', () => {
    const deletedMessage = makeMessage({ user_id: 'user-me', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({ message: deletedMessage }));
    expect(result.showReply).toBe(false);
  });
});

// ── Other user's message ──────────────────────────────────────────────────────

describe("other user's message", () => {
  const otherMessage = makeMessage({ user_id: 'user-other' });

  it('shows reply and report; not edit, ban (no permission), or avatarOptions', () => {
    const result = getMessageMenuItems(makeOpts({ message: otherMessage }));
    expect(result.showReply).toBe(true);
    expect(result.showReport).toBe(true);
    expect(result.showEdit).toBe(false);
    expect(result.showBan).toBe(false);
    expect(result.showAvatarOptions).toBe(false);
  });

  it('hides report when message is deleted', () => {
    const deletedOther = makeMessage({ user_id: 'user-other', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({ message: deletedOther }));
    expect(result.showReport).toBe(false);
  });

  it('hides reply when message is deleted', () => {
    const deletedOther = makeMessage({ user_id: 'user-other', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({ message: deletedOther }));
    expect(result.showReply).toBe(false);
  });
});

// ── Moderator actions ─────────────────────────────────────────────────────────

describe('moderator with delete_any and ban_user permissions', () => {
  const otherMessage = makeMessage({ user_id: 'user-other' });

  it('shows delete on other user message when has chat.delete_any', () => {
    const result = getMessageMenuItems(makeOpts({
      message: otherMessage,
      currentUserPermissions: ['chat.delete_any'],
    }));
    expect(result.showDelete).toBe(true);
  });

  it('shows ban when has chat.ban_user and target has lower priority', () => {
    const result = getMessageMenuItems(makeOpts({
      message: otherMessage,
      currentUserPermissions: ['chat.ban_user'],
      currentUserPriority: 10,
      messageAuthorPriority: 1,
    }));
    expect(result.showBan).toBe(true);
  });

  it('hides ban when target has equal priority', () => {
    const result = getMessageMenuItems(makeOpts({
      message: otherMessage,
      currentUserPermissions: ['chat.ban_user'],
      currentUserPriority: 5,
      messageAuthorPriority: 5,
    }));
    expect(result.showBan).toBe(false);
  });

  it('hides ban when target has higher priority', () => {
    const result = getMessageMenuItems(makeOpts({
      message: otherMessage,
      currentUserPermissions: ['chat.ban_user'],
      currentUserPriority: 1,
      messageAuthorPriority: 10,
    }));
    expect(result.showBan).toBe(false);
  });

  it('hides ban on own message even with ban_user permission', () => {
    const ownMessage = makeMessage({ user_id: 'user-me' });
    const result = getMessageMenuItems(makeOpts({
      message: ownMessage,
      currentUserPermissions: ['chat.ban_user'],
      currentUserPriority: 10,
      messageAuthorPriority: 1,
    }));
    expect(result.showBan).toBe(false);
  });

  it('hides ban when message is deleted', () => {
    const deletedOther = makeMessage({ user_id: 'user-other', is_deleted: true });
    const result = getMessageMenuItems(makeOpts({
      message: deletedOther,
      currentUserPermissions: ['chat.ban_user'],
      currentUserPriority: 10,
      messageAuthorPriority: 1,
    }));
    // showBan is not gated on isDeleted per spec — ban is about the user, not the message
    // The spec only gates ban on: !isOwn && !isAnonymous && hasPermission && canBanTarget
    expect(result.showBan).toBe(true);
  });

  it('full moderator sees all applicable actions on other user message', () => {
    const result = getMessageMenuItems(makeOpts({
      message: otherMessage,
      currentUserPermissions: ALL_PERMISSIONS,
      currentUserPriority: 10,
      messageAuthorPriority: 1,
    }));
    expect(result.showReply).toBe(true);
    expect(result.showEdit).toBe(false);   // not own message
    expect(result.showDelete).toBe(true);
    expect(result.showReport).toBe(true);
    expect(result.showBan).toBe(true);
    expect(result.showAvatarOptions).toBe(false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('edit_count undefined treated as 0 (under limit)', () => {
    const msg = makeMessage({ user_id: 'user-me', created_at: new Date(RECENT), edit_count: undefined });
    const result = getMessageMenuItems(makeOpts({
      message: msg,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(true);
  });

  it('message created exactly at edit window boundary is within window', () => {
    // 14 minutes 59 seconds ago — still within 15-minute window
    const justInside = new Date(NOW - (15 * 60 * 1000 - 1000)).toISOString();
    const msg = makeMessage({ user_id: 'user-me', created_at: new Date(justInside) });
    const result = getMessageMenuItems(makeOpts({
      message: msg,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(true);
  });

  it('message created exactly at edit window boundary is outside window', () => {
    // 15 minutes 1 second ago — just outside window
    const justOutside = new Date(NOW - (15 * 60 * 1000 + 1000)).toISOString();
    const msg = makeMessage({ user_id: 'user-me', created_at: new Date(justOutside) });
    const result = getMessageMenuItems(makeOpts({
      message: msg,
      currentUserPermissions: ['chat.edit_own'],
    }));
    expect(result.showEdit).toBe(false);
  });
});
