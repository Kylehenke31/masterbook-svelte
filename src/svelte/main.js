import { mount } from 'svelte';
import App from './App.svelte';
import { hydrate } from '../data.js';
// Self-hosted rather than loaded from Google's CDN. This app also ships as an
// Electron build, and a desktop app that has to reach the network before it
// can draw its own front door would silently fall back to Arial offline.
// Vite fingerprints the woff2 files into the bundle like any other asset.
import '@fontsource-variable/rethink-sans';
import '../styles.css';

// Restore theme before mount to avoid flash
const saved = localStorage.getItem('movie-ledger-theme');
if (saved === 'light' || saved === 'dark') {
  document.documentElement.dataset.theme = saved;
}

hydrate();
mount(App, { target: document.getElementById('app') });
