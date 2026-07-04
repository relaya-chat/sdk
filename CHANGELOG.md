# Changelog

All notable changes to the Relaya Chat SDK are documented here.

Packages versioned together: `@relaya-chat/core`, `@relaya-chat/react`, `@relaya-chat/react-native`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed

- **`@relaya-chat/react-native`** — `useRelayaChat` now fetches the space's `hideDeletedMessages` setting from the server on mount and exposes it as `chat.hideDeletedMessages` in `RelayaChatState`. Previously the hook never read this setting, so toggling "hide deleted messages" off in the space admin had no effect on React Native clients - deleted messages always appeared as a "[message deleted]" placeholder regardless. The hook now calls `api.getStation()` on mount (non-blocking; failure leaves the safe default of `false`). **RN developers must use `chat.hideDeletedMessages` (not `auth.station?.hideDeletedMessages`) to drive deleted-message rendering in their message list**, as `auth.station` reflects the value at sign-in time while `chat.hideDeletedMessages` is always fetched fresh. The example `RelayaMessageList` component has been updated to accept `hideDeletedMessages` and `currentUserPermissions` props and implements the correct filter: non-moderators see deleted messages omitted when the setting is enabled; moderators (`DELETE_ANY` permission) always see the "[message deleted]" placeholder. **Supersedes** the 2.0.0-beta.2 documentation guidance, which incorrectly recommended reading from `auth.station?.hideDeletedMessages`.

---

## [2.0.0-beta.4] — 2026-07-03

### Added

- **`@relaya-chat/react-native`** — `onStickersUpdated` option added to `useRelayaChat`, invoked when the server broadcasts a `stickers:updated` WS event (e.g. a moderator adds/removes stickers). Mirrors the real-time sticker refresh `@relaya-chat/react` already had; previously React Native had no way to react to this event and required a manual reconnect or restart to pick up sticker changes. No new server or `@relaya-chat/core` dependency - `stickers:updated` and `getStickers()` already existed.

### Fixed

- **`@relaya-chat/react` + `@relaya-chat/react-native`** — REST-based moderation actions (`deleteMessage`, `banUser`, `reportMessage`, `editMessage`, `blockUser`, `unblockUser`) now await token-freshness (`ensureFreshToken`) before calling the API, mirroring the check already performed before WebSocket connects. Previously these actions used whatever access token was currently cached; a client that stayed continuously foregrounded for the full ~30-minute AT lifetime with no WS reconnect and no background/foreground transition had nothing to trigger a refresh, so the next moderation call could fail with a stale-token 401. The shared check is implemented once as `withFreshToken()` in `@relaya-chat/core`.
- **`@relaya-chat/react`** — `UserList` now shows blocked users who are currently offline (or were never online this session). Previously the blocked-user section was derived by filtering the online-only `users` list, so a blocked user vanished from the sidebar — and the Unblock control along with them — as soon as they disconnected. `UserList` now iterates `blockedUserIds` directly and resolves display names via a new `getUserInfo` prop (wired from `chat.getUserInfo` in `ChatWindow`), falling back to "Unknown User" for a user blocked in a prior session who hasn't been seen this session. Blocked users who are offline still render italicized (`user-list__name--blocked`); blocked users who are currently online render in regular font, so it's clear at a glance whether a block is "biting" a live user.

---

## [2.0.0-beta.3] — 2026-07-02

### Added

- **`@relaya-chat/react` + `@relaya-chat/react-native`** — User-to-user blocking. `blockUser(userId)` / `unblockUser(userId)` added to `useRelayaChat`, backed by `POST/DELETE /api/chat/:stationSlug/blocks`. New `blockedUserIds: string[]` state field, populated from the server on connect (`auth:success`) and kept in sync with optimistic updates. Messages from blocked users are filtered at every ingestion point — initial load, catch-up, live broadcast, scroll-back, and immediately on block. **`@relaya-chat/react`** adds a "Block user" item to `MessageContextMenu` and an "Unblock" affordance in `UserList` (blocked users shown italicized, sorted after online users). Requires Relaya server v1.5.0 or later; earlier servers simply omit the `blockedUserIds` field and the block endpoints, so the SDK behaves as if no users are blocked.

