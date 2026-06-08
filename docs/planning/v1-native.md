# Relaya V1 Native — As-Built

This document records the first React Native / Expo integration for Relaya. Waves 1–4 (iOS simulator) are complete.

---

## Package Overview

- Package: `@relaya-chat/react-native`
- Shape: **headless hooks and utilities** — no default mobile UI
- Exports: `useRelayaAuth`, `useRelayaChat`, `getMessageMenuItems`, related TypeScript types
- Location: `sdk/packages/react-native/`
- npm publish: deferred to post-V1 (BFM integration is the prerequisite)

---

## Architecture Decisions

### Headless SDK

Relaya provides chat/auth state and actions. The host app owns all UI and navigation. This was a firm design choice for V1 native.

### Auth Model (AT/RT)

| Token | Lifetime / Storage | Purpose |
|---|---|---|
| Access token (AT) | JWT, ~30 minutes, **memory only** | REST auth and WebSocket URL auth |
| Refresh token (RT) | opaque, 33-day rolling inactivity window, **SecureStore** | silent session restoration and RT rotation |

Core behavior:
- OTP sign-in: email → 6-digit code → `/auth/verify-code` → `{ accessToken, refreshToken, user, station }`
- `/auth/refresh` consumes the old RT and returns a new AT+RT pair (rotating)
- WebSocket auth: `?token=<AT>&station=<slug>`
- `ensureFreshToken()` must be called before opening/reopening an authenticated WebSocket
- No cookies in the chat auth path

The 33-day window is a **rolling RT inactivity window**, not a static expiry. Every successful refresh extends it another 33 days. A returning user who opens the app within the window gets a silent restore; an app inactive for more than 33 days requires re-authentication.

### What Does Not Carry Over From Web

The web SDK needed cross-tab coordination because multiple tabs share `localStorage` with independent JS heaps. This does not apply to a normal React Native app. The following were deliberately **not ported** to `@relaya-chat/react-native`:

- `BroadcastChannel`
- localStorage leader leases and storage event coordination
- popup auth
- iframe host-managed semantics
- tab/follower refresh suppression

### What Does Carry Over From Web

- AT in memory only; only RT is persisted
- RT rotated on every refresh; stored RT updated immediately
- Concurrent refresh calls deduped per RT value (one in-flight refresh per RT)
- JWT expiry decoded client-side to avoid unnecessary refresh round-trips
- `ensureFreshToken()` is the only public freshness method
- Transient failures do not clear the RT (one 10-second retry; no `onSessionEnded`)
- Confirmed failures (401/403 after retry) clear the RT and call `onSessionEnded`
- `AppState` foreground transition calls `ensureFreshToken()` (not browser visibility APIs)
- Logout posts `{ refreshToken }` to `/auth/logout` in the request body (no Authorization header dependency)

---

## Public API (as shipped)

```ts
export interface RelayaTokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RelayaAuthOptions {
  serverUrl: string;
  spaceSlug: string;
  tokenStorage: RelayaTokenStorage;
  refreshTokenStorageKey?: string;  // default: 'relaya_refresh_token'
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}

export interface RelayaChatOptions {
  serverUrl: string;
  spaceSlug: string;
  authState: RelayaAuthState;
  getToken: RelayaAuthActions['getToken'];
  ensureFreshToken: RelayaAuthActions['ensureFreshToken'];
  allowAnonymous?: boolean;               // default: true
  backgroundDisconnectDelayMs?: number;   // default: 3 * 60 * 1000
}
```

**Storage:** SDK does not bundle `expo-secure-store` or `react-native-keychain`. Storage is app-provided via `RelayaTokenStorage` so Expo and bare RN apps choose the correct implementation. The Expo adapter is in `examples/expo-basic/src/relayaTokenStorage.ts` as a copy-paste reference.

**`spaceSlug`:** Public SDK surface uses `spaceSlug`. Internally mapped to existing server `stationSlug` terminology. The terminology policy (space = external, station = internal) is documented in `memory-bank/systemPatterns.md`.

**`allowAnonymous`:** When `false`, no WebSocket is opened until the user authenticates. Useful for host apps that require sign-in before any chat access.

**`backgroundDisconnectDelayMs`:** On background, a timer is set to close the WebSocket after this delay. If the app returns to active before the timer fires, the timer is cancelled and the existing connection is kept. On long-background reconnect, `ensureFreshToken()` is called before reconnecting.

---

## Expo Example

Location: `sdk/packages/react-native/examples/expo-basic/`

