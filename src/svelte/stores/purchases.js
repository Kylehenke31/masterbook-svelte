/**
 * purchases.js — Svelte store version of src/data.js
 * Wraps all purchase CRUD + folder numbering + persistence in reactive stores.
 * Original src/data.js is untouched.
 */

import { writable, get } from 'svelte/store';

// ── Storage Keys ──────────────────────────────────────────────
const STORAGE_KEY  = 'movie-ledger-v2';
const COUNTERS_KEY = 'movie-ledger-counters-v2';

// ── Seed Data ─────────────────────────────────────────────────
export const SEED_PURCHASES = [
  {
    id: 'seed-001', createdAt: '2026-03-16T09:00:00Z', folder: '1000',
    date: '2026-03-16', vendor: 'Foto-Kem', method: 'CC', ccLast4: '4892',
    description: 'Film processing and scanning services',
    lineItem: '5400 – Lab Processing', submittedBy: 'Mia Torres',
    status: 'Approved', paid: true, amount: 3475.00, chargeType: 'Lab',
    w9Attached: true, payMethodDocAttached: true, linkedFolder: null,
    receiptUrl: null, notes: 'Weekly lab batch, 16mm dailies', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-002', createdAt: '2026-03-16T14:30:00Z', folder: '0001',
    date: '2026-03-16', vendor: 'Craft Catering Co.', method: 'Check', ccLast4: null,
    description: 'On-set catering 35 crew members',
    lineItem: '5900 – Catering & Craft Services', submittedBy: 'Sarah Kim',
    status: 'Approved', paid: true, amount: 1890.50, chargeType: 'Catering',
    w9Attached: true, payMethodDocAttached: true, linkedFolder: null,
    receiptUrl: null, notes: 'Lunch service day 12, Ext. Warehouse', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-003', createdAt: '2026-03-17T08:45:00Z', folder: '1001',
    date: '2026-03-17', vendor: 'Sunbelt Rentals', method: 'PO-CC', ccLast4: '7731',
    description: 'Generator and power distribution rental',
    lineItem: '5300 – Grip & Electric', submittedBy: 'Mia Torres',
    status: 'Approved', paid: false, amount: 2150.00, chargeType: 'Equipment Rental',
    w9Attached: true, payMethodDocAttached: true, linkedFolder: null,
    receiptUrl: null, notes: 'PO issued, awaiting final invoice from vendor', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-004', createdAt: '2026-03-17T10:15:00Z', folder: '0002',
    date: '2026-03-17', vendor: 'Keslow Camera', method: 'PO', ccLast4: null,
    description: 'ARRI Alexa Mini LF weekly rental',
    lineItem: '5200 – Camera Equipment', submittedBy: 'Derek Hall',
    status: 'Pending Approval', paid: false, amount: 8200.00, chargeType: 'Equipment Rental',
    w9Attached: true, payMethodDocAttached: false, linkedFolder: null,
    receiptUrl: null, notes: 'Week 3 of 6-week camera package. Pending producer sign-off.', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-005', createdAt: '2026-03-18T08:00:00Z', folder: '0003',
    date: '2026-03-18', vendor: 'Art Supply Depot', method: 'PO', ccLast4: null,
    description: 'Set dressing art supplies mixed media',
    lineItem: '5800 – Art Department', submittedBy: 'Rachel Pham',
    status: 'In Review', paid: false, amount: 1200.00, chargeType: 'Art Department',
    w9Attached: false, payMethodDocAttached: false, linkedFolder: null,
    receiptUrl: null, notes: 'Brushes, paint, adhesives, and specialty papers for art dept set dressing. Week 4.', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-006', createdAt: '2026-03-17T09:30:00Z', folder: '1002',
    date: '2026-03-17', vendor: 'Hollywood Lighting Rentals', method: 'CC', ccLast4: '4892',
    description: 'LED fixtures grip truck package',
    lineItem: '5300 – Grip & Electric', submittedBy: 'Rachel Pham',
    status: 'Quote', paid: false, amount: 5500.00, chargeType: 'Equipment Rental',
    w9Attached: false, payMethodDocAttached: false, linkedFolder: null,
    receiptUrl: null, notes: 'Pending final quote approval before PO issued', isReturn: false, isQuote: true,
  },
  {
    id: 'seed-007', createdAt: '2026-03-18T16:00:00Z', folder: '0004',
    date: '2026-03-18', vendor: 'Craft Catering Co.', method: 'Return', ccLast4: null,
    description: 'Partial refund unused meals',
    lineItem: '5900 – Catering & Craft Services', submittedBy: 'Sarah Kim',
    status: 'Refunded', paid: true, amount: -315.00, chargeType: 'Catering',
    w9Attached: true, payMethodDocAttached: false, linkedFolder: '0001',
    receiptUrl: null, notes: 'Credit memo issued for 7 unused meals from day 12', isReturn: true, isQuote: false,
  },
  {
    id: 'seed-008', createdAt: '2026-03-18T13:20:00Z', folder: '0005',
    date: '2026-03-18', vendor: 'LA Prop House', method: 'Check', ccLast4: null,
    description: 'Hero prop set dressing period',
    lineItem: '5700 – Props', submittedBy: 'Rachel Pham',
    status: 'In Review', paid: false, amount: 4400.00, chargeType: 'Props',
    w9Attached: false, payMethodDocAttached: false, linkedFolder: null,
    receiptUrl: null, notes: 'Sent back for itemized invoice — original was lump sum', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-009', createdAt: '2026-03-17T11:00:00Z', folder: '0006',
    date: '2026-03-17', vendor: 'Pacific Fuels Inc.', method: 'Debit', ccLast4: null,
    description: 'Diesel fuel generator production week 3',
    lineItem: '5310 – Fuel', submittedBy: 'Derek Hall',
    status: 'Void', paid: false, amount: 680.00, chargeType: 'Fuel',
    w9Attached: false, payMethodDocAttached: false, linkedFolder: null,
    receiptUrl: null, notes: 'Duplicate submission — voided', isReturn: false, isQuote: false,
  },
  {
    id: 'seed-010', createdAt: '2026-03-19T09:45:00Z', folder: '1003',
    date: '2026-03-19', vendor: 'Silver Screen Transport', method: 'CC', ccLast4: '3019',
    description: 'Grip truck and cargo van weekly rental',
    lineItem: '5600 – Transportation', submittedBy: 'Derek Hall',
    status: 'Approved', paid: true, amount: 3400.00, chargeType: 'Transportation',
    w9Attached: true, payMethodDocAttached: true, linkedFolder: null,
    receiptUrl: null, notes: 'One 5-ton grip truck + 1 cargo van, week 4 of 6.', isReturn: false, isQuote: false,
  },
];

