<script>
  import { setContext } from 'svelte';
  import FolderNode from '../components/FolderNode.svelte';

  const FILES_KEY = 'movie-ledger-files';

  const FOLDER_TREE = [
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

  // ── State ──────────────────────────────────────────────────
  let files    = $state({});
  let expanded = $state({});
  let search   = $state('');

  try { files = JSON.parse(localStorage.getItem(FILES_KEY)) || {}; } catch { files = {}; }

  let totalFiles = $derived(Object.values(files).reduce((s, a) => s + a.length, 0));

  // ── Persistence ────────────────────────────────────────────
  function save() { localStorage.setItem(FILES_KEY, JSON.stringify(files)); }

  // ── Helpers ────────────────────────────────────────────────
  function formatSize(bytes) {
    if (bytes < 1024)         return bytes + ' B';
    if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getCallSheetDays() {
    try {
      const sheets   = JSON.parse(localStorage.getItem('movie-ledger-callsheets')) || {};
      const dayTypes = JSON.parse(localStorage.getItem('movie-ledger-crew-daytypes')) || {};
      const shootDates = Object.entries(dayTypes).filter(([,t]) => t === 'shoot').map(([d]) => d).sort();
      return Object.keys(sheets).sort().map(dateStr => {
        const idx = shootDates.indexOf(dateStr);
        return { id: `02-schedule/call-sheets/${dateStr}`, label: idx >= 0 ? `Day ${idx + 1}` : dateStr };
      });
    } catch { return []; }
  }

  function matchesSearch(label, path) {
    if (!search) return true;
    const q = search.toLowerCase();
    if (label.toLowerCase().includes(q) || path.toLowerCase().includes(q)) return true;
    return (files[path] || []).some(f => f.name.toLowerCase().includes(q));
  }

  function treeMatches(node) {
    if (matchesSearch(node.label, node.id)) return true;
    if (node.children) return node.children.some(c => treeMatches(c));
    if (node.dynamic === 'callsheets') return getCallSheetDays().some(d => matchesSearch(d.label, d.id));
    return false;
  }

  function toggle(folderId) {
    expanded = { ...expanded, [folderId]: !expanded[folderId] };
  }

  function autoExpand(nodes) {
    nodes.forEach(node => {
      if (treeMatches(node)) {
        expanded = { ...expanded, [node.id]: true };
        if (node.children) autoExpand(node.children);
      }
    });
  }

  function onSearchInput(e) {
    search = e.target.value.trim();
    if (search) autoExpand(FOLDER_TREE);
  }

  function handleUpload(folderId, e) {
    const fileList = Array.from(e.target.files);
    if (!fileList.length) return;
    let done = 0;
    fileList.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const current = files[folderId] || [];
        files = { ...files, [folderId]: [...current, { name: file.name, size: file.size, date: new Date().toISOString(), dataUrl: reader.result }] };
        if (++done === fileList.length) save();
      };
      reader.readAsDataURL(file);
    });
  }

  function deleteFile(folderId, idx) {
    const fileName = (files[folderId] || [])[idx]?.name || 'this file';
    if (!confirm(`Delete "${fileName}"?`)) return;
    const updated = [...(files[folderId] || [])];
    updated.splice(idx, 1);
    if (updated.length) files = { ...files, [folderId]: updated };
    else { const f = { ...files }; delete f[folderId]; files = f; }
    save();
  }

  // ── Share state with FolderNode via context ────────────────
  setContext('files', {
    get files()    { return files; },
    get expanded() { return expanded; },
    get search()   { return search; },
    toggle, matchesSearch, treeMatches, getCallSheetDays, formatSize, handleUpload, deleteFile,
  });
</script>

<div class="files-section">
  <h2 class="files-heading">Files</h2>
  <p class="files-subtitle">{totalFiles} file{totalFiles !== 1 ? 's' : ''} stored</p>

  <div class="files-search-wrap">
    <svg class="files-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      type="text"
      class="files-search"
      placeholder="Search files and folders..."
      value={search}
      oninput={onSearchInput}
    />
    {#if search}
      <button class="files-search-clear" onclick={() => search = ''} title="Clear">✕</button>
    {/if}
  </div>

  <div class="files-tree">
    {#each FOLDER_TREE as node (node.id)}
      <FolderNode {node} depth={0} />
    {/each}
  </div>
</div>

<style>
  .files-section  { max-width: 860px; }
  .files-heading  { font-size: 1.25rem; margin-bottom: 2px; }
  .files-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); margin-bottom: 16px; }

  .files-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }

  .files-search-icon {
    position: absolute;
    left: 10px;
    color: var(--text-muted, #888);
    pointer-events: none;
  }

  .files-search {
    width: 100%;
    padding: 7px 32px 7px 34px;
    background: var(--surface-2, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text, #eee);
    font-size: 0.875rem;
  }
  .files-search:focus { outline: none; border-color: var(--accent, #6a8a6a); }

  .files-search-clear {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 4px;
  }

  .files-tree { user-select: none; }
</style>
