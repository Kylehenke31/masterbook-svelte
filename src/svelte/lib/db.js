/**
 * db.js — Supabase persistence layer
 *
 * Pure async CRUD — no localStorage, no side effects.
 * All callers handle errors; these functions just throw on failure.
 */
import { supabase } from './supabase.js';

/* ── Auth helper ──────────────────────────────────────────────── */

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/* ── Projects ────────────────────────────────────────────────── */

/**
 * Load all projects owned by the current user.
 * Returns [{ id, data }] — data is the full project object.
 */
export async function cloudLoadProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, data')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

/**
 * Upsert a project. id must be the project's UUID.
 * Silently no-ops if not authenticated.
 */
export async function cloudSaveProject(project) {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase
    .from('projects')
    .upsert({ id: project.id, owner_id: user.id, data: project });
  if (error) console.warn('[db] cloudSaveProject error:', error.message);
}

/* ── Purchases ───────────────────────────────────────────────── */

/**
 * Load all purchases for a project, newest first.
 * Returns the plain purchase objects (extracted from the data column).
 */
export async function cloudLoadPurchases(projectId) {
  const { data, error } = await supabase
    .from('purchases')
    .select('data')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => r.data);
}

/**
 * Upsert a single purchase. Uses the purchase's own UUID as the row id.
 */
export async function cloudSavePurchase(projectId, purchase) {
  const { error } = await supabase
    .from('purchases')
    .upsert({ id: purchase.id, project_id: projectId, data: purchase });
  if (error) console.warn('[db] cloudSavePurchase error:', error.message);
}

/**
 * Upsert all purchases for a project in one batch.
 * Used for initial push when a user first logs in with existing local data.
 */
export async function cloudSaveAllPurchases(projectId, purchases) {
  if (!purchases.length) return;
  const rows = purchases.map(p => ({ id: p.id, project_id: projectId, data: p }));
  const { error } = await supabase.from('purchases').upsert(rows);
  if (error) console.warn('[db] cloudSaveAllPurchases error:', error.message);
}

/**
 * Hard-delete a purchase by its UUID.
 */
export async function cloudDeletePurchase(purchaseId) {
  const { error } = await supabase.from('purchases').delete().eq('id', purchaseId);
  if (error) console.warn('[db] cloudDeletePurchase error:', error.message);
}

/* ── Generic section tables ──────────────────────────────────── */
// Budget, personnel, calendars, schedules, call sheets, creative,
// vendors, insurance — all use the same upsert pattern.

export async function loadSection(tableName, projectId) {
  const { data, error } = await supabase
    .from(tableName)
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function saveSection(tableName, projectId, sectionData) {
  const { error } = await supabase
    .from(tableName)
    .upsert({ project_id: projectId, data: sectionData });
  if (error) console.warn(`[db] saveSection(${tableName}) error:`, error.message);
}
