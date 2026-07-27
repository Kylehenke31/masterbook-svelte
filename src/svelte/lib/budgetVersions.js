/**
 * budgetVersions.js — named snapshots ("drafts") of a project's budget.
 *
 * The "live" budget budget.js reads/writes (movie-ledger-budget +
 * movie-ledger-budget-lock) is untouched by this module — it's always
 * whatever is currently being edited. This module just manages a
 * registry of saved snapshots of that data, and can copy a snapshot
 * into (or out of) the live slot.
 */

const VERSIONS_KEY = 'movie-ledger-budget-versions';
const BUDGET_KEY    = 'movie-ledger-budget';
const LOCK_KEY      = 'movie-ledger-budget-lock';

function _uid() { return crypto.randomUUID(); }

function _loadState() {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY)) || { activeId: null, versions: [] }; }
  catch { return { activeId: null, versions: [] }; }
}

function _saveState(state) {
  localStorage.setItem(VERSIONS_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'budget' } }));
}

function _snapshotLive() {
  return {
    budget: JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}'),
    lock:   JSON.parse(localStorage.getItem(LOCK_KEY)   || 'null'),
  };
}

function _applyToLive(data) {
  if (data?.budget) localStorage.setItem(BUDGET_KEY, JSON.stringify(data.budget));
  else localStorage.removeItem(BUDGET_KEY);
  if (data?.lock) localStorage.setItem(LOCK_KEY, JSON.stringify(data.lock));
  else localStorage.removeItem(LOCK_KEY);
}

/* ── Reads ─────────────────────────────────────────────────────── */

export function listVersions() {
  return _loadState().versions.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getActiveVersionId() {
  return _loadState().activeId;
}

export function getActiveVersionName() {
  const state = _loadState();
  const v = state.versions.find(x => x.id === state.activeId);
  return v ? v.name : 'Untitled Budget';
}

/** Weak heuristic — true once anything has been saved to the live budget. */
export function hasLiveBudgetData() {
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    return !!raw && Object.keys(JSON.parse(raw)).length > 0;
  } catch { return false; }
}

export function suggestedDraftName() {
  return `Draft — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/* ── Writes ────────────────────────────────────────────────────── */

/** Snapshot the current live budget as a new named draft. */
export function saveCurrentAsVersion(name) {
  const state = _loadState();
  const now = new Date().toISOString();
  const entry = {
    id: _uid(),
    name: (name || '').trim() || suggestedDraftName(),
    data: _snapshotLive(),
    createdAt: now,
    updatedAt: now,
  };
  state.versions.push(entry);
  state.activeId = entry.id;
  _saveState(state);
  return entry;
}

/** Clear the live budget back to blank. Caller decides whether to save first. */
export function createFreshBudget() {
  localStorage.removeItem(BUDGET_KEY);
  localStorage.removeItem(LOCK_KEY);
  const state = _loadState();
  state.activeId = null;
  _saveState(state);
}

/** Replace the live budget with a saved draft's data. */
export function loadVersion(id) {
  const state = _loadState();
  const v = state.versions.find(x => x.id === id);
  if (!v) return false;
  _applyToLive(v.data);
  state.activeId = id;
  _saveState(state);
  return true;
}

export function duplicateVersion(id) {
  const state = _loadState();
  const v = state.versions.find(x => x.id === id);
  if (!v) return null;
  const now = new Date().toISOString();
  const copy = {
    id: _uid(),
    name: `${v.name} copy`,
    data: JSON.parse(JSON.stringify(v.data)),
    createdAt: now,
    updatedAt: now,
  };
  state.versions.push(copy);
  _saveState(state);
  return copy;
}

export function renameVersion(id, newName) {
  if (!newName?.trim()) return false;
  const state = _loadState();
  const v = state.versions.find(x => x.id === id);
  if (!v) return false;
  v.name = newName.trim();
  v.updatedAt = new Date().toISOString();
  _saveState(state);
  return true;
}

export function deleteVersion(id) {
  const state = _loadState();
  state.versions = state.versions.filter(x => x.id !== id);
  if (state.activeId === id) state.activeId = null;
  _saveState(state);
}
