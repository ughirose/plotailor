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
    alias: [
      { find: '@schema', replacement: path.resolve(__dirname, 'src/mocks/schema.ts') },
      { find: '@core', replacement: path.resolve(__dirname, 'src/mocks/core.ts') },
      { find: '@nano', replacement: path.resolve(__dirname, 'src/mocks/nano.ts') },
      { find: '@editor', replacement: path.resolve(__dirname, 'src/index.ts') },
    ],
  },
});
