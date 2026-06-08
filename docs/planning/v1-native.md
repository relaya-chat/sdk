# Relaya V1 Native Plan

This document records the first React Native / Expo integration plan for Relaya. This is an internal-development plan, though committed to the repo for use by various dev tools.

## Current Assessment

The public SDK workspace already contains a React Native package at `sdk/packages/react-native`:

- package name: `@relaya-chat/react-native`
- intended shape: **headless hooks and utilities**, not a drop-in mobile chat UI
- current exports:
  - `useRelayaAuth`
  - `useRelayaChat`
  - `getMessageMenuItems`
  - related TypeScript types
- current local validation:
  - `npm test --workspace packages/react-native` passes
  - `npm run build:react-native` passes

The package is the right starting point for the first mobile integration, but its auth implementation needs to be brought forward to match the current Relaya AT/RT auth architecture before it is used as the foundation for an Expo/iOS app.

## Target Integration

The first target is an **Expo iOS app**. The host app may still use native React Native modules for performance-sensitive features, especially player functionality, but Relaya chat should integrate through ordinary React Native screens/hooks.

The SDK should remain headless:

- Relaya provides chat/auth state and actions.
- The host app owns all UI and navigation.
- Minimal examples are useful, but a maintained default mobile UI is not part of the initial V1 native scope.

## Relevant Existing Architecture

Authoritative auth context comes from:

- `../relaya/memory-bank/systemPatterns.md`
- `../relaya/docs/completed/auth-analysis-2026-06-05.md`

The current Relaya chat auth model is:

| Token | Lifetime / Storage | Purpose |
|---|---|---|
| Access token (AT) | JWT, ~30 minutes, memory only | REST auth and WebSocket URL auth |
| Refresh token (RT) | opaque token, 33-day inactivity window, persisted client-side | silent session restoration and rotation |

Core behavior:

1. OTP sign-in uses email -> 6-digit code.
2. `/auth/verify-code` returns `{ accessToken, refreshToken, user, station }`.
3. `/auth/refresh` consumes the old RT and returns a new AT+RT pair.
4. The server stores only RT hashes and rotates RTs on every refresh.
5. WebSocket auth uses `?token=<AT>&station=<slug>`.
6. The client should call `ensureFreshToken()` before opening/reopening an authenticated WebSocket.
7. Chat auth uses no cookies.

The 33-day session concept still exists, but it is a **rolling RT inactivity window**, not one unchanged token that remains valid for 33 days regardless of use. Each concrete RT is valid until one of these happens:

- it is used successfully at `/auth/refresh`, at which point it is consumed and replaced by a new RT
- it expires after 33 days of inactivity
- it is deleted by logout or server-side account/session invalidation
- it is treated as reused/replayed and its token family is revoked

Every successful refresh issues a new RT with a fresh 33-day expiry. An active user who opens the app within that window should continue silently, while a user inactive for more than 33 days should be asked to sign in again. The React Native plan must preserve this by storing the RT securely across app launches and rotating the stored value on every successful refresh.

## What Does Not Carry Over From Web

The web SDK needed substantial cross-tab coordination because multiple browser tabs share `localStorage` but have independent JavaScript heaps. That does not normally apply to a React Native app.

The React Native package should **not** port the web-specific machinery as a first step:

- `BroadcastChannel`
- localStorage leader leases
- storage event coordination
- popup auth
- iframe host-managed semantics
- tab/follower refresh suppression

The React Native equivalent can be simpler because the normal app shape is one active JS runtime and one chat session surface.

## What Should Carry Over From Web

The durable auth rules should carry over:

- Keep AT in memory only.
- Persist only the RT, specifically to preserve the rolling 33-day session window across app launches.
- Rotate RT on every refresh.
- Dedupe concurrent refresh attempts within the same JS runtime.
- Decode JWT expiry to determine whether an AT is near expiry.
- Expose `ensureFreshToken()` for chat/WebSocket code.
- On foreground, proactively refresh/ensure freshness.
- On logout, send the RT to `/auth/logout` in the request body and clear local secure storage.
- Treat transient failures differently from confirmed auth failures where practical.

## Proposed React Native Auth Contract

The current `useRelayaAuth` implementation stores a single token in AsyncStorage and uses that value for refresh. That is not aligned with the AT/RT model. The React Native auth hook should instead accept a secure storage adapter and persist only the RT.

