/* ============================================================
   The Masterbook — data.js
   Central data store, seed data, folder numbering, CRUD helpers
   ============================================================ */

/* ── Data Model ──
  {
    id               : string (UUID)
    createdAt        : string (ISO 8601)
    folder           : string (zero-padded, e.g. "0001" or "1003")
    date             : string (YYYY-MM-DD)
    vendor           : string
    method           : "CC" | "PO-CC" | "PO" | "Petty Cash" | "Check" | "Debit" | "ACH" | "Return"
                        (PO-CC is legacy only — new submissions no longer produce it)
    ccLast4          : string | null  (only for CC / PO-CC)
    description      : string         (≤6 words)
    lineItem         : string         (budget line item)
    submittedBy      : string         (display-name snapshot taken at submission)
    submittedByUserId: string | null  (auth user id — the durable identity behind
                                        submittedBy, and what "My Book" filters on.
                                        Null on records created before this existed.)
    status           : "Submitted" | "In Review" | "Approved" | "Pending Approval"
                       | "Rejected" | "Refunded" | "Void" | "Quote"
                       ("Submitted" is a draft saved to the author's profile;
                        "Rejected" is kicked back for correction. Those two are
                        the only states in which the author may edit or delete
                        their own record — enforced by RLS, not just the UI.)
    rejectionReason  : string         (why an approver sent it back; shown to the author)
    rejectedAt       : string | null  (ISO 8601, set alongside rejectionReason)
    amount           : number         (negative for refunds)
    chargeType       : string         (e.g. "Equipment Rental", "Catering", etc.)
    w9Attached       : boolean
    payMethodDocAttached : boolean
    linkedFolder     : string | null  (for Returns, the original folder)
    receiptUrl       : string | null
    notes            : string
    isReturn         : boolean
    isQuote          : boolean

    -- Purchase Order fields (method === "PO") --
    poNumber         : string | null  (zero-padded, e.g. "0001" — separate sequence from `folder`)
    poLineItems      : Array<{ lineNo, qty, item, description, unitPrice }>
                        (lineTotal is never stored — always qty * unitPrice)
    salesperson      : string
    poSummaryGenerated : boolean      (set once the PO Summary PDF has auto-generated)

    -- Petty Cash fields (method === "Petty Cash") --
    pettyCashFund       : string       (legacy free-text — superseded by pettyCashEnvelopeId)
    pettyCashEnvelopeId : string | null (which envelope this charge posts against)

    -- Credit Card fields (method === "CC") --
    ccCardholderName : string         (denormalized copy of the picked Credit Card profile)
    ccCardType       : string         ("VISA" | "AMEX" | "Mastercard", denormalized)
    ccEnvelopeNum    : string         (manually assigned when preparing a CC Log)
    ccReceiptNum     : string         (manually assigned when preparing a CC Log)
    ccLogId          : string | null  (the cc_logs row this charge was packaged into.
                                        A charge belongs to exactly one log, for good.
                                        While the log is locked this charge is frozen —
                                        enforced by RLS via is_cc_log_locked().)
    ccLogNumber      : string | null  (that log's number, denormalized for display and
                                        for the Dropbox receipt filename)
    ccLogNumbers     : Array<string>  (legacy: logs this charge appeared on back when a
                                        charge could be swept into several. Still read
                                        for old records; new ones get ccLogId instead.)

    -- Vendor contact (denormalized copy at submission time; vendor records have no stable id) --
    vendorPhone          : string
    vendorStreetAddress  : string
    vendorCityStateZip   : string
  }
*/

export const DB = {
  purchases: [],
  // Folder counters — persisted alongside purchases
  folderCounters: {
    low: 0,   // 0000–0999: PO, Check, Debit
    high: 0,  // 1000–1999: CC, PO-CC
  },
  // Purchase Order numbering — a separate sequence from folderCounters,
  // since a PO gets both a generic filing "folder" number AND its own PO#.
  poCounter: {
    next: 1,
  },
  // CC Log numbering — one independent sequence per card, keyed by
  // "${cardType} ${last4}" (e.g. "VISA 9773").
  ccLogCounters: {},
};

