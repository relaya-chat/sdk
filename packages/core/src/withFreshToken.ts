// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk

/**
 * Runs `action` after awaiting an optional token-freshness check.
 *
 * REST-based moderation actions (delete/ban/report/edit/block/unblock message)
 * call `api.<method>()` directly, which reads whatever access token is
 * currently cached. The WebSocket connect path already refreshes the token
 * before connecting (see ensureFreshToken in useRelayaAuth); REST call sites
 * need the same check; otherwise a client that stays continuously
 * foregrounded for the full AT lifetime (~30 min) with no WS reconnect and no
 * background/foreground transition has nothing to trigger a refresh, and the
 * next REST moderation call fails with a stale-token 401.
 *
 * `ensureFreshToken` is awaited first so its rotation (if any) completes
 * before `action` reads the token; the resolved token value itself is not
 * needed here because `ApiClient` re-reads the token via its `getToken`
 * callback on every request.
 *
 * When `ensureFreshToken` is not provided (e.g. an anonymous-only flow),
 * `action` runs immediately. If `ensureFreshToken` rejects, the rejection
 * propagates and `action` does not run.
 */
export async function withFreshToken<T>(
  ensureFreshToken: (() => Promise<string | null>) | undefined,
  action: () => Promise<T>
): Promise<T> {
  await ensureFreshToken?.();
  return action();
}
