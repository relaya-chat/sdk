# Relaya Expo Basic Example

A minimal runnable Expo app demonstrating `@relaya-chat/react-native` integration.

## What this example demonstrates

- **SecureStore adapter** — `src/relayaTokenStorage.ts` shows the Expo SecureStore implementation of `RelayaTokenStorage`
- **OTP sign-in flow** — email entry → request code → enter 6-digit code → authenticated
- **Message list** — confirmed messages and optimistic (pending/failed) messages via `FlatList`
- **Optimistic sends** — messages appear immediately; reconciled when the server echoes them back
- **Sign out** — posts the refresh token to the server, clears SecureStore
- **Moderation action sheet** — long-press any message to see `getMessageMenuItems` in action (report, delete, ban, based on your permissions)
- **AppState foreground refresh** — handled automatically inside the SDK hooks; no extra code needed in the app
- **Presence bar** — shows authenticated user names and total online count using `chat.users` and `chat.totalCount`
- **Dev diagnostic panel** — shown only in `__DEV__` mode; displays `auth.status`, WebSocket `connectionStatus`, message count, and last error

## Read first, then authenticate (anonymous read → authenticated post)

A common pattern in a mobile app is to show existing messages in a space to
**unauthenticated** users as a hook, then prompt them to sign in only when they
try to post. The `@relaya-chat/react-native` hooks (`useRelayaAuth` and
`useRelayaChat`) are built for exactly this. You do **not** make REST calls
yourself, and you do **not** manage tokens by hand — the hooks do it for you. The
two things you need to understand are: which calls need a token (none of the
reads do), and what changes automatically once the user authenticates.


### The short version

1. Mount `useRelayaAuth` and `useRelayaChat` at the top of your screen and keep
   them mounted across the sign-in transition. Do not conditionally skip mounting
   `useRelayaChat` while the user is anonymous.
2. Leave `allowAnonymous` at its default (`true`). The chat hook opens an
   anonymous WebSocket, and on connect it loads the recent message history over
   REST automatically. No access token is involved.
3. When the user wants to post, run the OTP flow with `auth.requestCode(email)`
   then `auth.verifyCode(pendingId, code)`.
4. That's it. When `auth.status` becomes `'authenticated'`, the chat hook tears
   down the anonymous connection and reopens an authenticated one with a fresh
   access token. Already-loaded messages stay on screen; the hook does a
   cursor-based catch-up rather than a full reload. The user can now send.

### Why there is no "fetch messages" call to write

`GET /api/chat/{space}/messages` and `GET /api/chat/stations/{space}` are
**public** — they require no access token. The chat hook calls them for you when
the WebSocket reports `auth:success` (which the server sends to anonymous
connections too). So fetching the initial history is not something your app
code does; mounting `useRelayaChat` is the trigger.

### What token (or not) is used at each stage

| Stage | Access token (AT) | What the RN client sends | Result |
|---|---|---|---|
| Anonymous (pre-sign-in) | none — `getToken()` returns `null` | `X-Relaya-Api-Key` only (no `Authorization` header) | Reads succeed; posting is not possible |
| OTP in progress (`otp-sent`) | none yet | same as anonymous | User keeps reading while entering the code |
| Authenticated | AT in memory, refreshed automatically | `Authorization: Bearer <AT>` + `X-Relaya-Api-Key` | Reads + posting + moderation |


The **API key is not user identity.** It binds your app to the space (anti
co-option) and is sent on every REST call and on the WebSocket URL. It does not
authenticate a person. User identity always comes from the OTP → AT/RT flow.
Pass `apiKey` to both `useRelayaAuth` and `useRelayaChat` if your space has one
generated (space admin panel → Native tab).

### What changes post-auth — and what you must not do

- The access token lives in memory and the refresh token in SecureStore. Both
  are managed by `useRelayaAuth`. Do **not** call `/auth/refresh` yourself, do
  **not** persist the AT, and do **not** put the refresh token in AsyncStorage.
- Do **not** unmount and remount `useRelayaChat` to "switch" from anonymous to
  authenticated. The reconnection is driven by the `auth.status` change inside
  the hook. Remounting throws away the already-loaded messages.
- Gate only the **composer** on auth, not the message list. `sendMessage` is a
  no-op unless `auth.user` exists, so a natural UI is: always render the list,
  and swap the composer for a "Sign in to post" button while anonymous.

### Note on this example's UX choice

