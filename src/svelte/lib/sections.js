/**
 * sections.js — Cloud sync for all localStorage-based app sections.
 *
 * Strategy: each logical section maps to one Supabase table and one or more
 * localStorage keys.  On login we pull from the cloud and write to localStorage
 * so every synchronous component just works.  On save we read from localStorage
 * and push to the cloud as a fire-and-forget upsert.
 *
 * Nothing here touches Svelte state — it's plain async JS that App.svelte calls.
 */

import { loadSection, saveSection } from './db.js';
import { decideKeys, fingerprintBlob, mergeForPush } from './syncReconcile.js';
import { SECTION_FEATURE, canEdit } from './features.js';

/* ── Read-only enforcement ──────────────────────────────────────
 *
 * A member with a read grant may open a section but must not change it. That
 * is checked here rather than in each of a dozen components: this is the one
 * place every section's data leaves the browser, so a mutation reaching the
 * cloud has to pass through it whichever button caused it.
 *
 * It stops changes *persisting*, not the typing itself — a read-only user can
 * still alter what is on their screen, and it reverts on reload. That is the
 * honest limit of enforcing this outside the database, and is why the
 * financial tables are enforced in RLS as well.
 */
let _member = null;

/** Called by App.svelte whenever the signed-in member's grants are known. */
export function setSyncMember(member) { _member = member; }

function mayWriteSection(sectionName) {
  if (!_member) return true;                       // unknown grants: do not block
  const feature = SECTION_FEATURE[sectionName];
  if (!feature) return true;                       // ungoverned section
  return canEdit(_member, feature);
}

function refuseWrite(sectionName) {
  console.warn(`[sections] ${sectionName}: read-only for this member — change not saved`);
  window.dispatchEvent(new CustomEvent('masterbook-readonly-blocked', {
    detail: { section: sectionName, feature: SECTION_FEATURE[sectionName] },
  }));
}

/* ── Section → localStorage key map ────────────────────────────── */
//
// Each entry:
//   table    – Supabase table name
//   keys     – localStorage keys whose values make up this section's blob
//              (order matters: first key is the "primary" one for existence checks)
//
export const SECTIONS = {
  budget: {
    table: 'budgets',
    keys: [
      'movie-ledger-budget',
      'movie-ledger-budget-lock',
      'movie-ledger-hot-costs',
      'movie-ledger-fringe-actuals',
      'movie-ledger-budget-versions',
      'movie-ledger-budget-commits',
    ],
  },
  personnel: {
    table: 'personnel',
    keys: [
      'movie-ledger-crew',
      'movie-ledger-cast',
      'movie-ledger-cast-checkcols',
      'movie-ledger-crew-checkcols',
      'movie-ledger-crew-hiddencols',
      'movie-ledger-crew-imported',
      'movie-ledger-personnel-tab',
      'movie-ledger-cast-v1-backup',
      'movie-ledger-auto-prep',
    ],
  },
  calendars: {
    table: 'calendars',
    keys: [
      'movie-ledger-calendar',
      'movie-ledger-crew-daytypes',
      'movie-ledger-cal-tz',
      'movie-ledger-calendar-accounting',
      'movie-ledger-daytypes-accounting',
      'movie-ledger-crew-schedule',
    ],
  },
  schedules: {
    table: 'schedules',
    keys: [
      'movie-ledger-breakdowns',
      'movie-ledger-elements',
      'movie-ledger-one-liner-drafts',
      'movie-ledger-one-liner-active',
      'movie-ledger-one-liner',
      'movie-ledger-script-order',
    ],
  },
  call_sheets: {
    table: 'call_sheets',
    keys: [
      'movie-ledger-callsheets',
      'movie-ledger-cs-email-template',
      'movie-ledger-prod-info',
    ],
  },
  vendors: {
    table: 'vendors',
    keys: ['movie-ledger-vendors'],
  },
  insurance: {
    table: 'insurance',
    keys: ['movie-ledger-ins-cert'],
  },
  creative: {
    table: 'creative',
    keys: ['movie-ledger-creative'],
  },
  files: {
    table: 'creative',      // same Supabase table as creative — stored in same blob, different keys
    keys: ['movie-ledger-files'],
  },
  creditCards: {
    table: 'credit_cards',
    keys: ['movie-ledger-credit-cards'],
  },
  pettyCash: {
    table: 'petty_cash',
    keys: ['movie-ledger-petty-cash-envelopes'],
  },
};