/* ── Folder Numbering ── */
const FOLDER_LOW_MAX  = 999;
const FOLDER_HIGH_MIN = 1000;
const FOLDER_HIGH_MAX = 1999;
const FOLDER_ALERT_THRESHOLD = 50; // warn when this many remain

/**
 * Determine which range a method belongs to.
 * CC and PO-CC → high range (1000–1999)
 * PO, Check, Debit → low range (0000–0999)
 * Return → inherits linked folder range (caller handles)
 */
export function methodRange(method) {
  if (method === 'CC' || method === 'PO-CC') return 'high';
  return 'low';
}

/**
 * Assign the next folder number for the given method.
 * Returns { folder: string, alert: string|null }
 */
export function assignFolder(method, linkedFolder) {
  if (method === 'Return' && linkedFolder) {
    // Returns re-use the linked folder number
    return { folder: linkedFolder, alert: null };
  }

  const range = methodRange(method);
  let num, formatted, alert = null;

  if (range === 'high') {
    DB.folderCounters.high += 1;
    num = FOLDER_HIGH_MIN + DB.folderCounters.high - 1;
    formatted = String(num).padStart(4, '0');
    const remaining = FOLDER_HIGH_MAX - num;
    if (remaining <= FOLDER_ALERT_THRESHOLD) {
      alert = `CC folder range approaching ceiling: ${remaining} numbers remaining (${formatted}–1999).`;
    }
  } else {
    DB.folderCounters.low += 1;
    num = DB.folderCounters.low - 1;
    formatted = String(num).padStart(4, '0');
    const remaining = FOLDER_LOW_MAX - num;
    if (remaining <= FOLDER_ALERT_THRESHOLD) {
      alert = `PO/Check/Debit folder range approaching ceiling: ${remaining} numbers remaining (${formatted}–0999).`;
    }
  }

  return { folder: formatted, alert };
}

/**
 * Assign the next sequential Purchase Order number ("0001", "0002", ...).
 * Separate sequence from the generic folder numbering above — a PO gets
 * both a filing "folder" number and its own PO#. Never reused/reclaimed,
 * same as folder numbers.
 */
export function assignPONumber() {
  const num = DB.poCounter.next;
  DB.poCounter.next += 1;
  return String(num).padStart(4, '0');
}

/**
 * Assign the next sequential CC Log number for a given card ("001", "002", ...).
 * One independent sequence per card, keyed by "${cardType} ${last4}". A period
 * batch log and a later full-history log both consume from the same sequence —
 * neither is exclusive, since a charge can legitimately appear on more than one log.
 */
export function assignCCLogNumber(cardKey) {
  if (!DB.ccLogCounters[cardKey]) DB.ccLogCounters[cardKey] = { next: 1 };
  const num = DB.ccLogCounters[cardKey].next;
  DB.ccLogCounters[cardKey].next += 1;
  return String(num).padStart(3, '0');
}

