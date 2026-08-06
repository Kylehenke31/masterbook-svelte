/**
 * Credit Card Log lifecycle tests — LOCAL stack only.
 *
 *     supabase start && node supabase/tests/cc_log_lock.test.mjs
 *
 * The claim under test: packaging a log freezes the charges on it. That is the
 * entire point of packaging — the log PDF states what was submitted, and if
 * the charges behind it stayed editable the PDF would quietly stop being true.
 *
 * Asserted in both directions, because a freeze that blocks everything would
 * pass every "cannot" while making the feature useless.
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
  return { client: c, id: data.user.id };
}

const owner    = await makeUser('owner');     // admin
const acct     = await makeUser('acct');      // accounting
const crew     = await makeUser('crew');      // crew, and the submitter

const PID = crypto.randomUUID();
await owner.client.from('projects').insert({ id: PID, owner_id: owner.id, data: { title: 'CC Log Test' } });
await owner.client.from('project_members').insert({ project_id: PID, user_id: acct.id, role: 'accounting' });
await owner.client.from('project_members').insert({ project_id: PID, user_id: crew.id, role: 'crew' });

const CARD = 'VISA 9773';

/* ── Opening a log ── */
let log001;
{
  const { data, error } = await acct.client.from('cc_logs')
    .insert({ project_id: PID, card_key: CARD, log_number: '001' }).select().maybeSingle();
  log001 = data;
  check('a member can open a log', !error && !!data, error?.message || '');
  check('a new log starts open', data?.status === 'open', data?.status || 'none');
}
{
  const { error } = await acct.client.from('cc_logs')
    .insert({ project_id: PID, card_key: CARD, log_number: '002' });
  check('a card cannot have two open logs at once', !!error, error ? 'blocked' : 'SECOND OPEN LOG CREATED');
}

/* ── A charge on an open log stays editable ── */
const chargeId = crypto.randomUUID();
await admin.from('purchases').insert({
  id: chargeId, project_id: PID,
  data: { id: chargeId, vendor: 'Foto-Kem', amount: 500, status: 'Approved', paid: true,
          method: 'CC', ccLast4: '9773', submittedByUserId: crew.id, ccLogId: log001.id },
});
const editAs = async (client, vendor) => {
  const { data: cur } = await admin.from('purchases').select('data').eq('id', chargeId).maybeSingle();
  const { data } = await client.from('purchases')
    .update({ data: { ...cur.data, vendor } }).eq('id', chargeId).select();
  return (data || []).length > 0;
};
check('accounting CAN edit a charge while its log is open', await editAs(acct.client, 'Edited while open'));

/* ── Packaging freezes it ── */
{
  const { error } = await acct.client.from('cc_logs')
    .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: acct.id })
    .eq('id', log001.id);
  check('a member can package (lock) the open log', !error, error?.message || '');
}
check('accounting CANNOT edit a charge once its log is packaged',
  !(await editAs(acct.client, 'Edited after lock')));
check('admin CANNOT edit it either — the freeze is not a permission level',
  !(await editAs(owner.client, 'Admin override attempt')));
{
  const { data } = await owner.client.from('purchases').delete().eq('id', chargeId).select();
  check('a frozen charge cannot be deleted', (data || []).length === 0);
}
{
  const { data } = await acct.client.from('purchases').select('id').eq('id', chargeId);
  check('a frozen charge is still readable', (data || []).length === 1);
}

/* ── Only an admin can reopen ── */
{
  const { data } = await acct.client.from('cc_logs')
    .update({ status: 'open' }).eq('id', log001.id).select();
  check('accounting CANNOT reopen a locked log', (data || []).length === 0);
}
{
  const { data, error } = await owner.client.from('cc_logs')
    .update({ status: 'open', reopened_at: new Date().toISOString(), reopened_by: owner.id })
    .eq('id', log001.id).select();
  check('admin CAN reopen a locked log', !error && (data || []).length === 1, error?.message || '');
}
check('reopening thaws the charges again', await editAs(acct.client, 'Corrected after reopen'));

/* ── The next log carries the next number ── */
{
  await owner.client.from('cc_logs').update({ status: 'locked' }).eq('id', log001.id);
  const { data, error } = await acct.client.from('cc_logs')
    .insert({ project_id: PID, card_key: CARD, log_number: '002' }).select().maybeSingle();
  check('once 001 is locked, 002 can be opened', !error && data?.log_number === '002', error?.message || '');
  const { data: all } = await acct.client.from('cc_logs').select('log_number, status')
    .eq('project_id', PID).eq('card_key', CARD).order('log_number');
  check('history reads 001 locked, 002 open',
    JSON.stringify(all) === JSON.stringify([
      { log_number: '001', status: 'locked' }, { log_number: '002', status: 'open' }]),
    JSON.stringify(all));
}

/* ── A charge on no log is unaffected ── */
{
  const freeId = crypto.randomUUID();
  await admin.from('purchases').insert({
    id: freeId, project_id: PID,
    data: { id: freeId, vendor: 'Unlogged', amount: 10, status: 'Approved',
            submittedByUserId: crew.id, ccLogId: null },
  });
  const { data: cur } = await admin.from('purchases').select('data').eq('id', freeId).maybeSingle();
  const { data } = await acct.client.from('purchases')
    .update({ data: { ...cur.data, vendor: 'Still editable' } }).eq('id', freeId).select();
  check('a charge on no log is not frozen by anyone else\'s lock', (data || []).length === 1);
}

/* ── Isolation still holds ── */
{
  const outsider = await makeUser('outsider');
  const { data } = await outsider.client.from('cc_logs').select('id').eq('project_id', PID);
  check('a non-member cannot see this project\'s logs', (data || []).length === 0, `saw ${data?.length ?? 0}`);
}

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
