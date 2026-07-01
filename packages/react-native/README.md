# @relaya-chat/react-native

Real-time community chat for React Native and Expo. Headless hooks — you bring your own UI.

## What this package does

`@relaya-chat/react-native` gives you two hooks:

- **`useRelayaAuth`** — OTP email/code sign-in, AT/RT session management, secure storage of the refresh token, and session restoration on app launch.
- **`useRelayaChat`** — WebSocket chat connection, message history, optimistic sends, moderation actions, and background/foreground lifecycle handling.

**Headless by design.** The hooks return state and action callbacks. You render your own native components, handle your own navigation, and control all UI. No views, no bundled UI library.

---

## Installation

```sh
npm install @relaya-chat/react-native
```

### Required peer dependencies

```sh
npm install react react-native
```

### Secure storage (choose one — not bundled)

**Expo:**
```sh
npx expo install expo-secure-store
```

**Bare React Native:**
```sh
npm install react-native-keychain
```

The SDK does not bundle either storage package. Your app chooses the implementation appropriate for its environment. See [README-AUTH.md](README-AUTH.md) for adapter code.

### Server

Requires **Relaya server v1.2.0 or later**. The hosted SaaS (`api.relaya.chat`) always runs the current version.

---

## Quick start

```tsx
import { useRelayaAuth, useRelayaChat } from '@relaya-chat/react-native';
import * as SecureStore from 'expo-secure-store';

// Expo SecureStore adapter (create once, share across your app)
const tokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};

export function ChatScreen() {
  const auth = useRelayaAuth({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'your-space-slug',
    tokenStorage,
    onSessionEnded: (reason) => {
      if (reason === 'refresh-failed') {
        // Navigate to sign-in screen
      }
    },
  });

  const chat = useRelayaChat({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'your-space-slug',
    authState: auth,
    getToken: auth.getToken,
    ensureFreshToken: auth.ensureFreshToken,
    allowAnonymous: true,
    backgroundDisconnectDelayMs: 3 * 60 * 1000,
  });

  if (auth.status === 'loading') {
    return <ActivityIndicator />;
  }

  if (auth.status !== 'authenticated') {
    return <SignInPanel auth={auth} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <MessageList messages={chat.messages} optimistic={chat.optimistic} />
      <MessageComposer onSend={chat.sendMessage} />
    </View>
  );
}
```

### Sign-in panel sketch

```tsx
function SignInPanel({ auth }: { auth: ReturnType<typeof useRelayaAuth> }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleRequestCode = async () => {
    const { pendingId } = await auth.requestCode(email);
    setPendingId(pendingId);
  };

  const handleVerify = async () => {
    if (!pendingId) return;
    await auth.verifyCode(pendingId, code);
    // auth.status transitions to 'authenticated'
  };

  if (!pendingId) {
    return (
      <>
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" />
        <Button title="Send code" onPress={handleRequestCode} />
        {auth.error && <Text>{auth.error}</Text>}
      </>
    );
  }

  return (
    <>
      <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" />
      <Button title="Sign in" onPress={handleVerify} />
      {auth.error && <Text>{auth.error}</Text>}
    </>
  );
}
```

---


## API reference

### `useRelayaAuth(options: RelayaAuthOptions)`

Returns `RelayaAuthState & RelayaAuthActions`.

#### `RelayaAuthOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `serverUrl` | `string` | — | Relaya SaaS endpoint. Always `'https://api.relaya.chat'`. |
| `spaceSlug` | `string` | — | Your space identifier, assigned by Relaya. E.g. `'your-space-slug'`. |
| `tokenStorage` | `RelayaTokenStorage` | — | Secure storage adapter (see [README-AUTH.md](README-AUTH.md)). **Required.** |
| `refreshTokenStorageKey` | `string` | `'relaya_refresh_token'` | Key used to store the refresh token. Override only if you need per-space isolation. |
| `onSessionEnded` | `(reason: 'logout' \| 'refresh-failed') => void` | — | Called when the session ends. Navigate the user to a sign-in screen here. |
| `apiKey` | `string` | — | Per-space API key (generated in the relaya.chat space admin under **Integration & security**). Required when your space has API key enforcement enabled. Sent as `X-Relaya-Api-Key` on every REST request. |

#### `RelayaAuthState`

