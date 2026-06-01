// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
/**
 * RelayaServerContext — provides the configured serverUrl to all components
 * in the Relaya component tree.
 *
 * This eliminates the need to thread `serverUrl` through every hook and
 * component that constructs an ApiClient or makes a REST call. Components
 * simply call `useServerUrl()` to get the base URL for the current deployment.
 */

import React, { createContext, useContext } from 'react';

const RelayaServerContext = createContext<string>('');

export function RelayaServerProvider({
  serverUrl,
  children,
}: {
  serverUrl: string;
  children: React.ReactNode;
}) {
  return (
    <RelayaServerContext.Provider value={serverUrl}>
      {children}
    </RelayaServerContext.Provider>
  );
}

/**
 * Returns the serverUrl from the nearest RelayaServerProvider in the tree.
 * Falls back to `''` (same-origin) when no provider is present.
 */
export function useServerUrl(): string {
  return useContext(RelayaServerContext);
}
