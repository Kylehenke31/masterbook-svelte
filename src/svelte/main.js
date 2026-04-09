import { mount } from 'svelte';
import App from './App.svelte';
import { hydrate } from './stores/purchases.js';
import '../styles.css';

// Restore theme before mount to avoid flash
const saved = localStorage.getItem('movie-ledger-theme');
if (saved === 'light' || saved === 'dark') {
  document.documentElement.dataset.theme = saved;
}

hydrate();
mount(App, { target: document.getElementById('app') });
