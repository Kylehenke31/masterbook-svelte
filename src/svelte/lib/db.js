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
/**
 * Create a project row with a plain INSERT.
 *
 * Deliberately not upsert. PostgREST's upsert is INSERT ... ON CONFLICT DO
 * UPDATE, and Postgres evaluates the UPDATE policy's WITH CHECK for that
 * statement — projects_admin_update requires admin on the project. Nobody is
 * an admin of a project that does not exist yet, so creating one by upsert
 * fails with "new row violates row-level security policy" while the INSERT
 * policy it appears to be failing is perfectly satisfied.
 *
 * That is the whole deadlock: the upsert needs admin, admin comes from the
 * trigger on insert, and the insert never happens. A plain INSERT is subject
 * only to projects_insert_own — owner_id = auth.uid() — which the creator
 * always satisfies.
 */
export async function cloudInsertProject(project) {
  const user = await getUser();
  if (!user) return { ok: false, error: 'not signed in' };
  const { error } = await supabase
    .from('projects')
    .insert({ id: project.id, owner_id: user.id, data: project });
  if (!error) return { ok: true };
  console.warn('[db] cloudInsertProject error:', error.message);
  return { ok: false, error: error.message };
}

export async function cloudSaveProject(project) {
  const user = await getUser();
  if (!user) return;
  const { error } = await supabase
    .from('projects')
    .upsert({ id: project.id, owner_id: user.id, data: project });
  if (!error) return { ok: true };
  // Reported, not just logged, and the outcome is returned rather than
  // discarded. A project that never reaches the cloud has no row, so the
  // trigger that makes its creator an admin never fires, and every later thing
  // gated on membership fails somewhere far away — a receipt upload denied by
  // RLS, with nothing connecting it back to here.
  // The insert policy is `owner_id = auth.uid()`, so a refusal usually means
  // the id we sent and the id the database resolved from the token disagree.
  // Checked rather than assumed — assuming they matched is what hid this for
  // several rounds — but only reported when they actually differ, since the
  // matching case says nothing and every line printed on a healthy failure is
  // a line someone has to read past on the next one.
  let mismatch = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const raw = session?.access_token?.split('.')[1];
    const sub = raw ? JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))).sub : null;
    if (sub && sub !== user.id) {
      mismatch = `\n  the session and the request disagree about who you are —` +
                 `\n  owner_id sent: ${user.id}\n  token subject: ${sub}`;
    }
  } catch { /* an unreadable token is not worth failing the save report over */ }

  console.warn(`[db] cloudSaveProject error: ${error.message}${mismatch}`);
  window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
    detail: {
      table: 'projects', operation: 'cloudSaveProject',
      message: `the project was saved on this device only — ${error.message}`,
      at: new Date().toISOString(),
    },
  }));
  return { ok: false, error: error.message };
}

/**
 * Ask the database to record you as admin of a project you own.
 *
 * Needed because project_members can only be written by an existing admin, so
 * a project whose creating trigger did not fire has no members and no way to
 * gain any. claim_project_admin is security definer and grants admin only to
 * the account recorded as the project's owner, asking for itself.
 */
export async function claimProjectAdmin(projectId) {
  const { data, error } = await supabase.rpc('claim_project_admin', { p_project_id: projectId });
  if (error) {
    console.warn('[db] claimProjectAdmin error:', error.message);
    return { ok: false, reason: 'rpc_error', error: error.message };
  }
  // 'granted' | 'no_such_project' | 'no_owner_recorded' | 'not_owner' | 'not_signed_in'
  return { ok: data === 'granted', reason: data };
}


/**
 * Remove yourself from a project.
 *
 * Needs the RPC for the same reason claiming admin does: project_members can
 * only be written by an admin, so without it the only way off a project is to
 * ask somebody else. Refuses to strand a project with no admins.
 */
export async function leaveProject(projectId) {
  const { data, error } = await supabase.rpc('leave_project', { p_project_id: projectId });
  if (error) {
    console.warn('[db] leaveProject error:', error.message);
    return { ok: false, reason: 'rpc_error', error: error.message };
  }
  // 'left' | 'not_a_member' | 'last_admin' | 'not_signed_in'
  return { ok: data === 'left', reason: data };
}

