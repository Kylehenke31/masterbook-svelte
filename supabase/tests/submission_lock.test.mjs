/**
 * Submission lock tests — LOCAL stack only.
 *
 *     supabase start && node supabase/tests/submission_lock.test.mjs
 *
 * Asserts the rule the review process depends on: once submitted, a record is
 * out of its author's hands until an approver acts. Tested at the database,
 * because a lock that only exists in the UI is a suggestion — the REST
 * endpoint is directly reachable.
 *
 * Both directions are checked. A lock that blocks everything would pass every
 * "cannot" assertion while making the app useless, so every refusal is paired
 * with the permission it must not have taken away.
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

const owner    = await makeUser('owner');     // admin of the project
const author   = await makeUser('author');    // crew — files submissions
const reviewer = await makeUser('reviewer');  // accounting
const other    = await makeUser('other');     // crew — unrelated to the record

const PID = crypto.randomUUID();
await owner.client.from('projects').insert({ id: PID, owner_id: owner.id, data: { title: 'Lock Test' } });
for (const [u, role] of [[author, 'crew'], [reviewer, 'accounting'], [other, 'crew']]) {
  await owner.client.from('project_members').insert({ project_id: PID, user_id: u.id, role });
}

const mk = async (status) => {
  const id = crypto.randomUUID();
  await admin.from('purchases').insert({
    id, project_id: PID,
    data: { id, vendor: 'Test Vendor', amount: 100, status, submittedByUserId: author.id },
  });
  return id;
};
const statusOf = async id => (await admin.from('purchases').select('data').eq('id', id).maybeSingle()).data?.data?.status;
const tryEdit = async (client, id, vendor) => {
  const { data } = await client.from('purchases').update({
    data: { id, vendor, amount: 100, status: await statusOf(id), submittedByUserId: author.id },
  }).eq('id', id).select();
  return (data || []).length > 0;
};

/* ── The author keeps control while it is still theirs ── */
{
  const draft = await mk('Submitted');
  check('author CAN edit their own draft', await tryEdit(author.client, draft, 'Edited draft'));
}
{
  const rejected = await mk('Rejected');
  check('author CAN edit after it is sent back', await tryEdit(author.client, rejected, 'Corrected'));
}
{
  const draft = await mk('Submitted');
  const { data } = await author.client.from('purchases').delete().eq('id', draft).select();
  check('author CAN delete their own draft', (data || []).length === 1);
}

/* ── The lock itself ── */
{
  const inReview = await mk('In Review');
  check('author CANNOT edit once submitted for review',
    !(await tryEdit(author.client, inReview, 'Sneaky edit')));
  const { data } = await author.client.from('purchases').delete().eq('id', inReview).select();
  check('author CANNOT delete once submitted for review', (data || []).length === 0);
}
{
  const pending = await mk('Pending Approval');
  check('author CANNOT edit while pending approval',
    !(await tryEdit(author.client, pending, 'Sneaky edit')));
}
{
  const approved = await mk('Approved');
  check('author CANNOT edit an approved record',
    !(await tryEdit(author.client, approved, 'Post-approval edit')));
  const { data } = await author.client.from('purchases').delete().eq('id', approved).select();
  check('author CANNOT delete an approved record', (data || []).length === 0);
}

/* ── Reviewers are not locked out ── */
{
  const inReview = await mk('In Review');
  check('accounting CAN edit a submission under review',
    await tryEdit(reviewer.client, inReview, 'Reviewer correction'));
  const { data } = await reviewer.client.from('purchases')
    .update({ data: { id: inReview, vendor: 'x', amount: 100, status: 'Approved', submittedByUserId: author.id } })
    .eq('id', inReview).select();
  check('accounting CAN approve it', (data || []).length === 1);
}
{
  const inReview = await mk('In Review');
  const { data } = await owner.client.from('purchases')
    .update({ data: { id: inReview, vendor: 'y', amount: 100, status: 'Rejected', submittedByUserId: author.id } })
    .eq('id', inReview).select();
  check('admin CAN send it back (Rejected)', (data || []).length === 1);
  check('the record is now Rejected', await statusOf(inReview) === 'Rejected');
  check('author CAN edit it again once rejected',
    await tryEdit(author.client, inReview, 'Fixed after rejection'));
}

/* ── Unrelated members ── */
{
  const draft = await mk('Submitted');
  check('another crew member CANNOT edit someone else\'s draft',
    !(await tryEdit(other.client, draft, 'Not mine')));
  const { data } = await other.client.from('purchases').delete().eq('id', draft).select();
  check('another crew member CANNOT delete it', (data || []).length === 0);
}

/* ── Authorship cannot be reassigned on the way through ── */
{
  const rejected = await mk('Rejected');
  const { data } = await author.client.from('purchases').update({
    data: { id: rejected, vendor: 'v', amount: 100, status: 'Rejected', submittedByUserId: other.id },
  }).eq('id', rejected).select();
  check('author CANNOT hand their record to someone else (WITH CHECK)', (data || []).length === 0);
}

/* ── Reading stays open to the project ── */
{
  const inReview = await mk('In Review');
  const { data } = await other.client.from('purchases').select('id').eq('id', inReview);
  check('every member can still READ the books', (data || []).length === 1);
}

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
