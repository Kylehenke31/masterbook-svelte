import { writable } from 'svelte/store';

export const currentRoute = writable(
  typeof window !== 'undefined'
    ? window.location.hash.slice(1) || 'home'
    : 'home'
);

export function navigate(route) {
  window.location.hash = route;
}