/** Delete a project you own but may not be a member of. */
export async function deleteOwnedProject(projectId) {
  const { data, error } = await supabase.rpc('delete_owned_project', { p_project_id: projectId });
  if (error) {
    console.warn('[db] deleteOwnedProject error:', error.message);
    return { ok: false, reason: 'rpc_error', error: error.message };
  }
  return { ok: data === 'deleted', reason: data };
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

/**
 * The signed-in user's own membership — { role, permissions } — or null.
 *
 * This is what every permission check wants, rather than the role alone:
 * "may they approve" is edit on Expenses however it was granted, and asking
 * only for the role hides a plain crew member who holds it.
 */
export async function loadMyMembership(projectId, userId = null) {
  const uid = userId ?? (await getUser())?.id;
  if (!uid || !projectId) return null;
  const { data, error } = await supabase
    .from('project_members')
    .select('role, permissions')
    .eq('project_id', projectId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) { console.warn('[db] loadMyMembership error:', error.message); return null; }
  return data ? { role: data.role, permissions: data.permissions || {} } : null;
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

/* ── Project access: members and invites ─────────────────────────
 *
 * Distinct from project.staff, which is a contact list that auto-imports into
 * the Crew List. These are people with a login and a set of permissions.
 */

/** Members with their grants, plus profile fields for display. */
export async function listMembersWithPermissions(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role, permissions, created_at, profiles ( display_name, email )')
    .eq('project_id', projectId);
  if (error) { console.warn('[db] listMembersWithPermissions error:', error.message); return []; }
  return (data ?? []).map(r => ({
    userId: r.user_id,
    role: r.role,
    permissions: r.permissions || {},
    displayName: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || 'Unknown',
    email: r.profiles?.email || '',
    since: r.created_at,
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Invites that have not been claimed yet. Admin-visible only, per RLS. */
export async function listPendingInvites(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_invites')
    .select('id, email, role, permissions, created_at')
    .eq('project_id', projectId)
    .is('accepted_at', null)
    .order('created_at');
  if (error) { console.warn('[db] listPendingInvites error:', error.message); return []; }
  return data ?? [];
}

/**
 * Invite someone by email.
 *
 * Records the intended permissions against the address rather than sending
 * anything — whoever signs up with it claims the invite. No mail yet; that is
 * separate work so it can be designed alongside the app's other sending.
 *
 * Upserts on (project_id, email) so re-inviting someone revises the pending
 * invite instead of failing on the unique constraint.
 */
export async function inviteMember(projectId, email, role, permissions) {
  const user = await getUser();
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) throw new Error('An email address is required');
  const { error } = await supabase
    .from('project_invites')
    .upsert({ project_id: projectId, email: clean, role, permissions: permissions || {},
              invited_by: user?.id ?? null, accepted_at: null },
            { onConflict: 'project_id,email' });
  if (error) throw new Error(`Could not create the invite: ${error.message}`);
}

export async function cancelInvite(inviteId) {
  const { error } = await supabase.from('project_invites').delete().eq('id', inviteId);
  if (error) throw new Error(`Could not cancel the invite: ${error.message}`);
}

/** Change what an existing member can reach. Admin-only, enforced by RLS. */
export async function updateMemberAccess(projectId, userId, role, permissions) {
  const { data, error } = await supabase
    .from('project_members')
    .update({ role, permissions: permissions || {} })
    .eq('project_id', projectId).eq('user_id', userId)
    .select();
  if (error) throw new Error(`Could not update permissions: ${error.message}`);
  if (!data?.length) throw new Error('Only an admin can change project permissions.');
}

/** Remove someone from the project entirely. Their submissions stay. */
export async function removeMember(projectId, userId) {
  const { data, error } = await supabase
    .from('project_members')
    .delete().eq('project_id', projectId).eq('user_id', userId)
    .select();
  if (error) throw new Error(`Could not remove that member: ${error.message}`);
  if (!data?.length) throw new Error('Only an admin can remove a member.');
}

/**
 * Claim any invites addressed to the signed-in user's email.
 * Safe to call on every sign-in: already-claimed invites are skipped.
 */
export async function acceptPendingInvites() {
  const { data, error } = await supabase.rpc('accept_project_invites');
  if (error) { console.warn('[db] acceptPendingInvites error:', error.message); return 0; }
  return data ?? 0;
}

/* ── Credit Card Logs ────────────────────────────────────────────
 *
 * Each card has exactly one open log at a time. Charges accumulate into it;
 * packaging locks it and opens the next. A locked log freezes the charges on
 * it — enforced by RLS (see migration 20260806030000), not here.
 */

/** Every log for a card, oldest first. */
export async function listCCLogs(projectId, cardKey) {
  if (!projectId || !cardKey) return [];
  const { data, error } = await supabase
    .from('cc_logs')
    .select('*')
    .eq('project_id', projectId)
    .eq('card_key', cardKey)
    .order('log_number');
  if (error) { console.warn('[db] listCCLogs error:', error.message); return []; }
  return data ?? [];
}

/**
 * The card's open log, opening one if there isn't a current one.
 *
 * Numbering continues from the highest log this card has ever had, rather than
 * counting existing rows — a deleted or reopened log must not cause a number
 * to be reused, since the number is printed on filed receipts.
 */
export async function getOrOpenCCLog(projectId, cardKey) {
  if (!projectId || !cardKey) throw new Error('Project and card are required');
  const logs = await listCCLogs(projectId, cardKey);
  const open = logs.find(l => l.status === 'open');
  if (open) return open;

  const highest = logs.reduce((m, l) => Math.max(m, parseInt(l.log_number, 10) || 0), 0);
  const next = String(highest + 1).padStart(3, '0');
  const { data, error } = await supabase
    .from('cc_logs')
    .insert({ project_id: projectId, card_key: cardKey, log_number: next })
    .select()
    .maybeSingle();
  // A unique index enforces one open log per card, so a race here surfaces as
  // a conflict rather than a forked sequence. Re-read and take the winner.
  if (error) {
    const retry = await listCCLogs(projectId, cardKey);
    const found = retry.find(l => l.status === 'open');
    if (found) return found;
    throw new Error(`Could not open a log: ${error.message}`);
  }
  return data;
}

/** Lock a log. Its charges become frozen from this point. */
export async function packageCCLog(logId) {
  const user = await getUser();
  const { error } = await supabase
    .from('cc_logs')
    .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: user?.id ?? null })
    .eq('id', logId);
  if (error) throw new Error(`Could not package the log: ${error.message}`);
}

/** Reopen a locked log, thawing its charges. Admin only, enforced by RLS. */
export async function reopenCCLog(logId) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('cc_logs')
    .update({ status: 'open', reopened_at: new Date().toISOString(), reopened_by: user?.id ?? null })
    .eq('id', logId)
    .select();
  if (error) throw new Error(`Could not reopen the log: ${error.message}`);
  // RLS returns zero rows rather than an error when the caller is not an admin.
  if (!data?.length) throw new Error('Only an admin can reopen a packaged log.');
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

// "tempdocs" was the original name and no such bucket ever existed, so nothing
// is stored under it. Receipts are not temporary — they are the evidence
// behind an approved expense — so the bucket is named for what it holds.
const RECEIPTS_BUCKET = 'receipts';

/**
 * Store a receipt PDF and return the reference kept on the purchase.
 *
 * Path is {project_id}/{purchase_id}.pdf, so access follows project
 * membership — an approver has to be able to open a receipt somebody else
 * submitted, which a user-scoped path cannot express.
 *
 * Throws rather than returning null. This used to swallow the error, which is
 * how every upload could fail with "Bucket not found" for the entire life of
 * the feature while each draft was cheerfully saved with no receipt attached.
 */
export async function uploadDraftReceipt(projectId, purchaseId, bytes, kind = '') {
  const user = await getUser();
  if (!user) throw new Error('Not signed in — cannot store the document');
  if (!projectId) throw new Error('No active project — cannot store the document');
  // `kind` distinguishes the several PDFs one purchase can carry — the receipt
  // itself, a W9, payment instructions — which otherwise collide on one path.
  const suffix = kind ? `_${kind}` : '';
  const path = `${projectId}/${purchaseId}${suffix}.pdf`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
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
