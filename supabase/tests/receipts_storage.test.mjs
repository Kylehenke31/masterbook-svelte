/**
 * Receipt storage isolation tests — LOCAL stack only.
 *
 *     supabase start && node supabase/tests/receipts_storage.test.mjs
 *
 * The review workflow needs a receipt to be readable by someone other than the
 * person who uploaded it (an approver), and unreadable by anyone outside the
 * project. Those two facts pull in opposite directions, so they are tested
 * together rather than assumed.
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

const submitter = await makeUser('submitter');
const approver  = await makeUser('approver');
const outsider  = await makeUser('outsider');

const PID = crypto.randomUUID();
await submitter.client.from('projects').insert({ id: PID, owner_id: submitter.id, data: { title: 'Receipts Test' } });
await submitter.client.from('project_members').insert({ project_id: PID, user_id: approver.id, role: 'accounting' });

const purchaseId = crypto.randomUUID();
const path = `${PID}/${purchaseId}.pdf`;
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

/* ── bucket exists ── */
{
  const { data } = await admin.storage.listBuckets();
  check('receipts bucket exists', (data || []).some(b => b.id === 'receipts'),
    (data || []).map(b => b.id).join(',') || 'none');
  const bucket = (data || []).find(b => b.id === 'receipts');
  check('receipts bucket is private', bucket ? bucket.public === false : false,
    bucket ? `public=${bucket.public}` : 'missing');
}

/* ── the submitter can upload ── */
{
  const { error } = await submitter.client.storage.from('receipts')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  check('project member can upload a receipt', !error, error?.message || '');
}

/* ── an approver can read what someone else uploaded ── */
{
  const { data, error } = await approver.client.storage.from('receipts').download(path);
  check('another member can READ it (the approval workflow depends on this)',
    !error && !!data, error?.message || `${data ? 'ok' : 'no data'}`);
}

/* ── an outsider cannot ── */
{
  const { data, error } = await outsider.client.storage.from('receipts').download(path);
  check('a non-member CANNOT read it', !!error || !data, error ? 'blocked' : 'DOWNLOAD SUCCEEDED');
}
{
  const { error } = await outsider.client.storage.from('receipts')
    .upload(`${PID}/${crypto.randomUUID()}.pdf`, pdf, { contentType: 'application/pdf' });
  check('a non-member CANNOT upload into the project', !!error, error ? 'blocked' : 'UPLOAD SUCCEEDED');
}
{
  const { data } = await outsider.client.storage.from('receipts').remove([path]);
  const stillThere = await approver.client.storage.from('receipts').download(path);
  check('a non-member CANNOT delete it', !stillThere.error && !!stillThere.data,
    stillThere.error ? 'FILE GONE' : 'survived');
}

/* ── a malformed object name must deny, not error the query ── */
{
  const { error } = await outsider.client.storage.from('receipts')
    .upload(`not-a-uuid/whatever.pdf`, pdf, { contentType: 'application/pdf' });
  check('malformed path is denied cleanly (try_uuid guard)', !!error, error ? 'blocked' : 'UPLOAD SUCCEEDED');
}

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
