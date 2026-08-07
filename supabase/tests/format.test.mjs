/**
 * Formatting rules — no database, no browser.
 *
 *     node supabase/tests/format.test.mjs
 *
 * Currency rounding gets its own tests because the obvious implementation is
 * wrong in a way that is easy to ship and hard to notice: (95.545).toFixed(2)
 * is "95.54", a cent short of what the person typing it meant. On an
 * accounting tool that is the kind of error that surfaces at reconciliation.
 */
import { padReceiptNum, sanitiseCurrencyInput, roundToCents, formatCurrency, normalisePONumber }
  from '../../src/svelte/lib/format.js';

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });
const eq = (name, actual, expected) =>
  check(name, actual === expected, actual === expected ? '' : `got "${actual}", want "${expected}"`);

/* ── What a person may type ── */
eq('digits pass through',            sanitiseCurrencyInput('95'), '95');
eq('commas are dropped, not rejected', sanitiseCurrencyInput('1,250.00'), '1250.00');
eq('letters and symbols are removed', sanitiseCurrencyInput('$9a5b'), '95');
eq('a second decimal point is a typo', sanitiseCurrencyInput('95.54.5'), '95.545');
eq('a lone point survives while typing', sanitiseCurrencyInput('.'), '.');
eq('empty stays empty',              sanitiseCurrencyInput(''), '');
eq('null is not "null"',             sanitiseCurrencyInput(null), '');

/* ── Settling to two decimals ── */
eq('95 becomes 95.00',        formatCurrency('95'), '95.00');
eq('95.5 becomes 95.50',      formatCurrency('95.5'), '95.50');
eq('1,250 becomes 1250.00',   formatCurrency('1,250'), '1250.00');
eq('0.1 becomes 0.10',        formatCurrency('0.1'), '0.10');
eq('blank stays blank',       formatCurrency(''), '');
eq('a lone point is not 0.00', formatCurrency('.'), '');
eq('letters alone give blank', formatCurrency('abc'), '');

/* ── The rounding that toFixed gets wrong ── */
eq('95.545 rounds up to 95.55 (toFixed alone gives 95.54)', formatCurrency('95.545'), '95.55');
eq('12.3456 rounds to 12.35', formatCurrency('12.3456'), '12.35');
eq('12.3444 rounds to 12.34', formatCurrency('12.3444'), '12.34');
eq('2.675 rounds up to 2.68 (the classic float case)', formatCurrency('2.675'), '2.68');
eq('1.005 rounds up to 1.01', formatCurrency('1.005'), '1.01');
eq('exact values are untouched', formatCurrency('100.00'), '100.00');
check('rounding does not drift on a large value', roundToCents(999999.999) === 1000000);

/* ── Negative amounts (refunds) keep their sign ── */
check('a negative rounds away from zero, not toward it', roundToCents(-2.675) === -2.68,
  String(roundToCents(-2.675)));

/* ── PO numbers ── */
eq('7 pads to 0007',      normalisePONumber('7'), '0007');
eq('0007 stays 0007',     normalisePONumber('0007'), '0007');
eq('PO-0007 yields 0007', normalisePONumber('PO-0007'), '0007');
eq('blank stays blank',   normalisePONumber(''), '');
check('"7" and "0007" compare equal — otherwise a clash would be missed',
  normalisePONumber('7') === normalisePONumber('0007'));

/* ── Receipt numbers, unchanged ── */
eq('4 pads to 004',       padReceiptNum(4), '004');
eq('non-numeric is left alone', padReceiptNum('N/A'), 'N/A');

const failed = results.filter(r => !r.pass);
console.log('');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
