/**
 * approval.js — what happens the moment an expense is committed.
 *
 * Commit is the point the paperwork becomes real: the charge joins its card's
 * open Credit Card Log, and its receipt is filed into Dropbox. Both used to
 * wait until someone generated a log, which meant a settled receipt could sit
 * unfiled indefinitely.
 *
 * Approval is a step short of this and has no side effects at all. Sign-offs
 * accumulate on a record as opinions — two accountants and then a line
 * producer — and none of them writes anything. Only commit does, which is why
 * commit is the action restricted to admins and accountants: it is the only
 * way an action inside this app can put a file in the production's Dropbox.
 *
 * "Paid" is deliberately not consulted. A credit card charge has already been
 * made by the time anyone reviews it — committing is confirming the details
 * are right, not authorising a payment. Paid is a reconciliation flag ticked
 * later, and gating log membership on it left settled receipts stranded until
 * someone remembered.
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
 * Voiding a Purchase Order: mark its Dropbox folder as void.
 *
 * Called after the record is voided, and best-effort like everything else
 * here — a Dropbox outage must not prevent someone voiding a PO, but the
 * folder then disagrees with the books until it is renamed, so a failure is
 * reported rather than swallowed.
 *
 * The Dropbox folder is named from poNumber and vendor, and voidPurchase
 * changes neither — it only rewrites status and the ledger folder number. So
 * the record can be read either side of the void; the caller passes the
 * pre-void copy simply because it has it to hand.
 */
export async function onPurchaseOrderVoided(purchase) {
  if (!purchase || purchase.method !== 'PO') return {};
  if (!purchase.poSummaryFiled) return { nothingFiled: true };
  try {
    if (!(await isDropboxConnected())) {
      reportApprovalProblem('voided, but Dropbox is not connected so its folder was not marked VOID', purchase.folder);
      return { renamed: false, problem: 'dropbox not connected' };
    }
    const { voidPurchaseOrderFolder } = await import('./dropbox.js');
    const result = await voidPurchaseOrderFolder(purchase);
    if (!result) {
      // poSummaryFiled is the books saying this PO's packet was filed, so its
      // folder should be there to rename. That it is not means the two
      // disagree — most likely a PO filed before each one got its own folder.
      // Silence here is the worst answer: it reads as a clean void while the
      // paperwork still sits under its live name, which is precisely what
      // someone following the paper trail later would be misled by.
      reportApprovalProblem('voided, but no Dropbox folder was found to mark VOID', purchase.folder);
      return { renamed: false, nothingToRename: true };
    }
    return { renamed: true, ...result };
  } catch (e) {
    reportApprovalProblem(`its Dropbox folder could not be marked VOID — ${e.message}`, purchase.folder);
    return { renamed: false, problem: e.message };
  }
}

/**
 * Committing a Purchase Order.
 *
 * A PO is a document in its own right rather than a line on a periodic log, so
 * there is no log to join — commit renders its Summary PDF once and files it
 * under Purchase Orders.
 *
 * The PDF is rendered a single time and used for both the Dropbox copy and the
 * download. Rendering twice risked the filed copy and the one in the approver's
 * hands differing if the record changed in between.
 *
 * Commit is also what makes the PO an actual in the budget — see the filter
 * in budget.js. Payment is tracked separately by the Paid flag, which is what
 * the Purchase Orders log uses as its outstanding-payments checklist.
 */
