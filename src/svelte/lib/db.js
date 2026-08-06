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
  // Throws rather than warning: callers decide how loudly to fail, and a
  // purchase that never reached the cloud is not something to whisper about.
  if (error) throw new Error(error.message);
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

/* ── Project membership ──────────────────────────────────────── */

/**
 * Everyone on a project, with the profile fields needed to show a name.
 * Returns [{ userId, role, displayName, email }] sorted by display name.
 *
 * RLS restricts this to projects the caller belongs to, so an empty array
 * means "not a member" just as much as it means "no members" — callers should
 * not treat it as an error.
 */
export async function loadProjectMembers(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role, profiles ( display_name, email )')
    .eq('project_id', projectId);
  if (error) { console.warn('[db] loadProjectMembers error:', error.message); return []; }
  return (data ?? [])
    .map(r => ({
      userId:      r.user_id,
      role:        r.role,
      // display_name is only set when the user supplied one at sign-up, so
      // fall back to the email local-part the same way getDisplayName does.
      displayName: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || 'Unknown',
      email:       r.profiles?.email || '',
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The signed-in user's own profile row, or null when not signed in.
 */
export async function loadMyProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error) { console.warn('[db] loadMyProfile error:', error.message); return null; }
  return data ?? null;
}

/**
 * Set the signed-in user's display name.
 *
 * Written to both profiles (what other members can read, and what names a
 * credit card's Dropbox folder) and auth user_metadata (what getDisplayName
 * falls back to before profiles has loaded). Keeping them in step avoids the
 * UI showing two different names for the same person.
 */
export async function updateMyDisplayName(displayName) {
  const user = await getUser();
  if (!user) return null;
  const name = String(displayName || '').trim();
  if (!name) throw new Error('Display name cannot be empty');

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', user.id);
  if (error) throw new Error(error.message);

  const { error: authErr } = await supabase.auth.updateUser({ data: { display_name: name } });
  if (authErr) console.warn('[db] updateMyDisplayName auth metadata error:', authErr.message);
  return name;
}

/** The signed-in user's role on a project, or null if they are not a member. */
export async function getMyProjectRole(projectId) {
  const user = await getUser();
  if (!user || !projectId) return null;
  const { data, error } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) { console.warn('[db] getMyProjectRole error:', error.message); return null; }
  return data?.role ?? null;
}

/* ── Dropbox connection (per-user, not per-project) ─────────────── */

export async function saveDropboxToken(refreshToken) {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase
    .from('dropbox_tokens')
    .upsert({ owner_id: user.id, refresh_token: refreshToken });
  if (error) console.warn('[db] saveDropboxToken error:', error.message);
}

export async function loadDropboxToken() {
  const user = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('dropbox_tokens')
    .select('refresh_token')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error) { console.warn('[db] loadDropboxToken error:', error.message); return null; }
  return data?.refresh_token ?? null;
}

export async function disconnectDropbox() {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase.from('dropbox_tokens').delete().eq('owner_id', user.id);
  if (error) console.warn('[db] disconnectDropbox error:', error.message);
}

/* ── Draft receipt storage ───────────────────────────────────────
   purchase.receiptUrl encodes where a receipt currently lives:
     null                              — no receipt
     data:application/pdf;base64,...   — held temporarily in this browser
     supabase://tempdocs/{path}        — staged in Supabase Storage (draft)
   Storage paths are prefixed with the owner's user id so the bucket's
   RLS policy (folder[0] = auth.uid()) scopes each user to their own files. */

const RECEIPTS_BUCKET = 'tempdocs';

export async function uploadDraftReceipt(projectId, purchaseId, bytes) {
  const user = await getUser();
  if (!user) return null;
  const path = `${user.id}/${projectId}/${purchaseId}.pdf`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) { console.warn('[db] uploadDraftReceipt error:', error.message); return null; }
  return `supabase://${RECEIPTS_BUCKET}/${path}`;
}

/** Accepts a `supabase://{bucket}/{path}` reference, returns an ArrayBuffer of the file's bytes. */
export async function downloadDraftReceipt(supabaseUrl) {
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(supabaseUrl || '');
  if (!match) return null;
  const [, bucket, path] = match;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) { console.warn('[db] downloadDraftReceipt error:', error.message); return null; }
  return await data.arrayBuffer();
}

export async function deleteDraftReceipt(supabaseUrl) {
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(supabaseUrl || '');
  if (!match) return;
  const [, bucket, path] = match;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.warn('[db] deleteDraftReceipt error:', error.message);
}
