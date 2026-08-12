/**
 * Multi-project registry — shared helpers used by App shell,
 * ProjectMenu (Home), and ProjectSettings.
 *
 * Primary store: localStorage (synchronous, used by all components).
 * Cloud layer: Supabase (async, fire-and-forget on writes, authoritative on login).
 */
import { writable } from 'svelte/store';
import { cloudSaveProject, cloudLoadProjects } from '../lib/db.js';

/* ── Storage keys ── */
export const REGISTRY_KEY  = 'movie-ledger-project-registry';
export const ACTIVE_ID_KEY = 'movie-ledger-active-project-id';

/** All localStorage keys that belong to a single project */
export const PROJECT_DATA_KEYS = [
  'movie-ledger-project', 'movie-ledger-v2', 'movie-ledger-budget',
  'movie-ledger-crew', 'movie-ledger-cast', 'movie-ledger-cast-checkcols',
  'movie-ledger-personnel-tab', 'movie-ledger-breakdowns', 'movie-ledger-elements',
  'movie-ledger-one-liner-drafts', 'movie-ledger-one-liner-active',
  'movie-ledger-calendar', 'movie-ledger-crew-daytypes', 'movie-ledger-cal-tz',
  'movie-ledger-vendors', 'movie-ledger-ins-cert', 'movie-ledger-files',
  'movie-ledger-prod-info', 'movie-ledger-callsheets', 'movie-ledger-one-liner',
  'movie-ledger-script-order', 'movie-ledger-calendar-accounting',
  'movie-ledger-daytypes-accounting', 'movie-ledger-cs-email-template',
  'movie-ledger-crew-schedule', 'movie-ledger-cast-v1-backup',
  'movie-ledger-counters-v2', 'movie-ledger-po-counter-v1', 'movie-ledger-budget-lock',
  'movie-ledger-hot-costs', 'movie-ledger-fringe-actuals',
  'movie-ledger-auto-prep', 'anthropic-api-key',
  'movie-ledger-creative', 'movie-ledger-crew-checkcols',
  'movie-ledger-budget-versions', 'movie-ledger-budget-commits',
  'movie-ledger-credit-cards', 'movie-ledger-cc-log-counters-v1',
  'movie-ledger-petty-cash-envelopes',
];

/* ── Reactive store so App shell and other components stay in sync ── */
export const projectStore = writable(null);

export function refreshProjectStore() {
  projectStore.set(getProject());
}

/* ── Project CRUD ── */
export function getProject() {
  try {
    const raw = localStorage.getItem('movie-ledger-project');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveProject(data) {
  localStorage.setItem('movie-ledger-project', JSON.stringify(data));
  const activeId = getActiveProjectId();
  if (activeId) syncRegistryEntry(activeId);
  projectStore.set(data);
  // Cloud sync — inject the registry id since it's not stored inside the data object
  if (activeId) {
    cloudSaveProject({ ...data, id: activeId }).catch(() => {});
  }
}

/**
 * Make sure the active project actually exists in the cloud.
 *
 * A project saved only to localStorage looks completely normal — it opens, it
 * has a name, you can work in it — while having no row in `projects`. With no
 * row, the on_project_created trigger never ran, so the person who made it was
 * never recorded as its admin, and everything gated on membership fails
 * somewhere far from the cause. Submitting a purchase is usually where it
 * shows up, as "Receipt upload failed: new row violates row-level security
 * policy", because the receipts bucket tests membership in the project the
 * upload path names.
 *
 * Inserting the row is what repairs it: that is what fires the trigger.
 *
 * One case this cannot fix, and says so rather than pretending: a row that
 * exists while you are *not* a member of it. cloudLoadProjects only returns
 * projects you belong to, so an orphan looks identical to a missing row from
 * here — but the upsert then resolves to an UPDATE, which needs admin rights
 * you do not have, and fails. The error surfaces through the sync channel
 * instead of being swallowed, which is the most this layer can honestly do.
 */
export async function ensureProjectInCloud() {
  const id = getActiveProjectId();
  const project = getProject();
  if (!id || !project) return { skipped: true };
  try {
    const { cloudLoadProjects, cloudSaveProject, claimProjectAdmin } = await import('../lib/db.js');

    // cloudLoadProjects only returns projects you are a member of, so this
    // says "not visible to me", not "not there" — which is the whole problem.
    const visible = (await cloudLoadProjects()).some(p => p.id === id);

    if (!visible) {
      const saved = await cloudSaveProject({ ...project, id });
      // Checked, not assumed. Reporting a repair that did not happen is worse
      // than reporting nothing: it sends the next hour of debugging somewhere
      // else entirely.
      if (saved && saved.ok === false) {
        console.warn('[project] active project is missing from the cloud and could not be inserted:', saved.error);
        return { failed: true, message: saved.error };
      }
    }

    // Claim admin whether or not the row was just written. A row that already
    // existed without a membership is exactly the state that cannot be fixed
    // any other way — writing to project_members needs an admin, and there
    // isn't one. This is a no-op when membership is already correct.
    const claim = await claimProjectAdmin(id);
    if (claim.ok) {
      console.warn('[project] recorded you as admin of the active project');
      return { repaired: true, claimed: true };
    }
    if (claim.notOwner) {
      console.warn('[project] you are not the owner of the active project, so admin could not be claimed');
      return { notOwner: true };
    }
    return { present: visible, claimFailed: claim.error };
  } catch (e) {
    console.warn('[project] ensureProjectInCloud failed:', e.message);
    return { failed: true, message: e.message };
  }
}

/* ── Registry ── */
export function getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY)) || []; } catch { return []; }
}

