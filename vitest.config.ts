import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@editor': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'node_modules/@worldcraft/core/src/index.ts'),
      '@schema': path.resolve(__dirname, 'node_modules/@worldcraft/schema/src/index.ts'),
    },
  },
});
