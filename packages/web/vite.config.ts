import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron';

  return {
    base: isElectron ? './' : (process.env.VITE_BASE_URL ?? '/'),
    plugins: [react()],
    resolve: {
      alias: [
        // More-specific alias first so CSS subpath imports resolve to the source dir
        { find: '@linkml-editor/core/ui', replacement: resolve(__dirname, '../core/src/ui') },
        { find: '@linkml-editor/core', replacement: resolve(__dirname, '../core/src/index.ts') },
        // Provide browser-compatible Buffer polyfill for both web and electron builds
        { find: 'buffer', replacement: resolve(__dirname, 'node_modules/buffer/index.js') },
      ],
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
      alias: [
        { find: '@linkml-editor/core/ui', replacement: resolve(__dirname, '../core/src/ui') },
        { find: '@linkml-editor/core', replacement: resolve(__dirname, '../core/src/index.ts') },
      ],
    },
  };
});