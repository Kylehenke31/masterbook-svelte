/**
 * dropbox.js — Dropbox connection + Files API wrapper.
 *
 * Uses OAuth 2.0 with PKCE (no App Secret needed) — the right flow for a
 * browser-only app with no backend server of its own. The App Key is a
 * public client identifier, safe to ship in frontend code (same category
 * as the Supabase anon key), read from VITE_DROPBOX_APP_KEY.
 *
 * The refresh token this flow produces is stored per-user in Supabase
 * (dropbox_tokens table) via db.js — never in localStorage, since it's
 * long-lived and grants real account access.
 */

const APP_KEY       = import.meta.env.VITE_DROPBOX_APP_KEY;
const REDIRECT_URI  = window.location.origin;
const VERIFIER_KEY  = 'masterbook-dropbox-pkce-verifier';

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier() {
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return base64url(arr.buffer);
}

async function challengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Kick off the connect flow — redirects the browser to Dropbox. */
export async function startDropboxAuth() {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFromVerifier(verifier);
  const params = new URLSearchParams({
    client_id: APP_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: REDIRECT_URI,
  });
  window.location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
}

/**
 * Call once on app load. If the URL has Dropbox's ?code= redirect param,
 * completes the token exchange and stores the refresh token. Always
 * strips the query string afterward so it doesn't linger or re-fire on
 * refresh. Returns true if a connection was just completed.
 */
export async function handleDropboxRedirect() {
  const url  = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.pathname + url.hash);
  if (!verifier) return false;

  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: APP_KEY,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!resp.ok) throw new Error(`Dropbox token exchange failed: ${resp.status}`);
  const data = await resp.json();
  const { saveDropboxToken } = await import('./db.js');
  await saveDropboxToken(data.refresh_token);
  return true;
}

let _accessTokenCache = null; // { token, expiresAt }

/** Mint (and cache) a short-lived access token from the stored refresh token. */
async function getAccessToken() {
  if (_accessTokenCache && _accessTokenCache.expiresAt > Date.now() + 60_000) {
    return _accessTokenCache.token;
  }
  const { loadDropboxToken } = await import('./db.js');
  const refreshToken = await loadDropboxToken();
  if (!refreshToken) throw new Error('Dropbox is not connected.');

  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: APP_KEY,
    }),
  });
  if (!resp.ok) throw new Error(`Dropbox token refresh failed: ${resp.status}`);
  const data = await resp.json();
  _accessTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _accessTokenCache.token;
}

export async function isDropboxConnected() {
  const { loadDropboxToken } = await import('./db.js');
  return !!(await loadDropboxToken());
}

export async function disconnectDropbox() {
  _accessTokenCache = null;
  const { disconnectDropbox: clear } = await import('./db.js');
  await clear();
}

/** Create a folder (and any missing parent folders). No-op if it already exists. */
export async function dropboxCreateFolder(path) {
  const token = await getAccessToken();
  const resp = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (resp.ok) return true;
  const err = await resp.json().catch(() => ({}));
  if (err?.error?.['.tag'] === 'path' && err.error.path?.['.tag'] === 'conflict') return true; // already exists
  throw new Error(`Dropbox create_folder_v2 failed (${resp.status}): ${err?.error_summary || ''}`);
}

/** Upload a file, overwriting any existing file at that exact path. */
export async function dropboxUploadFile(path, bytes) {
  const token = await getAccessToken();
  const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: true }),
    },
    body: bytes,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Dropbox upload failed (${resp.status}): ${err?.error_summary || ''}`);
  }
  return await resp.json();
}
