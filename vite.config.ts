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
          const url = req.url || '';
          if (url === '/lp' || url === '/lp/' || url.startsWith('/lp?')) {
            req.url = '/index.html';
          } else if (url === '/' || url === '/app' || url === '/app/' || url.startsWith('/app?')) {
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
      '@schema': path.resolve(__dirname, 'src/mocks/schema.ts'),
      '@core': path.resolve(__dirname, 'src/mocks/core.ts'),
      '@editor': path.resolve(__dirname, 'src/index.ts'),
      '@editor/*': path.resolve(__dirname, 'src/*'),
      '@nano': path.resolve(__dirname, 'src/mocks/nano.ts'),
    },
  },
});

