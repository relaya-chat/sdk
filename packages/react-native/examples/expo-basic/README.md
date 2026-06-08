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