| Field | Type | Description |
|---|---|---|
| `status` | `'loading' \| 'anonymous' \| 'otp-sent' \| 'authenticated'` | Current auth state. |
| `user` | `RelayaAuthUser \| null` | Authenticated user info. |
| `station` | `RelayaAuthStation \| null` | Space/station metadata. |
| `error` | `string \| null` | Last auth error message. |

#### `RelayaAuthActions`

| Method | Signature | Description |
|---|---|---|
| `requestCode` | `(email: string) => Promise<{ pendingId: string }>` | Sends a 6-digit OTP to the given email. Returns `pendingId` for `verifyCode`. |
| `verifyCode` | `(pendingId: string, code: string) => Promise<void>` | Verifies the OTP. On success, transitions `status` to `'authenticated'`. |
| `logout` | `() => Promise<void>` | Sends the RT to `/auth/logout`, clears secure storage, transitions to `'anonymous'`. |
| `ensureFreshToken` | `() => Promise<string \| null>` | Returns a fresh AT. Refreshes via RT when near-expired. Returns `null` when unauthenticated. |
| `getToken` | `() => string \| null` | Returns the current AT synchronously from memory. Pass to `useRelayaChat`. |

---

### `useRelayaChat(options: RelayaChatOptions)`

Returns `RelayaChatState & RelayaChatActions`.

#### `RelayaChatOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `serverUrl` | `string` | — | Relaya SaaS endpoint. Always `'https://api.relaya.chat'`. |
| `spaceSlug` | `string` | — | Your space identifier. Must match the slug passed to `useRelayaAuth`. |
| `authState` | `RelayaAuthState` | — | The full state object returned by `useRelayaAuth`. |
| `getToken` | `() => string \| null` | — | The `getToken` action from `useRelayaAuth`. Used synchronously for REST API requests. |
| `ensureFreshToken` | `() => Promise<string \| null>` | — | The `ensureFreshToken` action from `useRelayaAuth`. Awaited before each WebSocket open; if it returns `null`, `connectionStatus` becomes `'reconnecting'` until the session recovers. |
| `allowAnonymous` | `boolean` | `true` | When `true`, anonymous users connect in read-only mode. Set `false` to require sign-in before any connection. |
| `backgroundDisconnectDelayMs` | `number` | `180000` | Time (ms) before closing the WebSocket after the app backgrounds. Short app switches within this window preserve the existing connection. On foreground after a long absence, `ensureFreshToken()` is called and the connection is reopened. |
| `apiKey` | `string` | — | Per-space API key. Sent as `X-Relaya-Api-Key` on REST requests and appended as `?apiKey=` on the WebSocket upgrade URL. Pass the same key provided to `useRelayaAuth`. |

#### `RelayaChatState`

| Field | Type | Description |
|---|---|---|
| `messages` | `Message[]` | Current confirmed messages. |
| `optimistic` | `OptimisticMessage[]` | Pending optimistic messages. Each has `status: 'sending' \| 'failed'` and, when failed, an `errorMessage` string with the server's rejection reason. |
| `users` | `OnlineUser[]` | Currently online users. |
| `userCount` | `number` | Online user count. |
| `totalCount` | `number` | Total channel member count. |
| `connectionStatus` | `ConnectionStatus` | WebSocket connection state. |
| `loadingInitial` | `boolean` | Initial message load in progress. |
| `loadingOlder` | `boolean` | Older-message load in progress. |
| `hasOlderMessages` | `boolean` | Whether more history is available to load. |
| `error` | `string \| null` | Last error message. |

#### Rendering failed / rejected messages

When the server rejects a message (e.g. content policy), the `OptimisticMessage` in `chat.optimistic` transitions to `status: 'failed'` and gains an `errorMessage` field with the human-readable rejection reason. Show it clearly in your UI:

```tsx
{optimistic.map(msg => (
  <View key={msg.clientId} style={msg.status === 'failed' ? styles.failedBubble : styles.sendingBubble}>
    <Text style={msg.status === 'failed' ? styles.failedText : styles.sendingText}>
      {msg.content}
    </Text>
    {msg.status === 'failed' && msg.errorMessage && (
      <Text style={styles.errorLabel}>
        {'\u26a0\ufe0f'} {msg.errorMessage}
      </Text>
    )}
  </View>
))}
```

Always render `errorMessage` when present - Apple App Store Guideline 1.2 (UGC) requires that users receive visible feedback when their content is rejected.

#### `RelayaChatActions`

