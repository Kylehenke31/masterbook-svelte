const { createRequire } = await import('node:module'); const require = createRequire('file:///Users/kylehenke/masterbook-svelte/');
/**
 * Tenant-isolation test against the LOCAL Supabase stack.
 * Keys below are the Supabase CLI's fixed local development keys — they are
 * identical on every machine and grant nothing outside this container.
 */
const { createClient } = require('/Users/kylehenke/masterbook-svelte/node_modules/@supabase/supabase-js/dist/index.cjs');

const API = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
}

async function makeUser(email) {
  await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { client: c, id: data.user.id };
}

const uuid = () => crypto.randomUUID();
// Unique per run: the suite asserts on exact row counts, so reusing identities
// across runs against the same database would accumulate state and fail.
const RUN = crypto.randomUUID().slice(0, 8);

const alice = await makeUser(`alice-${RUN}@test.local`);
const bob   = await makeUser(`bob-${RUN}@test.local`);
const carol = await makeUser(`carol-${RUN}@test.local`);

// ── profiles auto-created by the on_auth_user_created trigger ──
{
  const { data } = await admin.from('profiles').select('id, email').like('email', `%-${RUN}@test.local`);
  const emails = (data || []).map(r => r.email).sort();
  check('profile row auto-created for each new user',
    ['alice','bob','carol'].every(n => emails.includes(`${n}-${RUN}@test.local`)),
    emails.join(',') || 'none');
}

// ── project creation ──
const P1 = uuid(), P2 = uuid();
{
  const { error } = await alice.client.from('projects')
    .insert({ id: P1, owner_id: alice.id, data: { title: 'Alice Production' } });
  check('owner can create a project', !error, error?.message || '');
}
{
  const { error } = await bob.client.from('projects')
    .insert({ id: P2, owner_id: bob.id, data: { title: 'Bob Production' } });
  check('second owner can create a separate project', !error, error?.message || '');
}

// ── owner auto-enrolled as admin by the on_project_created trigger ──
{
  const { data } = await admin.from('project_members').select('project_id, user_id, role');
  const a = (data || []).find(m => m.project_id === P1 && m.user_id === alice.id);
  check('creator auto-enrolled as admin', a?.role === 'admin', a?.role || 'no membership row');
}

// ── the core isolation claim ──
{
  const { data } = await alice.client.from('projects').select('id');
  check('alice sees ONLY her project',
    data?.length === 1 && data[0].id === P1, `saw ${data?.length ?? 0}`);
}
{
  const { data } = await bob.client.from('projects').select('id');
  check('bob sees ONLY his project',
    data?.length === 1 && data[0].id === P2, `saw ${data?.length ?? 0}`);
}
{
  const { data } = await carol.client.from('projects').select('id');
  check('carol (no membership) sees NOTHING', (data?.length ?? 0) === 0, `saw ${data?.length ?? 0}`);
}

// ── data in a project follows membership ──
const PUR1 = uuid();
{
  const { error } = await alice.client.from('purchases')
    .insert({ id: PUR1, project_id: P1, data: { vendor: 'Foto-Kem', amount: 3475 } });
  check('member can insert a purchase', !error, error?.message || '');
}
{
  const { data } = await bob.client.from('purchases').select('id').eq('project_id', P1);
  check('bob CANNOT read another project\'s purchases', (data?.length ?? 0) === 0, `saw ${data?.length ?? 0}`);
}
{
  const { error } = await bob.client.from('purchases')
    .insert({ id: uuid(), project_id: P1, data: { vendor: 'Injected', amount: 1 } });
  check('bob CANNOT insert into another project', !!error, error ? 'blocked' : 'INSERT SUCCEEDED');
}
{
  const { data, error } = await bob.client.from('purchases')
    .update({ data: { vendor: 'Hijacked' } }).eq('id', PUR1).select();
  check('bob CANNOT update another project\'s purchase',
    (data?.length ?? 0) === 0, error ? 'blocked' : `updated ${data?.length ?? 0} rows`);
}
{
  const { data } = await bob.client.from('purchases').delete().eq('id', PUR1).select();
  check('bob CANNOT delete another project\'s purchase',
    (data?.length ?? 0) === 0, `deleted ${data?.length ?? 0} rows`);
}

// ── adding a member grants access ──
{
  const { error } = await alice.client.from('project_members')
    .insert({ project_id: P1, user_id: carol.id, role: 'accounting' });
  check('admin can add a member', !error, error?.message || '');
}
{
  const { data } = await carol.client.from('purchases').select('id').eq('project_id', P1);
  check('added member NOW sees the project\'s purchases', data?.length === 1, `saw ${data?.length ?? 0}`);
}

// ── role separation ──
{
  const { error } = await carol.client.from('project_members')
    .insert({ project_id: P1, user_id: bob.id, role: 'admin' });
  check('non-admin member CANNOT add members', !!error, error ? 'blocked' : 'INSERT SUCCEEDED');
}
{
  const { data } = await carol.client.from('projects')
    .update({ data: { title: 'Renamed by accountant' } }).eq('id', P1).select();
  check('non-admin CANNOT update the project', (data?.length ?? 0) === 0, `updated ${data?.length ?? 0}`);
}

// ── recursion guard: the thing SECURITY DEFINER exists to prevent ──
{
  const t0 = Date.now();
  const { data, error } = await carol.client.from('project_members').select('project_id, role');
  const ms = Date.now() - t0;
  check('project_members query does not recurse (SECURITY DEFINER)',
    !error && ms < 3000, error ? error.message : `${data?.length ?? 0} rows in ${ms}ms`);
}

// ── co-member visibility for name display ──
{
  const { data } = await carol.client.from('profiles').select('email');
  const emails = (data || []).map(r => r.email).sort();
  check('co-members can see each other\'s profiles',
    emails.includes(`alice-${RUN}@test.local`) && emails.includes(`carol-${RUN}@test.local`),
    emails.join(',') || 'none');
}
{
  const { data } = await carol.client.from('profiles').select('email');
  check('non-co-member profile stays hidden',
    !(data || []).some(r => r.email === `bob-${RUN}@test.local`),
    (data || []).map(r => r.email).join(','));
}

// ── every project-scoped table enforces membership ──
const TABLES = ['budgets','calendars','call_sheets','channels','creative','credit_cards',
                'insurance','messages','personnel','petty_cash','schedules','vendors'];
const leaks = [];
for (const t of TABLES) {
  await admin.from(t).insert(
    t === 'messages' ? { project_id: P1, data: {} } :
    t === 'channels' ? { project_id: P1, data: {} } : { project_id: P1, data: { secret: true } }
  );
  const { data } = await bob.client.from(t).select('project_id').eq('project_id', P1);
  if ((data?.length ?? 0) > 0) leaks.push(t);
}
check(`all ${TABLES.length} project-scoped tables block non-members`,
  leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(', ')}` : 'no leaks');

// ── report ──
const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