/* ── Seed Data ── */
export const SEED_PURCHASES = [
  /* ── 1. Approved + Paid ── */
  {
    id: 'seed-001',
    createdAt: '2026-03-16T09:00:00Z',
    folder: '1000',
    date: '2026-03-16',
    vendor: 'Foto-Kem',
    method: 'CC',
    ccLast4: '4892',
    description: 'Film processing and scanning services',
    lineItem: '5400 – Lab Processing',
    submittedBy: 'Mia Torres',
    status: 'Approved',
    paid: true,
    amount: 3475.00,
    chargeType: 'Lab',
    w9Attached: true,
    payMethodDocAttached: true,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Weekly lab batch, 16mm dailies',
    isReturn: false,
    isQuote: false,
  },
  /* ── 2. Approved + Paid ── */
  {
    id: 'seed-002',
    createdAt: '2026-03-16T14:30:00Z',
    folder: '0001',
    date: '2026-03-16',
    vendor: 'Craft Catering Co.',
    method: 'Check',
    ccLast4: null,
    description: 'On-set catering 35 crew members',
    lineItem: '5900 – Catering & Craft Services',
    submittedBy: 'Sarah Kim',
    status: 'Approved',
    paid: true,
    amount: 1890.50,
    chargeType: 'Catering',
    w9Attached: true,
    payMethodDocAttached: true,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Lunch service day 12, Ext. Warehouse',
    isReturn: false,
    isQuote: false,
  },
  /* ── 3. Approved + Unpaid ── */
  {
    id: 'seed-003',
    createdAt: '2026-03-17T08:45:00Z',
    folder: '1001',
    date: '2026-03-17',
    vendor: 'Sunbelt Rentals',
    method: 'PO-CC',
    ccLast4: '7731',
    description: 'Generator and power distribution rental',
    lineItem: '5300 – Grip & Electric',
    submittedBy: 'Mia Torres',
    status: 'Approved',
    paid: false,
    amount: 2150.00,
    chargeType: 'Equipment Rental',
    w9Attached: true,
    payMethodDocAttached: true,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'PO issued, awaiting final invoice from vendor',
    isReturn: false,
    isQuote: false,
  },
  /* ── 4. Pending Approval ── */
  {
    id: 'seed-004',
    createdAt: '2026-03-17T10:15:00Z',
    folder: '0002',
    date: '2026-03-17',
    vendor: 'Keslow Camera',
    method: 'PO',
    ccLast4: null,
    description: 'ARRI Alexa Mini LF weekly rental',
    lineItem: '5200 – Camera Equipment',
    submittedBy: 'Derek Hall',
    status: 'Pending Approval',
    paid: false,
    amount: 8200.00,
    chargeType: 'Equipment Rental',
    w9Attached: true,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Week 3 of 6-week camera package. Pending producer sign-off.',
    isReturn: false,
    isQuote: false,
  },
  /* ── 5. In Review ── */
  {
    id: 'seed-005',
    createdAt: '2026-03-18T08:00:00Z',
    folder: '0003',
    date: '2026-03-18',
    vendor: 'Art Supply Depot',
    method: 'PO',
    ccLast4: null,
    description: 'Set dressing art supplies mixed media',
    lineItem: '5800 – Art Department',
    submittedBy: 'Rachel Pham',
    status: 'In Review',
    paid: false,
    amount: 1200.00,
    chargeType: 'Art Department',
    w9Attached: false,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Brushes, paint, adhesives, and specialty papers for art dept set dressing. Week 4.',
    isReturn: false,
    isQuote: false,
  },
  /* ── 6. Quote ── */
  {
    id: 'seed-006',
    createdAt: '2026-03-17T09:30:00Z',
    folder: '1002',
    date: '2026-03-17',
    vendor: 'Hollywood Lighting Rentals',
    method: 'CC',
    ccLast4: '4892',
    description: 'LED fixtures grip truck package',
    lineItem: '5300 – Grip & Electric',
    submittedBy: 'Rachel Pham',
    status: 'Quote',
    paid: false,
    amount: 5500.00,
    chargeType: 'Equipment Rental',
    w9Attached: false,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Pending final quote approval before PO issued',
    isReturn: false,
    isQuote: true,
  },
  /* ── 7. Refunded + Paid ── */
  {
    id: 'seed-007',
    createdAt: '2026-03-18T16:00:00Z',
    folder: '0004',
    date: '2026-03-18',
    vendor: 'Craft Catering Co.',
    method: 'Return',
    ccLast4: null,
    description: 'Partial refund unused meals',
    lineItem: '5900 – Catering & Craft Services',
    submittedBy: 'Sarah Kim',
    status: 'Refunded',
    paid: true,
    amount: -315.00,
    chargeType: 'Catering',
    w9Attached: true,
    payMethodDocAttached: false,
    linkedFolder: '0001',
    receiptUrl: null,
    notes: 'Credit memo issued for 7 unused meals from day 12',
    isReturn: true,
    isQuote: false,
  },
  /* ── 8. In Review (sent back for revision) ── */
  {
    id: 'seed-008',
    createdAt: '2026-03-18T13:20:00Z',
    folder: '0005',
    date: '2026-03-18',
    vendor: 'LA Prop House',
    method: 'Check',
    ccLast4: null,
    description: 'Hero prop set dressing period',
    lineItem: '5700 – Props',
    submittedBy: 'Rachel Pham',
    status: 'In Review',
    paid: false,
    amount: 4400.00,
    chargeType: 'Props',
    w9Attached: false,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Sent back for itemized invoice — original was lump sum',
    isReturn: false,
    isQuote: false,
  },
  /* ── 9. Void ── */
  {
    id: 'seed-009',
    createdAt: '2026-03-17T11:00:00Z',
    folder: '0006',
    date: '2026-03-17',
    vendor: 'Pacific Fuels Inc.',
    method: 'Debit',
    ccLast4: null,
    description: 'Diesel fuel generator production week 3',
    lineItem: '5310 – Fuel',
    submittedBy: 'Derek Hall',
    status: 'Void',
    paid: false,
    amount: 680.00,
    chargeType: 'Fuel',
    w9Attached: false,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'Duplicate submission — voided',
    isReturn: false,
    isQuote: false,
  },
  /* ── 10. Approved + Paid ── */
  {
    id: 'seed-010',
    createdAt: '2026-03-19T09:45:00Z',
    folder: '1003',
    date: '2026-03-19',
    vendor: 'Silver Screen Transport',
    method: 'CC',
    ccLast4: '3019',
    description: 'Grip truck and cargo van weekly rental',
    lineItem: '5600 – Transportation',
    submittedBy: 'Derek Hall',
    status: 'Approved',
    paid: true,
    amount: 3400.00,
    chargeType: 'Transportation',
    w9Attached: true,
    payMethodDocAttached: true,
    linkedFolder: null,
    receiptUrl: null,
    notes: 'One 5-ton grip truck + 1 cargo van, week 4 of 6.',
    isReturn: false,
    isQuote: false,
  },
];

