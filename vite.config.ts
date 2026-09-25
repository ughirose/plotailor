import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 8080,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@schema': path.resolve(__dirname, '../packages/schema/src/index.ts'),
      '@core': path.resolve(__dirname, '../worldcraft/src/index.ts'),
      '@editor': path.resolve(__dirname, 'src/index.ts'),
      '@editor/*': path.resolve(__dirname, 'src/*'),
      '@nano': path.resolve(__dirname, '../narrative-nano/src/index.ts'),
    },
  },
});
