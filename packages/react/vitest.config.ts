// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
import { defineConfig } from 'vitest/config';

/**
 * Test config for @relaya-chat/react.
 *
 * Kept separate from vite.config.ts (the library build) so tests run in a plain
 * node environment without the lib-build/rollup settings. Unit tests that need
 * browser globals (localStorage, window, BroadcastChannel) stub them per-test
 * rather than pulling in a full DOM environment dependency.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