/* ── Snapshot helpers ───────────────────────────────────────────── */

/** Read all keys for a section from localStorage → single blob object. */
function snapshotSection(sectionName) {
  const { keys } = SECTIONS[sectionName];
  const blob = {};
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw !== null) blob[key] = raw; // store as raw string, preserves JSON exactly
  }
  return blob;
}

/** Write a section blob back into localStorage. */
function restoreSection(sectionName, blob) {
  if (!blob || typeof blob !== 'object') return;
  const { keys } = SECTIONS[sectionName];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(blob, key)) {
      localStorage.setItem(key, blob[key]);
    }
  }
}

/** True if the section has any non-empty content in localStorage. */
function sectionHasData(sectionName) {
  const { keys } = SECTIONS[sectionName];
  return keys.some(k => {
    const raw = localStorage.getItem(k);
    if (!raw) return false;
    try { const v = JSON.parse(raw); return v && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0); }
    catch { return raw.length > 0; }
  });
}

/* ── Staleness guard ────────────────────────────────────────────── */
// A cloud load/sync is a background fetch that can take a real moment.
// If the user edits a section (e.g. adds a Credit Card) while one of these
// is still in flight, the fetch resolves with a snapshot from *before*
// that edit and would silently overwrite it — same race as data.js's
// hydrateFromCloud/_mutationVersion, generalized to every section here.
// App.svelte bumps this the instant a 'masterbook-section-changed' event
// fires, i.e. right after the section's own localStorage write.
const _sectionVersions = {};

export function bumpSectionVersion(sectionName) {
  _sectionVersions[sectionName] = (_sectionVersions[sectionName] || 0) + 1;
}

/* ── Divergence guard ───────────────────────────────────────────── */
// The staleness guard above only covers edits made *during* a fetch. It does
// nothing about the larger hazard: local data that was never pushed at all.
// restoreSection is a bare localStorage.setItem, so a plain "cloud wins" load
// silently destroys unpushed local work — which is precisely how a browser
// holding the only copy of a section can lose it to an emptier cloud.
//
// To tell "local is merely stale" apart from "local has changes the cloud has
// never seen", we remember what the section looked like the last time local
// and cloud agreed. Comparing local, cloud and that fingerprint gives a
// definite answer without timestamps or extra columns.

const FINGERPRINTS_KEY = 'movie-ledger-section-sync-fingerprints-v1';

function readFingerprints() {
  try { return JSON.parse(localStorage.getItem(FINGERPRINTS_KEY)) || {}; }
  catch { return {}; }
}

function getSyncedFingerprint(projectId, table) {
  return readFingerprints()[projectId]?.[table] ?? null;
}

/**
 * Record that local and cloud agree, right now, for the keys they agree on.
 *
 * Conflicted keys are deliberately excluded: writing a fingerprint for a key
 * we just refused to resolve would tell the *next* load that this state was
 * agreed, and the conflict would silently resolve itself in favour of
 * whichever side happens to be local. The conflict must persist until someone
 * actually settles it.
 */
function setSyncedFingerprint(projectId, table, blob, exclude = []) {
  if (!projectId) return;
  const all = readFingerprints();
  const prev = all[projectId]?.[table] || {};
  const next = fingerprintBlob(blob);
  for (const key of exclude) {
    if (key in prev) next[key] = prev[key];  // keep the old baseline
    else delete next[key];                   // never had one; do not invent one
  }
  all[projectId] = { ...(all[projectId] || {}), [table]: next };
  try { localStorage.setItem(FINGERPRINTS_KEY, JSON.stringify(all)); } catch {}
}

/** Every section that persists to this table, merged into one blob. */
function snapshotTable(table) {
  const blob = {};
  for (const [name, cfg] of Object.entries(SECTIONS)) {
    if (cfg.table === table) Object.assign(blob, snapshotSection(name));
  }
  return blob;
}