/* ── Seed folder counter derivation ── */
function deriveSeedCounters() {
  let low = 0, high = 0, poNext = 1;
  for (const p of SEED_PURCHASES) {
    if (!p.isReturn) {
      const n = parseInt(p.folder, 10);
      if (n >= 1000) high = Math.max(high, n - 999);
      else low = Math.max(low, n + 1);
    }
    const po = parseInt(p.poNumber, 10);
    if (!isNaN(po)) poNext = Math.max(poNext, po + 1);
  }
  DB.folderCounters.low  = low;
  DB.folderCounters.high = high;
  DB.poCounter.next = poNext;
}

/* ── Store Helpers ── */
// Bumped on every local mutation — lets hydrateFromCloud() detect whether
// a local edit landed while its fetch was still in flight, so it doesn't
// clobber a fresher local change with a stale cloud snapshot (see below).
let _mutationVersion = 0;

export function addPurchase(record) {
  const isRefund = record.method === 'Return';
  const purchase = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    paid: false,
    w9Attached: false,
    payMethodDocAttached: false,
    linkedFolder: null,
    receiptUrl: null,
    notes: '',
    isReturn: isRefund,
    isQuote: record.status === 'Quote',
    poNumber: null,
    poLineItems: [],
    salesperson: '',
    poSummaryGenerated: false,
    pettyCashFund: '',
    pettyCashEnvelopeId: null,
    ccCardholderName: '',
    ccCardType: '',
    ccEnvelopeNum: '',
    ccReceiptNum: '',
    ccLogNumbers: [],
    vendorPhone: '',
    vendorStreetAddress: '',
    vendorCityStateZip: '',
    ...record,
  };
  // Refund entries always get "Refunded" status and negative amount
  if (isRefund) {
    purchase.status = 'Refunded';
    purchase.amount = -Math.abs(purchase.amount);
  }
  DB.purchases.unshift(purchase);
  _mutationVersion++;
  persist();
  // Cloud sync — fire and forget, but not silent. A purchase that saves
  // locally and never reaches Supabase looks completely successful to the
  // person who filed it, and only surfaces when an approver cannot find it.
  getCloudHelpers().then(h => {
    if (!h) return;
    const pid = h.getActiveProjectId();
    if (!pid) return;
    h.cloudSavePurchase(pid, purchase).catch(e => {
      console.error('[data] cloudSavePurchase failed:', e);
      window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
        detail: {
          table: 'purchases', operation: 'cloudSavePurchase',
          message: `folder ${purchase.folder || purchase.id} saved on this device only — ${e?.message || 'unknown error'}`,
          at: new Date().toISOString(),
        },
      }));
    });
  });
  return purchase;
}

