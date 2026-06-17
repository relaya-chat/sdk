# Relaya™ SDK

Add real-time community chat to your React or React Native app in minutes.

Relaya™ is a hosted chat SaaS for media brands, radio stations, and community apps. This SDK connects your front end to the Relaya platform at [api.relaya.chat](https://api.relaya.chat).

## Packages

| Package | Description |
|---|---|
| [`@relaya-chat/react`](packages/react) | Drop-in chat component + hooks for React web apps |
| [`@relaya-chat/react-native`](packages/react-native) | Headless hooks for React Native and Expo |
| [`@relaya-chat/core`](packages/core) | TypeScript types, REST client, WebSocket manager (used by the above) |

## Quick Start — React

```sh
npm install @relaya-chat/react
```

```tsx
import { RelayaChat } from '@relaya-chat/react';
import '@relaya-chat/react/styles';

export default function App() {
  return (
    <RelayaChat
      spaceSlug="my-space"
      serverUrl="https://api.relaya.chat"
    />
  );
}
```

## Quick Start — React Native / Expo

```sh
npm install @relaya-chat/react-native @relaya-chat/core
npx expo install expo-secure-store
```

```tsx
import { useRelayaAuth, useRelayaChat } from '@relaya-chat/react-native';
import * as SecureStore from 'expo-secure-store';

const tokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};

export default function ChatScreen() {
  const auth = useRelayaAuth({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'my-space',
    tokenStorage,
  });

  const { messages, sendMessage, connectionStatus } = useRelayaChat({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'my-space',
    authState: auth,
    getToken: auth.getToken,
    ensureFreshToken: auth.ensureFreshToken,
    allowAnonymous: true,
  });
  // render your own UI using messages and sendMessage
}
```

For a complete runnable example including OTP sign-in, moderation, and AppState handling, see [`packages/react-native/examples/expo-basic/`](packages/react-native/examples/expo-basic/).

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `spaceSlug` | `string` | ✓ | Your space slug, assigned by Relaya |
| `serverUrl` | `string` | ✓ | Base URL for **all** SDK requests — REST API calls (messages, stickers, sounds, auth) **and** the WebSocket connection. Pass `"https://api.relaya.chat"` for Relaya SaaS. Pass `""` only when the widget is same-origin with the server (e.g. Relaya's own hosted iframe). No backend proxy routes are required in your app. |
| `className` | `string` | — | Additional CSS class on the outermost wrapper |
| `manageOwnRefreshToken` | `boolean` | — | `true` (default): widget manages its own session in `localStorage`. `false`: host app owns the session; pass a fresh `token` on each mount. |
| `token` | `string` | — | One-time token for host-managed auth handoff |
| `hideSignOut` | `boolean` | — | Suppress the widget's built-in Sign Out button |
| `hideAdmin` | `boolean` | — | Suppress the admin gear icon |
| `apiKey` | `string` | — | Per-space API key (generated in the space admin panel → **Native** tab). Required when your space has API key enforcement enabled. Sent as `X-Relaya-Api-Key` on REST calls and as `?apiKey=` on the WebSocket upgrade. |
| `onSessionEnded` | `(reason) => void` | — | Called when the session ends (`'logout'` or `'refresh-failed'`) |

## Troubleshooting

**API calls are hitting my app's server instead of Relaya**

Ensure `serverUrl` is set to `"https://api.relaya.chat"`. The SDK routes _all_ requests — REST and real-time WebSocket — through this base URL. No proxy routes or backend setup are required in your host app.

```tsx
// ✓ Correct — all requests go directly to api.relaya.chat
<RelayaChat spaceSlug="my-space" serverUrl="https://api.relaya.chat" />

// ✗ Wrong — omitting serverUrl defaults to same-origin (relative paths), causing 404s
<RelayaChat spaceSlug="my-space" serverUrl="" />
```

---

## Features

- **Real-time messaging** via WebSocket — auto-reconnects on network drops, no polling
- **OTP authentication** — email-based one-time codes, no passwords, 33-day sessions
- **Moderation built in** — ban management, message deletion, report review — included on every plan
- **Admin panel** — built-in moderator UI (React package)
- **Custom sticker sets** — upload your own stickers for on-brand community expression
- **Chat history & export** — configurable archive up to 180 days, CSV export, searchable from admin
- **Custom branding** — visual theme editor, CSS custom properties, light/dark mode
- **Country & IP controls** — country allowlist/blocklist and IP ban tools for compliance and abuse management
- **No-cookie architecture** — access token in memory + refresh token in `localStorage`; no cookies; no cookie-consent banner; works in cross-origin iframes
- **App Store compliant** — built to satisfy Apple's UGC guidelines from day one
- **Three integration paths** — iframe embed (no-code), React component, React Native hooks — one subscription covers all
- **TypeScript** — fully typed, strict mode

## Getting a Space

Sign up at [relaya.chat](https://relaya.chat) to create a space (your chat community) and get a `spaceSlug`. 15-day free trial, no credit card required.

Once your space is set up, you can optionally generate a per-space API key in the admin panel under **Settings → Native**. Pass this key as the `apiKey` prop when you have **API key enforcement** enabled for your space. Spaces without enforcement configured work without an API key.

## Documentation

- [Embedder contract](https://relaya.chat/docs) — props, hooks, events reference
- [Theming guide](https://relaya.chat/docs/theming) — CSS custom properties
- [Admin panel](https://relaya.chat/docs/admin) — moderation features
- [Privacy & data handling](packages/react/PRIVACY.md) — what Relaya collects, for your own privacy policy
- [Checking the live server version](docs/server-version.md) — curl the version endpoint, cross-reference SDK compatibility

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributors assign copyright to JAB Ventures, Inc.

## License

MIT — see [LICENSE](LICENSE).
