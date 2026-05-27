# @relaya-chat/core

> Core API client and WebSocket manager for the Relaya™ real-time chat SaaS.
> Used by `@relaya-chat/react` and `@relaya-chat/react-native`. Can also be used
> headlessly to build custom chat UI in any framework.

---

## You probably want @relaya-chat/react

If you're building a React app, use the drop-in component instead:

```sh
npm install @relaya-chat/react @relaya-chat/core
```

See the [`@relaya-chat/react` README](../react/README.md) for the Quick Start.

---

## For Headless / Custom UI

Use `ApiClient` for REST calls and `ChatConnection` for real-time WebSocket messaging:

```typescript
import { ApiClient, ChatConnection } from '@relaya-chat/core';

// Token held in memory — Relaya uses access/refresh tokens, no cookies
let accessToken: string | null = null;

const api = new ApiClient('https://api.relaya.chat', () => accessToken);

// Step 1: request a 6-digit OTP to the user's email
const { pendingId } = await api.requestCode('user@example.com', 'your-space-slug');

// Step 2: verify the code and obtain tokens
const auth = await api.verifyCode(pendingId, '123456', 'your-space-slug');
accessToken = auth.accessToken;

// Step 3: open a WebSocket for real-time messages
const conn = new ChatConnection(
  () => `wss://api.relaya.chat/ws?token=${accessToken}&station=your-space-slug`,
  (msg) => {
    if (msg.type === 'message:broadcast') {
      console.log(msg.message.content);
    }
  },
  (status) => console.log('Connection status:', status),
  { onAuthRevoked: () => { accessToken = null; } }
);

conn.connect();

// Send a message
conn.send({ type: 'message:send', content: 'Hello!', clientId: crypto.randomUUID() });

// Tear down on exit
conn.close();
```

> **Note:** Relaya is a hosted SaaS — these packages connect to `api.relaya.chat`.
> You need a space slug from your Relaya account. [Sign up at relaya.chat](https://relaya.chat).

---

## What's in @relaya-chat/core

- **`ApiClient`** — fetch-based REST client for all Relaya API endpoints (auth, messages, members, bans, stickers, moderation config, and more)
- **`ChatConnection`** — WebSocket connection manager with exponential backoff reconnect, heartbeat handling, and auth-revocation callbacks
- **TypeScript types** — full type definitions for all server messages (`WsServerMessage`, `WsClientMessage`), API responses (`AuthVerifyResponse`, `MessagesResponse`), and domain entities (`Message`, `Ban`, `Role`, `Permission`)
- **Works in browser and React Native** — no Node.js dependencies; uses the global `fetch` and `WebSocket` APIs

---

## License — MIT

Copyright (c) 2026 JAB Ventures, Inc.