export function getPurchases() {
  return DB.purchases;
}

export function getPurchaseById(id) {
  return DB.purchases.find(p => p.id === id) ?? null;
}

export function updatePurchase(id, changes) {
  const idx = DB.purchases.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const merged = { ...DB.purchases[idx], ...changes };
  // Keep isReturn in sync with method
  if ('method' in changes) {
    merged.isReturn = merged.method === 'Return';
  }
  // Refund entries always stay "Refunded" and negative
  if (merged.isReturn || merged.method === 'Return') {
    if (merged.status === 'Approved' || merged.status === 'Committed') merged.status = 'Refunded';
    merged.amount = -Math.abs(Number(merged.amount) || 0);
  }
  DB.purchases[idx] = merged;
  _mutationVersion++;
  persist();
  // Cloud sync — fire and forget, but surfaced on failure for the same reason
  // as addPurchase: an edit that only lands locally looks entirely successful.
  getCloudHelpers().then(h => {
    if (!h) return;
    const pid = h.getActiveProjectId();
    if (!pid) return;
    h.cloudSavePurchase(pid, merged).catch(e => {
      console.error('[data] cloudSavePurchase (update) failed:', e);
      window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
        detail: {
          table: 'purchases', operation: 'updatePurchase',
          message: `folder ${merged.folder || merged.id} updated on this device only — ${e?.message || 'unknown error'}`,
          at: new Date().toISOString(),
        },
      }));
    });
  });
  return DB.purchases[idx];
}

export function deletePurchase(id) {
  DB.purchases = DB.purchases.filter(p => p.id !== id);
  _mutationVersion++;
  persist();
  // Cloud sync — fire and forget
  getCloudHelpers().then(h => {
    if (!h) return;
    h.cloudDeletePurchase(id).catch(() => {});
  });
}

export function voidPurchase(id) {
  const p = getPurchaseById(id);
  if (!p) return null;
  // Rename folder: "0001" → "0001 VOID"
  const newFolder = p.folder && !p.folder.includes('VOID')
    ? p.folder + ' VOID'
    : p.folder;
  return updatePurchase(id, { status: 'Void', folder: newFolder });
}

export function togglePaid(id) {
  const p = getPurchaseById(id);
  if (!p) return null;
  return updatePurchase(id, { paid: !p.paid });
}

/**
 * Initials for an approval bubble: "Kyle Henke" → "KH".
 *
 * Stored on the approval rather than derived at render time, because the
 * bubble is a record of who signed off — it should still read "KH" after that
 * person is removed from the project and their profile is no longer loadable.
 */