| Method | Signature | Description |
|---|---|---|
| `sendMessage` | `(content: string, replyTo?: ReplyData) => void` | Sends a message with optimistic state. |
| `loadOlderMessages` | `() => Promise<void>` | Fetches the next page of older messages. |
| `editMessage` | `(messageId: string, newContent: string) => Promise<void>` | Edits a message (own messages only). |
| `deleteMessage` | `(messageId: string) => Promise<void>` | Deletes a message (moderation permission required). |
| `banUser` | `(userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>` | Bans a user (moderation permission required). |
| `reportMessage` | `(messageId: string, reason: string, details?: string) => Promise<void>` | Reports a message. |
| `getUserInfo` | `(userId: string) => UserInfo \| undefined` | Looks up a user from the in-session directory. |
| `getAvatarForMessage` | `(userId: string, messageTime: Date) => string \| null` | Returns the avatar URL active at the time the message was sent. |

#### Server-initiated session revocation

If the Relaya server sends a `force_logout` message or closes the WebSocket with code 4001, `useRelayaChat` detects this via an internal `onAuthRevoked` callback and immediately clears the connection. No automatic reconnect is attempted — `useRelayaAuth`'s `onSessionEnded` callback handles the appropriate UI response (e.g. navigating to the sign-in screen).

---

### `getMessageMenuItems(opts: MessageMenuOpts): MessageMenuItems`

Returns a structured list of available actions for a message based on the current user's permissions and message ownership. Use this to build a context menu or action sheet.

```tsx
import { getMessageMenuItems } from '@relaya-chat/react-native';

const menuItems = getMessageMenuItems({
  message,
  currentUserId: auth.user?.id ?? null,
  currentUserPermissions: auth.user?.permissions ?? [],
  currentUserPriority: 0,      // derive from role data in production
  messageAuthorPriority: 0,    // derive from role data in production
});

// menuItems.showEdit, menuItems.showDelete, menuItems.showReport, menuItems.showBan
```

---

## Mounting strategy

Mount `useRelayaAuth` in an app-level layout or provider component so the in-memory AT/RT state persists across navigation. If auth is mounted inside a screen component, it will re-initialize (and re-read secure storage) on every screen mount.

```tsx
// _layout.tsx or App.tsx — mount once at the root
export function RootLayout() {
  const auth = useRelayaAuth({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'your-space-slug',
    tokenStorage,
  });

  return (
    <AuthContext.Provider value={auth}>
      <Stack />
    </AuthContext.Provider>
  );
}
```

---

## Upgrading from earlier versions

### `stationSlug` → `spaceSlug`

Both `useRelayaAuth` and `useRelayaChat` previously accepted `stationSlug`. This has been renamed to `spaceSlug` to align with Relaya's public-facing terminology.

**Before:**
```ts
useRelayaAuth({ stationSlug: 'your-space-slug', ... })
useRelayaChat({ stationSlug: 'your-space-slug', ... })
```

**After:**
```ts
useRelayaAuth({ spaceSlug: 'your-space-slug', ... })
useRelayaChat({ spaceSlug: 'your-space-slug', ... })
```

The value itself (your space identifier string) does not change — only the option name.

### `useRelayaAuth` no longer accepts `AsyncStorage` directly

The auth hook previously imported `@react-native-async-storage/async-storage` directly. It now requires a `tokenStorage` adapter. AsyncStorage is unencrypted and not appropriate for session credentials. See [README-AUTH.md](README-AUTH.md) for adapter examples.

### `tokenStorageKey` → `refreshTokenStorageKey`

If you previously passed a `tokenStorageKey` option, rename it to `refreshTokenStorageKey`. The default value (`'relaya_refresh_token'`) is unchanged.

---

## Authentication deep dive

See [README-AUTH.md](README-AUTH.md) for:
- How the AT/RT model works and why
- Full `RelayaTokenStorage` interface and adapter examples (Expo SecureStore, react-native-keychain)
- Session lifecycle (mount, OTP, silent restore, logout)
- Security properties

---

## Expo example

A runnable Expo example is available at [`examples/expo-basic/`](examples/expo-basic/). It demonstrates the SecureStore adapter, full OTP sign-in flow, message list, message composer, moderation action sheet, AppState foreground refresh, and sign-out. See the [example README](examples/expo-basic/README.md) for setup instructions.

---

## License

MIT — see [LICENSE](LICENSE)
