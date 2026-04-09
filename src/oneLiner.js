/* ============================================================
   The Masterbook — oneLiner.js
   One-Liner (Shoot Order): Re-orderable scene slugs pulled
   from the Breakdown, with Dividers, Day Breaks, multi-draft
   support, and Print/PDF export.
   ============================================================ */

const OL_KEY       = 'movie-ledger-one-liner-drafts';
const OL_ACTIVE    = 'movie-ledger-one-liner-active';
const BD_KEY       = 'movie-ledger-breakdowns';
const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';

let _container = null;
let _drafts    = {};   // { draftId: { name, items[] } }
let _activeDraftId = null;
let _dragIdx   = null;
let _pickerOpen = false;

/* ── Entry ── */
export function renderOneLiner(container) {
  _container = container;
  _loadDrafts();
  _render();
}

/* ── Persistence ── */
function _loadDrafts() {
  try { _drafts = JSON.parse(localStorage.getItem(OL_KEY)) || {}; } catch { _drafts = {}; }
  _activeDraftId = localStorage.getItem(OL_ACTIVE) || null;

  // Migrate from old single-list format
  if (Object.keys(_drafts).length === 0) {
    try {
      const oldItems = JSON.parse(localStorage.getItem('movie-ledger-one-liner'));
      if (Array.isArray(oldItems) && oldItems.length > 0) {
        const id = _uid();
        _drafts[id] = { name: 'Draft 1', items: oldItems };
        _activeDraftId = id;
        _saveDrafts();
        return;
      }
    } catch {}
    // Create default draft
    const id = _uid();
    _drafts[id] = { name: 'Draft 1', items: [] };
    _activeDraftId = id;
    _saveDrafts();
  }

  if (!_activeDraftId || !_drafts[_activeDraftId]) {
    _activeDraftId = Object.keys(_drafts)[0];
    localStorage.setItem(OL_ACTIVE, _activeDraftId);
  }
}

function _saveDrafts() {
  localStorage.setItem(OL_KEY, JSON.stringify(_drafts));
  localStorage.setItem(OL_ACTIVE, _activeDraftId);
}

function _items() { return _drafts[_activeDraftId]?.items || []; }
function _setItems(items) { _drafts[_activeDraftId].items = items; }

/* ── Helpers ── */
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _getBreakdownScenes() {
  try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; }
}

function _getProjectName() {
  try {
    const p = JSON.parse(localStorage.getItem('movie-ledger-project'));
    return p?.title || 'Untitled Project';
  } catch { return 'Untitled Project'; }
}

function _parseTimingToMin(str) {
  if (!str) return 0;
  str = str.trim();
  // Support "HH:MM", "H:MM", or just minutes "45"
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  return Number(str) || 0;
}

function _formatTimingTotal(minutes) {
  if (minutes === 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function _parsePageCount(str) {
  if (!str) return 0;
  str = str.trim();
  const parts = str.split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/');
      if (den && Number(den)) total += Number(num) / Number(den);
    } else {
      total += Number(p) || 0;
    }
  }
  return total;
}

function _formatPageTotal(val) {
  if (val === 0) return '0';
  const whole = Math.floor(val);
  const frac = val - whole;
  if (frac === 0) return whole.toString();
  const eighths = Math.round(frac * 8);
  if (eighths === 0) return whole.toString();
  if (eighths === 8) return (whole + 1).toString();
  return whole > 0 ? `${whole} ${eighths}/8` : `${eighths}/8`;
}

/* ── Scene data lookup ── */
function _findScene(sceneId) {
  return _getBreakdownScenes().find(s => s.id === sceneId) || null;
}

/* ── Numeric-aware scene sort (matching scriptOrder) ── */
function _parseSceneNum(str) {
  if (!str) return [0];
  const tokens = str.trim().split(/[-./\s]+/);
  const parts = [];
  for (const tok of tokens) {
    const sub = tok.match(/[0-9]+|[A-Za-z]+/g);
    if (sub) parts.push(...sub);
  }
  if (parts.length === 0) return [0];
  return parts.map(p => {
    const n = Number(p);
    if (!isNaN(n)) return n;
    return p.toLowerCase().charCodeAt(0) + 10000;
  });
}