export function initialsFor(name, email) {
  const src = String(name || '').trim() || String(email || '').split('@')[0] || '';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Record one person's sign-off.
 *
 * Approvals accumulate rather than replacing each other: a show where two
 * accountants review and a line producer commits needs to see all three, and
 * a single-person show simply has one. Nothing here decides whether that is
 * *enough* — that judgement belongs to whoever commits, which is why no
 * minimum is enforced.
 *
 * Re-approving is idempotent. Somebody clicking twice, or revisiting a record
 * they already signed, should not stack duplicate bubbles.
 */
export function approvePurchase(id, approver = {}) {
  const p = getPurchaseById(id);
  if (!p) return null;
  const userId = approver.userId || null;
  const existing = Array.isArray(p.approvals) ? p.approvals : [];
  if (userId && existing.some(a => a.userId === userId)) return p;
  const name = approver.name || approver.email || 'Unknown';
  const approvals = [...existing, {
    userId,
    name,
    initials: initialsFor(approver.name, approver.email),
    at: new Date().toISOString(),
  }];
  return updatePurchase(id, { status: 'Approved', approvals, approvedBy: name });
}

/** Withdraw your own sign-off, for a mind changed before commit. */
export function unapprovePurchase(id, userId) {
  const p = getPurchaseById(id);
  if (!p || !userId) return null;
  const approvals = (p.approvals || []).filter(a => a.userId !== userId);
  return updatePurchase(id, {
    approvals,
    status: approvals.length ? 'Approved' : 'In Review',
    approvedBy: approvals.length ? approvals[approvals.length - 1].name : null,
  });
}

/**
 * Commit a reviewed record — the point it becomes real.
 *
 * Everything that treats an expense as money spent keys on 'Committed', not
 * 'Approved': the budget actuals, the credit card logs, the petty cash
 * balances, the Purchase Orders outstanding total, and the Dropbox filing.
 * Approving is an opinion; committing is the decision, and only an admin or
 * accountant may make it.
 */
export function commitPurchase(id, committer = {}) {
  const p = getPurchaseById(id);
  if (!p) return null;
  return updatePurchase(id, {
    status: 'Committed',
    committedBy: committer.name || committer.email || 'Unknown',
    committedAt: new Date().toISOString(),
  });
}

/**
 * Send a submission back to its author for correction.
 *
 * This used to set 'In Review', which is indistinguishable from a submission
 * nobody has looked at yet — the author had no way to tell "still queued"
 * from "kicked back, needs work", and the review queue showed both the same.
 * 'Rejected' is also the state that unlocks the record for its author again
 * (see the purchases RLS policies): without a distinct status there is no way
 * back out of a lock.
 */
export function sendBackPurchase(id, reason = '') {
  return updatePurchase(id, {
    status: 'Rejected',
    rejectionReason: String(reason || '').trim(),
    rejectedAt: new Date().toISOString(),
    // Sign-offs are cleared. They were given for a version of this record that
    // is about to change, and carrying them forward would show a line producer
    // two accountants' approval of something neither has seen.
    approvals: [],
    approvedBy: null,
  });
}

/* ── LocalStorage Persistence ── */
const STORAGE_KEY        = 'movie-ledger-v2';
const COUNTERS_KEY       = 'movie-ledger-counters-v2';
const PO_COUNTER_KEY     = 'movie-ledger-po-counter-v1';
const CC_LOG_COUNTER_KEY = 'movie-ledger-cc-log-counters-v1';
// Set to 'on' to populate an empty ledger with SEED_PURCHASES. Off by default:
// see the comment in hydrate() for why demo data must never appear unbidden.
const DEMO_SEED_KEY      = 'movie-ledger-demo-seed';

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY,  JSON.stringify(DB.purchases));
    localStorage.setItem(COUNTERS_KEY, JSON.stringify(DB.folderCounters));
    localStorage.setItem(PO_COUNTER_KEY, JSON.stringify(DB.poCounter));
    localStorage.setItem(CC_LOG_COUNTER_KEY, JSON.stringify(DB.ccLogCounters));
  } catch (e) {
    // Almost always QuotaExceededError. This is not recoverable here and it
    // must not pass quietly: the in-memory ledger has the change but storage
    // does not, so the next reload loses it. Re-thrown so the caller (a submit
    // handler, say) can tell the user, rather than reporting success over a
    // write that did not happen.
    console.error('[data] persist failed:', e);
    window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
      detail: {
        table: 'localStorage', operation: 'persist',
        message: e?.name === 'QuotaExceededError'
          ? 'Local storage is full — this change was not saved on this device.'
          : (e?.message || 'could not write to local storage'),
        at: new Date().toISOString(),
      },
    }));
    throw e;
  }
}

/* ── Cloud helpers (imported lazily to avoid circular deps at boot) ── */
async function getCloudHelpers() {
  try {
    const [{ cloudSavePurchase, cloudSaveAllPurchases, cloudDeletePurchase },
           { getActiveProjectId }] = await Promise.all([
      import('./svelte/lib/db.js'),
      import('./svelte/stores/project.js'),
    ]);
    return { cloudSavePurchase, cloudSaveAllPurchases, cloudDeletePurchase, getActiveProjectId };
  } catch { return null; }
}

/**
 * Called once after user signs in.
 * Pulls purchases from Supabase for the active project and replaces
 * the in-memory DB so the purchase log shows cloud data.
 * Dispatches 'masterbook-purchases-loaded' when done so the UI can refresh.
 */
