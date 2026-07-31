/**
 * folderTree.js — the project file-cabinet structure shown in the Files
 * window. Shared source of truth: Files.svelte renders it as the browsable
 * tree, and dropbox.js walks it to provision the same structure in Dropbox
 * when a project connects.
 */

export const FOLDER_TREE = [
  { id: '01-accounting', label: '01. ACCOUNTING', children: [
    { id: '01-accounting/budget',          label: 'Budget' },
    { id: '01-accounting/hot-costs',       label: 'Hot Costs' },
    { id: '01-accounting/vendors',         label: 'Vendors' },
    { id: '01-accounting/purchase-orders', label: 'Purchase Orders' },
    { id: '01-accounting/credit-cards',    label: 'Credit Cards' },
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