function _sortBySceneNum(scenes) {
  return [...scenes].sort((a, b) => {
    const na = _parseSceneNum(a.sceneNum);
    const nb = _parseSceneNum(b.sceneNum);
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const va = na[i] ?? -1;
      const vb = nb[i] ?? -1;
      if (va !== vb) return va - vb;
    }
    return 0;
  });
}

/* ── Auto-number day breaks ── */
function _getDayNum(itemIdx) {
  const items = _items();
  let count = 0;
  for (let i = 0; i <= itemIdx; i++) {
    if (items[i].type === 'daybreak') count++;
  }
  return count;
}

/* ── Tally pages & timing between day breaks ── */
function _tallyDay(daybreakIdx) {
  const items = _items();
  let startIdx = 0;
  for (let i = daybreakIdx - 1; i >= 0; i--) {
    if (items[i].type === 'daybreak') { startIdx = i + 1; break; }
  }
  let pages = 0;
  let timing = 0;
  for (let i = startIdx; i < daybreakIdx; i++) {
    if (items[i].type === 'scene') {
      const scene = _findScene(items[i].sceneId);
      if (scene) {
        pages += _parsePageCount(scene.pageCount);
        timing += _parseTimingToMin(scene.timing);
      }
    }
  }
  return { pages, timing };
}

/* ── Color class for scene ── */
function _colorClass(scene) {
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  const isInt = ie === 'INT' || ie === 'INT/EXT';
  const isExt = ie === 'EXT';
  if (dn === 'DAWN') return 'bd-slug--dawn';
  if (dn === 'DUSK') return 'bd-slug--dusk';
  if (isInt && dn === 'DAY') return 'bd-slug--int-day';
  if (isExt && dn === 'DAY') return 'bd-slug--ext-day';
  if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--int-night';
  if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--ext-night';
  return '';
}

function _dnAbbrev(scene) {
  const dn = (scene.dayNight || '').toUpperCase();
  if (dn === 'DAY') return 'D';
  if (dn === 'NITE' || dn === 'NIGHT') return 'N';
  if (dn === 'DAWN') return 'Dn';
  if (dn === 'DUSK') return 'Dk';
  return scene.dayNight || '';
}

function _getColorKey(scene) {
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  const isInt = ie === 'INT' || ie === 'INT/EXT';
  const isExt = ie === 'EXT';
  if (dn === 'DAWN') return 'dawn';
  if (dn === 'DUSK') return 'dusk';
  if (isInt && dn === 'DAY') return 'int-day';
  if (isExt && dn === 'DAY') return 'ext-day';
  if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'int-night';
  if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'ext-night';
  return 'default';
}

function _uid() { return crypto.randomUUID(); }

/* ── Shoot date lookup: dayNum (1-based) → formatted date string ── */
function _getShootDates() {
  try {
    const dayTypes = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {};
    const shootDates = Object.entries(dayTypes)
      .filter(([, type]) => type === 'shoot')
      .map(([dateStr]) => dateStr)
      .sort();
    return shootDates;
  } catch { return []; }
}