export async function hydrateFromCloud(projectId) {
  if (!projectId) return;
  // Snapshot the mutation version before the fetch — if the user adds,
  // edits, or deletes a purchase while this request is still in flight
  // (very possible right after sign-in/project-switch, when this runs in
  // the background while the UI is already interactive), the cloud
  // snapshot we're about to fetch is stale by the time it lands. Applying
  // it anyway would silently revert that local change until the next
  // reload. Skip the overwrite instead — the fire-and-forget cloud save
  // from that local mutation will reconcile Supabase on its own.
  const versionAtStart = _mutationVersion;
  try {
    const { cloudLoadPurchases } = await import('./svelte/lib/db.js');
    const purchases = await cloudLoadPurchases(projectId);
    if (_mutationVersion !== versionAtStart) {
      console.warn('[data] hydrateFromCloud: local changes happened mid-fetch, skipping stale overwrite');
      return;
    }
    if (!purchases.length) {
      // No cloud data yet — push local data up to Supabase
      const h = await getCloudHelpers();
      if (h && DB.purchases.length) {
        await h.cloudSaveAllPurchases(projectId, DB.purchases).catch(() => {});
      }
      return;
    }
    DB.purchases = purchases;
    // Migrate what came down, and push the result back. Without this the cloud
    // copy keeps saying 'Approved' and re-applies it on every load, so the
    // migration would appear to work and then quietly undo itself.
    let cloudMigrated = false;
    for (const p of DB.purchases) {
      if (migrateApprovedToCommitted(p)) cloudMigrated = true;
    }
    if (cloudMigrated) {
      persist();
      const h = await getCloudHelpers();
      if (h) await h.cloudSaveAllPurchases(projectId, DB.purchases).catch(() => {});
    }
    // Recompute folder counters from cloud data
    let low = 0, high = 0, poNext = 1;
    const ccLogNext = {};
    for (const p of DB.purchases) {
      if (!p.isReturn) {
        const n = parseInt(p.folder, 10);
        if (!isNaN(n)) {
          if (n >= 1000) high = Math.max(high, n - 999);
          else           low  = Math.max(low,  n + 1);
        }
      }
      const po = parseInt(p.poNumber, 10);
      if (!isNaN(po)) poNext = Math.max(poNext, po + 1);
      if (p.ccCardType && p.ccLast4 && Array.isArray(p.ccLogNumbers)) {
        const cardKey = `${p.ccCardType} ${p.ccLast4}`;
        for (const logNum of p.ccLogNumbers) {
          const n = parseInt(logNum, 10);
          if (!isNaN(n)) ccLogNext[cardKey] = Math.max(ccLogNext[cardKey] || 1, n + 1);
        }
      }
    }
    DB.folderCounters = { low, high };
    DB.poCounter = { next: poNext };
    DB.ccLogCounters = Object.fromEntries(
      Object.entries(ccLogNext).map(([k, next]) => [k, { next }])
    );
    persist();
    window.dispatchEvent(new CustomEvent('masterbook-purchases-loaded'));
  } catch (e) {
    console.warn('[data] hydrateFromCloud failed:', e.message);
  }
}

/**
 * 'Approved' used to be the terminal state — it filed the paperwork and posted
 * the budget actual. Those things now happen at 'Committed', so a record
 * approved under the old rule is already committed in every sense that
 * matters; leaving it as 'Approved' would silently drop it out of the budget,
 * the logs and the outstanding totals.
 *
 * Keyed on the absence of `approvals`, which only the new flow ever writes, so
 * this cannot catch a record that was approved-but-not-yet-committed under the
 * new rules — exactly the record it must not touch.
 *
 * Applied to cloud-loaded records as well as local ones. hydrateFromCloud
 * replaces DB.purchases wholesale, so migrating only on the localStorage path
 * meant the migration was undone by the next sync a second later.
 *
 * @returns true when the record was changed.
 */
function migrateApprovedToCommitted(p) {
  if (p.status !== 'Approved' || Array.isArray(p.approvals)) return false;
  p.status = 'Committed';
  p.committedBy = p.approvedBy || 'Migrated';
  p.committedAt = p.approvedAt || new Date().toISOString();
  p.approvals = p.approvedBy
    ? [{ userId: null, name: p.approvedBy, initials: initialsFor(p.approvedBy), at: p.committedAt }]
    : [];
  return true;
}