// ── Folder Numbering ───────────────────────────────────────────
const FOLDER_LOW_MAX        = 999;
const FOLDER_HIGH_MIN       = 1000;
const FOLDER_HIGH_MAX       = 1999;
const FOLDER_ALERT_THRESHOLD = 50;

export function methodRange(method) {
  return (method === 'CC' || method === 'PO-CC') ? 'high' : 'low';
}

export function assignFolder(method, linkedFolder) {
  if (method === 'Return' && linkedFolder) {
    return { folder: linkedFolder, alert: null };
  }

  const counters = get(folderCounters);
  const range = methodRange(method);
  let num, formatted, alert = null;
  const updated = { ...counters };

  if (range === 'high') {
    updated.high += 1;
    num = FOLDER_HIGH_MIN + updated.high - 1;
    formatted = String(num).padStart(4, '0');
    const remaining = FOLDER_HIGH_MAX - num;
    if (remaining <= FOLDER_ALERT_THRESHOLD) {
      alert = `CC folder range approaching ceiling: ${remaining} numbers remaining (${formatted}–1999).`;
    }
  } else {
    updated.low += 1;
    num = updated.low - 1;
    formatted = String(num).padStart(4, '0');
    const remaining = FOLDER_LOW_MAX - num;
    if (remaining <= FOLDER_ALERT_THRESHOLD) {
      alert = `PO/Check/Debit folder range approaching ceiling: ${remaining} numbers remaining (${formatted}–0999).`;
    }
  }

  folderCounters.set(updated);
  _persistCounters(updated);
  return { folder: formatted, alert };
}

// ── Stores ────────────────────────────────────────────────────
export const purchases    = writable([]);
export const folderCounters = writable({ low: 0, high: 0 });

// ── Persistence ───────────────────────────────────────────────
function _persistAll() {
  localStorage.setItem(STORAGE_KEY,  JSON.stringify(get(purchases)));
  localStorage.setItem(COUNTERS_KEY, JSON.stringify(get(folderCounters)));
}

