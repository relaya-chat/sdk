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

Edit `src/ChatScreen.tsx` and update the constants near the top:

```ts
const SERVER_URL = 'https://api.relaya.chat';
const SPACE_SLUG = 'your-space-slug';   // ← replace this
```

### 4. Run on iOS simulator

```sh
npx expo start --ios
```

Or on a physical device:

```sh
npx expo start
```

Then scan the QR code with the Expo Go app, or press `i` for iOS simulator.

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
