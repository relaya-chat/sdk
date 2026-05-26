// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
// @relaya-chat/react/admin — admin panel entry point
//
// Loaded only in the admin popup window (?admin=true).
// The main chat bundle (index.ts) never imports from this file,
// ensuring admin components are not downloaded by regular chat users.

export { AdminPanel } from './AdminPanel.js';
export type { AdminPanelProps } from './AdminPanel.js';
