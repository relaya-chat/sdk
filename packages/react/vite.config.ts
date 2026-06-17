import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for @relaya-chat/react — library mode build.
 *
 * Produces one entry point:
 *   dist/index.js / dist/index.cjs  — main chat component and headless hooks
 *
 * CSS is extracted to dist/relaya.css (imported via "@relaya-chat/react/styles").
 *
 * React and react-dom are peer dependencies and are not bundled.
 */
export default defineConfig({
  plugins: [react()],

  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        format === 'cjs' ? `${entryName}.cjs` : `${entryName}.js`,
      cssFileName: 'relaya',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJsxRuntime',
        },
      },
    },
  },
});
