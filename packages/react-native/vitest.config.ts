// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { defineConfig } from 'vitest/config';

/**
 * Test config for @relaya-chat/react-native.
 *
 * All tests run in the plain node environment. Hook tests mock React hooks
 * and React Native modules directly (same pattern as useRelayaAuth.test.ts),
 * so no DOM environment is required.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