### Documentation

- **`@relaya-chat/react`** — README gains a "Moderation & UGC compliance" section documenting the full Apple Guideline 1.2 story (filter, report, block) plus the `blockUser`/`unblockUser`/`blockedUserIds`/`reportMessage` API.
- **`@relaya-chat/react-native`** — README documents `blockedUserIds` usage and adds an App Store warning: space admins can disable the server-side content filter, which may affect Guideline 1.2 compliance for apps using that space.
- **All packages** — "Server" compatibility line bumped to v1.5.0 or later (previously v1.2.0), reflecting the new block endpoints.

---

## [2.0.0-beta.2] — 2026-06-19

### Documentation

- **All packages** — Clarified that `hideDeletedMessages` on `AuthStation` /
  `RelayaAuthStation` is a **read-only, server-set value**. It reflects the
  space-level admin setting configured at relaya.chat and is populated by the
  server when the auth hook loads station data. SDK consumers should read this
  field to decide whether to hide deleted message rows in their UI, but must
  not attempt to set or pass it as a configuration option — there is no
  supported way to override it from the client. The correct usage pattern is:

  ```ts
  // React Native example — hide deleted rows for non-moderators when the
  // space admin has enabled the setting.
  const hideDeleted = auth.station?.hideDeletedMessages ?? false;
  ```

  The property is optional (`boolean | undefined`) because it may be absent
  immediately after OTP verification; it is populated on the next auth
  refresh or app restart.

---

## [2.0.0-beta.1] — 2026-06-18

### Removed

- **`@relaya-chat/react`** — **BREAKING:** `clearTokenFromUrl()` is no longer exported and `magicLinkToken` has been removed from the `RelayaChatConfig` type. These were remnants of an older magic-link sign-in flow that the server no longer supports; the OTP sign-in path (email + 6-digit code) is unaffected. If you called `clearTokenFromUrl()`, remove the call. If you passed `magicLinkToken` to `parseConfig()`, remove that field. No behavior change for users of `<RelayaChat>`.

- **`@relaya-chat/react`** — **BREAKING:** The admin panel has been removed from the SDK. The `AdminPanel` component (and its `AdminPanelProps` type), the `@relaya-chat/react/admin` subpath export, and the `reorderStickersByFilename` helper are gone. Space administration now lives natively in the relaya.chat `/account` dashboard rather than inside the embedded chat client; the in-chat gear icon that opened the panel was removed in the previous release. Consumers embedding `<RelayaChat>` need no changes — chat is unaffected. Anyone importing from `@relaya-chat/react/admin` or referencing `AdminPanel` must remove those imports and administer spaces at relaya.chat. This drops ~5,000 lines of code and all admin stylesheets, so the package and its default CSS bundle are smaller; the default styles no longer carry admin UI.

### Added

- **All packages** — `apiKey` prop / option for per-space API key enforcement. Pass the key generated in the space's admin settings at relaya.chat as `apiKey` to `<RelayaChat>`, `useRelayaAuth`, and `useRelayaChat`. The key is sent as `X-Relaya-Api-Key` on all REST requests and appended as `?apiKey=` on the WebSocket upgrade URL. Omitting the prop is a no-op — spaces without key enforcement configured are unaffected. Requires Relaya server v1.3.0 or later for enforcement to take effect.

### Fixed


- **`@relaya-chat/react`** — Cross-tab refresh lease is now released when the auth hook unmounts, so a quick page reload reconnects immediately instead of waiting out the lease TTL. Previously a reload could leave chat sitting on "Loading…" for up to ~30 seconds. The tab coordinator is also dispose-safe: broadcasts to a closed `BroadcastChannel` are ignored rather than throwing, which could otherwise drop the session on remount (including React StrictMode double-mounting in development).

---

## [1.4.0] — 2026-06-08

### Added

- **`@relaya-chat/react-native`** — `useRelayaAuth` rewritten to the AT/RT (access/refresh token) model. Handles OTP sign-in, token refresh, and sign-out using the same session lifecycle as the React package. Stores tokens in `AsyncStorage` via an injected adapter so consumers control the storage implementation.