Proposed public types:

```ts
export interface RelayaTokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RelayaAuthOptions {
  serverUrl: string;
  spaceSlug: string;
  tokenStorage: RelayaTokenStorage;
  refreshTokenStorageKey?: string;
  onSessionEnded?: (reason: 'logout' | 'refresh-failed') => void;
}

export interface RelayaAuthActions {
  requestCode(email: string): Promise<{ pendingId: string }>;
  verifyCode(pendingId: string, code: string): Promise<void>;
  logout(): Promise<void>;
  ensureFreshToken(): Promise<string | null>;
  getToken(): string | null;
}
```

Notes:

- Public SDK language should use `spaceSlug`.
- Internals may continue to map that to existing server/station terminology.
- `refreshTokenStorageKey` should default to `relaya_refresh_token` unless there is a mobile-specific reason to choose another key.
- A low-level `refresh()` action should **not** be part of the public hook return value for V1 native. Consumers should call `ensureFreshToken()` when they need a usable AT. Internally, the hook can still have a private refresh/rotation helper that calls `/auth/refresh` with the current RT.
- The hook should maintain both `accessTokenRef` and `refreshTokenRef` in memory. Secure storage reads are async and should not be required in synchronous paths such as `getToken()` or ordinary send/logout flows. On mount, read the RT from storage once, then keep `refreshTokenRef.current` synchronized on every rotation.

### Expo SecureStore Adapter

Recommended for Expo:

```ts
import * as SecureStore from 'expo-secure-store';

export const relayaTokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
```

### Bare React Native Adapter

Recommended for bare React Native: `react-native-keychain`.

The SDK should not bundle either storage package. Storage should remain app-provided so Expo and bare RN apps can choose the correct secure storage implementation.

## React Native Auth Behavior

### Mount / Restore

On mount:

1. Read RT from `tokenStorage`.
2. If absent, set `status: 'anonymous'`.
3. If present and no valid AT is already available in memory, call `/auth/refresh` with the RT.
4. On success:
   - store the new RT in secure storage
   - keep the new AT in memory only
   - load `/me` and station/space metadata
   - set `status: 'authenticated'`
5. On confirmed auth failure:
   - clear the stored RT
   - clear AT memory
   - set `status: 'anonymous'`
   - call `onSessionEnded('refresh-failed')`
6. On transient failure:
   - do not immediately destroy stored RT
   - do not call `onSessionEnded`
   - schedule one retry after 10 seconds, matching the web SDK policy
   - if the retry also fails transiently, keep the RT recoverable rather than destructively clearing secure storage

Important: because the AT is intentionally memory-only, a true app cold start or JS runtime restart has no AT to validate or reuse. The persisted RT is the only session credential available. In that case, `/auth/refresh` is the restore operation: the server validates the RT, consumes it, and returns a newly rotated AT+RT pair. It does not simply answer "the RT is still valid" while leaving the old token pair in place. This is how the app leverages the 33-day window: the stored RT lets a returning user silently obtain a fresh AT, and the returned replacement RT extends the rolling inactivity window another 33 days.

Confirmed auth failure means `/auth/refresh` returns 401 or 403 for the current RT after retry policy has ruled out transient failure. Client-side code should not try to depend on exact server log codes, but the server-side causes include expired RT (`RT:004`), deleted/unknown/externally invalidated RT (`RT:006`), token-family reuse/revocation (`RT:003`), or inactive user/membership/account checks (403). `RT:005` is emitted by the logout route when a token is deleted; it is not itself a refresh response code.

For a quick in-app screen remount, the preferred architecture is to keep `useRelayaAuth` mounted in an app-level provider or route group layout so the in-memory AT/RT state survives navigation. In that case, a chat screen returning after a short absence should call `ensureFreshToken()` and reuse the current AT when it is still fresh, rather than re-reading secure storage and forcing an RT rotation on every screen mount.

### OTP Sign-In

`requestCode(email)`:

- calls `/auth/request-code`
- returns `pendingId`
- lets the app present its own OTP input UI

`verifyCode(pendingId, code)`:

- calls `/auth/verify-code`
- stores returned `refreshToken` in `tokenStorage`
- keeps returned `accessToken` in memory
- sets authenticated user/station state

