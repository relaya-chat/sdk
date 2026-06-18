# Authentication - @relaya-chat/react-native

Relaya React Native auth uses the same AT/RT model as the web SDK, but the host app owns secure token storage and all UI.

## Token model
| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (AT) | About 30 minutes | Memory only | REST auth and WebSocket auth |
| Refresh token (RT) | 33-day rolling inactivity window | Secure storage adapter supplied by your app | Silent restore and AT refresh |

No cookies are used. The RT is the durable credential. Every /auth/refresh call consumes the old RT and returns a new AT+RT.

## Storage adapter

The SDK does not bundle storage. Provide a RelayaTokenStorage implementation:

```tsx
export interface RelayaTokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Expo example:

```tsx
import * as SecureStore from "expo-secure-store";

export const relayaTokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
```

Use Expo SecureStore, Keychain, or equivalent secure storage. Do not use AsyncStorage for refresh tokens.

## Session lifecycle

On mount:

1. useRelayaAuth reads the RT from tokenStorage.
2. If none exists, auth becomes anonymous.
3. If an RT exists, the hook calls /auth/refresh.
4. On success, the hook stores the new RT and keeps the AT in memory.
5. On confirmed 401/403, the hook clears storage and calls onSessionEnded("refresh-failed").
6. On transient network failure, the hook preserves the RT and retries later.

Mount useRelayaAuth at app/root level. If mounted per screen, each navigation remount can re-read storage and create avoidable refresh churn.

## OTP sign-in

```tsx
const { pendingId } = await auth.requestCode("user@example.com");
await auth.verifyCode(pendingId, code);
```

verifyCode stores the returned RT using tokenStorage and keeps the AT in memory.

```tsx
ensureFreshToken()
```

Call this before opening authenticated WebSockets or making API calls that need a guaranteed-fresh token. useRelayaChat already calls it before WebSocket open/reopen.

Concurrent refreshes for the same RT are deduplicated so the RT is spent once per refresh cycle.

## API keys

If your space has API key enforcement enabled, pass the same key to both hooks:

```tsx
const auth = useRelayaAuth({
  serverUrl: "https://api.relaya.chat",
  spaceSlug: "your-space-slug",
  tokenStorage,
  apiKey: "rlk_live_...",
});

const chat = useRelayaChat({
  serverUrl: "https://api.relaya.chat",
  spaceSlug: "your-space-slug",
  authState: auth,
  getToken: auth.getToken,
  ensureFreshToken: auth.ensureFreshToken,
  apiKey: "rlk_live_...",
});
```

The SDK sends the key as X-Relaya-Api-Key on REST and ?apiKey= on WebSocket upgrade. The API key identifies the integration, not the user.

## Logout

```tsx
logout()
```

Posts { refreshToken } to /auth/logout, clears AT memory, deletes the RT from secure storage, sets auth to anonymous, and calls onSessionEnded("logout") when provided. Local state is cleared regardless of network success.

## Debugging checklist
- Secure storage adapter must persist the rotated RT returned by every refresh.
- ensureFreshToken() returning null can mean transient network failure, not only sign-out.
- If WS connects anonymously when it should be authenticated, verify the auth hook is mounted once and auth.status is authenticated.
- If API key enforcement is active, pass apiKey to both useRelayaAuth and useRelayaChat.
Keep refreshTokenStorageKey stable unless you intentionally isolate sessions. 