/**
 * Report a sync failure loudly enough to be noticed.
 *
 * Every failure path here used to end at console.warn and nothing else. That
 * is how the credit_cards and petty_cash tables could simply not exist for
 * months: the app was told "relation does not exist" on every save and every
 * load, shrugged each time, and kept presenting localStorage as though it were
 * synced. Silence about a persistence failure is the worst possible default
 * for an accounting tool — the user believes their data is safe precisely
 * because nothing said otherwise.
 */
function reportSyncFailure(table, operation, message) {
  console.warn(`[sections] ${operation}(${table}) failed:`, message);
  window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
    detail: { table, operation, message, at: new Date().toISOString() },
  }));
}

/** Every localStorage key this table is responsible for. */
function knownKeysForTable(table) {
  const keys = new Set();
  for (const cfg of Object.values(SECTIONS)) {
    if (cfg.table === table) for (const k of cfg.keys) keys.add(k);
  }
  return keys;
}

/**
 * Keys a table's blob may legitimately write back to localStorage.
 *
 * A stored blob can contain keys this version no longer owns — either left by
 * an older version, or written by a newer one. Restoring those blind is
 * dangerous: the ledger key `movie-ledger-v2` used to be carried in the
 * budgets blob, and the copy still sitting there is stale seed data. Treating
 * it as "a key only the cloud has" would restore ten demo purchases over a
 * real ledger.
 *
 * So unknown keys are ignored for restore. They are still preserved on push
 * (see mergeForPush) rather than deleted, since a key this version does not
 * recognise may belong to one that does.
 */
function filterToKnown(blob, table) {
  const known = knownKeysForTable(table);
  const out = {};
  for (const [k, v] of Object.entries(blob || {})) if (known.has(k)) out[k] = v;
  return out;
}

/** Bind the pure decision in syncReconcile.js to this table's actual state. */
function reconcile(projectId, table, cloudBlob) {
  return decideKeys(
    snapshotTable(table),
    filterToKnown(cloudBlob, table),
    getSyncedFingerprint(projectId, table));
}

/** Write only the keys the reconciler judged safe to take from the cloud. */
function restoreKeys(cloudBlob, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(cloudBlob, key)) {
      localStorage.setItem(key, cloudBlob[key]);
    }
  }
}

/**
 * Conflicts are surfaced rather than resolved. Local data is left alone and
 * the competing cloud values are stashed so they can be recovered or merged
 * deliberately — losing data to an automatic merge would be the same class of
 * bug this guard exists to prevent.
 */
function reportConflict(projectId, table, cloudBlob, keys) {
  const stashKey = `movie-ledger-sync-conflict:${projectId}:${table}`;
  const stash = {};
  for (const k of keys) stash[k] = cloudBlob[k];
  try { localStorage.setItem(stashKey, JSON.stringify({ at: new Date().toISOString(), cloud: stash })); }
  catch {}
  console.warn(
    `[sections] ${table}: ${keys.join(', ')} changed both locally and in the cloud ` +
    `since they last agreed. Kept local; cloud copy stashed at "${stashKey}".`);
  window.dispatchEvent(new CustomEvent('masterbook-sync-conflict', {
    detail: { table, projectId, stashKey, keys },
  }));
}

/* ── Cloud save / load ──────────────────────────────────────────── */

/**
 * Push a single section to Supabase from the current localStorage state.
 * Fire-and-forget — caller does not need to await.
 */
export async function saveSectionToCloud(sectionName, projectId) {
  if (!projectId) return;
  if (!mayWriteSection(sectionName)) { refuseWrite(sectionName); return; }
  const { table } = SECTIONS[sectionName];
  const blob = snapshotSection(sectionName);
  if (!Object.keys(blob).length) return; // nothing to save
  try {
    await saveSection(table, projectId, blob);
    // Cloud now matches local for this table — that agreement is the baseline
    // the divergence guard compares against on the next load.
    setSyncedFingerprint(projectId, table, snapshotTable(table));
  } catch (e) {
    reportSyncFailure(table, 'saveSectionToCloud', e.message);
  }
}