### Ensure Fresh Token / Internal Refresh

`ensureFreshToken()` is the public action. It is the only freshness method app developers should normally call. The actual RT rotation helper should remain internal to the hook.

`ensureFreshToken()`:

- returns the current AT immediately when it is more than two minutes from expiry
- if expired or near expiry, uses the current RT to call `/auth/refresh`
- on success, rotates the stored RT and returns the new AT
- returns `null` when no valid authenticated session is available

Concurrent calls within the same JS runtime should share a single in-flight refresh per RT value.

### Foreground Handling

React Native should use `AppState`, not browser visibility APIs.

On `AppState` transition to `active`:

- if authenticated, call `ensureFreshToken()`
- do not force a refresh round-trip when the AT is still fresh
- the chat layer can then reconnect the WebSocket with a fresh AT

### Logout

`logout()` should:

1. Read the current RT from memory or secure storage.
2. Call `POST /auth/logout` with `{ refreshToken }`.
3. Clear secure RT storage.
4. Clear AT memory.
5. Set anonymous state.
6. Call `onSessionEnded('logout')` if provided.

The logout call should not depend on sending the AT as an Authorization header.

## Proposed React Native Chat Contract

`useRelayaChat` should be updated so it can ensure token freshness before creating an authenticated WebSocket.

It should also expose two mobile-specific policy knobs:

```ts
export interface RelayaChatOptions {
  serverUrl: string;
  spaceSlug: string;
  authState: RelayaAuthState;
  getToken: RelayaAuthActions['getToken'];
  ensureFreshToken: RelayaAuthActions['ensureFreshToken'];
  /** Default true: anonymous/read-only users may connect and read chat. */
  allowAnonymous?: boolean;
  /** Default 3 minutes: delay before closing WS after app backgrounding. */
  backgroundDisconnectDelayMs?: number;
}
```

Proposed usage:

```tsx
const auth = useRelayaAuth({
  serverUrl: 'https://api.relaya.chat',
  spaceSlug: 'your-space-slug',
  tokenStorage: relayaTokenStorage,
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
```

Before constructing `ChatConnection`:

1. If `authState.status === 'authenticated'`, call `ensureFreshToken()`.
2. If it returns an AT, build the WebSocket URL with that AT.
3. If it returns `null`, set `connectionStatus: 'reconnecting'` and retry shortly.
4. If `authState.status !== 'authenticated'` and `allowAnonymous !== false`, connect without a token for anonymous/read-only chat.
5. If `allowAnonymous === false`, do not open a WebSocket until the user authenticates. This lets host apps require sign-in before any chat connection.

On background/foreground:

- background: schedule WebSocket close after `backgroundDisconnectDelayMs`, defaulting to 3 minutes
- quick app switch: if the app returns to active before the delay fires, cancel the timer and keep the existing connection
- long background interval: if the delay fires, close the socket; on foreground, call `ensureFreshToken()`, reconnect, and use existing REST catch-up logic for missed messages

The initial default should be mobile-friendly rather than web-page-like. Mobile users switch app contexts frequently, and closing/reopening the WebSocket on every brief app switch is too heavyweight. Three minutes is the starting assumption; simulator/device testing can tune it.

## Minimal Example Strategy

Build one lightweight runnable Expo example first, then extract the important pieces as snippets in the README. A runnable example is the best way to debug the SDK contract on iOS, and it gives the project a concrete integration artifact to share later.

Recommended structure:

```txt
sdk/packages/react-native/examples/expo-basic/
  package.json
  app.json
  App.tsx
  README.md
  src/
    ChatScreen.tsx
    relayaTokenStorage.ts
    components/
      RelayaSignInPanel.tsx
      RelayaMessageList.tsx
      RelayaMessageComposer.tsx
```

The runnable example should remain intentionally small and dependency-light. Its files should also serve as copy-paste reference snippets demonstrating:

- SecureStore adapter
- sign-in button
- email + OTP flow
- message list rendering
- optimistic sending
- sign out
- basic moderation/report action sheet using `getMessageMenuItems`
- AppState foreground refresh

Example screen shape:

