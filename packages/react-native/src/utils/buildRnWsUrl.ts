// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * buildRnWsUrl — constructs the WebSocket URL for React Native chat connections.
 *
 * Converts an http(s) serverUrl to ws(s) and appends query parameters:
 *   - token (Bearer JWT, URI-encoded) — omitted for anonymous connections
 *   - station (space slug, URI-encoded)
 *
 * This is an internal utility; not part of the public @relaya-chat/react-native API.
 */

export function buildRnWsUrl(
  serverUrl: string,
  stationSlug: string,
  token?: string,
  apiKey?: string
): string {
  // Convert http(s):// → ws(s)://
  const wsBase = serverUrl.replace(/^http/, 'ws');
  const tokenParam = token ? `token=${encodeURIComponent(token)}&` : '';
  const apiKeyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey)}` : '';
  return `${wsBase}/ws?${tokenParam}station=${encodeURIComponent(stationSlug)}${apiKeyParam}`;
}