export function saveRegistry(reg) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

export function getActiveProjectId() {
  return localStorage.getItem(ACTIVE_ID_KEY) || null;
}

export function setActiveProjectId(id) {
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

export function registerProject(projectId, projectData) {
  const reg = getRegistry();
  if (!reg.find(r => r.id === projectId)) {
    reg.push({
      id: projectId,
      title: projectData.title || '',
      productionNumber: projectData.productionNumber || '',
      budgetTemplate: projectData.budgetTemplate || 'commercial',
      _createdAt: projectData._createdAt || new Date().toISOString(),
      _archived: false,
    });
    saveRegistry(reg);
  }
}

export function syncRegistryEntry(projectId) {
  const reg = getRegistry();
  const p   = getProject();
  const entry = reg.find(r => r.id === projectId);
  if (entry && p) {
    entry.title             = p.title             || entry.title;
    entry.productionNumber  = p.productionNumber  || entry.productionNumber;
    entry.budgetTemplate    = p.budgetTemplate     || entry.budgetTemplate;
    entry._archived         = p._archived          || false;
    saveRegistry(reg);
  }
}

/* ── Snapshot / Restore ── */
export function snapshotProject(projectId) {
  if (!projectId) return;
  for (const key of PROJECT_DATA_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) localStorage.setItem(`ml-${projectId}-${key}`, val);
    else              localStorage.removeItem(`ml-${projectId}-${key}`);
  }
}

export function restoreProject(projectId) {
  for (const key of PROJECT_DATA_KEYS) localStorage.removeItem(key);
  if (!projectId) return;
  for (const key of PROJECT_DATA_KEYS) {
    const val = localStorage.getItem(`ml-${projectId}-${key}`);
    if (val !== null) localStorage.setItem(key, val);
  }
}

export function switchProject(targetId) {
  const currentId = getActiveProjectId();
  if (currentId === targetId) return;
  if (currentId) snapshotProject(currentId);
  restoreProject(targetId);
  setActiveProjectId(targetId);
  syncRegistryEntry(targetId);
  refreshProjectStore();
}

/* ── One-time migration: wrap legacy single-project into registry ── */
export function migrateToMultiProject() {
  const reg      = getRegistry();
  const activeId = getActiveProjectId();
  if (reg.length > 0 || activeId) return; // already migrated
  const p = getProject();
  if (!p?.title) return;
  const id = crypto.randomUUID();
  registerProject(id, p);
  setActiveProjectId(id);
  snapshotProject(id);
}

/* ── Cloud sync ── */

/**
 * Called once after the user signs in.
 * Pulls all projects from Supabase, rebuilds the local registry,
 * and snapshots each project's data into localStorage so the
 * existing synchronous APIs keep working.
 *
 * Returns true if any cloud data was found, false otherwise.
 */
export async function loadProjectsFromCloud() {
  try {
    const cloudProjects = await cloudLoadProjects();
    if (!cloudProjects.length) return false;

    // Rebuild registry from cloud
    const reg = cloudProjects.map(({ id, data }) => ({
      id,
      title:            data.title             || '',
      productionNumber: data.productionNumber  || '',
      budgetTemplate:   data.budgetTemplate    || 'commercial',
      _createdAt:       data._createdAt        || new Date().toISOString(),
      _archived:        data._archived         || false,
    }));
    saveRegistry(reg);

    // Snapshot each project into localStorage so switchProject() works.
    // Strip the injected `id` field — it lives in the registry, not the data blob.
    for (const { id, data } of cloudProjects) {
      const { id: _id, ...projectData } = data;
      localStorage.setItem(`ml-${id}-movie-ledger-project`, JSON.stringify(projectData));
    }

    // Restore whichever project was active (or default to first)
    const currentId = getActiveProjectId();
    const validId   = reg.find(r => r.id === currentId) ? currentId : reg[0]?.id;
    if (validId) {
      setActiveProjectId(validId);
      restoreProject(validId);
    }

    refreshProjectStore();
    return true;
  } catch (e) {
    console.warn('[project] loadProjectsFromCloud failed:', e.message);
    return false;
  }
}

/* ── Display helpers ── */
export function projectFolderName(project) {
  if (!project?.title) return '';
  const num = project.productionNumber || '';
  return num ? `${num}_${project.title}` : project.title;
}

export function getUserInitials() {
  const project = getProject();
  const name    = project?.defaultSubmitter || '';
  const parts   = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}
