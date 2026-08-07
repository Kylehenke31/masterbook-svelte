/**
 * approval.js — what happens the moment an expense is approved.
 *
 * Approval is the point the paperwork becomes real: the charge joins its
 * card's open Credit Card Log, and its receipt is filed into Dropbox. Both
 * used to wait until someone generated a log, which meant an approved receipt
 * could sit unfiled indefinitely.
 *
 * "Paid" is deliberately not consulted. A credit card charge has already been
 * made by the time anyone approves it — approval is the admin confirming the
 * details are right, not authorising a payment. Paid is a reconciliation flag
 * ticked later, and gating log membership on it left approved receipts
 * stranded until someone remembered.
 *
 * Every step is best-effort and reported rather than thrown: a Dropbox outage
 * must not be able to block an approval, but it must not pass silently either
 * — an unfiled receipt is invisible until an auditor goes looking for it.
 */

import { getActiveProjectId } from '../stores/project.js';
import { getOrOpenCCLog } from './db.js';
import { fileCCLogReceipts, isDropboxConnected } from './dropbox.js';

const CARDS_KEY = 'movie-ledger-credit-cards';

function reportApprovalProblem(message, folder) {
  console.warn('[approval]', message);
  window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
    detail: {
      table: 'dropbox', operation: 'fileOnApproval',
      message: `${folder ? `Folder ${folder}: ` : ''}${message}`,
      at: new Date().toISOString(),
    },
  }));
}

function findCard(purchase) {
  let cards = [];
  try { cards = JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch {}
  return cards.find(c => c.cardType === purchase.ccCardType && c.last4 === purchase.ccLast4) || null;
}

/**
 * Approving a Purchase Order.
 *
 * A PO is a document in its own right rather than a line on a periodic log, so
 * there is no log to join — approval renders its Summary PDF once and files it
 * under Purchase Orders.
 *
 * The PDF is rendered a single time and used for both the Dropbox copy and the
 * download. Rendering twice risked the filed copy and the one in the approver's
 * hands differing if the record changed in between.
 *
 * Approval is also what makes the PO an actual in the budget — see the filter
 * in budget.js. Payment is tracked separately by the Paid flag, which is what
 * the Purchase Orders log uses as its outstanding-payments checklist.
 */
async function onPurchaseOrderApproved(purchase, applyChanges) {
  if (purchase.poSummaryFiled) return { alreadyFiled: true };

  let bytes;
  try {
    const { buildPOSummaryPDF } = await import('./poSummary.js');
    bytes = await buildPOSummaryPDF(purchase);
  } catch (e) {
    reportApprovalProblem(`the PO Summary could not be generated — ${e.message}`, purchase.folder);
    return { problem: e.message };
  }

  // Hand the approver their copy regardless of whether Dropbox is reachable.
  try {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_Summary_${purchase.poNumber || 'unknown'}_${(purchase.vendor || 'Vendor').replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { /* a failed download must not stop the filing */ }

  try {
    if (!(await isDropboxConnected())) {
      reportApprovalProblem('approved, but Dropbox is not connected so the PO was not filed', purchase.folder);
      return { filed: false, problem: 'dropbox not connected' };
    }
    const { filePurchaseOrder } = await import('./dropbox.js');
    const { filename } = await filePurchaseOrder(purchase, bytes);
    applyChanges(purchase.id, { poSummaryGenerated: true, poSummaryFiled: true, poFilename: filename });
    return { filed: true, filename };
  } catch (e) {
    reportApprovalProblem(`the PO could not be filed to Dropbox — ${e.message}`, purchase.folder);
    applyChanges(purchase.id, { poSummaryGenerated: true });
    return { filed: false, problem: e.message };
  }
}

/**
 * Run the side effects of approving a purchase.
 *
 * @param purchase        the freshly-approved record
 * @param applyChanges    (id, changes) => void — how to persist the log stamp
 * @returns {Promise<{ logNumber?: string, filed?: boolean, problem?: string }>}
 */
export async function onPurchaseApproved(purchase, applyChanges) {
  if (!purchase) return {};
  if (purchase.method === 'PO') return onPurchaseOrderApproved(purchase, applyChanges);
  if (purchase.method !== 'CC') return {};   // only CC charges belong to a CC Log

  const projectId = getActiveProjectId();
  if (!projectId) return {};

  const card = findCard(purchase);
  if (!card) {
    reportApprovalProblem(
      `no credit card on file matches ${purchase.ccCardType || '?'} ${purchase.ccLast4 || '????'}, so it could not join a log`,
      purchase.folder);
    return { problem: 'card not found' };
  }

  // Join the card's open log, opening one if this is the first charge.
  let log;
  try {
    log = await getOrOpenCCLog(projectId, `${card.cardType} ${card.last4}`);
  } catch (e) {
    reportApprovalProblem(`could not open a credit card log — ${e.message}`, purchase.folder);
    return { problem: e.message };
  }
  applyChanges(purchase.id, { ccLogId: log.id, ccLogNumber: log.log_number });

  // File the receipt now rather than at packaging.
  if (!purchase.receiptUrl) return { logNumber: log.log_number, filed: false };
  try {
    if (!(await isDropboxConnected())) {
      reportApprovalProblem('approved, but Dropbox is not connected so the receipt was not filed', purchase.folder);
      return { logNumber: log.log_number, filed: false, problem: 'dropbox not connected' };
    }
    const stamped = { ...purchase, ccLogId: log.id, ccLogNumber: log.log_number };
    const result = await fileCCLogReceipts(card, log.log_number, [stamped]);
    if (result.failedCount) {
      reportApprovalProblem(`receipt could not be filed to Dropbox — ${result.failed?.[0]?.message || 'unknown error'}`, purchase.folder);
      return { logNumber: log.log_number, filed: false, problem: 'upload failed' };
    }
    return { logNumber: log.log_number, filed: true };
  } catch (e) {
    reportApprovalProblem(`receipt could not be filed to Dropbox — ${e.message}`, purchase.folder);
    return { logNumber: log.log_number, filed: false, problem: e.message };
  }
}
