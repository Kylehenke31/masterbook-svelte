/* ============================================================
   The Masterbook — files.js
   Files: hierarchical production folder structure with search,
   expandable folders, and file upload per folder.
   ============================================================ */

const FILES_KEY = 'movie-ledger-files';

let _container = null;
let _files     = {};   // { folderPath: [{ name, dataUrl, size, date }] }
let _expanded  = {};   // { folderPath: true/false }
let _search    = '';

/* ── Entry Point ── */
export function renderFiles(container) {
  _container = container;
  _load();
  _render();
}

/* ── Persistence ── */
function _load() {
  try { _files = JSON.parse(localStorage.getItem(FILES_KEY)) || {}; } catch { _files = {}; }
}
function _save() {
  localStorage.setItem(FILES_KEY, JSON.stringify(_files));
}

/* ── Helpers ── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ── Folder tree definition ── */
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

/* ── Dynamic sub-folders (Call Sheets by shoot day) ── */
function _getCallSheetDays() {
  try {
    const sheets = JSON.parse(localStorage.getItem('movie-ledger-callsheets')) || {};
    const dayTypes = JSON.parse(localStorage.getItem('movie-ledger-crew-daytypes')) || {};
    const shootDates = Object.entries(dayTypes)
      .filter(([, t]) => t === 'shoot')
      .map(([d]) => d)
      .sort();
    const days = [];
    Object.keys(sheets).sort().forEach(dateStr => {
      const idx = shootDates.indexOf(dateStr);
      const dayNum = idx >= 0 ? idx + 1 : null;
      const label = dayNum ? `Day ${dayNum}` : dateStr;
      days.push({ id: `02-schedule/call-sheets/${dateStr}`, label });
    });
    return days;
  } catch { return []; }
}

/* ── Search filter ── */
function _matchesSearch(label, path) {
  if (!_search) return true;
  const q = _search.toLowerCase();
  // Check folder/file labels and path
  if (label.toLowerCase().includes(q)) return true;
  if (path.toLowerCase().includes(q)) return true;
  // Check files inside this folder
  const folderFiles = _files[path] || [];
  return folderFiles.some(f => f.name.toLowerCase().includes(q));
}

function _folderTreeMatches(node) {
  // A folder matches if it or any of its children/files match
  if (_matchesSearch(node.label, node.id)) return true;
  if (node.children) return node.children.some(c => _folderTreeMatches(c));
  if (node.dynamic === 'callsheets') return _getCallSheetDays().some(d => _matchesSearch(d.label, d.id));
  return false;
}

/* ── Render ── */
function _render() {
  const fileCount = Object.values(_files).reduce((sum, arr) => sum + arr.length, 0);

  _container.innerHTML = `
    <div class="files-section">
      <h2 class="files-heading">Files</h2>
      <p class="files-subtitle">${fileCount} file${fileCount !== 1 ? 's' : ''} stored</p>

      <div class="files-search-wrap">
        <svg class="files-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="files-search" id="files-search" placeholder="Search files and folders..." value="${esc(_search)}" />
        ${_search ? '<button class="files-search-clear" id="files-search-clear" title="Clear">✕</button>' : ''}
      </div>

      <div class="files-tree" id="files-tree">
        ${_renderTree(FOLDER_TREE, 0)}
      </div>
    </div>
  `;

  _wireEvents();
}

