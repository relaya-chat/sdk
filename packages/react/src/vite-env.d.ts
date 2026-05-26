// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
// Type declarations for Vite-specific import patterns.
// Vite resolves these at build time; this file provides
// compatible type declarations for non-Vite TypeScript consumers
// (e.g. Next.js type-checking via the package's `types` field).

// Side-effect CSS imports (e.g. import './styles/main.css')
declare module '*.css' {}

// Inline CSS imports (e.g. import styles from './foo.css?inline')
declare module '*.css?inline' {
  const content: string;
  export default content;
}