function _fmtShootDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ══════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════ */
function _render() {
  const items = _items();
  const draftName = _drafts[_activeDraftId]?.name || 'Draft';
  const draftKeys = Object.keys(_drafts);

  // Draft selector
  const draftOptions = draftKeys.map(id =>
    `<option value="${esc(id)}"${id === _activeDraftId ? ' selected' : ''}>${esc(_drafts[id].name)}</option>`
  ).join('');

  // Slug list
  const slugsHTML = items.length === 0
    ? '<p class="ol-empty">No scenes added yet. Use the Scene Picker to add scenes.</p>'
    : items.map((item, idx) => _renderItem(item, idx)).join('');

  _container.innerHTML = `
    <section class="ol-section">
      <div class="ol-toolbar">
        <button class="btn btn--ghost btn--sm" id="ol-back">← Back</button>
        <h2>One-Liner (Shoot Order)</h2>
        <div class="ol-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="ol-scene-picker-btn">Scene Picker</button>
          <button class="btn btn--ghost btn--sm" id="ol-add-blank">+ Divider</button>
          <button class="btn btn--ghost btn--sm" id="ol-add-daybreak">+ Day Break</button>
          <button class="btn btn--ghost btn--sm" id="ol-print-btn">Print / PDF</button>
          <button class="btn btn--primary btn--sm" id="ol-save">Save</button>
        </div>
      </div>

      <!-- Draft selector -->
      <div class="ol-draft-bar">
        <label class="ol-draft-label">Draft:
          <select class="ol-draft-select" id="ol-draft-select">${draftOptions}</select>
        </label>
        <button class="btn btn--ghost btn--sm" id="ol-draft-new" title="New Draft">+ New</button>
        <button class="btn btn--ghost btn--sm" id="ol-draft-rename" title="Rename Draft">Rename</button>
        <button class="btn btn--ghost btn--sm" id="ol-draft-dup" title="Duplicate Draft">Duplicate</button>
        ${draftKeys.length > 1 ? '<button class="btn btn--ghost btn--sm ol-draft-del" id="ol-draft-del" title="Delete Draft">Delete</button>' : ''}
      </div>

      <!-- Slug list -->
      <div class="ol-list" id="ol-list">
        ${slugsHTML}
      </div>
    </section>

    <!-- Scene Picker modal -->
    <div class="ol-picker-overlay" id="ol-picker-overlay" style="display:none;">
      <div class="ol-picker-modal" id="ol-picker-modal">
        <div class="ol-picker-header">
          <h3>Scene Picker</h3>
          <button class="btn btn--ghost btn--sm" id="ol-picker-close">✕</button>
        </div>
        <div class="ol-picker-body" id="ol-picker-body"></div>
      </div>
    </div>
  `;

  _wireEvents();
}