async function onPurchaseOrderCommitted(purchase, applyChanges) {
  if (purchase.poSummaryFiled) return { alreadyFiled: true };

  // The filed document is the whole packet: topsheet, invoice, payment
  // instructions, W9 — in that order. Filing only the topsheet meant the
  // paperwork behind an approval lived in three places, which is exactly what
  // makes it unfindable later.
  let bytes, packet = { included: [], missing: [] };
  try {
    const { buildPOSummaryPDF } = await import('./poSummary.js');
    const summary = await buildPOSummaryPDF(purchase);
    const { buildPOPacket } = await import('./poPacket.js');
    packet = await buildPOPacket(purchase, summary);
    bytes = packet.bytes;
  } catch (e) {
    reportApprovalProblem(`the PO document could not be generated — ${e.message}`, purchase.folder);
    return { problem: e.message };
  }

  // Where this goes is the project's filing plan's decision, not this
  // function's — Dropbox, a folder on this computer, or the committer's own
  // Downloads. What stays here is what the document *is* and what it is
  // called, which is knowledge that belongs with the document.
  const { fileDocument } = await import('./fileDocument.js');
  const localName = `PO-${purchase.poNumber || 'unknown'}_${(purchase.vendor || 'Vendor').replace(/\s+/g, '_')}.pdf`;
  const poFolder = `PO-${purchase.poNumber || '0000'}_${purchase.vendor || 'Unknown'}`;

  const result = await fileDocument({
    bytes,
    filename: localName,
    folderId: '01-accounting/purchase-orders',
    subfolder: poFolder,
    describe: `PO-${purchase.poNumber || 'unknown'}`,
    dropboxFile: async (b) => {
      const { filePurchaseOrder } = await import('./dropbox.js');
      return await filePurchaseOrder(purchase, b);
    },
  });

  if (result.filed) {
    applyChanges(purchase.id, {
      poSummaryGenerated: true, poSummaryFiled: true,
      poFilename: result.filename || localName,
      poPacketIncluded: packet.included,
      poFiledTo: result.destination,
    });
    // Say what went in. A packet missing its invoice is filed and valid, but
    // somebody should know it went out that way rather than discover it later.
    if (packet.missing.length) {
      reportApprovalProblem(
        `filed without ${packet.missing.join(' or ')} — nothing was attached for ${packet.missing.length > 1 ? 'those' : 'that'}`,
        purchase.folder);
    }
    return { filed: true, filename: result.filename || localName, destination: result.destination,
             included: packet.included, missing: packet.missing };
  }

  applyChanges(purchase.id, { poSummaryGenerated: true });

  // A project set to keep its own files is working as configured — reporting
  // that as a problem would train people to ignore the warning that matters.
  if (result.destination === 'manual' && !result.degradedFrom) {
    return { filed: false, downloaded: result.downloaded, manual: true };
  }
  if (result.skipped) {
    return { filed: false, downloaded: result.downloaded, skipped: true };
  }
  reportApprovalProblem(
    result.problem
      ? `the PO could not be filed — ${result.problem}. It was downloaded instead.`
      : `${result.reason || 'the PO was not filed'} — it was downloaded instead.`,
    purchase.folder);
  return { filed: false, downloaded: result.downloaded, problem: result.problem || result.reason };
}

/**
 * Run the side effects of committing a purchase.
 *
 * Committing, not approving. Approvals accumulate as opinions and carry no
 * consequences; commit is the single decision that files the paperwork and
 * puts the money in the budget, and it is restricted to admins and
 * accountants. Hanging these effects off approval would mean the first
 * reviewer to click caused a write to the production's Dropbox.
 *
 * @param purchase        the freshly-committed record
 * @param applyChanges    (id, changes) => void — how to persist the log stamp
 * @returns {Promise<{ logNumber?: string, filed?: boolean, problem?: string }>}
 */
export async function onPurchaseCommitted(purchase, applyChanges) {
  if (!purchase) return {};
  if (purchase.method === 'PO') return onPurchaseOrderCommitted(purchase, applyChanges);
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

  const stamped = { ...purchase, ccLogId: log.id, ccLogNumber: log.log_number };
  const { fileAttachments } = await import('./fileDocument.js');
  const { ccReceiptFilename } = await import('./dropbox.js');

  const result = await fileAttachments({
    items: [{ ref: purchase.receiptUrl, filename: ccReceiptFilename(stamped, log.log_number) }],
    folderId: '01-accounting/credit-cards',
    // The same card folder Dropbox uses, so a production that switches between
    // the two finds its receipts in the same place either way.
    subfolder: `${card.cardType} ${card.last4}_${card.cardholderName}/Receipts`,
    describe: purchase.folder || 'this charge',
    dropboxFile: () => fileCCLogReceipts(card, log.log_number, [stamped]),
  });

  // Joining the log is the part that matters to the books, and it already
  // happened — so a receipt that was skipped by choice is not a problem to
  // report. One that failed is.
  if (result.filedCount) return { logNumber: log.log_number, filed: true, destination: result.destination };
  if (result.manual || result.skipped) {
    return { logNumber: log.log_number, filed: false, manual: result.manual, skipped: result.skipped };
  }
  reportApprovalProblem(
    `the charge joined log ${log.log_number}, but its receipt was not filed — ${result.problem || result.failed?.[0]?.message || result.reason || 'unknown error'}`,
    purchase.folder);
  return { logNumber: log.log_number, filed: false, problem: result.problem || 'upload failed' };
}
