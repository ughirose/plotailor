import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 8080,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    {
      name: 'html-rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/app' || req.url === '/app/' || req.url?.startsWith('/app?')) {
            req.url = '/app.html';
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
      },
    },
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