function _renderItem(item, idx) {
  const dragAttr = `draggable="true" data-idx="${idx}"`;

  if (item.type === 'blank') {
    const dText  = item.text || '';
    const dBold  = item.bold ? 'active' : '';
    const dItal  = item.italic ? 'active' : '';
    const dSize  = item.fontSize || 14;
    const dColor = item.fontColor || '#ffffff';
    const dAlign = item.align || 'center';
    const dFill  = item.fillColor || '#333333';
    const boldStyle   = item.bold ? 'font-weight:700;' : '';
    const italStyle   = item.italic ? 'font-style:italic;' : '';
    const alignLeft   = dAlign === 'left' ? 'active' : '';
    const alignCenter = dAlign === 'center' ? 'active' : '';
    const alignRight  = dAlign === 'right' ? 'active' : '';

    return `<div class="ol-item ol-item--divider" ${dragAttr}>
      <span class="ol-drag-handle" title="Drag to reorder">☰</span>
      <div class="ol-divider-wrap" style="background:${esc(dFill)};">
        <div class="ol-divider-toolbar" data-idx="${idx}">
          <button class="ol-div-btn ol-div-bold ${dBold}" data-act="bold" data-idx="${idx}" title="Bold">B</button>
          <button class="ol-div-btn ol-div-italic ${dItal}" data-act="italic" data-idx="${idx}" title="Italic"><em>I</em></button>
          <label class="ol-div-size-label" title="Font Size">
            <input type="number" class="ol-div-size" data-idx="${idx}" value="${dSize}" min="8" max="36" step="1"/>
            <span>px</span>
          </label>
          <label class="ol-div-color-label" title="Font Color">A
            <input type="color" class="ol-div-fcolor" data-idx="${idx}" value="${esc(dColor)}"/>
          </label>
          <span class="ol-div-sep"></span>
          <button class="ol-div-btn ol-div-align ${alignLeft}" data-act="left" data-idx="${idx}" title="Align Left">⫷</button>
          <button class="ol-div-btn ol-div-align ${alignCenter}" data-act="center" data-idx="${idx}" title="Align Center">☰</button>
          <button class="ol-div-btn ol-div-align ${alignRight}" data-act="right" data-idx="${idx}" title="Align Right">⫸</button>
          <span class="ol-div-sep"></span>
          <label class="ol-div-color-label" title="Fill Color">▐
            <input type="color" class="ol-div-fill" data-idx="${idx}" value="${esc(dFill)}"/>
          </label>
        </div>
        <input type="text" class="ol-divider-text" data-idx="${idx}" value="${esc(dText)}"
          placeholder="Enter divider text…"
          style="font-size:${dSize}px;color:${esc(dColor)};text-align:${dAlign};${boldStyle}${italStyle}" />
      </div>
      <button class="btn btn--ghost btn--sm ol-item-dup" data-idx="${idx}" title="Duplicate">⧉</button>
      <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
    </div>`;
  }

  if (item.type === 'daybreak') {
    const dayNum = _getDayNum(idx);
    const tally = _tallyDay(idx);
    const shootDates = _getShootDates();
    const shootDate = shootDates[dayNum - 1]; // dayNum is 1-based, array is 0-based
    const dateLabel = shootDate ? ` — ${_fmtShootDate(shootDate)}` : '';
    return `<div class="ol-item ol-item--daybreak" ${dragAttr}>
      <span class="ol-drag-handle" title="Drag to reorder">☰</span>
      <div class="ol-daybreak-bar">
        <span class="ol-daybreak-label">END OF DAY ${dayNum}${esc(dateLabel)}</span>
        <span class="ol-daybreak-totals">
          <span class="ol-daybreak-pages">${_formatPageTotal(tally.pages)} pg</span>
          <span class="ol-daybreak-timing">${_formatTimingTotal(tally.timing)}</span>
        </span>
      </div>
      <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
    </div>`;
  }

  // Scene slug
  const scene = _findScene(item.sceneId);
  if (!scene) {
    return `<div class="ol-item ol-item--missing" ${dragAttr}>
      <span class="ol-drag-handle" title="Drag to reorder">☰</span>
      <div class="bd-slug"><div class="bd-slug-cell" style="grid-column:1/-1;text-align:center;color:#999;">Scene removed from breakdown</div></div>
      <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
    </div>`;
  }

  const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
  const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
  const bgCount = scene.bgCount ?? '';
  const locAddr = scene.locationAddress || '';
  const cc = _colorClass(scene);
  const dnStr = _dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '');

  return `<div class="ol-item" ${dragAttr}>
    <span class="ol-drag-handle" title="Drag to reorder">☰</span>
    <div class="bd-slug ${cc}">
      <div class="bd-slug-cell bd-slug-scnum"><span class="bd-slug-val-bold">${esc(scene.sceneNum || '—')}</span></div>
      <div class="bd-slug-cell bd-slug-setting">
        <span class="bd-slug-val-bold">${esc(setting || '—')}</span>
        <span class="bd-slug-desc">${esc(scene.description || '')}</span>
      </div>
      <div class="bd-slug-cell bd-slug-dn"><span class="bd-slug-val">${esc(dnStr)}</span></div>
      <div class="bd-slug-cell bd-slug-pg"><span class="bd-slug-val">${esc(scene.pageCount || '')}</span></div>
      <div class="bd-slug-cell bd-slug-cast">
        <span class="bd-slug-val">${castIds ? 'Cast: ' + esc(castIds) : ''}</span>
        <span class="bd-slug-bg">BG: ${esc(bgCount)}</span>
      </div>
      <div class="bd-slug-cell bd-slug-loc"><span class="bd-slug-val">${esc(locAddr)}</span></div>
      <div class="bd-slug-cell bd-slug-timing"><span class="bd-slug-val">${esc(scene.timing || '')}</span></div>
    </div>
    <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   EVENTS
   ══════════════════════════════════════════════════════════════ */
function _wireEvents() {
  // Back
  _container.querySelector('#ol-back').addEventListener('click', () => {
    _saveDrafts();
    window.location.hash = '#schedules';
  });

  // Save
  _container.querySelector('#ol-save').addEventListener('click', () => {
    _saveDrafts();
    const btn = _container.querySelector('#ol-save');
    btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save', 1500);
  });

  // Scene Picker modal
  _container.querySelector('#ol-scene-picker-btn').addEventListener('click', () => _openPicker());
  _container.querySelector('#ol-picker-close').addEventListener('click', () => _closePicker());
  _container.querySelector('#ol-picker-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) _closePicker();
  });

  // Add blank divider
  _container.querySelector('#ol-add-blank').addEventListener('click', () => {
    const items = _items();
    items.push({ type: 'blank' });
    _saveDrafts(); _render();
  });

  // Add day break
  _container.querySelector('#ol-add-daybreak').addEventListener('click', () => {
    const items = _items();
    items.push({ type: 'daybreak' });
    _saveDrafts(); _render();
  });

  // Print / PDF
  _container.querySelector('#ol-print-btn').addEventListener('click', () => _openPrintView());

  // ── Draft management ──
  _container.querySelector('#ol-draft-select').addEventListener('change', e => {
    _activeDraftId = e.target.value;
    _saveDrafts(); _render();
  });

  _container.querySelector('#ol-draft-new').addEventListener('click', () => {
    const num = Object.keys(_drafts).length + 1;
    const id = _uid();
    _drafts[id] = { name: `Draft ${num}`, items: [] };
    _activeDraftId = id;
    _saveDrafts(); _render();
  });

  _container.querySelector('#ol-draft-rename').addEventListener('click', () => {
    const current = _drafts[_activeDraftId].name;
    const newName = prompt('Rename draft:', current);
    if (newName && newName.trim()) {
      _drafts[_activeDraftId].name = newName.trim();
      _saveDrafts(); _render();
    }
  });

  _container.querySelector('#ol-draft-dup').addEventListener('click', () => {
    const src = _drafts[_activeDraftId];
    const id = _uid();
    _drafts[id] = { name: src.name + ' (copy)', items: JSON.parse(JSON.stringify(src.items)) };
    _activeDraftId = id;
    _saveDrafts(); _render();
  });

  const delBtn = _container.querySelector('#ol-draft-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete "${_drafts[_activeDraftId].name}"?`)) return;
      delete _drafts[_activeDraftId];
      _activeDraftId = Object.keys(_drafts)[0];
      _saveDrafts(); _render();
    });
  }

  // Delete item
  _container.querySelectorAll('.ol-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      _items().splice(idx, 1);
      _saveDrafts(); _render();
    });
  });

  // Duplicate divider
  _container.querySelectorAll('.ol-item-dup').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const items = _items();
      const dupe = JSON.parse(JSON.stringify(items[idx]));
      items.splice(idx + 1, 0, dupe);
      _saveDrafts(); _render();
    });
  });

  // ── Divider controls ──
  _container.querySelectorAll('.ol-divider-text').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      _items()[idx].text = inp.value;
      _saveDrafts();
    });
  });

  _container.querySelectorAll('.ol-div-bold, .ol-div-italic').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      _items()[idx][act] = !_items()[idx][act];
      _saveDrafts(); _render();
    });
  });

  _container.querySelectorAll('.ol-div-size').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      _items()[idx].fontSize = Math.max(8, Math.min(36, Number(inp.value) || 14));
      _saveDrafts(); _render();
    });
  });

  _container.querySelectorAll('.ol-div-fcolor').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      _items()[idx].fontColor = inp.value;
      _saveDrafts();
      const textEl = _container.querySelector(`.ol-divider-text[data-idx="${idx}"]`);
      if (textEl) textEl.style.color = inp.value;
    });
  });

  _container.querySelectorAll('.ol-div-align').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      _items()[idx].align = btn.dataset.act;
      _saveDrafts(); _render();
    });
  });

  _container.querySelectorAll('.ol-div-fill').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      _items()[idx].fillColor = inp.value;
      _saveDrafts();
      const wrap = inp.closest('.ol-divider-wrap');
      if (wrap) wrap.style.background = inp.value;
    });
  });

  // Drag and drop
  const items = _container.querySelectorAll('.ol-item');
  items.forEach(el => {
    el.addEventListener('dragstart', e => {
      _dragIdx = Number(el.dataset.idx);
      el.classList.add('ol-item--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('ol-item--dragging');
      _dragIdx = null;
      _container.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d => d.classList.remove('ol-drop-above','ol-drop-below'));
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetIdx = Number(el.dataset.idx);
      if (targetIdx === _dragIdx) return;
      _container.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d => d.classList.remove('ol-drop-above','ol-drop-below'));
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      el.classList.add(e.clientY < midY ? 'ol-drop-above' : 'ol-drop-below');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('ol-drop-above', 'ol-drop-below');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      const targetIdx = Number(el.dataset.idx);
      if (_dragIdx === null || _dragIdx === targetIdx) return;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let insertAt = e.clientY < midY ? targetIdx : targetIdx + 1;
      const curItems = _items();
      const [moved] = curItems.splice(_dragIdx, 1);
      if (insertAt > _dragIdx) insertAt--;
      curItems.splice(insertAt, 0, moved);
      _dragIdx = null;
      _saveDrafts(); _render();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   SCENE PICKER (modal)
   ══════════════════════════════════════════════════════════════ */
function _openPicker() {
  const overlay = _container.querySelector('#ol-picker-overlay');
  overlay.style.display = 'flex';
  _populatePicker();
}

function _closePicker() {
  _container.querySelector('#ol-picker-overlay').style.display = 'none';
}

function _populatePicker() {
  const body = _container.querySelector('#ol-picker-body');
  const allScenes = _sortBySceneNum(_getBreakdownScenes());
  const includedIds = new Set(_items().filter(i => i.type === 'scene').map(i => i.sceneId));

  const allChecked = allScenes.length > 0 && allScenes.every(s => includedIds.has(s.id));

  const rows = allScenes.map(s => {
    const checked = includedIds.has(s.id) ? ' checked' : '';
    const setting = [s.intExt, s.location].filter(Boolean).join(' ');
    return `<label class="ol-pick-row">
      <input type="checkbox" class="ol-pick-chk" data-scene-id="${esc(s.id)}"${checked}/>
      <span class="ol-pick-num">${esc(s.sceneNum || '?')}</span>
      <span class="ol-pick-set">${esc(setting || '—')}</span>
      <span class="ol-pick-syn">${esc(s.description || '')}</span>
    </label>`;
  }).join('');

  body.innerHTML = `
    <label class="ol-pick-row ol-pick-row--all">
      <input type="checkbox" id="ol-select-all" ${allChecked ? 'checked' : ''}/>
      <strong>Select All</strong>
    </label>
    <div class="ol-pick-list">${rows}</div>
  `;

  // Wire picker events (they stay within the modal)
  const selectAll = body.querySelector('#ol-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      body.querySelectorAll('.ol-pick-chk').forEach(chk => chk.checked = selectAll.checked);
      _syncPickerToItems();
      _populatePicker(); // refresh counts
    });
  }

  body.querySelectorAll('.ol-pick-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      _syncPickerToItems();
      // Don't re-render everything — just update the main list behind the modal
      _updateSlugList();
    });
  });
}

