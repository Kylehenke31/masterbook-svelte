import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
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
