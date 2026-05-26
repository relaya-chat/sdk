// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * @relaya-chat/react-native — public API surface
 *
 * Headless hooks and utilities for building Relaya chat in React Native / Expo.
 * No UI components are exported — host apps render their own native components
 * using the state and actions provided by these hooks.
 */

// ── Auth hook ─────────────────────────────────────────────────────────────────
export { useRelayaAuth } from './hooks/useRelayaAuth';
export type {
  RelayaAuthOptions,
  RelayaAuthState,
  RelayaAuthActions,
  RelayaAuthUser,
  RelayaAuthStation,
  AuthStatus,
} from './hooks/useRelayaAuth';

// ── Chat hook ─────────────────────────────────────────────────────────────────
export { useRelayaChat } from './hooks/useRelayaChat';
export type {
  RelayaChatOptions,
  RelayaChatState,
  RelayaChatActions,
  OnlineUser,
  ReplyData,
} from './hooks/useRelayaChat';

// ── Moderation utility ────────────────────────────────────────────────────────
export { getMessageMenuItems } from './utils/getMessageMenuItems';
export type {
  MessageMenuItems,
  MessageMenuOpts,
} from './utils/getMessageMenuItems';