```tsx
export function ChatScreen() {
  const auth = useRelayaAuth({
    serverUrl: 'https://api.relaya.chat',
    spaceSlug: 'your-space-slug',
    tokenStorage: relayaTokenStorage,
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

  if (auth.status !== 'authenticated') {
    return <RelayaSignInPanel auth={auth} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <RelayaMessageList messages={chat.messages} optimistic={chat.optimistic} />
      <RelayaMessageComposer onSend={chat.sendMessage} />
    </View>
  );
}
```

These components should remain intentionally plain. Their job is to prove and document the integration contract, not to become a cross-app UI framework.

## Validation Plan

### SDK-Level Tests

Add focused tests for the React Native auth behavior using fake storage and fake API/fetch behavior.

Coverage targets:

- no stored RT -> anonymous state
- stored RT -> refresh called -> AT set in memory and RT rotated in storage
- `verifyCode()` stores RT and sets authenticated state
- `ensureFreshToken()` returns current AT when fresh
- `ensureFreshToken()` refreshes when AT is near expiry
- concurrent `ensureFreshToken()` calls share one in-flight refresh per RT value
- transient refresh failure preserves RT, schedules one 10-second retry, and does not call `onSessionEnded`
- confirmed auth failure clears RT and calls `onSessionEnded('refresh-failed')`
- `logout()` posts RT body and clears storage

This likely requires extracting RN auth refresh helpers or making the hook easier to test via dependency injection.

### Expo / iOS Validation

For the first target app:

1. Install the local SDK package or use a workspace link during development.
2. Add `expo-secure-store`.
3. Add a chat route/screen using the example pattern.
4. Point at a real Relaya space on `https://api.relaya.chat`.
5. Validate in iOS simulator.
6. Validate on a physical iOS device.

Manual validation checklist:

- anonymous/read-only connection works, if supported
- sign-in button presents inline email/code flow
- OTP verification authenticates
- app kill/reopen silently restores via stored RT
- app kill/reopen within the 33-day RT inactivity window silently restores and rotates the RT
- app reopen after RT expiry shows sign-in instead of silently restoring
- app background/foreground reconnects cleanly
- long background interval reconnects after `ensureFreshToken()`
- sending messages works
- edit/delete/report work where permissions allow
- sign out clears secure storage and does not silently restore

During early validation, expose a small dev-only diagnostic panel with:

- `auth.status`
- `chat.connectionStatus`
- message count
- last error

## Existing React Native Code Corrections

The current `sdk/packages/react-native/src/hooks/useRelayaAuth.ts` was written for an older single-token model. It should be rewritten around the AT/RT contract rather than patched piecemeal.

Required auth corrections:

- Stop importing `@react-native-async-storage/async-storage` directly. Use the injected `tokenStorage` adapter.
- Remove `@react-native-async-storage/async-storage` from `peerDependencies`; it can remain only as a dev/example dependency if needed for tests or migration examples. Expo docs should use SecureStore first.
- Rename public options from `stationSlug` to `spaceSlug` while mapping internally to server station terminology.
- Rename `tokenStorageKey` to `refreshTokenStorageKey`, defaulting to `relaya_refresh_token`.
- Never persist the AT. `verifyCode()` and refresh success must persist `refreshToken`, not `accessToken`.
- On mount, treat the stored value as an RT and call `/auth/refresh`; do not call `/me` with a stored token as though it were a still-valid AT.
- Keep AT and RT in memory refs (`accessTokenRef`, `refreshTokenRef`) and update both on every token rotation.
- Add JWT expiry decoding so `ensureFreshToken()` can avoid unnecessary server calls while the AT remains fresh.
- Add RT-keyed in-flight refresh deduplication so two callers cannot spend the same RT concurrently.
- Add `onSessionEnded` and invoke it only for confirmed auth failure or explicit logout.
- Make AppState foreground handling call `ensureFreshToken()`, not a public `refresh()` action.
- Make logout send `{ refreshToken }` in the request body; do not rely on an Authorization header.

Required chat corrections:

- Rename public options from `stationSlug` to `spaceSlug` while mapping internally as needed.
- Await `ensureFreshToken()` before authenticated `ChatConnection` creation.
- If `ensureFreshToken()` returns `null`, set `connectionStatus: 'reconnecting'` and retry instead of opening a WebSocket with a stale AT.
- Add `allowAnonymous`, default `true`, and suppress anonymous WebSocket connections when `allowAnonymous === false`.
- Add `backgroundDisconnectDelayMs`, default `3 * 60 * 1000`, using React Native `AppState` rather than browser visibility APIs.
- Replace the `state.loadingOlder` closure guard in `loadOlderMessages` with a ref-backed guard to avoid stale closure behavior.