function _renderTree(nodes, depth) {
  let html = '';
  nodes.forEach(node => {
    if (_search && !_folderTreeMatches(node)) return;

    const hasChildren = !!(node.children?.length) || node.dynamic === 'callsheets';
    const isOpen = !!_expanded[node.id];
    const folderFiles = _files[node.id] || [];
    const isTopLevel = depth === 0;
    const chevron = hasChildren || folderFiles.length > 0 || isTopLevel
      ? `<span class="files-chevron ${isOpen ? 'files-chevron--open' : ''}">\u25B6</span>`
      : `<span class="files-chevron ${isOpen ? 'files-chevron--open' : ''}">\u25B6</span>`;

    const folderIcon = isOpen
      ? '<svg class="files-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
      : '<svg class="files-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';

    const labelClass = isTopLevel ? 'files-label files-label--top' : 'files-label files-label--sub';

    html += `<div class="files-node" style="padding-left:${depth * 20}px">
      <div class="files-row" data-folder="${esc(node.id)}">
        ${chevron}
        ${folderIcon}
        <span class="${labelClass}">${esc(node.label)}</span>
        <span class="files-badge">${folderFiles.length || ''}</span>
      </div>`;

    if (isOpen) {
      // Render child folders
      if (node.children) {
        html += _renderTree(node.children, depth + 1);
      }
      // Render dynamic call sheet days
      if (node.dynamic === 'callsheets') {
        const days = _getCallSheetDays();
        days.forEach(day => {
          if (_search && !_matchesSearch(day.label, day.id)) return;
          const dayFiles = _files[day.id] || [];
          const dayOpen = !!_expanded[day.id];
          html += `<div class="files-node" style="padding-left:${(depth + 1) * 20}px">
            <div class="files-row" data-folder="${esc(day.id)}">
              <span class="files-chevron ${dayOpen ? 'files-chevron--open' : ''}">\u25B6</span>
              <svg class="files-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              <span class="files-label files-label--sub">${esc(day.label)}</span>
              <span class="files-badge">${dayFiles.length || ''}</span>
            </div>`;
          if (dayOpen) {
            html += _renderFiles(day.id, depth + 2);
          }
          html += `</div>`;
        });
      }

      // Render files in this folder
      html += _renderFiles(node.id, depth + 1);
    }

    html += `</div>`;
  });
  return html;
}

function _renderFiles(folderId, depth) {
  const folderFiles = _files[folderId] || [];
  let html = '';

  // File list
  folderFiles.forEach((f, fi) => {
    if (_search && !f.name.toLowerCase().includes(_search.toLowerCase())) return;
    html += `<div class="files-file" style="padding-left:${depth * 20}px">
      <svg class="files-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
      <a class="files-file-name" href="${f.dataUrl}" download="${esc(f.name)}" title="Download ${esc(f.name)}">${esc(f.name)}</a>
      <span class="files-file-size">${_formatSize(f.size)}</span>
      <button class="files-file-del" data-del-folder="${esc(folderId)}" data-del-idx="${fi}" title="Remove">✕</button>
    </div>`;
  });

  // Upload area
  html += `<div class="files-upload" style="padding-left:${depth * 20}px">
    <label class="files-upload-btn" title="Upload file to this folder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add File
      <input type="file" class="files-upload-input" data-upload-folder="${esc(folderId)}" multiple hidden />
    </label>
  </div>`;

  return html;
}

/* ── Wire Events ── */
function _wireEvents() {
  // Search
  const searchInput = _container.querySelector('#files-search');
  let debounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      _search = searchInput.value.trim();
      // Auto-expand matching folders when searching
      if (_search) _autoExpand(FOLDER_TREE);
      _render();
    }, 200);
  });
  searchInput.focus();
  // Place cursor at end
  searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

  const clearBtn = _container.querySelector('#files-search-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { _search = ''; _render(); });

  // Folder toggle
  _container.querySelectorAll('.files-row').forEach(row => {
    row.addEventListener('click', () => {
      const folder = row.dataset.folder;
      _expanded[folder] = !_expanded[folder];
      _render();
    });
  });

  // File upload
  _container.querySelectorAll('.files-upload-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const folderId = input.dataset.uploadFolder;
      const files = Array.from(e.target.files);
      if (!files.length) return;

      let processed = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          if (!_files[folderId]) _files[folderId] = [];
          _files[folderId].push({
            name: file.name,
            size: file.size,
            date: new Date().toISOString(),
            dataUrl: reader.result,
          });
          processed++;
          if (processed === files.length) {
            _save();
            _render();
          }
        };
        reader.readAsDataURL(file);
      });
    });
  });

  // File delete
  _container.querySelectorAll('.files-file-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folder = btn.dataset.delFolder;
      const idx = parseInt(btn.dataset.delIdx, 10);
      const fileName = (_files[folder] || [])[idx]?.name || 'this file';
      if (!confirm(`Delete "${fileName}"?`)) return;
      _files[folder].splice(idx, 1);
      if (!_files[folder].length) delete _files[folder];
      _save();
      _render();
    });
  });
}

/* ── Auto-expand folders that match search ── */
function _autoExpand(nodes) {
  nodes.forEach(node => {
    if (_folderTreeMatches(node)) {
      _expanded[node.id] = true;
      if (node.children) _autoExpand(node.children);
    }
    if (node.dynamic === 'callsheets') {
      _getCallSheetDays().forEach(d => {
        if (_matchesSearch(d.label, d.id)) _expanded[d.id] = true;
      });
    }
  });
}
