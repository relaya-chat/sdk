# Authentication — @relaya-chat/react-native

## The AT/RT model

Relaya uses a **short-lived access token + rotating refresh token** pair.

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (AT) | JWT, ~30 minutes | Memory only — never persisted | REST API auth and WebSocket URL auth |
| Refresh token (RT) | Opaque, 33-day rolling inactivity window | Secure storage you provide | Silent session restoration and AT rotation |

**What "rolling 33-day window" means:** Every successful token refresh consumes the old RT and issues a new one with a fresh 33-day expiry. A user who opens the app within 33 days of their last activity is silently re-authenticated. A user inactive for more than 33 days must sign in again.

**No cookies.** Relaya chat auth uses no cookies.

**Theft detection.** If a refresh token is replayed after it has already been used, Relaya detects the anomaly and revokes the entire session family.

### Why AT in memory only?

On a true app cold start (app kill / JS runtime restart), there is no AT. The SDK reads the persisted RT, calls `/auth/refresh`, and the server responds with a freshly rotated AT+RT pair. The new AT goes to memory; the new RT is written back to secure storage. The stored RT is the durable session credential. The AT is an ephemeral capability derived from it.

---

## `RelayaTokenStorage` interface

The SDK does not bundle any storage library. Your app provides a `tokenStorage` adapter that satisfies:

```typescript
export interface RelayaTokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

The SDK calls these three methods with a key of `'relaya_refresh_token'` (or whatever you pass as `refreshTokenStorageKey`). Only the RT is stored — the AT is never written to storage.

### Expo SecureStore adapter (recommended for Expo)

```typescript
import * as SecureStore from 'expo-secure-store';

export const relayaTokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
```

Install: `npx expo install expo-secure-store`

### react-native-keychain adapter (bare React Native)

```typescript
import * as Keychain from 'react-native-keychain';

export const relayaTokenStorage = {
  get: async (key: string) => {
    const creds = await Keychain.getGenericPassword({ service: key });
    return creds ? creds.password : null;
  },
  set: (key: string, value: string) =>
    Keychain.setGenericPassword('relaya', value, { service: key }),
  delete: (key: string) => Keychain.resetGenericPassword({ service: key }),
};
```

Install: `npm install react-native-keychain`

> **Do not use `AsyncStorage` for token storage.** AsyncStorage is unencrypted and readable by anyone with device access or a debugger. It is not appropriate for session credentials.

---

## Session lifecycle

### On mount (app start / screen mount)

1. The hook reads the RT from `tokenStorage`.
2. If no RT is found: `status` transitions to `'anonymous'`. No network call is made.
3. If an RT exists: the hook calls `POST /auth/refresh` with the RT.
   - **Success:** new AT stored in memory, new RT written to `tokenStorage`, user and station metadata loaded, `status` → `'authenticated'`.
   - **Confirmed auth failure (401/403):** RT cleared from storage, `status` → `'anonymous'`, `onSessionEnded('refresh-failed')` called.
   - **Transient failure (network error, 5xx):** RT preserved, `status` → `'anonymous'` temporarily, one retry scheduled after 10 seconds. If the retry also fails transiently, the RT is kept in storage for the next app launch.

Mount `useRelayaAuth` at the app root (layout or provider), not inside individual screens. The AT lives only in the hook's memory — remounting the hook means reading secure storage again.

### OTP sign-in

```tsx
// Step 1 — send code
const { pendingId } = await auth.requestCode('user@example.com');

// Step 2 — verify code
await auth.verifyCode(pendingId, '123456');
// auth.status is now 'authenticated'
```

`verifyCode` persists the returned `refreshToken` to `tokenStorage` and keeps the `accessToken` in memory only.

### `ensureFreshToken()`

Call this before opening an authenticated WebSocket or making an API call that needs a guaranteed-fresh token.

- If the current AT has more than 2 minutes remaining: returns it immediately (no network call).
- If the AT is expired or near expiry: calls `/auth/refresh`, rotates both tokens, returns the new AT.
- If no authenticated session exists: returns `null`.

Concurrent calls sharing the same RT are deduplicated — the RT is spent exactly once per refresh cycle.

`useRelayaChat` calls `ensureFreshToken()` automatically before opening a WebSocket connection.

### AppState / foreground handling

The hook listens to React Native `AppState` changes. When the app returns to `'active'` and `status === 'authenticated'`, `ensureFreshToken()` is called automatically. A user who backgrounds the app for less than ~28 minutes (AT still fresh) sees no round-trip on foreground. A longer absence triggers a silent refresh before the chat connection reopens.

### Logout

```tsx
await auth.logout();
// auth.status is now 'anonymous'
```

Logout:
1. POSTs `{ refreshToken }` to `/auth/logout` — no Authorization header needed.
2. Clears the AT from memory.
3. Calls `tokenStorage.delete()` to remove the RT from device storage.
4. Sets `status` to `'anonymous'`.
5. Calls `onSessionEnded('logout')` if provided.

Local state is cleared regardless of whether the server call succeeds.

---

## Security properties

| Property | Detail |
|---|---|
| AT storage | Memory only — never written to disk |
| RT storage | OS-encrypted, via your `tokenStorage` adapter |
| Cookie exposure | None — Relaya chat auth uses no cookies |
| Token reuse detection | Yes — replayed RT revokes the entire session family |
| Session persistence across app launches | Yes — within the 33-day rolling inactivity window |
| Session expiry for inactive users | RT expires after 33 days of inactivity; user must sign in again |

The refresh token is only as secure as the `tokenStorage` implementation you provide. SecureStore (Expo) and Keychain (bare RN) on a non-jailbroken device offer hardware-backed credential protection equivalent in strength to HTTP-only cookies on the web. AsyncStorage is not acceptable for this use case.

---

## References

- **[IETF draft-ietf-oauth-browser-based-apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)** — Authoritative IETF OAuth Working Group guidance recommending short-lived ATs in memory and rotating RTs in storage.
- **[Auth0 — Refresh Token Rotation](https://auth0.com/blog/securing-single-page-applications-with-refresh-token-rotation)** — Why rotating RTs with reuse detection are the right model for web and mobile apps.
- **[Auth0 — Inactivity-based refresh token lifetimes](https://auth0.com/blog/achieving-a-seamless-user-experience-with-refresh-token-inactivity-lifetimes)** — Why rolling inactivity expiry is preferable to hard expiry for UX without sacrificing security.
- **[IETF RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252)** — Best-practice RFC for OAuth 2.0 in native applications. Covers token storage and why OS secure storage is the right credential store.