- **`@relaya-chat/react-native`** — `useRelayaChat` updated to the AT/RT model (Wave 2A). WebSocket connections now attach a fresh access token on each connect attempt, and auth failure closes the socket gracefully for a clean re-auth cycle.

- **`@relaya-chat/react-native`** — Expo Basic example app (`packages/react-native/examples/expo-basic`). Demonstrates sign-in, message list, message composer, and a presence bar against a real Relaya space. Runnable with `npm run ios` from the example directory.

### Fixed

- **`@relaya-chat/react-native`** — Re-render loop in `useRelayaAuth` caused by an unstabilised callback reference inside a `useEffect` dependency array.

- **`@relaya-chat/react-native`** — JWT decode path and `tsconfig` corrections in the Expo Basic example.

- **`@relaya-chat/react-native`** — New Architecture (`newArchEnabled: true`) enabled in the Expo Basic `app.json` to suppress Expo Go warnings.

### Documentation

- Server minimum-version requirements added to all three package READMEs.
- React Native package README rewritten to reflect the AT/RT auth model and `useRelayaChat` changes.

---

## [1.3.0] — 2026-06-06

### Fixed

- **`@relaya-chat/react`** — Multi-tab token refresh coordination. A localStorage lease elects a single "refresh leader" tab; a `BroadcastChannel` propagates the rotated tokens to all other tabs. Eliminates simultaneous `/auth/refresh` calls from competing tabs sharing the same token — previously one tab would invalidate the other's session. Falls back to race-aware refresh where `BroadcastChannel` is unavailable.

- **`@relaya-chat/react`** — Race-aware token refresh. `clearStoredRefreshTokenIfCurrent()` prevents a losing tab from overwriting a winning tab's freshly rotated refresh token. A 401 response now re-reads localStorage before giving up — if another tab already rotated the token in, the SDK retries with the new value rather than ending the session. Authenticated WebSocket connections now call `ensureFreshToken()` before the upgrade, preventing a stuck reconnect loop caused by sending an expired access token on the initial WS handshake.

- **`@relaya-chat/react`** — Reliable scroll-to-bottom (revised). Removed `scroll-behavior: smooth` from the message list container and the `isProgrammaticScrollRef` / 500 ms suppression workaround. The initial jump to the bottom is now instant; smooth scrolling is preserved for new messages arriving while the view is already at the bottom. Resolves the ↓ button vanishing in active chats.

---

## [1.2.0] — 2026-06-04

### Added

- **`@relaya-chat/react`** — `theme` prop on `<RelayaChat>`: pass `'light'` or `'dark'` to override auto-detection from `prefers-color-scheme`. Pass your app's `resolvedTheme` (e.g. from `next-themes`) to keep the widget in sync with your host page's theme switching.
- **`@relaya-chat/react`** — `headerIconColor` field added to the `SpaceTheme` interface, mapped to the `--sp-header-icon-color` CSS custom property. Controls the icon and button tint in the header bar (defaults to white; set to a dark value when using a light-coloured header background).
- **`@relaya-chat/react`** — `SpaceHeaderNameAdmin` component (exported via `@relaya-chat/react/admin`). Admins can set a cosmetic display-name override shown in the chat header bar, independent of the space slug and billing records.
- **`@relaya-chat/react`** — Anonymous guest count in `UserListModal`. Non-authenticated listeners are now shown as a single "N guests" row at the bottom of the online-users list, and the header count includes them in the total.
- **`@relaya-chat/react`** — `PRIVACY.md` added to the package (also published to npm). Describes what user data Relaya collects and processes on the integrator's behalf — useful when writing your own privacy policy.

### Fixed

- **`@relaya-chat/react`** — Reliable initial scroll-to-bottom. The message list now uses a double `requestAnimationFrame` + `behavior: 'instant'` strategy on first load, preventing the scroll-to-bottom button from appearing spuriously (or `autoScroll` from being disabled) before layout is finalised — especially in iframe contexts where parent-page layout can delay dimension calculation.