## Implementation Sequence

The steps below are organized into waves. Within a wave, steps marked **[parallel-safe]** can be assigned to independent Cline Kanban subagents simultaneously. Steps marked **[serial]** must complete before the next wave begins. Steps marked **[new tests]** require writing or updating tests as part of the work.

Subagent notes:
- Before running any test suite command (`npm test --workspace packages/react-native`), check for a sentinel file at `/tmp/relaya-rn-test.lock`. If the file exists, wait and retry in 10-second intervals until it is gone, then create it before running, and delete it after. This prevents concurrent test runs from interfering with each other.
- No local server start/stop is required for SDK-level tests; they use fake storage and fake fetch. The `api.relaya.chat` production server is used only for manual iOS validation in Wave 4.

---

### Wave 1 — Foundation (serial, must complete before Wave 2)

**[serial] Step 1.1 — Rewrite `useRelayaAuth.ts` to AT/RT model**

File: `sdk/packages/react-native/src/hooks/useRelayaAuth.ts`

This is the load-bearing change. All other waves depend on a stable AT/RT auth hook interface. Do not start Wave 2 until this step passes its own type-check (`npm run build:react-native`) and the existing tests still pass.

Key deliverables:
- Accept `RelayaTokenStorage` adapter; remove direct `AsyncStorage` import
- Persist only the RT; keep AT in memory refs
- On mount: read RT from storage, call `/auth/refresh`, rotate both tokens
- `verifyCode()` persists `refreshToken`, never `accessToken`
- `ensureFreshToken()` decodes JWT expiry and refreshes only when near-expired
- RT-keyed in-flight refresh deduplication
- `onSessionEnded` fired only on confirmed auth failure or explicit logout
- Transient failures: do not clear RT; schedule one 10-second retry
- `logout()` posts `{ refreshToken }` to `/auth/logout`
- Rename public options: `stationSlug` → `spaceSlug`, `tokenStorageKey` → `refreshTokenStorageKey`

**[serial] Step 1.2 — Extract auth helper functions** (can be done as part of Step 1.1 by the same agent)

File: `sdk/packages/react-native/src/hooks/useRelayaAuth.ts` (or extracted module alongside it)

Extract pure/testable helpers before tests are written in Wave 2:
- JWT expiry decoder
- Refresh deduplication logic (keyed by RT value)
- Transient-vs-confirmed failure classifier

---

### Wave 2 — Parallel expansion (begin after Wave 1 is merged/stable)

All three steps below can be run by independent subagents simultaneously.

**[parallel-safe] Step 2A — Update `useRelayaChat.ts` + add AppState handling** [new tests]

Files:
- `sdk/packages/react-native/src/hooks/useRelayaChat.ts`

Deliverables:
- Accept `RelayaChatOptions`: `authState`, `getToken`, `ensureFreshToken`, `allowAnonymous`, `backgroundDisconnectDelayMs`
- Rename `stationSlug` → `spaceSlug` in public options
- Await `ensureFreshToken()` before authenticated `ChatConnection` creation; set `connectionStatus: 'reconnecting'` if it returns `null`
- Suppress anonymous WebSocket when `allowAnonymous === false`
- Replace `state.loadingOlder` closure guard with a ref-backed guard
- Add `AppState` listener (not browser visibility): delay WS close `backgroundDisconnectDelayMs` (default `3 * 60 * 1000`); cancel timer and keep connection on quick foreground return; on long-background reconnect, call `ensureFreshToken()` before reconnecting
- Tests: one focused test for the `allowAnonymous: false` suppression path and one for the background-disconnect timer cancel behavior (use fake timers)

**[parallel-safe] Step 2B — Write focused RN auth tests** [new tests]

File: `sdk/packages/react-native/src/hooks/useRelayaAuth.test.ts` (new file)

Use fake `RelayaTokenStorage` and fake `fetch` throughout. No network, no native modules. Use sentinel file before running the test suite (see Subagent notes above).