`src/ChatScreen.tsx` in this example takes a **sign-in-first** approach — it
renders `RelayaSignInPanel` whenever `auth.status !== 'authenticated'`, so the
anonymous read-only list is not shown. That keeps the example focused on the
auth flow. To get the read-first behavior described above, render the message
list regardless of `auth.status` and show the sign-in affordance inline instead
of returning early. The hooks already support it; only the screen's conditional
rendering needs to change. For example:

```tsx
// Always mount both hooks; never gate useRelayaChat on auth status.
const auth = useRelayaAuth({ serverUrl, spaceSlug, tokenStorage, apiKey });
const chat = useRelayaChat({
  serverUrl,
  spaceSlug,
  authState: auth,
  getToken: auth.getToken,
  ensureFreshToken: auth.ensureFreshToken,
  allowAnonymous: true, // default — anonymous users read while signed out
  apiKey,
});

return (
  <View style={{ flex: 1 }}>
    {/* Messages render for anonymous and authenticated users alike */}
    <RelayaMessageList messages={chat.messages} optimistic={chat.optimistic} />

    {auth.status === 'authenticated' ? (
      <RelayaMessageComposer onSend={chat.sendMessage} />
    ) : (
      <RelayaSignInPanel auth={auth} />
    )}
  </View>
);
```

---

## Setup

### 1. Install dependencies

```sh
cd sdk/packages/react-native/examples/expo-basic
npm install
```


This installs Expo, `expo-secure-store`, and links the local `@relaya-chat/react-native` and `@relaya-chat/core` packages.

### 2. Build the SDK first

The local SDK package must be built before the example can import its types:

```sh
# From the sdk/ root
npm run build:react-native
```

### 3. Configure your space

You'll need a Relaya space to connect to. Sign up at [relaya.chat](https://relaya.chat) to create a space and get your `spaceSlug`. A 15-day free trial is available — no credit card required.

Copy the local config template and fill in your space slug:

```sh
cp src/config.local.ts.example src/config.local.ts
```

Then edit `src/config.local.ts`:

```ts
export const SERVER_URL = 'https://api.relaya.chat';
export const SPACE_SLUG = 'your-space-slug'; // ← replace with your real slug
```

`config.local.ts` is gitignored — it will never be accidentally committed.

### 4. Run on iOS simulator

```sh
npm run ios
```

This uses `scripts/start-ios.js` to ensure a valid iPhone simulator is booted before handing off to Expo. It works correctly even if Xcode simulators have been deleted or recreated since the last run.

Or start Metro without auto-opening a simulator (press `i` to open one manually):

```sh
npm start
```

## Type-checking

```sh
npm run typecheck
```

This runs `tsc --noEmit` against all `.ts` and `.tsx` files in the example directory.

## File overview

```
expo-basic/
  App.tsx                          Entry point — mounts ChatScreen inside SafeAreaView
  src/
    ChatScreen.tsx                 Main screen: useRelayaAuth + useRelayaChat + all features
    relayaTokenStorage.ts          Expo SecureStore adapter (copy this into your own app)
    components/
      RelayaSignInPanel.tsx        Email input → OTP code input → sign-in
      RelayaMessageList.tsx        FlatList rendering messages + optimistic messages
      RelayaMessageComposer.tsx    Text input + send button
```

## Notes

- Components are intentionally plain. Their purpose is to document the integration contract clearly, not to serve as a polished UI.
- `currentUserPriority` and `messageAuthorPriority` are passed as `0` in this example because `RelayaAuthUser` does not expose role priority in V1. Production apps should derive these values from role data.
- For bare React Native (without Expo), replace `expo-secure-store` with `react-native-keychain`. See [README-AUTH.md](../../README-AUTH.md) for the adapter pattern.

## For developers building their own app

This example is wired to the SDK via local `file:` symlinks so it can be run directly inside the SDK monorepo. A few things in this example are **specific to this monorepo setup** and are **not** needed in your own app:

| File / setting | This example (monorepo) | Your own app |
|---|---|---|
| `package.json` deps | `"file:../../"` and `"file:../../../core"` (local symlinks) | `npm install @relaya-chat/react-native @relaya-chat/core` |
| `metro.config.js` | Required — Metro won't follow symlinks outside the project root without it | **Not needed** — npm installs are regular directories, not symlinks |

When building your own app, skip both of those. Just install from npm and Metro will resolve the packages normally. The files worth copying to your own project are:

- `src/relayaTokenStorage.ts` — SecureStore adapter
- `src/ChatScreen.tsx` — shows the full `useRelayaAuth` + `useRelayaChat` integration
- `src/components/` — example UI components (optional, reference only)
