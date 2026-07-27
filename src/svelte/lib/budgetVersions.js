/**
 * budgetVersions.js — named drafts of a project's budget.
 *
 * Model: exactly one draft is "active" at a time. The live budget
 * budget.js reads/writes (movie-ledger-budget + movie-ledger-budget-lock)
 * is that active draft's in-progress working copy. Committing writes the
 * live copy back into the active draft's own record (in place — it never
 * forks a new draft). The active draft is also what auto-loads the first
 * time a project's Budget page is opened (see ensureActiveLoaded).
 */

const VERSIONS_KEY = 'movie-ledger-budget-versions';
const BUDGET_KEY    = 'movie-ledger-budget';
const LOCK_KEY      = 'movie-ledger-budget-lock';

function _uid() { return crypto.randomUUID(); }

function _loadState() {
  try {
    const state = JSON.parse(localStorage.getItem(VERSIONS_KEY)) || {};
    return {
      activeId: state.activeId ?? null,
      versions: state.versions ?? [],
    };
  } catch { return { activeId: null, versions: [] }; }
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

export function getVersion(id) {
  return _loadState().versions.find(x => x.id === id) || null;
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

/**
 * True if the live budget differs from the active draft's last-committed
 * data (or, if there's no active draft at all, true whenever the live
 * budget has any data — since there's nowhere for it to be "committed").
 */
export function hasUncommittedChanges() {
  const state = _loadState();
  const v = state.versions.find(x => x.id === state.activeId);
  if (!v) return hasLiveBudgetData();
  return JSON.stringify(_snapshotLive()) !== JSON.stringify(v.data);
}

export function suggestedDraftName() {
  return `Draft — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/* ── Writes ────────────────────────────────────────────────────── */

/**
 * Start a brand-new, blank, named draft and make it active immediately.
 * Caller is responsible for handling any uncommitted changes on the
 * outgoing active draft first (see hasUncommittedChanges).
 */
export function createNamedDraft(name) {
  const state = _loadState();
  const now = new Date().toISOString();
  const entry = {
    id: _uid(),
    name: (name || '').trim() || suggestedDraftName(),
    data: { budget: {}, lock: null },
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  state.versions.push(entry);
  state.activeId = entry.id;
  _saveState(state);
  _applyToLive(entry.data);
  return entry;
}

/**
 * Fork the CURRENT live budget into a brand-new separate draft (does not
 * touch the active draft's own saved data, and does not change which
 * draft is active). Useful for "save my in-progress edits as a new
 * variant without committing them to the draft I started from."
 */
export function forkLiveAsNewDraft(name) {
  const state = _loadState();
  const now = new Date().toISOString();
  const entry = {
    id: _uid(),
    name: (name || '').trim() || suggestedDraftName(),
    data: _snapshotLive(),
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  state.versions.push(entry);
  _saveState(state);
  return entry;
}

/** Write the current live budget back into the active draft, in place. */
export function commitToActiveDraft() {
  const state = _loadState();
  const v = state.versions.find(x => x.id === state.activeId);
  if (!v) return null;
  v.data = _snapshotLive();
  v.updatedAt = new Date().toISOString();
  _saveState(state);
  return v;
}

/** Clear the live budget back to blank, with no active draft. */
export function createFreshBudget() {
  localStorage.removeItem(BUDGET_KEY);
  localStorage.removeItem(LOCK_KEY);
  const state = _loadState();
  state.activeId = null;
  _saveState(state);
}

/**
 * Switch the active draft. Loads that draft's data into the live slot.
 * Does NOT create, fork, or duplicate anything — caller should offer to
 * commitToActiveDraft() the outgoing draft first if hasUncommittedChanges().
 */
export function markAsActive(id) {
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
    notes: v.notes || '',
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

export function setDraftNotes(id, notes) {
  const state = _loadState();
  const v = state.versions.find(x => x.id === id);
  if (!v) return false;
  v.notes = notes || '';
  _saveState(state);
  return true;
}

export function deleteVersion(id) {
  const state = _loadState();
  state.versions = state.versions.filter(x => x.id !== id);
  if (state.activeId === id) state.activeId = null;
  _saveState(state);
}

/**
 * Called once when the Budget page mounts. If nothing has been edited
 * yet in this session (no live data) and there's an active draft,
 * loads it in. Never overwrites in-progress live edits.
 * Returns true if it loaded something.
 */
export function ensureActiveLoaded() {
  if (hasLiveBudgetData()) return false;
  const state = _loadState();
  if (!state.activeId) return false;
  const v = state.versions.find(x => x.id === state.activeId);
  if (!v) return false;
  _applyToLive(v.data);
  return true;
}
