# Authentication — @relaya/react

## What Relaya does for you

Relaya uses a **short-lived access token + rotating refresh token** model. Your users authenticate once with a one-time code sent to their email. After that, Relaya handles everything:

- **Access token (15 minutes):** Held only in JavaScript memory — never written to storage. Used for every API call and WebSocket connection. Silently refreshed in the background before it expires, so the user never notices.
- **Refresh token (33-day inactivity window):** Stored in `localStorage` (keyed to the Relaya widget domain — the parent page cannot read it). Persists across browser close/reopen and is shared across tabs. If the user revisits within 33 days of their last activity, they are automatically re-authenticated without re-entering their email or code. If they are inactive for longer, they see the sign-in prompt again.
- **No cookies.** Relaya does not set any cookies. Your users are not subject to cookie-consent requirements because of Relaya.
- **Theft detection.** If a refresh token is somehow replayed after it has already been used, Relaya detects the anomaly and revokes the entire session family — forcing a fresh sign-in.

**You build none of this.** Mount the component. Auth is handled entirely inside it.

---

## What you need to do

### 1. Mount the component

```tsx
import { RelayaChat } from '@relaya/react';
import '@relaya/react/styles';

function MyPage() {
  return (
    <RelayaChat
      spaceSlug="your-space-slug"
      apiUrl="https://api.relaya.chat"
    />
  );
}
```

Users who attempt to chat are prompted for their email inline. They receive a 6-digit code, enter it inline, and are authenticated. No redirect, no popup required.

### 2. Iframe embed context

If you are embedding Relaya in a cross-origin iframe (e.g., from a Wix or Squarespace site), no extra configuration is needed. Relaya uses `localStorage` (not cookies) for its refresh token, which is not affected by third-party cookie restrictions (ITP, Privacy Sandbox).

The refresh token is keyed to the Relaya widget domain (`chat.relayaplatform.com`). The parent page's JavaScript cannot access it — same-origin policy prevents cross-frame storage access.

> **iOS Safari note:** In cross-origin iframes, Safari ITP may clear `localStorage` after approximately 7 days without a direct user interaction with the widget domain. Active users who interact with the chat widget are not affected.

### 3. No CORS credential configuration required

Relaya does not use `credentials: 'include'` for any API calls. Auth is carried via `Authorization: Bearer` headers built entirely client-side. No server-side CORS credential configuration is needed on your end.

---

## Sign-out

Call the `logout` action exposed by `useRelayaAuth`, or use the built-in sign-out UI. On logout, Relaya:
1. Calls `POST /auth/logout` to delete the refresh token server-side.
2. Clears the access token from memory.
3. Clears the refresh token from `localStorage`.

---

## Security properties

| Property | Detail |
|---|---|
| XSS token theft window | 15 minutes (access token expiry) |
| Persistent credential in JS-accessible storage | Refresh token in `localStorage` — keyed to widget domain, not readable by parent page |
| Cookie exposure | None |
| Token reuse detection | Yes — replayed refresh token revokes the entire session |

---

## References

This auth design follows published best-practice guidance for browser-based applications and embedded widgets:

- **[IETF draft-ietf-oauth-browser-based-apps (latest)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)** — Authoritative IETF OAuth Working Group guidance for SPAs and embedded widgets. Recommends short-lived access tokens in memory + rotating refresh tokens in storage, exactly as Relaya implements.

- **[Auth0 — Refresh Token Rotation](https://auth0.com/blog/securing-single-page-applications-with-refresh-token-rotation)** — Industry explanation of why rotating RTs with reuse detection are the right model for browser applications.

- **[Auth0 — Inactivity-based refresh token lifetimes](https://auth0.com/blog/achieving-a-seamless-user-experience-with-refresh-token-inactivity-lifetimes)** — Explains why inactivity-based expiry (used by Relaya) is preferable to hard expiry for user experience without sacrificing security.

- **[Curity — Token Handler / BFF Pattern](https://curity.io/blog/token-handler-the-single-page-applications-new-bff)** — Documents why the classic HTTP-only cookie pattern (BFF) fails in cross-origin iframe deployments, and the AT/RT in-memory pattern as the recommended alternative.
