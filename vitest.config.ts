import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@schema': path.resolve(__dirname, 'src/mocks/schema.ts'),
      '@core': path.resolve(__dirname, 'src/mocks/core.ts'),
      '@nano': path.resolve(__dirname, 'src/mocks/nano.ts'),
      '@editor': path.resolve(__dirname, 'src/index.ts'),
      '@editor/*': path.resolve(__dirname, 'src/*'),
    },
  },
});
