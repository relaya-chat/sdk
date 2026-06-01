# Changelog

All notable changes to the Relaya Chat SDK are documented here.

Packages versioned together: `@relaya-chat/core`, `@relaya-chat/react`, `@relaya-chat/react-native`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