---

## [1.1.4] — 2026-06-01

### Fixed

- **`@relaya-chat/react`** — CSS resets are now scoped to `.relaya-root` to prevent styles from leaking into the host application.
- **`@relaya-chat/react`** — WebSocket disconnect on tab hide is now delayed to reduce spurious connect/disconnect churn when users briefly switch tabs.

---

## [1.1.3] — 2026-06-01

### Fixed

- **`@relaya-chat/react`** — `StickerPickerDialog` `pickerRef` prop type widened to `React.Ref<HTMLDivElement>` for React 19 compatibility. Previously the narrower `RefObject<HTMLDivElement>` caused a TypeScript build error when consuming the ref returned by `useRef` under `@types/react@19`.

---

## [1.1.2] — 2026-06-01

### Fixed

- **`@relaya-chat/react`** — OTP entry screen now suggests checking spam folder when the login code doesn't arrive.
- **`@relaya-chat/react`** — `.d.ts` type declaration files are now correctly generated and included in the build output.

### Changed

- npm publish workflow switched to OIDC Trusted Publishing (no long-lived token required).

---

## [1.1.1] — 2026-06-01

### Fixed

- **`@relaya-chat/react`** — Avatar settings (gravatar gallery fetch, avatar preference PATCH) now use `serverUrl` as the request base. Previously these used hardcoded relative paths in `MessageItem` and `GravatarStyleModal`, silently failing for all cross-origin SDK embedders.

## [1.1.0] — 2026-06-01

### Fixed

- **Cross-origin REST routing** — All REST API calls (messages, stickers, sounds, moderation,
  geo restrictions, auth, exports) now correctly route to `serverUrl` when set. Previously,
  13 hooks and components constructed `ApiClient` with a hard-coded same-origin base URL (`""`),
  causing 404s when the widget was embedded in a third-party host app.
  `RelayaServerContext` now distributes `serverUrl` through the React tree so every
  consumer receives the correct base URL without prop-drilling. (`@relaya-chat/react`)

- **Cross-origin auth popup** — The login popup URL was built from `window.location.origin`
  (the host app's domain) instead of `serverUrl`'s origin. For cross-origin embedders, this
  opened the popup on a domain that has no auth route, breaking login entirely. The
  `postMessage` origin check was similarly wrong. Both now use `new URL(serverUrl).origin`
  when `serverUrl` is set. (`@relaya-chat/react`)

- **Font-face CSS rule** — Removed a broken `@font-face` declaration that referenced a
  missing asset and generated a console warning on load. (`@relaya-chat/react`)

### Changed

- `buildWsUrl()` — JSDoc now explicitly notes this helper is for same-origin / iframe use
  only. Cross-origin SDK consumers should derive their WebSocket URL directly from
  `serverUrl` (replace `https://` with `wss://`). (`@relaya-chat/react`)

### Removed

- `API_BASE_URL` constant removed from `config.ts` — it was always `""` (same-origin) and
  became dead code after the cross-origin REST routing fix. (`@relaya-chat/react`)

### Documentation

- Added `react-native` package README.
- Corrected prop name typos in root README Quick Start examples.
- `serverUrl` prop documentation updated to clarify it covers both REST and WebSocket
  connections; added Troubleshooting section for cross-origin 404 errors.

---

## [1.0.1] — 2026-05-29

### Fixed

- React 19 type compatibility in `useRelayaAuth` and `StickerPickerDialog` — resolved
  `bigint` assignability error in `ReactNode` union caused by `@types/react` split between
  React 18 and 19. (`@relaya-chat/react`)

---

## [1.0.0] — 2026-04-01

Initial public release of the Relaya Chat SDK.

- `@relaya-chat/core` — TypeScript types, REST `ApiClient`, WebSocket `ChatConnection`
- `@relaya-chat/react` — Drop-in `<RelayaChat>` compound component, individual hooks
  (`useRelayaAuth`, `useRelayaChat`, `useSpaceTheme`, and more), admin panel components
- `@relaya-chat/react-native` — React Native primitives (types, `ApiClient`, `ChatConnection`)
