/**
 * Unit tests for the sync divergence guard.
 *
 *     node supabase/tests/sync_reconcile.test.mjs
 *
 * No database, no browser — decideKeys() is pure on purpose, because it is the
 * function that decides whether a user's unpushed work gets destroyed.
 */
import { decideKeys, fingerprint, fingerprintBlob, mergeForPush } from '../../src/svelte/lib/syncReconcile.js';

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  check(name, a === e, a === e ? '' : `got ${a}, want ${e}`);
};

const R = (restore = [], push = false, conflicts = []) => ({ restore, push, conflicts });

/* ── One side only: always safe ── */
eq('key only in cloud -> restore it',
  decideKeys({}, { a: '1' }, null), R(['a'], false, []));
eq('key only in local -> push, never dropped',
  decideKeys({ a: '1' }, {}, null), R([], true, []));
eq('both empty -> nothing to do',
  decideKeys({}, {}, null), R([], false, []));
eq('identical values -> nothing to do',
  decideKeys({ a: '1' }, { a: '1' }, null), R([], false, []));

/* ── The case that lost data before this guard existed ── */
eq('both changed, never synced -> conflict, local untouched',
  decideKeys({ a: '1' }, { a: '2' }, null), R([], false, ['a']));

/* ── With a recorded agreement the answer is unambiguous ── */
eq('only cloud moved -> restore',
  decideKeys({ a: '1' }, { a: '2' }, { a: fingerprint('1') }), R(['a'], false, []));
eq('only local moved -> push',
  decideKeys({ a: '2' }, { a: '1' }, { a: fingerprint('1') }), R([], true, []));
eq('both moved from a common base -> conflict',
  decideKeys({ a: '2' }, { a: '3' }, { a: fingerprint('1') }), R([], false, ['a']));

/* ── Per-key independence: the reason this is not decided per table ──
   Real case from 2026-08-04: the budgets blob held a 66 KB budget present only
   in the cloud alongside a genuinely contested counter. Judging the table as a
   whole blocked the safe restore. */
eq('a conflict on one key does not block a safe restore of another',
  decideKeys(
    { 'movie-ledger-v2': 'local-ledger' },
    { 'movie-ledger-v2': 'cloud-ledger', 'movie-ledger-budget': 'big-budget' },
    null),
  R(['movie-ledger-budget'], false, ['movie-ledger-v2']));

/* ── Regression: the credit-cards scenario from 2026-08-04 ──
   One browser held the only copy of a card; the cloud table had just been
   created. A second browser then pushed a different card. The first browser
   must not silently lose its own. */
eq('regression: unpushed local card is not clobbered by a foreign cloud copy',
  decideKeys(
    { 'movie-ledger-credit-cards': '[{"last4":"9773","cardholderName":"Kyle Henke"}]' },
    { 'movie-ledger-credit-cards': '[{"last4":"0000","cardholderName":"Test"}]' },
    null),
  R([], false, ['movie-ledger-credit-cards']));

/* ── Mixed batch ── */
eq('restore, push and conflict can all occur together',
  decideKeys(
    { same: 'x', localOnly: 'L', contested: 'mine' },
    { same: 'x', cloudOnly: 'C', contested: 'theirs' },
    null),
  R(['cloudOnly'], true, ['contested']));

/* ── Fingerprint properties ── */
check('fingerprint is stable', fingerprint('abc') === fingerprint('abc'));
check('fingerprint differs for different values', fingerprint('abc') !== fingerprint('abd'));
check('absent is distinguishable from empty string', fingerprint(null) !== fingerprint(''));
eq('fingerprintBlob covers every key',
  Object.keys(fingerprintBlob({ a: '1', b: '2' })).sort(), ['a', 'b']);

/* ── An empty-string value is data, not absence ── */
eq('empty-string cloud value still counts as present',
  decideKeys({ a: 'x' }, { a: '' }, null), R([], false, ['a']));


/* ── mergeForPush semantics ──
   saveSection replaces the whole data column, so a push built only from this
   browser's localStorage deletes every key it happens to be missing. That is
   not hypothetical: it erased a credit card that existed only in the cloud. */

eq('push preserves a cloud-only key this browser never had',
  mergeForPush({ 'movie-ledger-credit-cards': 'CARD', counters: '{}' }, { counters: '{"a":1}' }),
  { 'movie-ledger-credit-cards': 'CARD', counters: '{"a":1}' });
eq('push lets local win for keys it holds',
  mergeForPush({ a: 'cloud' }, { a: 'local' }), { a: 'local' });
eq('push with no cloud row is just local',
  mergeForPush(null, { a: 'local' }), { a: 'local' });


/* ── Retired keys must never be restored ──
   movie-ledger-v2 used to be carried in the budgets blob. The stale copy left
   there is seed data. Once the key is no longer owned by the section, it must
   be ignored — restoring it would write ten demo purchases over a real ledger.
   sections.js enforces this by filtering the cloud blob to known keys before
   calling decideKeys, so the retired key never reaches this function. */
{
  const known = new Set(['movie-ledger-budget']);
  const filterToKnown = blob => Object.fromEntries(
    Object.entries(blob).filter(([k]) => known.has(k)));
  const cloud = { 'movie-ledger-budget': 'real', 'movie-ledger-v2': 'SEED-DATA' };
  eq('retired key is filtered out before any restore decision',
    decideKeys({}, filterToKnown(cloud), null), R(['movie-ledger-budget'], false, []));
  check('retired key never appears in a restore list',
    !decideKeys({}, filterToKnown(cloud), null).restore.includes('movie-ledger-v2'));
}

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
