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
