import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** Redirect bare / to the Svelte entry point during dev */
const redirectToSvelte = {
  name: 'redirect-root-to-svelte',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/' || req.url === '') {
        res.writeHead(302, { Location: '/index.svelte.html' });
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [svelte(), redirectToSvelte],
  root: '.',
  build: {
    outDir: 'dist-svelte',
    rollupOptions: {
      input: 'index.svelte.html',
    },
  },
  server: {
    port: 5173,
    open: '/index.svelte.html',
  },
});