Required coverage (from Validation Plan):
- No stored RT → `status: 'anonymous'`, no refresh call
- Stored RT → refresh called → AT set in memory, RT rotated in storage, `status: 'authenticated'`
- `verifyCode()` stores RT, keeps AT in memory, sets `status: 'authenticated'`
- `ensureFreshToken()` returns current AT immediately when it is more than two minutes from expiry
- `ensureFreshToken()` calls `/auth/refresh` when AT is expired or near expiry
- Concurrent `ensureFreshToken()` calls share one in-flight refresh per RT value (deduplication)
- Transient refresh failure (network error): preserves RT, schedules one 10-second retry, does **not** call `onSessionEnded`
- Confirmed auth failure (401/403): clears RT from storage, calls `onSessionEnded('refresh-failed')`
- `logout()`: posts RT in body, clears secure storage, sets `status: 'anonymous'`, calls `onSessionEnded('logout')`
- AppState transition to `active` calls `ensureFreshToken()` when `status: 'authenticated'`

**[parallel-safe] Step 2C — Rewrite documentation**

Files:
- `sdk/packages/react-native/README.md`
- `sdk/packages/react-native/README-AUTH.md`

Document the new AT/RT model, `RelayaTokenStorage` adapter pattern, `RelayaAuthOptions`, `RelayaChatOptions`, `spaceSlug` rename, and the Expo SecureStore adapter example. Reference the Expo example directory once it exists. No tests required.

---

### Wave 3 — Expo example (serial, begin after Wave 2 is merged/stable)

**[serial] Step 3 — Build minimal Expo example** [new tests: none, but type-checks must pass]

Directory: `sdk/packages/react-native/examples/expo-basic/`

Structure:
```
package.json
app.json
App.tsx
README.md
src/
  ChatScreen.tsx
  relayaTokenStorage.ts       ← Expo SecureStore adapter
  components/
    RelayaSignInPanel.tsx
    RelayaMessageList.tsx
    RelayaMessageComposer.tsx
```

Demonstrate: SecureStore adapter, sign-in button, email+OTP flow, message list rendering, optimistic sending, sign out, `getMessageMenuItems` for report/moderation action sheet, `AppState` foreground refresh. Include a dev-only diagnostic panel (`auth.status`, `chat.connectionStatus`, message count, last error) for early validation.

After creating the example, add a brief link to it from `sdk/README.md` and the React Native package README.

---

### Wave 4 — iOS validation (serial, human-driven, begin after Wave 3 is stable)

**[serial] Step 4 — Integrate and validate on iOS simulator and device**

This step is human-driven and cannot be parallelized. It requires a physical or virtual iOS environment pointing at `https://api.relaya.chat`.

Checklist (from Validation Plan):
- [ ] Anonymous/read-only connection works
- [ ] Sign-in button presents email/OTP flow
- [ ] OTP verification authenticates
- [ ] App kill/reopen silently restores via stored RT within 33-day window
- [ ] App kill/reopen rotates RT on restore
- [ ] App reopen after RT expiry shows sign-in
- [ ] Background/foreground reconnects cleanly
- [ ] Long background interval reconnects after `ensureFreshToken()`
- [ ] Sending messages works
- [ ] Edit/delete/report work where permissions allow
- [ ] Sign out clears secure storage and does not silently restore

## Resolved Direction and Remaining Questions

Resolved direction:

- Anonymous/read-only mobile connections should be enabled by default.
- Developers who want auth before any chat connection should be able to set `allowAnonymous: false` in `useRelayaChat`.
- The SDK should delay WebSocket closure after backgrounding, not disconnect immediately on every app switch.
- Initial background disconnect delay: `3 * 60 * 1000` ms.
- Build a lightweight runnable Expo example first, located at `sdk/packages/react-native/examples/expo-basic/`, then use it as the source for docs snippets.
- Link to the runnable Expo example from the public SDK root README (`sdk/README.md`) and the React Native package README after the implementation lands.
- Keep V1 native headless. Do not export or commit to maintained default UI components in the initial native SDK.

Remaining questions:

- Whether 3 minutes is the right background disconnect delay after simulator and physical-device validation.
- Exact example-app packaging details, while keeping the location package-local under `sdk/packages/react-native/examples/expo-basic/`.
