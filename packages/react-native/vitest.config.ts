// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Test config for @relaya-chat/react-native.
 *
 * All tests run in the plain node environment. Hook tests mock React hooks
 * and React Native modules directly (same pattern as useRelayaAuth.test.ts),
 * so no DOM environment is required.
 *
 * The resolve alias maps @relaya-chat/core to its TypeScript source so tests
 * can run without a prior build step (the published dist/ is not required).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@relaya-chat/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
