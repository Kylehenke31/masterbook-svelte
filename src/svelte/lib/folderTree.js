/**
 * folderTree.js — the project file-cabinet structure shown in the Files
 * window. Shared source of truth: Files.svelte renders it as the browsable
 * tree, and dropbox.js walks it to provision the same structure in Dropbox
 * when a project connects.
 */

export const FOLDER_TREE = [
  { id: '01-accounting', label: '01. ACCOUNTING', children: [
    { id: '01-accounting/budget',          label: 'i. Budget' },
    { id: '01-accounting/hot-costs',       label: 'ii. Hot Costs' },
    { id: '01-accounting/vendors',         label: 'iii. Vendors' },
    { id: '01-accounting/purchase-orders', label: 'iv. Purchase Orders' },
    { id: '01-accounting/credit-cards',    label: 'v. Credit Cards' },
    { id: '01-accounting/petty-cash',      label: 'vi. Petty Cash' },
    { id: '01-accounting/checks',          label: 'vii. Checks' },
  ]},
  { id: '02-schedule', label: '02. SCHEDULE', children: [
    { id: '02-schedule/one-liners',  label: 'One-Liners' },
    { id: '02-schedule/doods',       label: 'DooDs' },
    { id: '02-schedule/call-sheets', label: 'Call Sheets', dynamic: 'callsheets' },
  ]},
  { id: '03-creative',        label: '03. CREATIVE' },
  { id: '04-insurance',       label: '04. INSURANCE' },
  { id: '05-logs',            label: '05. LOGS' },
  { id: '06-crew',            label: '06. CREW' },
  { id: '07-talent',          label: '07. TALENT' },
  { id: '08-daily-paperwork', label: '08. DAILY PAPERWORK' },
  { id: '09-locations',       label: '09. LOCATIONS' },
  { id: '10-legal',           label: '10. LEGAL' },
  { id: '11-travel',          label: '11. TRAVEL' },
  { id: '12-post-prod',       label: '12. POST PROD' },
];

/**
 * Resolve a folder id to its labelled path, e.g.
 * '01-accounting/credit-cards' -> '01. ACCOUNTING/v. Credit Cards'.
 *
 * Callers that need to write into a specific cabinet folder should go through
 * this rather than hardcoding labels: the ordinal prefixes ("v.") get
 * renumbered whenever the tree changes, and a hardcoded copy would silently
 * start writing to a folder that no longer exists. Throws on an unknown id —
 * a typo'd id should fail loudly at the call site, not create a stray folder.
 */
export function folderPathById(id) {
  for (const node of FOLDER_TREE) {
    if (node.id === id) return node.label;
    for (const child of node.children || []) {
      if (child.id === id) return `${node.label}/${child.label}`;
    }
  }
  throw new Error(`folderPathById: unknown folder id "${id}"`);
}