export function hydrate() {
  const rawPurchases    = localStorage.getItem(STORAGE_KEY);
  const rawCounters     = localStorage.getItem(COUNTERS_KEY);
  const rawPoCounter    = localStorage.getItem(PO_COUNTER_KEY);
  const rawCcLogCounter = localStorage.getItem(CC_LOG_COUNTER_KEY);

  if (rawPurchases) {
    DB.purchases = JSON.parse(rawPurchases);
    DB.folderCounters = rawCounters
      ? JSON.parse(rawCounters)
      : { low: 0, high: 0 };
    DB.poCounter = rawPoCounter
      ? JSON.parse(rawPoCounter)
      : { next: 1 };
    DB.ccLogCounters = rawCcLogCounter
      ? JSON.parse(rawCcLogCounter)
      : {};
    // Migrate: rename "Returned" status → "Refunded" for refund entries,
    // and ensure refund amounts are negative
    let migrated = false;
    for (const p of DB.purchases) {
      if (p.status === 'Returned' && (p.isReturn || p.method === 'Return')) {
        p.status = 'Refunded';
        migrated = true;
      }
      if ((p.isReturn || p.method === 'Return') && p.status !== 'Refunded') {
        p.status = 'Refunded';
        migrated = true;
      }
      if ((p.isReturn || p.method === 'Return') && Number(p.amount) > 0) {
        p.amount = -Math.abs(Number(p.amount));
        migrated = true;
      }
      // Non-refund entries with old "Returned" status → "In Review"
      if (p.status === 'Returned' && !p.isReturn && p.method !== 'Return') {
        p.status = 'In Review';
        migrated = true;
      }
      if (migrateApprovedToCommitted(p)) migrated = true;
    }
    if (migrated) persist();
  } else if (localStorage.getItem(DEMO_SEED_KEY) === 'on') {
    // Demo data is opt-in and must stay that way.
    //
    // This used to run for any project whose ledger was empty, and it called
    // persist() — so ten fictional purchases (Foto-Kem, Keslow Camera, and
    // friends) were written to localStorage indistinguishable from real ones,
    // and from there synced to the cloud. A real project's ledger reached
    // Supabase containing seed-001..seed-010. On a shared production that is
    // fabricated accounting data appearing in someone else's books.
    //
    // An empty project now starts empty.
    DB.purchases = [...SEED_PURCHASES];
    deriveSeedCounters();
    persist();
  } else {
    DB.purchases = [];
    DB.folderCounters = { low: 0, high: 0 };
    DB.poCounter = { next: 1 };
    DB.ccLogCounters = {};
  }
}

/* ── Summary Calculations ── */
export function calcSummary(purchases) {
  let committed = 0, approved = 0, inReview = 0, quotes = 0, refunded = 0;

  for (const p of purchases) {
    if (p.status === 'Void') continue;

    const amt = Number(p.amount) || 0;

    if (p.status === 'Refunded') {
      refunded += Math.abs(amt);   // track as positive for display
      continue;
    }

    switch (p.status) {
      // Committed is the money actually spent — it is what the budget, the
      // logs and the filed paperwork all agree on. Approved is a step short:
      // signed off, waiting for someone to commit it.
      case 'Committed':         committed += amt; break;
      case 'Approved':          approved  += amt; break;
      case 'Pending Approval':  inReview  += amt; break;
      case 'Quote':             quotes    += amt; break;
      case 'In Review':         inReview  += amt; break;
      case 'Submitted':         inReview  += amt; break;
    }
  }

  // Net = everything committed or in-flight minus refunds. Quotes are counted
  // and shown, but deliberately left out: a quote is a price a vendor has
  // offered, not money the production has committed — nobody approved it and
  // nothing is owed on it. Counting it would also double up the moment a quote
  // is accepted, because accepting one means submitting a separate PO for the
  // same money while the quote stays on the log as the record of what was
  // offered.
  const net = committed + approved + inReview - refunded;
  return { net, committed, approved, quotes, refunded, inReview };
}