function _persistCounters(counters) {
  localStorage.setItem(COUNTERS_KEY, JSON.stringify(counters));
}

function _deriveSeedCounters(seeds) {
  let low = 0, high = 0;
  for (const p of seeds) {
    if (!p.isReturn) {
      const n = parseInt(p.folder, 10);
      if (n >= 1000) high = Math.max(high, n - 999);
      else low = Math.max(low, n + 1);
    }
  }
  return { low, high };
}

export function hydrate() {
  const rawPurchases = localStorage.getItem(STORAGE_KEY);
  const rawCounters  = localStorage.getItem(COUNTERS_KEY);

  if (rawPurchases) {
    let data = JSON.parse(rawPurchases);
    const counters = rawCounters ? JSON.parse(rawCounters) : { low: 0, high: 0 };

    // Migration: Returned → Refunded
    let migrated = false;
    for (const p of data) {
      if (p.status === 'Returned' && (p.isReturn || p.method === 'Return')) {
        p.status = 'Refunded'; migrated = true;
      }
      if ((p.isReturn || p.method === 'Return') && p.status !== 'Refunded') {
        p.status = 'Refunded'; migrated = true;
      }
      if ((p.isReturn || p.method === 'Return') && Number(p.amount) > 0) {
        p.amount = -Math.abs(Number(p.amount)); migrated = true;
      }
      if (p.status === 'Returned' && !p.isReturn && p.method !== 'Return') {
        p.status = 'In Review'; migrated = true;
      }
    }

    purchases.set(data);
    folderCounters.set(counters);
    if (migrated) _persistAll();
  } else {
    const seeds = [...SEED_PURCHASES];
    const counters = _deriveSeedCounters(seeds);
    purchases.set(seeds);
    folderCounters.set(counters);
    _persistAll();
  }
}

// ── CRUD ──────────────────────────────────────────────────────
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
    ...record,
  };
  if (isRefund) {
    purchase.status = 'Refunded';
    purchase.amount = -Math.abs(purchase.amount);
  }
  purchases.update(list => {
    const updated = [purchase, ...list];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  });
  return purchase;
}

export function getPurchases() {
  return get(purchases);
}

export function getPurchaseById(id) {
  return get(purchases).find(p => p.id === id) ?? null;
}

export function updatePurchase(id, changes) {
  let updated = null;
  purchases.update(list => {
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return list;
    const merged = { ...list[idx], ...changes };
    if ('method' in changes) merged.isReturn = merged.method === 'Return';
    if (merged.isReturn || merged.method === 'Return') {
      if (merged.status === 'Approved') merged.status = 'Refunded';
      merged.amount = -Math.abs(Number(merged.amount) || 0);
    }
    updated = merged;
    const newList = [...list];
    newList[idx] = merged;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
    return newList;
  });
  return updated;
}

export function deletePurchase(id) {
  purchases.update(list => {
    const updated = list.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  });
}

export function voidPurchase(id) {
  const p = getPurchaseById(id);
  if (!p) return null;
  const newFolder = p.folder && !p.folder.includes('VOID') ? p.folder + ' VOID' : p.folder;
  return updatePurchase(id, { status: 'Void', folder: newFolder });
}

export function togglePaid(id) {
  const p = getPurchaseById(id);
  if (!p) return null;
  return updatePurchase(id, { paid: !p.paid });
}

export function approvePurchase(id) {
  return updatePurchase(id, { status: 'Approved' });
}

export function sendBackPurchase(id) {
  return updatePurchase(id, { status: 'In Review' });
}

// ── Summary ───────────────────────────────────────────────────
export function calcSummary(list) {
  let approved = 0, inReview = 0, quotes = 0, refunded = 0;
  for (const p of list) {
    if (p.status === 'Void') continue;
    const amt = Number(p.amount) || 0;
    if (p.status === 'Refunded') { refunded += Math.abs(amt); continue; }
    switch (p.status) {
      case 'Approved':         approved += amt; break;
      case 'Pending Approval': inReview += amt; break;
      case 'Quote':            quotes   += amt; break;
      case 'In Review':        inReview += amt; break;
      case 'Submitted':        inReview += amt; break;
    }
  }
  const net = approved + inReview + quotes - refunded;
  return { net, approved, inReview, quotes, refunded };
}
