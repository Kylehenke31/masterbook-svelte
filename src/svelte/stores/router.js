import { writable } from 'svelte/store';

/**
 * The hash carries two things: which screen, and occasionally which record.
 * "#my-book?user=abc" is one admin looking at somebody else's book — the
 * screen is still my-book, so the route must not include the query or every
 * `route === 'my-book'` comparison in the app quietly stops matching.
 */
function split(hash) {
  const raw = hash.replace(/^#/, '');
  const q   = raw.indexOf('?');
  if (q === -1) return { route: raw || 'home', params: {} };
  return {
    route: raw.slice(0, q) || 'home',
    params: Object.fromEntries(new URLSearchParams(raw.slice(q + 1))),
  };
}

const initial = typeof window !== 'undefined'
  ? split(window.location.hash)
  : { route: 'home', params: {} };

export const currentRoute  = writable(initial.route);
export const routeParams   = writable(initial.params);

/** Called by whoever listens to hashchange, so both stores move together. */
export function applyHash(hash) {
  const { route, params } = split(hash);
  currentRoute.set(route);
  routeParams.set(params);
}

export function navigate(route) {
  window.location.hash = route;
}
