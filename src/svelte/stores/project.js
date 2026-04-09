/**
 * Multi-project registry — shared helpers used by App shell,
 * ProjectMenu (Home), and ProjectSettings.
 *
 * All data lives in localStorage; no Svelte state here so it
 * can be imported as a plain ES module by any component.
 */
import { writable } from 'svelte/store';

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
  'movie-ledger-counters-v2', 'movie-ledger-budget-lock',
  'movie-ledger-hot-costs', 'movie-ledger-fringe-actuals',
  'movie-ledger-auto-prep', 'anthropic-api-key',
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
