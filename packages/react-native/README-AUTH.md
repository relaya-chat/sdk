# Authentication — @relaya-chat/react-native

## What Relaya does for you

Relaya uses a **short-lived access token + rotating refresh token** model. Your users authenticate once with a one-time code sent to their email. After that, Relaya handles everything:

- **Access token (15 minutes):** Held only in JavaScript memory — never written to storage. Used for every API call and WebSocket connection. Silently refreshed in the background before it expires.
- **Refresh token (30-day inactivity window):** Stored in the secure storage you provide (see below). If the user opens the app within 30 days of their last activity, they are automatically re-authenticated without re-entering their email or code. Inactive for longer — they see the sign-in prompt again.
- **No cookies.** Relaya does not set any cookies.
- **Theft detection.** If a refresh token is replayed after it has already been used, Relaya detects the anomaly and revokes the entire session family — forcing a fresh sign-in.

**You build none of the token logic.** You mount the component and provide a storage implementation. Relaya handles the rest.

---

## What you need to do

### 1. Provide a `tokenStorage` implementation — required

Relaya needs somewhere to persist the refresh token across app launches. The SDK does not bundle a storage library — you choose the implementation appropriate for your app.

The interface:

```typescript
interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

**Recommended: Expo SecureStore**

```typescript
import * as SecureStore from 'expo-secure-store';

const tokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
```

**Bare React Native: react-native-keychain**

```typescript
import * as Keychain from 'react-native-keychain';

const tokenStorage = {
  get: async (key: string) => {
    const creds = await Keychain.getGenericPassword({ service: key });
    return creds ? creds.password : null;
  },
  set: (key: string, value: string) =>
    Keychain.setGenericPassword('relaya', value, { service: key }),
  delete: (key: string) => Keychain.resetGenericPassword({ service: key }),
};
```

> **Do not use `AsyncStorage` for token storage.** AsyncStorage is unencrypted and readable by anyone with device access or a debugger. It is not appropriate for session credentials.

### 2. Mount the component

```tsx
import { RelayaChat } from '@relaya-chat/react-native';

function ChatScreen() {
  return (
    <RelayaChat
      spaceSlug="your-space-slug"
      apiUrl="https://api.relaya.chat"
      tokenStorage={tokenStorage}
    />
  );
}
```

Users who attempt to chat see an inline OTP prompt (email → 6-digit code → authenticated). No redirect, no external browser, no popup.

### 3. Background timer throttling on iOS

iOS aggressively throttles JavaScript timers when the app is backgrounded or the device is locked. Relaya's silent AT refresh timer (which fires every ~13 minutes while the app is open) may be delayed on return from background.

Relaya handles this gracefully: if an API call receives a `401` due to an expired AT, it automatically attempts an RT exchange before surfacing an error to the user. However, if your app stays backgrounded for more than 30 days, the RT will have expired and the user must sign in again.

To trigger a proactive AT refresh when the app returns to the foreground, pass an `AppState` listener to the SDK's `refresh()` action:

```typescript
import { AppState } from 'react-native';

useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      auth.refresh();   // silently renews AT if RT is still valid
    }
  });
  return () => sub.remove();
}, []);
```

---

## Sign-out

Call `auth.logout()` from your UI. On logout, Relaya:
1. Calls `POST /auth/logout` to delete the refresh token server-side.
2. Clears the access token from memory.
3. Calls `tokenStorage.delete()` to remove the refresh token from device storage.

---

## Security properties

| Property | Detail |
|---|---|
| XSS token theft window | N/A (native app) |
| Refresh token storage | OS-encrypted via your `tokenStorage` implementation |
| Cookie exposure | None |
| Token reuse detection | Yes — replayed refresh token revokes the entire session |
| Session persistence across app launches | Yes — as long as the RT in `tokenStorage` has not expired |

> The refresh token is only as secure as the `tokenStorage` implementation you provide. SecureStore / Keychain on a non-jailbroken device is equivalent in strength to HTTP-only cookies on the web. AsyncStorage is not acceptable for this use case.

---

## References

This auth design follows published best-practice guidance for browser-based and mobile applications:

- **[IETF draft-ietf-oauth-browser-based-apps (latest)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)** — Authoritative IETF OAuth Working Group guidance for SPAs and embedded widgets. Recommends short-lived access tokens in memory + rotating refresh tokens in storage, exactly as Relaya implements.

- **[Auth0 — Refresh Token Rotation](https://auth0.com/blog/securing-single-page-applications-with-refresh-token-rotation)** — Industry explanation of why rotating RTs with reuse detection are the right model for both web and mobile applications.

- **[Auth0 — Inactivity-based refresh token lifetimes](https://auth0.com/blog/achieving-a-seamless-user-experience-with-refresh-token-inactivity-lifetimes)** — Explains why inactivity-based expiry (used by Relaya) is preferable to hard expiry for user experience without sacrificing security.

- **[IETF RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252)** — Best-practice RFC for OAuth 2.0 in native (iOS/Android) applications. Covers token storage, security properties, and why OS secure storage (Keychain/SecureStore) is the appropriate credential store for mobile apps.
