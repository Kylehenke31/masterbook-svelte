/**
 * budgetCommits.js — a minimalistic, append-only log of budget "commits".
 *
 * A commit is just a checkpoint marker: who, when, which draft, and an
 * optional message describing what changed. It does not diff field
 * values — that's intentionally out of scope. Pair with
 * budgetVersions.js's saveCurrentAsVersion() if you also want a
 * restorable snapshot at that point in time.
 */

import { get } from 'svelte/store';
import { authUser, getDisplayName } from '../stores/auth.js';

const COMMITS_KEY = 'movie-ledger-budget-commits';

function _load() {
  try { return JSON.parse(localStorage.getItem(COMMITS_KEY)) || []; }
  catch { return []; }
}

function _save(list) {
  localStorage.setItem(COMMITS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'budget' } }));
}

export function listCommits() {
  return _load().slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Record a commit. `message` is optional (git-style — a blank message
 * just logs "(no message)"). `versionName` labels which draft this
 * checkpoint belongs to, for readability in the log only.
 */
export function commitBudgetChanges(message, versionName) {
  const user = get(authUser);
  const entry = {
    id: crypto.randomUUID(),
    message: (message || '').trim() || '(no message)',
    userLabel: user ? getDisplayName(user) : 'Unknown user',
    versionName: versionName || 'Untitled Budget',
    timestamp: new Date().toISOString(),
  };
  const list = _load();
  list.push(entry);
  _save(list);
  return entry;
}
