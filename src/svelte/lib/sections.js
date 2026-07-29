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
      'movie-ledger-v2',
      'movie-ledger-budget',
      'movie-ledger-budget-lock',
      'movie-ledger-hot-costs',
      'movie-ledger-fringe-actuals',
      'movie-ledger-counters-v2',
      'movie-ledger-po-counter-v1',
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
    keys: ['movie-ledger-credit-cards', 'movie-ledger-cc-log-counters-v1'],
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

/* ── Cloud save / load ──────────────────────────────────────────── */

/**
 * Push a single section to Supabase from the current localStorage state.
 * Fire-and-forget — caller does not need to await.
 */
export async function saveSectionToCloud(sectionName, projectId) {
  if (!projectId) return;
  const { table } = SECTIONS[sectionName];
  const blob = snapshotSection(sectionName);
  if (!Object.keys(blob).length) return; // nothing to save
  try {
    await saveSection(table, projectId, blob);
  } catch (e) {
    console.warn(`[sections] saveSectionToCloud(${sectionName}) failed:`, e.message);
  }
}

/**
 * Pull a single section from Supabase and write it to localStorage.
 * Returns true if cloud data was found.
 */
export async function loadSectionFromCloud(sectionName, projectId) {
  if (!projectId) return false;
  const { table } = SECTIONS[sectionName];
  try {
    const blob = await loadSection(table, projectId);
    if (blob) {
      restoreSection(sectionName, blob);
      return true;
    }
    return false;
  } catch (e) {
    console.warn(`[sections] loadSectionFromCloud(${sectionName}) failed:`, e.message);
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
    try {
      const blob = await loadSection(table, projectId);
      if (blob) {
        // Restore each section that uses this table
        for (const n of sameTable) restoreSection(n, blob);
      } else {
        // No cloud data — push local data up if any section has content
        const merged = {};
        for (const n of sameTable) {
          if (sectionHasData(n)) Object.assign(merged, snapshotSection(n));
        }
        if (Object.keys(merged).length) {
          await saveSection(table, projectId, merged);
        }
      }
    } catch (e) {
      console.warn(`[sections] syncAllSectionsFromCloud(${table}) failed:`, e.message);
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
    if (!byTable[cfg.table]) byTable[cfg.table] = {};
    Object.assign(byTable[cfg.table], snapshotSection(name));
  }
  await Promise.all(
    Object.entries(byTable).map(async ([table, blob]) => {
      if (!Object.keys(blob).length) return;
      try { await saveSection(table, projectId, blob); }
      catch (e) { console.warn(`[sections] pushAllSectionsToCloud(${table}) failed:`, e.message); }
    })
  );
}
