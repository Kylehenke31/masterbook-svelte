import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** Redirect bare / to the Svelte entry point during dev */
const redirectToSvelte = {
  name: 'redirect-root-to-svelte',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const queryIndex = req.url.indexOf('?');
      const pathname    = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
      const query       = queryIndex === -1 ? ''      : req.url.slice(queryIndex);
      if (pathname === '/' || pathname === '') {
        // Preserve the query string — e.g. Dropbox's OAuth redirect lands on
        // bare `/?code=...`, and that code has to survive the redirect.
        res.writeHead(302, { Location: '/index.svelte.html' + query });
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
