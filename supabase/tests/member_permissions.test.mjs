/**
 * Per-feature member permissions — LOCAL stack only.
 *
 *     supabase start && node supabase/tests/member_permissions.test.mjs
 *
 * Built around the case that motivated the feature: a Production Designer who
 * edits her own creative department, reads the others, files her own expenses,
 * and cannot approve anything.
 *
 * Note what this suite does NOT claim. Read restriction is currently enforced
 * in the interface, not the database — the submission form's pickers need
 * blanket read access to cards, envelopes and budget lines. So the assertions
 * here are about WRITES, which is where a bypass fabricates records.
 */
const { createRequire } = await import('node:module');
const require = createRequire('file:///Users/kylehenke/masterbook-svelte/');
const { createClient } = require('/Users/kylehenke/masterbook-svelte/node_modules/@supabase/supabase-js/dist/index.cjs');

const API = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
const RUN = crypto.randomUUID().slice(0, 8);
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

async function makeUser(tag) {
  const email = `${tag}-${RUN}@test.local`;
  await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (error) throw new Error(`${tag}: ${error.message}`);
  return { client: c, id: data.user.id, email };
}

const owner    = await makeUser('owner');       // Project Admin
const designer = await makeUser('designer');    // Production Designer
const acct     = await makeUser('acct');        // Accounting, by grants not role

const PID = crypto.randomUUID();
await owner.client.from('projects').insert({ id: PID, owner_id: owner.id, data: { title: 'Permissions Test' } });

// The Production Designer: edits her department, reads two others, no ledger grant.
await owner.client.from('project_members').insert({
  project_id: PID, user_id: designer.id, role: 'crew',
  permissions: { creative_prod_design: 'edit', creative_camera: 'read',
                 creative_costume: 'read', schedules: 'read' },
});
// Accounting via explicit grants rather than the legacy role name.
await owner.client.from('project_members').insert({
  project_id: PID, user_id: acct.id, role: 'crew',
  permissions: { expenses: 'edit', budget: 'edit', credit_cards: 'edit', vendors: 'edit' },
});

const hasFeature = async (client, feature, level) => {
  const { data } = await client.rpc('has_feature', {
    p_project_id: PID, p_feature: feature, p_min_level: level });
  return data === true;
};

/* ── The grant map reads back as written ── */
check('designer has edit on her own department',
  await hasFeature(designer.client, 'creative_prod_design', 'edit'));
check('designer has read on another department',
  await hasFeature(designer.client, 'creative_camera', 'read'));
check('designer does NOT have edit on another department',
  !(await hasFeature(designer.client, 'creative_camera', 'edit')));
check('designer has no expenses grant at all',
  !(await hasFeature(designer.client, 'expenses', 'read')));
check('admin holds every feature without listing them',
  await hasFeature(owner.client, 'petty_cash', 'edit') &&
  await hasFeature(owner.client, 'creative_stunts', 'edit'));

/* ── Filing your own expenses needs no ledger grant ── */
let designerCharge;
{
  designerCharge = crypto.randomUUID();
  const { error } = await designer.client.from('purchases').insert({
    id: designerCharge, project_id: PID,
    data: { id: designerCharge, vendor: 'Paint Supply', amount: 220, status: 'In Review',
            submittedByUserId: designer.id },
  });
  check('designer CAN file her own expense without an Expenses grant', !error, error?.message || '');
}
{
  const { data } = await designer.client.from('purchases').select('id').eq('id', designerCharge);
  check('designer can see her own submission', (data || []).length === 1);
}

/* ── But she cannot review ── */
{
  const { data } = await designer.client.from('purchases')
    .update({ data: { id: designerCharge, vendor: 'Paint Supply', amount: 220,
                      status: 'Approved', submittedByUserId: designer.id } })
    .eq('id', designerCharge).select();
  check('designer CANNOT approve her own expense', (data || []).length === 0);
}
{
  const other = crypto.randomUUID();
  await admin.from('purchases').insert({
    id: other, project_id: PID,
    data: { id: other, vendor: 'Someone Else', amount: 50, status: 'In Review', submittedByUserId: acct.id },
  });
  const { data } = await designer.client.from('purchases')
    .update({ data: { id: other, vendor: 'Hijacked', amount: 50, status: 'In Review', submittedByUserId: acct.id } })
    .eq('id', other).select();
  check('designer CANNOT edit someone else\'s expense', (data || []).length === 0);
}

/* ── An expenses:edit grant confers review, without being an admin ── */
{
  const { data } = await acct.client.from('purchases')
    .update({ data: { id: designerCharge, vendor: 'Paint Supply', amount: 220,
                      status: 'Approved', submittedByUserId: designer.id } })
    .eq('id', designerCharge).select();
  check('a member with expenses:edit CAN approve, without admin', (data || []).length === 1);
}

/* ── Financial blob writes follow the grant ── */
{
  const { error } = await designer.client.from('budgets')
    .upsert({ project_id: PID, data: { 'movie-ledger-budget': 'tampered' } });
  check('designer CANNOT write the budget', !!error, error ? 'blocked' : 'WRITE SUCCEEDED');
}
{
  const { error } = await acct.client.from('budgets')
    .upsert({ project_id: PID, data: { 'movie-ledger-budget': 'legit' } });
  check('a member with budget:edit CAN write the budget', !error, error?.message || '');
}
{
  const { error } = await designer.client.from('credit_cards')
    .upsert({ project_id: PID, data: { 'movie-ledger-credit-cards': '[]' } });
  check('designer CANNOT write the card list', !!error, error ? 'blocked' : 'WRITE SUCCEEDED');
}

/* ── Invites ── */
{
  const email = `invitee-${RUN}@test.local`;
  const { error } = await owner.client.from('project_invites').insert({
    project_id: PID, email, role: 'crew',
    permissions: { creative_camera: 'edit' }, invited_by: owner.id });
  check('admin CAN create an invite', !error, error?.message || '');

  const { error: e2 } = await designer.client.from('project_invites').insert({
    project_id: PID, email: `sneaky-${RUN}@test.local`, permissions: {} });
  check('a non-admin CANNOT invite anyone', !!e2, e2 ? 'blocked' : 'INSERT SUCCEEDED');

  // The invitee signs up afterwards and claims it.
  const invitee = await makeUser(`invitee`);
  const { data: claimed } = await invitee.client.rpc('accept_project_invites');
  check('signing up claims the invite', claimed === 1, `claimed ${claimed}`);
  const { data: mem } = await admin.from('project_members')
    .select('permissions').eq('project_id', PID).eq('user_id', invitee.id).maybeSingle();
  check('the invited permissions carried across',
    mem?.permissions?.creative_camera === 'edit', JSON.stringify(mem?.permissions));
  const { data: again } = await invitee.client.rpc('accept_project_invites');
  check('claiming twice is a no-op', again === 0, `claimed ${again}`);
}

/* ── Removal ── */
{
  const { data } = await owner.client.from('project_members')
    .delete().eq('project_id', PID).eq('user_id', designer.id).select();
  check('admin CAN remove a member', (data || []).length === 1);
  const { data: seen } = await designer.client.from('projects').select('id').eq('id', PID);
  check('a removed member loses sight of the project', (seen || []).length === 0, `saw ${seen?.length ?? 0}`);
}

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
