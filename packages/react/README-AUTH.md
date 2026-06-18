# Authentication - @relaya-chat/react

Relaya handles user sign-in and session management for the web widget. Users authenticate with a one-time email code. Your app does not need an auth backend for chat.

## Token model

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (AT) | About 30 minutes | JavaScript memory only | REST auth and WebSocket auth |
| Refresh token (RT) | 33-day rolling inactivity window | localStorage.relaya_refresh_token by default | Silent restore and AT refresh |

No cookies are used by chat auth. API calls use Authorization: Bearer <AT>. WebSocket connections use ?token=<AT>.

Every refresh consumes the old RT and returns a new AT+RT. The SDK writes the new RT immediately. The web package includes multi-tab race protection so a losing tab does not clear a newer RT written by a winning tab.

## Default widget mode

In normal <RelayaChat> use, the SDK owns localStorage.relaya_refresh_token:

```tsx
<RelayaChat
  spaceSlug="your-space-slug"
  serverUrl="https://api.relaya.chat"
/>
```

On mount, the widget tries to restore a session by refreshing the stored RT. If no RT exists, users can read anonymously and are prompted to sign in before posting.

## Host-managed mode

Advanced host apps can own the RT themselves:

```tsx
<RelayaChat
  spaceSlug="your-space-slug"
  serverUrl="https://api.relaya.chat"
  token={oneTimeToken}
  manageOwnRefreshToken={false}
  hideSignOut
  onSessionEnded={() => redirectToHostSignIn()}
/>
```

When manageOwnRefreshToken={false}, the widget must not read, write, or clear localStorage.relaya_refresh_token. The host owns durable session state and should provide fresh handoff tokens on mount.

## API keys and iframe allowlists

Space admins configure integration security in relaya.chat under the native space admin area.

- Iframe embeds are protected by an origin allowlist enforced at WebSocket upgrade time.
- React SDK usage can require a per-space API key.

Pass the API key when your space has key enforcement enabled:

```tsx
<RelayaChat
  spaceSlug="your-space-slug"
  serverUrl="https://api.relaya.chat"
  apiKey="rlk_live_..."
/>
```

The SDK sends the key as X-Relaya-Api-Key on REST requests and ?apiKey= on WebSocket upgrade. The key does not identify a user; it only binds the integration to a space.

## Sign-out

Calling logout() or using the built-in sign-out UI:

1. Posts { refreshToken } to /auth/logout.
2. Clears the AT from memory.
3. Clears the RT from localStorage when the widget owns storage.

Local state is cleared even if the network request fails.

## Troubleshooting

- If users are unexpectedly signed out, check whether multiple app instances are mounting auth and refreshing the same RT.
- If WebSocket opens fail after API key enforcement, confirm the same apiKey prop reaches both auth and chat connection paths.
- If iframe connections fail, confirm the browser Origin exactly matches an allowed origin. Do not include a path or trailing slash.
- If using host-managed mode, confirm the host is not expecting the widget to persist RTs.

## Privacy note

The widget stores a functional refresh token only for sign-in persistence. It does not set cookies or tracking storage. See PRIVACY.md for integrator-facing privacy language.