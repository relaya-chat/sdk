// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
// @relaya-chat/react — public SDK entry point

// ── Styles (bundled into dist/relaya.css; imported by consumers via @relaya-chat/react/styles) ──
import './styles/main.css';

// ── Style utilities ────────────────────────────────────────────────────────
// Subscribers can call removeRelayaStyles() to disable the auto-injected
// default styles and supply their own stylesheet.
export { injectRelayaStyles, removeRelayaStyles } from './styles/inject.js';

// ── Hooks ──────────────────────────────────────────────────────────────────
export { useRelayaAuth } from './hooks/useRelayaAuth.js';
export { useRelayaChat } from './hooks/useRelayaChat.js';
export { useSpaceTheme, applyDbTheme } from './hooks/useSpaceTheme.js';
export { useBans } from './hooks/useBans.js';
export { useModerationConfig } from './hooks/useModerationConfig.js';
export { useReports } from './hooks/useReports.js';

// ── Config ─────────────────────────────────────────────────────────────────
export { parseConfig, appConfig, buildWsUrl } from './config.js';
export type { AppConfig, Theme } from './config.js';

// ── Space theming ─────────────────────────────────────────────────────────
export { getSpaceTheme, applySpaceTheme } from './spaceThemes.js';
export type { SpaceTheme } from './spaceThemes.js';

// ── Contexts ───────────────────────────────────────────────────────────────
export { NotificationMuteProvider, useNotificationMute } from './contexts/NotificationMuteContext.js';

// ── Mention / sticker input utilities ─────────────────────────────────────
export {
  findActiveMentionQuery,
  getMentionSuggestions,
  resolveSpaceCompletion,
  insertMentionToken,
} from './mentionInputUtils.js';
export type { ActiveMentionQuery } from './mentionInputUtils.js';

export {
  findActiveShortcodeQuery,
  insertStickerShortcode,
  getStickerSuggestions,
} from './stickerInputUtils.js';
export type { ActiveShortcodeQuery } from './stickerInputUtils.js';

// ── Types re-exported from hooks ───────────────────────────────────────────
export type {
  AuthStatus,
  AuthUser,
  AuthStation,
  AuthState,
  AuthActions,
  UseRelayaAuthOptions,
} from './hooks/useRelayaAuth.js';

export type {
  OnlineUser,
  ChatState,
  ChatActions,
  ReplyData,
} from './hooks/useRelayaChat.js';

export type {
  BanEntry,
  BansState,
  BansActions,
} from './hooks/useBans.js';

export type {
  ModerationConfigState,
  ModerationConfigActions,
} from './hooks/useModerationConfig.js';

export type {
  ReportsState,
  ReportsActions,
} from './hooks/useReports.js';

// ── Drop-in compound component ─────────────────────────────────────────────
export { RelayaChat } from './RelayaChat.js';
export type { RelayaChatProps } from './RelayaChat.js';

// ── Individual components (advanced embedding use cases) ───────────────────
export { default as ChatWindow } from './components/ChatWindow.js';
export { default as AudioNotification } from './components/AudioNotification.js';
export { default as AuthModal } from './components/AuthModal.js';
export { default as BanModal } from './components/BanModal.js';
export { default as ChatNameEditor } from './components/ChatNameEditor.js';
export { default as ConnectionStatus } from './components/ConnectionStatus.js';
export { default as GravatarStyleModal } from './components/GravatarStyleModal.js';
export { default as MessageAvatar } from './components/MessageAvatar.js';
export { default as MessageContextMenu } from './components/MessageContextMenu.js';
export { default as MessageInput } from './components/MessageInput.js';
export { default as MessageItem } from './components/MessageItem.js';
export { default as MessageList } from './components/MessageList.js';
export { default as MuteToggle } from './components/MuteToggle.js';
export { default as OTPCodeInput } from './components/OTPCodeInput.js';
export { default as ReportModal } from './components/ReportModal.js';
export { default as UserList } from './components/UserList.js';
export { default as UserListModal } from './components/UserListModal.js';