function _updateSlugList() {
  const items = _items();
  const listEl = _container.querySelector('#ol-list');
  if (!listEl) return;
  const slugsHTML = items.length === 0
    ? '<p class="ol-empty">No scenes added yet. Use the Scene Picker to add scenes.</p>'
    : items.map((item, idx) => _renderItem(item, idx)).join('');
  listEl.innerHTML = slugsHTML;
  // Re-wire drag/delete on new elements (lightweight)
  _rewireListEvents();
}

function _rewireListEvents() {
  // Delete
  _container.querySelectorAll('.ol-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      _items().splice(idx, 1);
      _saveDrafts();
      _updateSlugList();
    });
  });

  // Duplicate divider
  _container.querySelectorAll('.ol-item-dup').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const items = _items();
      const dupe = JSON.parse(JSON.stringify(items[idx]));
      items.splice(idx + 1, 0, dupe);
      _saveDrafts();
      _updateSlugList();
    });
  });

  // Drag
  _container.querySelectorAll('.ol-item').forEach(el => {
    el.addEventListener('dragstart', e => {
      _dragIdx = Number(el.dataset.idx);
      el.classList.add('ol-item--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('ol-item--dragging');
      _dragIdx = null;
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetIdx = Number(el.dataset.idx);
      if (targetIdx === _dragIdx) return;
      _container.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d => d.classList.remove('ol-drop-above','ol-drop-below'));
      const rect = el.getBoundingClientRect();
      el.classList.add(e.clientY < rect.top + rect.height / 2 ? 'ol-drop-above' : 'ol-drop-below');
    });
    el.addEventListener('dragleave', () => el.classList.remove('ol-drop-above','ol-drop-below'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      const targetIdx = Number(el.dataset.idx);
      if (_dragIdx === null || _dragIdx === targetIdx) return;
      const rect = el.getBoundingClientRect();
      let insertAt = e.clientY < rect.top + rect.height / 2 ? targetIdx : targetIdx + 1;
      const curItems = _items();
      const [moved] = curItems.splice(_dragIdx, 1);
      if (insertAt > _dragIdx) insertAt--;
      curItems.splice(insertAt, 0, moved);
      _dragIdx = null;
      _saveDrafts();
      _updateSlugList();
    });
  });
}

