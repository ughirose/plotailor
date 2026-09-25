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
      '@schema': path.resolve(__dirname, 'src/mocks/schema.ts'),
      '@core': path.resolve(__dirname, 'src/mocks/core.ts'),
      '@nano': path.resolve(__dirname, 'src/mocks/nano.ts'),
      '@editor': path.resolve(__dirname, 'src/index.ts'),
      '@editor/*': path.resolve(__dirname, 'src/*'),
    },
  },
});
