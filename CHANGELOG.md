# Changelog

All notable changes to the Relaya Chat SDK are documented here.

Packages versioned together: `@relaya-chat/core`, `@relaya-chat/react`, `@relaya-chat/react-native`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **`@relaya-chat/react`** — `EmbedSecurityAdmin`, surfaced as an "Embed security" section in `<AdminPanel>` (admin-only). The **iFrame** tab lets space admins view, add, and remove the domains authorized to embed a space; the **Native SDK** tab shows API key status and supports generating, rotating, and revoking an API key, with a one-time full-key reveal after generate/rotate.

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