```
expo-basic/
  App.tsx                          Entry point — SafeAreaView
  scripts/start-ios.js             Pre-boots a valid iPhone simulator before expo start
  src/
    ChatScreen.tsx                 Full useRelayaAuth + useRelayaChat integration
    relayaTokenStorage.ts          Expo SecureStore adapter (copy-paste reference)
    components/
      RelayaSignInPanel.tsx        Email input → OTP code input
      RelayaMessageList.tsx        FlatList with confirmed + optimistic messages
      RelayaMessageComposer.tsx    Text input + send button
```

The example demonstrates: SecureStore adapter, OTP sign-in, message list with optimistic sends, presence bar (`chat.users` + `chat.totalCount`), moderation action sheet via `getMessageMenuItems`, AppState foreground refresh, sign-out, and a dev-only diagnostic panel (`auth.status`, `connectionStatus`, message count, last error).

**iOS launch:** `npm run ios` invokes `scripts/start-ios.js`, which pre-boots a valid iPhone simulator before handing off to `expo start --ios`. This bypasses a macOS system preference (`com.apple.iphonesimulator CurrentDeviceUDID`) that can hold a stale UDID from a deleted simulator (common after Xcode upgrades).

**Monorepo note:** The example uses `file:` symlinks and `metro.config.js` watchFolders + nodeModulesPaths to resolve the local SDK packages. Neither is needed in a standalone app that installs from npm.

---

## Wave Summary

### Wave 1 — Auth Hook Rewrite

`useRelayaAuth.ts` rewritten to the AT/RT model:
- `RelayaTokenStorage` adapter replaces direct AsyncStorage import
- AT kept in memory only (`accessTokenRef`); RT persisted via adapter (`refreshTokenRef`)
- JWT expiry decoding (`decodeJwtExpiry` / `isTokenFresh`)
- RT-keyed refresh deduplication (`inFlightRefreshMap` / `deduplicatedRefresh`)
- Transient-vs-confirmed failure classifier (`isConfirmedAuthFailure`)
- 10-second transient retry; `onSessionEnded` only on confirmed failure or explicit logout
- AppState foreground refresh
- `spaceSlug` renamed from `stationSlug` in all public options

### Wave 2A — Chat Hook Update

`useRelayaChat.ts` updated:
- `RelayaChatOptions` accepts `authState`, `getToken`, `ensureFreshToken`, `allowAnonymous`, `backgroundDisconnectDelayMs`
- Awaits `ensureFreshToken()` before authenticated WebSocket creation
- `connectionStatus: 'reconnecting'` if token unavailable
- AppState disconnect timer with quick-return cancellation and long-background reconnect
- `buildRnWsUrl` utility (http→ws protocol swap, token + station params)
- `currentTokenRef` so `ChatConnection` URL factory always reads the freshest AT
- `onAuthRevoked` nulls `connRef` on server `force_logout` / close code 4001

### Wave 2B — Tests

- `useRelayaAuth.test.ts` — 12 tests using HookRuntime pattern (fake storage + fake fetch, no native modules)
- `useRelayaChat.test.ts` — 4 tests covering `allowAnonymous: false` and background timer cancel/fire
- `buildRnWsUrl.test.ts` — 7 tests
- `getMessageMenuItems.test.ts` — 23 tests

### Wave 2C — Documentation

`README.md` and `README-AUTH.md` rewritten for the AT/RT model, `RelayaTokenStorage` adapter pattern, updated option shapes, and Expo SecureStore adapter reference.

### Wave 3 — Expo Example

`examples/expo-basic/` built with full integration demonstration. `metro.config.js` added for monorepo symlink resolution. `config.local.ts.example` with type declarations for the local config pattern.

### Wave 4 — iOS Simulator Validation

Validated end-to-end on iOS simulator pointing at `https://api.relaya.chat`.

- [x] Anonymous/read-only connection works
- [x] Sign-in button presents email/OTP flow
- [x] OTP verification authenticates
- [x] App kill/reopen silently restores via stored RT
- [x] Sending messages works
- [x] Presence bar shows online users and total count
- [x] Moderation action sheet (`getMessageMenuItems`) works
- [x] Sign out clears secure storage and does not silently restore
- [ ] App kill/reopen after 33-day RT expiry shows sign-in (not simulator-testable; architecture verified)
- [ ] Background/foreground reconnect on long background interval (architecture verified; device test pending)
- [ ] Physical device validation (pending)

Key fixes discovered during Wave 4 validation:
- Infinite re-render loop in `useRelayaAuth.ts` — inline `onSessionEnded` arrow function caused `ensureFreshToken` to regenerate on every render, re-triggering the WS connect effect. Fixed by storing `onSessionEnded` in a ref.

---

## Open Questions

- Whether 3 minutes is the right background disconnect delay — to be confirmed on physical device.