/* ── Sync picker checkboxes to items list ── */
function _syncPickerToItems() {
  const allScenes = _getBreakdownScenes();
  const checked = new Set();
  _container.querySelectorAll('.ol-pick-chk:checked').forEach(chk => checked.add(chk.dataset.sceneId));

  const items = _items();
  // Remove unchecked scenes
  const filtered = items.filter(item => item.type !== 'scene' || checked.has(item.sceneId));
  _setItems(filtered);

  // Add newly checked scenes at end
  const existing = new Set(filtered.filter(i => i.type === 'scene').map(i => i.sceneId));
  allScenes.forEach(s => {
    if (checked.has(s.id) && !existing.has(s.id)) {
      filtered.push({ type: 'scene', sceneId: s.id });
    }
  });

  _saveDrafts();
}

/* ══════════════════════════════════════════════════════════════
   PRINT / PDF VIEW
   ══════════════════════════════════════════════════════════════ */
function _openPrintView() {
  const items = _items();
  const projectName = _getProjectName();
  const draftName = _drafts[_activeDraftId]?.name || 'Draft';
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const _e = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const shootDates = _getShootDates();

  let rowsHTML = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === 'blank') {
      const dText  = item.text || '';
      const dBold  = item.bold ? 'font-weight:700;' : '';
      const dItal  = item.italic ? 'font-style:italic;' : '';
      const dSize  = item.fontSize || 14;
      const dColor = item.fontColor || '#ffffff';
      const dAlign = item.align || 'center';
      const dFill  = item.fillColor || '#333333';
      rowsHTML += `<tr><td colspan="7" class="so-td so-td--divider" style="background:${_e(dFill)};color:${_e(dColor)};font-size:${dSize}px;text-align:${dAlign};${dBold}${dItal}padding:6px 8px;">${_e(dText)}</td></tr>`;
      continue;
    }

    if (item.type === 'daybreak') {
      const dayNum = _getDayNum(i);
      const tally = _tallyDay(i);
      const shootDate = shootDates[dayNum - 1];
      const pdLabel = shootDate ? ` — ${_fmtShootDate(shootDate)}` : '';
      rowsHTML += `<tr class="so-row--daybreak"><td colspan="3" class="so-td so-td--daybreak-label">END OF DAY ${dayNum}${_e(pdLabel)}</td><td class="so-td so-td--daybreak-pg">${_e(_formatPageTotal(tally.pages))}</td><td colspan="2" class="so-td"></td><td class="so-td so-td--daybreak-timing">${_e(_formatTimingTotal(tally.timing))}</td></tr>`;
      continue;
    }

    const scene = _findScene(item.sceneId);
    if (!scene) continue;
    const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
    const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
    const bgCount = scene.bgCount ?? '';
    const locAddr = scene.locationAddress || '';
    const dnStr = _dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '');
    const ck = _getColorKey(scene);

    rowsHTML += `<tr class="so-row so-row--${ck}">
      <td class="so-td so-td--scnum">${_e(scene.sceneNum || '—')}</td>
      <td class="so-td so-td--setting"><strong>${_e(setting || '—')}</strong>${scene.description ? '<br><em>' + _e(scene.description) + '</em>' : ''}</td>
      <td class="so-td so-td--dn">${_e(dnStr)}</td>
      <td class="so-td so-td--pg">${_e(scene.pageCount || '')}</td>
      <td class="so-td so-td--cast">${castIds ? 'Cast: ' + _e(castIds) : ''}${bgCount ? '<br>BG: ' + _e(bgCount) : ''}</td>
      <td class="so-td so-td--loc">${_e(locAddr)}</td>
      <td class="so-td so-td--timing">${_e(scene.timing || '')}</td>
    </tr>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shoot Order — ${_e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.hdr{text-align:center;padding:12px 0 8px;border-bottom:2px solid #000;margin-bottom:4px;position:relative}
.hdr-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.hdr-sub{font-size:12px;margin-top:2px;color:#333}
.hdr-date{position:absolute;top:12px;right:0;font-size:10px;color:#333}
table{width:100%;border-collapse:collapse;margin-top:2px}
th{font-size:10px;font-weight:700;text-align:left;border-bottom:1.5px solid #000;padding:3px 4px}
.so-td{padding:4px 5px;border-bottom:1px solid #999;font-size:10.5px;vertical-align:top}
.so-td--scnum{width:7%;font-weight:700;text-align:center}
.so-td--setting{width:28%}
.so-td--dn{width:6%;text-align:center;font-style:italic}
.so-td--pg{width:7%;text-align:center}
.so-td--cast{width:22%}
.so-td--loc{width:18%;text-align:center;font-style:italic;font-size:10px}
.so-td--timing{width:7%;text-align:center}
.so-row--int-day td{background:#fff}
.so-row--ext-day td{background:#f5e6a3}
.so-row--int-night td{background:#b8cce4}
.so-row--ext-night td{background:#3a5a8c;color:#fff}
.so-row--dawn td{background:#f5d6a8}
.so-row--dusk td{background:#cdb4e0}
.so-row--daybreak td{background:#222;color:#fff;font-weight:700;font-size:11px;padding:6px 8px;border-bottom:2px solid #000}
.so-td--daybreak-label{text-transform:uppercase;letter-spacing:0.05em}
.so-td--daybreak-pg{text-align:center}
.so-td--daybreak-timing{text-align:center}
em{font-size:9.5px}
@page{margin:0.75in 0.5in 0.6in 0.5in}
.running-date{position:fixed;top:0;right:0;font-size:10px;color:#333}
.running-foot{position:fixed;bottom:0;right:0;font-size:9px;color:#555}
</style></head><body>
<div class="running-date">${_e(dateStr)}</div>
<div class="running-foot" id="pg-foot"></div>
<div class="hdr">
  <div class="hdr-title">${_e(projectName)} — SHOOT ORDER</div>
  <div class="hdr-sub">${_e(draftName)} — ${_e(dateStr)}</div>
</div>
<table>
  <thead><tr>
    <th>Sc #</th><th>Set / Synopsis</th><th>D/N</th><th>Pages</th><th>Cast / BG</th><th>Location</th><th>Time</th>
  </tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<script>
window.onload=function(){
  var bodyH=document.body.scrollHeight;
  var pageH=879;
  var total=Math.max(1,Math.ceil(bodyH/pageH));
  var foot=document.getElementById('pg-foot');
  if(total===1){foot.textContent='1';}
  else{var s=document.createElement('style');s.textContent='.running-foot{counter-reset:none}.running-foot::after{content:counter(page)}';document.head.appendChild(s);foot.textContent='';}
  window.print();
}
</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}
