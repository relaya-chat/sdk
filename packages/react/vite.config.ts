import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for @relaya/react — library mode build.
 *
 * Produces two entry points:
 *   dist/index.js / dist/index.cjs  — main chat component and headless hooks
 *   dist/admin.js                   — admin panel (loaded only in admin popup window)
 *
 * CSS is extracted to dist/relaya.css (imported via "@relaya/react/styles").
 *
 * React and react-dom are peer dependencies and are not bundled.
 */
export default defineConfig({
  plugins: [react()],

  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        admin: resolve(__dirname, 'src/admin.ts'),
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
