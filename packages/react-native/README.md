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

Requires **Relaya server v1.6.0 or later** (for terms acceptance support; v1.5.0 works but omits `termsAccepted`/`termsUrl`/`termsVersion` from auth responses - the SDK defaults these to `termsAccepted: true` for backward compatibility). The hosted SaaS (`api.relaya.chat`) always runs the current version.

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

  if (!auth.termsAccepted) {
    return <TermsAcceptancePanel auth={auth} />;
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
| `termsAccepted` | `boolean` | `true` when the space has no terms requirement, or when the user has accepted the current terms version. `false` when terms are required and the user has not yet accepted the current version. |
| `termsUrl` | `string \| null` | URL of the space's community guidelines page. `null` when terms are not required. |
| `termsVersion` | `string \| null` | Opaque version string set by the space admin (e.g. `"2026-07"`). `null` when terms are not required. |

#### `RelayaAuthActions`

| Method | Signature | Description |
|---|---|---|
| `requestCode` | `(email: string) => Promise<{ pendingId: string }>` | Sends a 6-digit OTP to the given email. Returns `pendingId` for `verifyCode`. |
| `verifyCode` | `(pendingId: string, code: string) => Promise<void>` | Verifies the OTP. On success, transitions `status` to `'authenticated'`. |
| `logout` | `() => Promise<void>` | Sends the RT to `/auth/logout`, clears secure storage, transitions to `'anonymous'`. |
| `ensureFreshToken` | `() => Promise<string \| null>` | Returns a fresh AT. Refreshes via RT when near-expired. Returns `null` when unauthenticated. |
| `getToken` | `() => string \| null` | Returns the current AT synchronously from memory. Pass to `useRelayaChat`. |
| `acceptTerms` | `() => Promise<void>` | Records that the user has accepted the current terms version. Call after the user taps "I Agree". On success, `termsAccepted` transitions to `true`. Throws on network error (caller handles). |

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
| `onStickersUpdated` | `() => void` | — | Called when the server notifies that the sticker library changed. Use this to refresh your local sticker picker state. |
| `onMentionNotification` | `() => void` | — | Called when the server sends a `mention:notification` for the current user (someone @mentioned them). Use this to trigger audio playback via `expo-av`. The sound URL is available in `mentionSoundUrl`. |
| `onChannelNotification` | `() => void` | — | Called when the server sends a `channel:notification` (@channel mention). Use this to trigger audio playback via `expo-av`. The sound URL is available in `channelSoundUrl`. |

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
| `blockedUserIds` | `string[]` | IDs of users the current user has blocked. Empty array for anonymous/unauthenticated users. Use this to visually distinguish blocked users' messages and to show an unblock affordance. |
| `hideDeletedMessages` | `boolean` | When `true`, the space admin has configured deleted messages to be hidden from non-moderator users. See [Rendering deleted messages](#rendering-deleted-messages). |
| `mentionSoundUrl` | `string \| null` | URL of the sound to play on @mention notifications. Fetched from the server on mount. Always non-null after first successful fetch (falls back to the server-bundled default). Use with `onMentionNotification`. |
| `channelSoundUrl` | `string \| null` | URL of the sound to play on @channel notifications. Always non-null after first successful fetch. Use with `onChannelNotification`. |
| `error` | `string \| null` | Last error message. |

#### Audio notifications

The SDK fires `onMentionNotification` and `onChannelNotification` when the server sends a `mention:notification` or `channel:notification` WebSocket event. The sound URLs (`mentionSoundUrl`, `channelSoundUrl`) are fetched automatically on mount from `GET /api/chat/:slug/sounds`. The server always returns a URL - either a space-specific custom file uploaded by the admin, or the server-bundled default - so these will always be populated after mount.

The SDK does not play audio. Your app uses `expo-av` (or equivalent) in the callback:

```tsx
import { Audio } from 'expo-av';

const chat = useRelayaChat({
  serverUrl: 'https://api.relaya.chat',
  spaceSlug: 'your-space-slug',
  authState: auth,
  getToken: auth.getToken,
  ensureFreshToken: auth.ensureFreshToken,
  onMentionNotification: () => {
    if (chat.mentionSoundUrl) {
      Audio.Sound.createAsync({ uri: chat.mentionSoundUrl })
        .then(({ sound }) => sound.playAsync());
    }
  },
  onChannelNotification: () => {
    if (chat.channelSoundUrl) {
      Audio.Sound.createAsync({ uri: chat.channelSoundUrl })
        .then(({ sound }) => sound.playAsync());
    }
  },
});
```

If you don't pass these callbacks, no audio plays. There is nothing else to configure - the sound URLs and notification events are handled entirely by the SDK.

#### Rendering deleted messages

When a moderator deletes a message, the server soft-deletes it and broadcasts the deletion to all connected clients. The deleted message remains in `chat.messages` with `is_deleted: true` and `content: null`.

How your app should render deleted messages depends on the space admin's setting, exposed as `chat.hideDeletedMessages`:

- **`hideDeletedMessages: false`** (default) - Show a visible placeholder (e.g. "Message removed") for all deleted messages. This is the default behavior and keeps the conversation flow visible.
- **`hideDeletedMessages: true`** - Omit deleted messages entirely for non-moderator users. Moderators always see the placeholder regardless of this setting.

The `DELETE_ANY` permission (from `@relaya-chat/core`) identifies moderators:

```tsx
import { PERMISSIONS } from '@relaya-chat/core';

// In your message list renderer:
const canModerate = (auth.user?.permissions ?? []).includes(PERMISSIONS.DELETE_ANY);

const visibleMessages = chat.hideDeletedMessages && !canModerate
  ? chat.messages.filter((m) => !m.is_deleted)
  : chat.messages;

// Then render visibleMessages, showing a "Message removed" placeholder
// for any message where m.is_deleted === true.
```

The `examples/expo-basic/src/components/RelayaMessageList.tsx` component demonstrates this pattern. Pass `hideDeletedMessages={chat.hideDeletedMessages}` and `currentUserPermissions={auth.user?.permissions ?? []}` to your message list component.

#### Blocking users

`blockedUserIds` is an array of user IDs blocked by the current user within this space. It is populated from the server on connect and kept in sync as the user blocks or unblocks.

Use it to visually distinguish messages from blocked users. Apple App Store Guideline 1.2 (UGC) requires that apps give users a way to block other users and that blocked content is visually differentiated - not silently hidden:

```tsx
{messages.map(msg => {
  const isBlocked = chat.blockedUserIds.includes(msg.userId);
  return (
    <View key={msg.id} style={styles.messageBubble}>
      <Text style={[styles.senderName, isBlocked && styles.blockedName]}>
        {msg.displayName}
      </Text>
      <Text style={isBlocked ? styles.blockedText : styles.messageText}>
        {msg.content}
      </Text>
      {isBlocked && (
        <TouchableOpacity onPress={() => chat.unblockUser(msg.userId)}>
          <Text style={styles.unblockLabel}>Unblock</Text>
        </TouchableOpacity>
      )}
    </View>
  );
})}
```

Recommended styles for blocked messages: muted/greyed name text, italic or lighter body text, and an accessible unblock affordance. Do not completely hide blocked messages - they must remain visible in a visually differentiated state.

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

> **App Store warning - content filter:** The Relaya server includes a built-in profanity
> filter that is **enabled by default** for every space. Space admins can disable it or
> adjust the word list from the Relaya admin dashboard. If a space admin disables the
> content filter for a space used in an iOS app, the app may be rejected by Apple under
> Guideline 1.2 (User-Generated Content). If your app is rejected for this reason,
> re-enable the content filter in the Relaya admin dashboard and resubmit.

#### `RelayaChatActions`

| Method | Signature | Description |
|---|---|---|
| `sendMessage` | `(content: string, replyTo?: ReplyData) => void` | Sends a message with optimistic state. |
| `loadOlderMessages` | `() => Promise<void>` | Fetches the next page of older messages. |
| `editMessage` | `(messageId: string, newContent: string) => Promise<void>` | Edits a message (own messages only). |
| `deleteMessage` | `(messageId: string) => Promise<void>` | Deletes a message (moderation permission required). |
| `banUser` | `(userId: string, params?: { reason?: string; expiresAt?: string }) => Promise<void>` | Bans a user (moderation permission required). |
| `blockUser` | `(userId: string) => Promise<void>` | Blocks a user. Updates `blockedUserIds` immediately. Idempotent - blocking an already-blocked user is a no-op. |
| `unblockUser` | `(userId: string) => Promise<void>` | Unblocks a previously blocked user. Updates `blockedUserIds` immediately. |
| `reportMessage` | `(messageId: string, reason: string, details?: string) => Promise<void>` | Reports a message. |
| `getUserInfo` | `(userId: string) => UserInfo \| undefined` | Looks up a user from the in-session directory. |
| `getAvatarForMessage` | `(userId: string, messageTime: Date) => string \| null` | Returns the avatar URL active at the time the message was sent. |

#### Terms acceptance (Apple UGC compliance)

When `auth.termsAccepted` is `false`, your app must show a terms acceptance screen before allowing any chat interaction. This is required by Apple App Store Guideline 1.2 (User-Generated Content).

```tsx
if (!auth.termsAccepted) {
  return (
    <View style={styles.termsContainer}>
      <Text style={styles.termsTitle}>Community Guidelines</Text>
      <Text style={styles.termsBody}>
        You must agree to the community guidelines before joining the chat.
      </Text>

      {auth.termsUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(auth.termsUrl!)}>
          <Text style={styles.termsLink}>View full community guidelines</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.agreeButton}
        onPress={async () => {
          try {
            await auth.acceptTerms();
            // auth.termsAccepted flips to true; re-render shows chat
          } catch {
            Alert.alert('Error', 'Could not save your response. Please try again.');
          }
        }}
      >
        <Text>I Agree</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => auth.logout()}>
        <Text style={styles.cancelLink}>Cancel / Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
```

**Key points:**

- `termsUrl` links to the space's community guidelines. Open with `Linking.openURL(auth.termsUrl)`.
- Call `auth.acceptTerms()` when the user confirms. On success, `auth.termsAccepted` flips to `true` and the screen re-renders to chat.
- Always provide a "Cancel / Sign out" path that calls `auth.logout()`. The user must not be trapped on the terms screen without a way to exit.
- **Mid-session re-acceptance:** `termsAccepted` is re-evaluated on every AT refresh (approximately every 30 minutes, or immediately on app resume after inactivity). If a space admin bumps `termsVersion`, `termsAccepted` will flip to `false` on the next refresh. Add a belt-and-suspenders guard in your chat screen to disable input when `!auth.termsAccepted`:

  ```tsx
  // In your chat screen — belt-and-suspenders guard
  const canChat = auth.status === 'authenticated' && auth.termsAccepted;
  ```

- **Enabling terms on an existing space:** If a space starts without terms and later enables them, all existing users will have `termsAccepted = false` on their next auth or refresh. Handle this the same way as first-time acceptance.

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

### Avatar preference utilities

The SDK exports helper functions for managing the user's avatar preference. Use these instead of constructing Gravatar URLs client-side.

**Why not construct URLs client-side?**
Gravatar's v3 REST API returns gallery image URLs with **MD5** hashes, but the Relaya server builds avatar URLs using **SHA-256** hashes (derived from the user's email). These are different hash values for the same email address, so a URL constructed from a gallery hash will display a different image than the one the server would produce. Always let the server build the URL.

#### Gravatar-generated style

```tsx
import { setAvatarPreferenceStyle } from '@relaya-chat/react-native';

// Valid styleId values: 'identicon' | 'monsterid' | 'retro' | 'wavatar' | 'robohash' | 'mp'
await setAvatarPreferenceStyle(serverUrl, spaceSlug, getToken, 'wavatar');
```

The server resolves the user's email, computes the correct SHA-256 hash, and stores a properly formed Gravatar URL.

#### User's uploaded gravatar.com photo

```tsx
import {
  fetchGravatarGallery,
  setAvatarPreferenceGravatarPhoto,
} from '@relaya-chat/react-native';

// Fetch the user's uploaded photos
const photos = await fetchGravatarGallery(serverUrl, spaceSlug, getToken);

// photos[0].url comes directly from the Gravatar API - pass it as-is
await setAvatarPreferenceGravatarPhoto(serverUrl, spaceSlug, getToken, photos[0].url);
```

Do not extract the hash from gallery photo URLs to construct generated-style URLs - that hash is MD5 (wrong type for style URLs).

#### Default gravatar / initials

```tsx
import {
  setAvatarPreferenceDefault,
  setAvatarPreferenceInitials,
} from '@relaya-chat/react-native';

// Reset to the user's default gravatar (server derives hash from email)
await setAvatarPreferenceDefault(serverUrl, spaceSlug, getToken);

// Show initials instead of any avatar image
await setAvatarPreferenceInitials(serverUrl, spaceSlug, getToken);
```

#### Building a gravatar picker

When building a gravatar-style picker UI:
1. Call `fetchGravatarGallery` to get the user's uploaded photos - display them in the upper section
2. Show a hardcoded list of generated style options (identicon, monsterid, retro, wavatar, robohash, mp) in the lower section
3. For style previews, you may construct preview URLs using the hash from a gallery photo URL (MD5) - this is fine for display only
4. **On selection:** call `setAvatarPreferenceStyle(styleId)` - never pass the preview URL to the server

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
