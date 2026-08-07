/**
 * format.js — formatting rules shared between what the user sees and what
 * gets written to disk.
 *
 * These live in one place because the same value is rendered in several: the
 * Credit Card Log grid, the generated log summary PDF, and the Dropbox
 * filename. If those formatted a receipt number differently, a receipt would
 * be filed as one thing and listed as another — hard to notice and annoying
 * to reconcile months later.
 */

/**
 * Receipt numbers are three digits: 4 -> "004".
 *
 * Values are padded rather than validated, so the grid can be typed into
 * naturally. Anything non-numeric is left exactly as entered rather than
 * mangled into a wrong number — a receipt marked "N/A" should stay "N/A".
 * Empty stays empty; callers that need a placeholder supply their own.
 */
export function padReceiptNum(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (!/^\d+$/.test(s)) return s;
  return s.padStart(3, '0');
}

/* ── Currency ──────────────────────────────────────────────────── */

/**
 * Keep only what can belong in a typed amount: digits and one decimal point.
 *
 * Commas are dropped rather than rejected — people type "1,250.00" out of
 * habit and mean 1250. A second decimal point is a typo, not a second
 * fraction, so everything after the first is discarded.
 */
export function sanitiseCurrencyInput(raw) {
  let s = String(raw ?? '').replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  return s;
}

/**
 * Round half-up to the cent.
 *
 * toFixed alone is not enough. 95.545 is stored as 95.54499999999999, so
 * (95.545).toFixed(2) yields "95.54" — a cent short of what anyone typing it
 * expects. Scaling with a small epsilon corrects that representation error
 * without shifting values that were already exact.
 */
export function roundToCents(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

/** A typed amount settled to two decimals: "95" -> "95.00". Blank stays blank. */
export function formatCurrency(raw) {
  const cleaned = sanitiseCurrencyInput(raw);
  if (cleaned === '' || cleaned === '.') return '';
  return roundToCents(cleaned).toFixed(2);
}

/**
 * PO numbers are four digits: "7" -> "0007".
 *
 * Used both for display and for comparing a typed number against existing
 * ones, so "7" and "0007" must not read as different POs.
 */
export function normalisePONumber(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  return digits ? digits.padStart(4, '0') : '';
}