/**
 * Pull a single section from Supabase and write it to localStorage.
 * Returns true if cloud data was found.
 */
export async function loadSectionFromCloud(sectionName, projectId) {
  if (!projectId) return false;
  const { table } = SECTIONS[sectionName];
  const versionAtStart = _sectionVersions[sectionName] || 0;
  try {
    const blob = await loadSection(table, projectId);
    if ((_sectionVersions[sectionName] || 0) !== versionAtStart) {
      console.warn(`[sections] loadSectionFromCloud(${sectionName}): local edit happened mid-fetch, skipping stale overwrite`);
      return false;
    }
    const { restore, push, conflicts } = reconcile(projectId, table, blob);
    if (restore.length) restoreKeys(blob, restore);
    if (conflicts.length) reportConflict(projectId, table, blob, conflicts);
    // Push after restoring, so what goes up already includes anything the
    // cloud was missing rather than racing it.
    if (push && !conflicts.length) await saveSection(table, projectId, mergeForPush(blob, snapshotTable(table)));
    setSyncedFingerprint(projectId, table, snapshotTable(table), conflicts);
    return restore.length > 0;
  } catch (e) {
    reportSyncFailure(table, 'loadSectionFromCloud', e.message);
    return false;
  }
}

/**
 * Pull ALL sections for a project from Supabase.
 * If a section has no cloud data but has local data, push the local data up.
 * Called once after login, before the route remount.
 */
export async function syncAllSectionsFromCloud(projectId) {
  if (!projectId) return;
  const names = Object.keys(SECTIONS);
  // files reuses the creative table — deduplicate table loads
  const seen = new Set();
  await Promise.all(names.map(async (name) => {
    const { table } = SECTIONS[name];
    if (seen.has(table)) return;
    seen.add(table);

    // Find all section names using this table
    const sameTable = names.filter(n => SECTIONS[n].table === table);
    const versionsAtStart = Object.fromEntries(sameTable.map(n => [n, _sectionVersions[n] || 0]));
    try {
      const blob = await loadSection(table, projectId);
      const changedMidFetch = sameTable.some(n => (_sectionVersions[n] || 0) !== versionsAtStart[n]);
      if (changedMidFetch) {
        console.warn(`[sections] syncAllSectionsFromCloud(${table}): local edit happened mid-fetch, skipping stale overwrite`);
        return;
      }
      const { restore, push, conflicts } = reconcile(projectId, table, blob);
      if (restore.length) restoreKeys(blob, restore);
      if (conflicts.length) reportConflict(projectId, table, blob, conflicts);
      // Hold off pushing while a key is contested: local is only *one* of two
      // valid states, and sending it up would overwrite the other one in the
      // cloud — turning a recoverable conflict into real data loss.
      if (push && !conflicts.length) {
        const merged = mergeForPush(blob, snapshotTable(table));
        if (Object.keys(merged).length) await saveSection(table, projectId, merged);
      }
      setSyncedFingerprint(projectId, table, snapshotTable(table), conflicts);
    } catch (e) {
      reportSyncFailure(table, 'syncAllSectionsFromCloud', e.message);
    }
  }));
}

/**
 * Push ALL sections for a project to Supabase from localStorage.
 * Used when switching projects or on explicit save-all.
 */
export async function pushAllSectionsToCloud(projectId) {
  if (!projectId) return;
  // Merge all sections that share a table into one blob
  const byTable = {};
  for (const [name, cfg] of Object.entries(SECTIONS)) {
    // A section this member may only read is left out of the push entirely,
    // rather than sent and rejected — the cloud copy stays whatever the people
    // who may edit it last agreed on.
    if (!mayWriteSection(name)) continue;
    if (!byTable[cfg.table]) byTable[cfg.table] = {};
    Object.assign(byTable[cfg.table], snapshotSection(name));
  }
  await Promise.all(
    Object.entries(byTable).map(async ([table, blob]) => {
      if (!Object.keys(blob).length) return;
      try {
        await saveSection(table, projectId, blob);
        setSyncedFingerprint(projectId, table, blob);
      }
      catch (e) { reportSyncFailure(table, 'pushAllSectionsToCloud', e.message); }
    })
  );
}
