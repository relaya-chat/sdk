# Relaya SDK

Add real-time community chat to your React or React Native app in minutes.

Relaya is a hosted chat SaaS for media brands, radio stations, and community apps. This SDK connects your front end to the Relaya platform at [api.relaya.chat](https://api.relaya.chat).

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
      apiBase="https://api.relaya.chat"
    />
  );
}
```

## Quick Start — React Native / Expo

```sh
npm install @relaya-chat/react-native @relaya-chat/core
```

```tsx
import { useRelayaChat } from '@relaya-chat/react-native';

export default function ChatScreen() {
  const { messages, sendMessage, connectionStatus } = useRelayaChat({
    spaceSlug: 'my-space',
    apiBase: 'https://api.relaya.chat',
  });
  // render your own UI using messages and sendMessage
}
```

## Features

- **Real-time messaging** via WebSocket
- **OTP authentication** — email-based, no passwords
- **Moderation** — ban management, message deletion, report review
- **Admin panel** — built-in moderator UI (React package)
- **Theming** — CSS custom properties, light/dark mode
- **TypeScript** — fully typed, strict mode

## Getting a Space

Sign up at [relaya.chat](https://relaya.chat) to create a space (your chat community) and get a `spaceSlug` and API credentials.

## Documentation

- [Embedder contract](https://relaya.chat/docs) — props, hooks, events reference
- [Theming guide](https://relaya.chat/docs/theming) — CSS custom properties
- [Admin panel](https://relaya.chat/docs/admin) — moderation features

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributors assign copyright to JAB Ventures, Inc.

## License

MIT — see [LICENSE](LICENSE).
