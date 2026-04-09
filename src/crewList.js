/* ============================================================
   The Masterbook — crewList.js
   3-row sticky header: week groups / day-type selectors / day letters.
   Position+Name frozen. Section rows with individual day cells for
   continuous week borders. Day totals in tfoot.
   ============================================================ */

const CREW_KEY      = 'movie-ledger-crew';
const SCHED_KEY     = 'movie-ledger-crew-schedule';
const DAYTYPES_KEY  = 'movie-ledger-crew-daytypes';

const DEFAULT_START = '2026-03-16';
const DEFAULT_WEEKS = 8;
const HANDLE_W      = 10;   // drag-handle column width (px)

/* ── Column Definitions ── */
const LEFT_COLS = [
  { key: 'position', label: 'POSITION', width: 100, frozen: true,  left: HANDLE_W },
  { key: 'name',     label: 'NAME',     width: 120, frozen: true,  left: HANDLE_W + 100 },
  { key: 'phone',    label: 'PHONE',    width: 96  },
  { key: 'email',    label: 'EMAIL',    width: 148 },
  { key: 'rate',     label: 'RATE',     width: 64  },
  { key: 'kitFee',   label: 'KIT FEE',  width: 58  },
];

const CHECKCOLS_KEY = 'movie-ledger-crew-checkcols';

const DEFAULT_CHECK_COLS = [
  { key: 'hired',           label: 'HIRED' },
  { key: 'onboardEmailed',  label: 'ONBOARD EMAILED' },
  { key: 'onboardComplete', label: 'ONBOARD COMPL.' },
];

function _loadCheckCols() {
  try {
    const stored = JSON.parse(localStorage.getItem(CHECKCOLS_KEY));
    if (Array.isArray(stored)) return stored;
  } catch { /* ignore */ }
  return DEFAULT_CHECK_COLS;
}

function _saveCheckCols(cols) {
  localStorage.setItem(CHECKCOLS_KEY, JSON.stringify(cols));
}

function _getRightCols() {
  const checks = _loadCheckCols();
  return [
    { key: '_days', label: '# DAYS', computed: true, width: 28 },
    ...checks.map(c => ({ key: c.key, label: c.label, check: true, width: 28 })),
    { key: 'notes', label: 'NOTES', width: 120 },
  ];
}

const DAY_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const TYPE_CLASSES = ['crew-col--prep','crew-col--shoot','crew-col--wrap','crew-col--hold'];

const DEFAULT_SECTIONS = [
  'CLIENT','AGENCY',
  'PAYROLL','PRODUCTION','CAMERA','ELECTRIC','SOUND',
  'GRIP','HMU','PRODUCTION DESIGN','TRANSPORTATION','BACKGROUND',
];

/* ── Module State ── */
let _container = null;
let _data      = [];
let _numWeeks  = DEFAULT_WEEKS;
let _dayTypes  = {};   // { 'YYYY-MM-DD': '' | 'prep' | 'shoot' | 'wrap' | 'down' }

/* Cell selection */
let _anchorCell = null;
let _focusCell  = null;
let _isSelecting = false;

/* Row drag */
let _dragSrc    = null;
let _dragTarget = null;
let _isDragRow  = false;

/* ── Entry Point ── */
export function renderCrewList(container) {
  _container = container;
  _load();
  _autoImportStaff();
  _render();
}

/* ── Persistence ── */
function _load() {
  try { _data = JSON.parse(localStorage.getItem(CREW_KEY)) || _defaultData(); } catch { _data = _defaultData(); }
  _ensureRequiredSections();
  try { _numWeeks = JSON.parse(localStorage.getItem(SCHED_KEY))?.numWeeks || DEFAULT_WEEKS; } catch { _numWeeks = DEFAULT_WEEKS; }
  try { _dayTypes = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { _dayTypes = {}; }
}

/* Ensure CLIENT and AGENCY sections exist at the top for existing projects */
function _ensureRequiredSections() {
  const required = ['CLIENT', 'AGENCY'];
  const existing = _data.map(s => s.sectionName?.toUpperCase());
  for (let i = required.length - 1; i >= 0; i--) {
    if (!existing.includes(required[i])) {
      _data.unshift({ sectionId: _uid(), sectionName: required[i], rows: [_blankRow()] });
    }
  }
}

function _save() {
  localStorage.setItem(CREW_KEY,     JSON.stringify(_data));
  localStorage.setItem(SCHED_KEY,    JSON.stringify({ numWeeks: _numWeeks }));
  localStorage.setItem(DAYTYPES_KEY, JSON.stringify(_dayTypes));
}

function _defaultData() {
  return DEFAULT_SECTIONS.map(name => ({ sectionId: _uid(), sectionName: name, rows: [_blankRow()] }));
}

function _blankRow() {
  const row = { id: _uid() };
  [...LEFT_COLS, ..._getRightCols()].forEach(c => { if (!c.computed) row[c.key] = c.check ? false : ''; });
  return row;
}

/* ── Project ── */
function _getProject() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || null; } catch { return null; }
}
function _getStartDate() { return _getProject()?.startDate || DEFAULT_START; }

/* ── Auto-import staff ── */
function _autoImportStaff() {
  const project = _getProject();
  if (!project?.staff?.length) return;
  const prod = _data.find(s => s.sectionName === 'PRODUCTION');
  if (!prod) return;
  project.staff.forEach(m => {
    if (prod.rows.some(r => r.name?.trim().toLowerCase() === m.name?.trim().toLowerCase())) return;
    const row = _blankRow();
    row.position = m.title || ''; row.name = m.name || '';
    row.email = m.email || '';    row.phone = m.phone || '';
    prod.rows.push(row);
  });
  _save();
}

/* ── Date columns ── */
function _generateDateCols() {
  const [sy, sm, sd] = _getStartDate().split('-').map(Number);
  const raw = new Date(sy, sm - 1, sd);
  // Roll back to the preceding Sunday so every week runs Sun–Sat
  const start = new Date(raw);
  start.setDate(raw.getDate() - raw.getDay());
  const cols = [];
  for (let w = 0; w < _numWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const dow = date.getDay();
      cols.push({
        key: _iso(date), dateStr: _iso(date),
        dayLetter: DAY_NAMES[dow][0],
        shortDate: `${date.getMonth()+1}/${date.getDate()}`,
        dow, isWeekend: dow === 0 || dow === 6, isWeekStart: d === 0, weekNum: w + 1,
      });
    }
  }
  return cols;
}

function _iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _countDays(row, dateCols) { return dateCols.filter(c => row[c.key] === '1').length; }

function _dayTypeClass(dateKey) {
  const t = _dayTypes[dateKey];
  return t ? `crew-col--${t}` : '';
}

/* ── Render ── */
function _render() {
  _container.innerHTML = _buildHTML();
  _attachListeners();
}

/* ── HTML ── */
function _buildHTML() {
  const dateCols = _generateDateCols();
  const firstDate = new Date(dateCols[0].dateStr + 'T00:00:00');
  const lastDate  = new Date(dateCols[dateCols.length - 1].dateStr + 'T00:00:00');
  const rangeLabel = `${_fmtDate(firstDate)} – ${_fmtDate(lastDate)}`;

  /* ── Header row 1: week groups (fixed cols span 3 rows) ── */
  const handleTh = `<th class="crew-th crew-th--handle" rowspan="3"></th>`;

  const leftThs = LEFT_COLS.map(c => {
    const style = c.frozen ? `position:sticky;left:${c.left}px;z-index:30;` : '';
    return `<th class="crew-th crew-th--left" rowspan="3" style="width:${c.width}px;min-width:${c.width}px;${style}">${esc(c.label)}</th>`;
  }).join('');

  const rightCols = _getRightCols();
  const rightThs = rightCols.map((c, i) => {
    const isNotes = c.key === 'notes';
    const cls = `crew-th crew-th--right${i===0?' crew-cell--right-first':''}${isNotes?' crew-th--right-notes':''}`;
    if (c.check) {
      return `<th class="${cls}" rowspan="3" style="width:${c.width}px;min-width:${c.width}px;">
        <span class="crew-col-label" contenteditable="plaintext-only" data-col-key="${c.key}">${esc(c.label)}</span></th>`;
    }
    return `<th class="${cls}" rowspan="3" style="width:${c.width}px;min-width:${c.width}px;">${esc(c.label)}</th>`;
  }).join('');

  const actionsTh = `<th class="crew-th crew-th--actions" rowspan="3"></th>`;

  const weekGroupThs = [];
  for (let w = 0; w < _numWeeks; w++) {
    const wCols = dateCols.slice(w * 7, w * 7 + 7);
    weekGroupThs.push(`<th class="crew-th crew-th--week-group" colspan="7">${esc(`WK ${w+1} · ${wCols[0].shortDate}–${wCols[6].shortDate}`)}</th>`);
  }

  /* ── Header row 2: day-type selectors ── */
  const dayTypeThs = dateCols.map(c => {
    const type = _dayTypes[c.key] || '';
    let cls = `crew-th crew-th--daytype${c.isWeekend ? ' crew-th--weekend' : ''}${c.isWeekStart ? ' crew-th--week-start' : ''}${type ? ` crew-col--${type}` : ''}`;
    return `<th class="${cls}" data-col="${c.key}">
      <select class="crew-daytype-select" data-date="${c.key}" title="Day type">
        <option value="">—</option>
        <option value="prep"${type==='prep'?' selected':''}>PREP</option>
        <option value="shoot"${type==='shoot'?' selected':''}>SHOOT</option>
        <option value="wrap"${type==='wrap'?' selected':''}>WRAP</option>
        <option value="hold"${type==='hold'?' selected':''}>HOLD</option>
      </select>
    </th>`;
  }).join('');

  /* ── Header row 3: day letters ── */
  const dayLetterThs = dateCols.map(c => {
    const type = _dayTypes[c.key] || '';
    let cls = `crew-th crew-th--day${c.isWeekend?' crew-th--weekend':''}${c.isWeekStart?' crew-th--week-start':''}${type?` crew-col--${type}`:''}`;
    return `<th class="${cls}" data-col="${c.key}" title="${c.dateStr}"><span class="crew-day-name">${c.dayLetter}</span><span class="crew-day-date">${c.shortDate}</span></th>`;
  }).join('');

  /* ── Sections ── */
  const bodyHTML = _data.map((sec, si) => _buildSection(sec, si, dateCols)).join('');

  /* ── Footer ── */
  const footHTML = _buildTfoot(dateCols);

  return `
    <div class="crew-inner">
      <div class="crew-toolbar">
        <span class="crew-date-range">${esc(rangeLabel)}</span>
        <div class="crew-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="crew-import-staff">↓ Re-import Staff</button>
          <button class="btn btn--ghost btn--sm" id="crew-add-section">+ Department</button>
          <button class="btn btn--ghost btn--sm" id="crew-add-col">+ Column</button>
          <button class="btn btn--ghost btn--sm" id="crew-extend">+ Week</button>
          <button class="btn btn--ghost btn--sm" id="crew-shrink" ${_numWeeks<=1?'disabled':''}>− Week</button>
        </div>
      </div>
      <div class="crew-scroll-wrap">
        <table class="crew-table" id="crew-table" cellspacing="0" cellpadding="0">
          <thead>
            <tr class="crew-header-row crew-header-row--weeks">
              ${handleTh}${leftThs}${weekGroupThs.join('')}${rightThs}${actionsTh}
            </tr>
            <tr class="crew-header-row crew-header-row--daytypes">${dayTypeThs}</tr>
            <tr class="crew-header-row crew-header-row--days">${dayLetterThs}</tr>
          </thead>
          <tbody id="crew-tbody">${bodyHTML}</tbody>
          ${footHTML}
        </table>
      </div>
    </div>
  `;
}

/* ── Section row: individual cells so week borders are continuous ── */
function _buildSection(sec, si, dateCols) {
  // Handle cell
  const handleCell = `<td class="crew-cell crew-cell--sticky crew-sec-handle" style="left:0;width:${HANDLE_W}px;"></td>`;

  // Position + Name merged (sticky, colspan=2)
  const nameCellStyle = `position:sticky;left:${HANDLE_W}px;z-index:2;`;
  const isProtected = ['CLIENT','AGENCY','PRODUCTION'].includes(sec.sectionName?.toUpperCase());
  const delSectionBtn = isProtected ? '' : ` <button class="btn btn--ghost btn--sm crew-del-section" data-section-idx="${si}" title="Delete department">✕</button>`;
  const nameCell = `<td class="crew-cell crew-cell--sticky crew-sec-name-cell" colspan="2" style="${nameCellStyle}">
    <span class="crew-sec-name" contenteditable="plaintext-only" data-section-idx="${si}">${esc(sec.sectionName)}</span>
    <button class="btn btn--ghost btn--sm crew-add-row" data-section-idx="${si}" title="Add row">+</button>
  </td>`;

  // Remaining LEFT_COLS (phone, email, rate, kitFee)
  const remainingLeft = LEFT_COLS.slice(2).map(() => `<td class="crew-cell crew-sec-bg"></td>`).join('');

  // Day cells — individual for week-separator continuity
  const dayCells = dateCols.map(c => {
    const tc = _dayTypeClass(c.key);
    let cls = `crew-cell crew-sec-bg${c.isWeekStart?' crew-cell--week-start':''}${tc?' '+tc:''}`;
    return `<td class="${cls}" data-col="${c.key}"></td>`;
  }).join('');

  // Right cols
  const rightCells = _getRightCols().map((_, i) => `<td class="crew-cell crew-sec-bg${i===0?' crew-cell--right-first':''}"></td>`).join('');

  const rowsHTML = sec.rows.map((row, ri) => _buildRow(row, si, ri, dateCols)).join('');

  return `
    <tr class="crew-sec-row">
      ${handleCell}${nameCell}${remainingLeft}${dayCells}${rightCells}
      <td class="crew-cell crew-sec-bg crew-cell--del">${delSectionBtn}</td>
    </tr>
    ${rowsHTML}
  `;
}

/* ── Data row ── */
function _buildRow(row, si, ri, dateCols) {
  const handleCell = `<td class="crew-cell crew-cell--sticky crew-cell--handle" style="left:0"><span class="crew-handle-nub" title="Drag to reorder">⠿</span></td>`;

  const leftCells = LEFT_COLS.map(c => {
    const raw   = row[c.key] ?? '';
    const val   = c.key === 'phone' ? _formatPhone(raw) : raw;
    const style = c.frozen ? `position:sticky;left:${c.left}px;z-index:2;` : '';
    return `<td class="crew-cell crew-cell--left${c.frozen?' crew-cell--sticky':''}" style="${style}" data-si="${si}" data-ri="${ri}" data-col="${c.key}">
      <div class="crew-cell-inner" contenteditable="plaintext-only" data-si="${si}" data-ri="${ri}" data-col="${c.key}">${esc(val)}</div>
    </td>`;
  }).join('');

  const dayCells = dateCols.map(c => {
    const on = row[c.key] === '1';
    const tc = _dayTypeClass(c.key);
    let cls = `crew-cell crew-cell--day${c.isWeekend?' crew-cell--weekend':''}${c.isWeekStart?' crew-cell--week-start':''}${on?' crew-cell--on':''}${tc?' '+tc:''}`;
    return `<td class="${cls}" data-si="${si}" data-ri="${ri}" data-col="${c.key}" data-day="1" title="${c.dateStr}"><span class="crew-day-dot">${on?'1':''}</span></td>`;
  }).join('');

  const numDays   = _countDays(row, dateCols);
  const rightCells = _getRightCols().map(c => {
    if (c.computed) return `<td class="crew-cell crew-cell--right crew-cell--computed crew-cell--right-first" data-si="${si}" data-ri="${ri}" data-col="${c.key}"><span class="crew-days-count">${numDays||''}</span></td>`;
    if (c.check)    return `<td class="crew-cell crew-cell--right crew-cell--check" data-si="${si}" data-ri="${ri}" data-col="${c.key}"><input type="checkbox" class="crew-check" data-si="${si}" data-ri="${ri}" data-col="${c.key}"${row[c.key]?' checked':''} /></td>`;
    const val = row[c.key] ?? '';
    return `<td class="crew-cell crew-cell--right" data-si="${si}" data-ri="${ri}" data-col="${c.key}"><div class="crew-cell-inner" contenteditable="plaintext-only" data-si="${si}" data-ri="${ri}" data-col="${c.key}">${esc(val)}</div></td>`;
  }).join('');

  return `<tr class="crew-row" data-si="${si}" data-ri="${ri}" data-row-id="${row.id}">
    ${handleCell}${leftCells}${dayCells}${rightCells}
    <td class="crew-cell crew-cell--del"><button class="crew-del-btn btn btn--ghost btn--sm" data-si="${si}" data-ri="${ri}" title="Delete row">✕</button></td>
  </tr>`;
}

/* ── Footer ── */
function _buildTfoot(dateCols) {
  const allRows = _data.flatMap(s => s.rows);

  const handleCell = `<td class="crew-cell crew-cell--sticky" style="left:0;width:${HANDLE_W}px;"></td>`;

  const leftCells = LEFT_COLS.map((c, i) => {
    const style = c.frozen ? `position:sticky;left:${c.left}px;z-index:2;` : '';
    return `<td class="crew-cell crew-cell--left${c.frozen?' crew-cell--sticky':''} crew-total-label" style="${style}">${i===0?'TOTAL':''}</td>`;
  }).join('');

  const dayCells = dateCols.map(c => {
    const count = allRows.filter(r => r[c.key] === '1').length;
    const tc = _dayTypeClass(c.key);
    let cls = `crew-cell crew-cell--day crew-total-day${c.isWeekStart?' crew-cell--week-start':''}${tc?' '+tc:''}`;
    return `<td class="${cls}" data-col="${c.key}" title="${c.dateStr}">${count>0?count:''}</td>`;
  }).join('');

  const rightCells = _getRightCols().map((_, i) => `<td class="crew-cell crew-cell--right${i===0?' crew-cell--right-first':''}"></td>`).join('');

  return `<tfoot><tr class="crew-total-row">${handleCell}${leftCells}${dayCells}${rightCells}<td class="crew-cell crew-cell--del"></td></tr></tfoot>`;
}

/* ── Listeners ── */
function _attachListeners() {
  const tbody = _container.querySelector('#crew-tbody');

  _container.querySelector('#crew-import-staff').addEventListener('click', () => { _autoImportStaff(); _render(); });
  _container.querySelector('#crew-add-section').addEventListener('click', _addSection);
  _container.querySelector('#crew-add-col').addEventListener('click', _addCheckCol);
  _container.querySelector('#crew-extend').addEventListener('click',  () => { _numWeeks++; _save(); _render(); });
  _container.querySelector('#crew-shrink').addEventListener('click',  () => { if (_numWeeks>1) { _numWeeks--; _save(); _render(); } });

  /* Check column header edit */
  _container.querySelectorAll('.crew-col-label').forEach(el => {
    el.addEventListener('blur', e => {
      const colKey = e.target.dataset.colKey;
      const newLabel = e.target.textContent.trim();
      if (!newLabel) return;
      const cols = _loadCheckCols();
      const col = cols.find(c => c.key === colKey);
      if (col) { col.label = newLabel; _saveCheckCols(cols); }
    });
  });

  /* Delete check column */
  _container.querySelectorAll('.crew-del-col').forEach(btn => {
    btn.addEventListener('click', e => {
      const colKey = e.target.dataset.colKey;
      const cols = _loadCheckCols();
      const idx = cols.findIndex(c => c.key === colKey);
      if (idx === -1) return;
      if (!confirm(`Remove column "${cols[idx].label}"?`)) return;
      cols.splice(idx, 1);
      _saveCheckCols(cols);
      _save(); _render();
    });
  });

  /* Day-type selects */
  _container.querySelectorAll('.crew-daytype-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const date = e.target.dataset.date;
      _dayTypes[date] = e.target.value;
      _save();
      _applyDayTypeInPlace(date, e.target.value);
    });
  });

  /* Section name edit */
  _container.querySelectorAll('.crew-sec-name').forEach(el => {
    el.addEventListener('blur', e => {
      const si = Number(e.target.dataset.sectionIdx);
      if (_data[si]) { _data[si].sectionName = e.target.textContent.trim(); _save(); }
    });
  });

  /* Add row */
  _container.querySelectorAll('.crew-add-row').forEach(btn => {
    btn.addEventListener('click', e => {
      const si = Number(e.target.dataset.sectionIdx);
      _data[si].rows.push(_blankRow()); _save(); _render();
    });
  });

  /* Delete section */
  _container.querySelectorAll('.crew-del-section').forEach(btn => {
    btn.addEventListener('click', e => {
      const si = Number(e.target.dataset.sectionIdx);
      const name = _data[si]?.sectionName || 'this department';
      if (!confirm(`Delete department "${name}" and all its rows?`)) return;
      _data.splice(si, 1);
      _save(); _render();
    });
  });

  /* Delete row */
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.crew-del-btn');
    if (!btn) return;
    const si = Number(btn.dataset.si), ri = Number(btn.dataset.ri);
    if (_data[si].rows.length === 1) _data[si].rows[ri] = _blankRow();
    else _data[si].rows.splice(ri, 1);
    _save(); _render();
  });

  /* Day cell toggle (in-place) */
  tbody.addEventListener('click', e => {
    if (_isDragRow) return;
    const td = e.target.closest('td[data-day]');
    if (!td) return;
    const { si, ri, col } = td.dataset;
    if (!_data[si]?.rows[ri]) return;
    _data[si].rows[ri][col] = _data[si].rows[ri][col] === '1' ? '' : '1';
    _save();
    const on = _data[si].rows[ri][col] === '1';
    td.classList.toggle('crew-cell--on', on);
    td.querySelector('.crew-day-dot').textContent = on ? '1' : '';
    // Update # DAYS
    const dateCols = _generateDateCols();
    const cnt = _countDays(_data[si].rows[ri], dateCols);
    const daysEl = tbody.querySelector(`td[data-si="${si}"][data-ri="${ri}"][data-col="_days"] .crew-days-count`);
    if (daysEl) daysEl.textContent = cnt || '';
    // Update tfoot total
    const total = _data.flatMap(s => s.rows).filter(r => r[col] === '1').length;
    const totalCell = _container.querySelector(`tfoot td[data-col="${col}"]`);
    if (totalCell) totalCell.textContent = total > 0 ? total : '';
  });

  /* Text cells */
  _container.querySelectorAll('.crew-cell-inner').forEach(el => {
    el.addEventListener('blur', e => {
      const { si, ri, col } = e.target.dataset;
      if (!_data[si]?.rows[ri]) return;
      let val = e.target.textContent.trim();
      if (col === 'phone') { val = _formatPhone(val); e.target.textContent = val; }
      _data[si].rows[ri][col] = val;
      _save();
    });
    el.addEventListener('keydown', _handleCellKeydown);
    el.addEventListener('mousedown', _handleCellMouseDown);
    el.addEventListener('mouseover',  _handleCellMouseOver);
  });

  /* Checkboxes */
  _container.querySelectorAll('.crew-check').forEach(chk => {
    chk.addEventListener('change', e => {
      const { si, ri, col } = e.target.dataset;
      if (_data[si]?.rows[ri]) { _data[si].rows[ri][col] = e.target.checked; _save(); }
    });
  });

  /* Row drag */
  tbody.addEventListener('mousedown', e => {
    const nub = e.target.closest('.crew-handle-nub');
    if (!nub) return;
    e.preventDefault();
    const row = nub.closest('.crew-row');
    if (!row) return;
    _dragSrc = { si: Number(row.dataset.si), ri: Number(row.dataset.ri), el: row };
    _isDragRow = true;
    row.classList.add('crew-row--dragging');
    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup',   _onDragEnd);
  });

  document.addEventListener('mouseup',  _handleCellMouseUp);
  document.addEventListener('keydown',  _handleGlobalKey);
}

/* ── Day-type in-place update ── */
function _applyDayTypeInPlace(date, type) {
  const newClass = type ? `crew-col--${type}` : '';
  _container.querySelectorAll(`[data-col="${date}"]`).forEach(cell => {
    if (cell.classList.contains('crew-sec-bg')) return;
    TYPE_CLASSES.forEach(cls => cell.classList.remove(cls));
    if (newClass) cell.classList.add(newClass);
  });
}

/* ── Row Drag ── */
function _onDragMove(e) {
  if (!_isDragRow || !_dragSrc) return;
  const el  = document.elementFromPoint(e.clientX, e.clientY);
  const row = el?.closest('.crew-row');
  _clearDropLines();
  if (!row || row === _dragSrc.el) { _dragTarget = null; return; }
  const rect = row.getBoundingClientRect();
  const above = e.clientY < rect.top + rect.height / 2;
  row.classList.add(above ? 'crew-drop-above' : 'crew-drop-below');
  _dragTarget = { si: Number(row.dataset.si), ri: Number(row.dataset.ri), above };
}

function _onDragEnd() {
  _isDragRow = false;
  document.removeEventListener('mousemove', _onDragMove);
  document.removeEventListener('mouseup',   _onDragEnd);
  _clearDropLines();
  _dragSrc?.el?.classList.remove('crew-row--dragging');
  if (_dragSrc && _dragTarget) { _moveRow(_dragSrc, _dragTarget); _save(); _render(); }
  _dragSrc = _dragTarget = null;
}

function _clearDropLines() {
  _container?.querySelectorAll('.crew-drop-above,.crew-drop-below').forEach(el =>
    el.classList.remove('crew-drop-above','crew-drop-below')
  );
}

function _moveRow(src, target) {
  const [row] = _data[src.si].rows.splice(src.ri, 1);
  if (_data[src.si].rows.length === 0) _data[src.si].rows.push(_blankRow());
  let tgtRi = target.ri;
  if (src.si === target.si && src.ri < tgtRi) tgtRi--;
  const insertAt = target.above ? tgtRi : tgtRi + 1;
  if (!_data[target.si]) return;
  _data[target.si].rows.splice(Math.max(0, Math.min(insertAt, _data[target.si].rows.length)), 0, row);
}

/* ── Keyboard nav ── */
function _handleCellKeydown(e) {
  const el = e.target, si = Number(el.dataset.si), ri = Number(el.dataset.ri), col = el.dataset.col;
  const keys = _getTextColKeys(), ci = keys.indexOf(col);

  if (e.key === 'Tab') {
    e.preventDefault();
    const next = e.shiftKey ? _prevCell(si,ri,ci,keys) : _nextCell(si,ri,ci,keys);
    if (next) { next.focus(); _selectAll(next); }
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); el.blur();
    const below = _cellAt(si,ri+1,col) ?? _cellAt(si+1,0,col);
    if (below) { below.focus(); _selectAll(below); }
  } else if (e.key === 'Escape') {
    el.blur();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const next = e.key === 'ArrowUp'
      ? (_cellAt(si,ri-1,col) ?? _cellAt(si-1,(_data[si-1]?.rows.length??1)-1,col))
      : (_cellAt(si,ri+1,col) ?? _cellAt(si+1,0,col));
    if (next) { e.preventDefault(); next.focus(); _selectAll(next); }
  }
}

function _getTextColKeys() {
  return [...LEFT_COLS.map(c=>c.key), ..._getRightCols().filter(c=>!c.check&&!c.computed).map(c=>c.key)];
}
function _nextCell(si,ri,ci,keys) {
  if (ci<keys.length-1) return _cellAt(si,ri,keys[ci+1]);
  if (ri<_data[si].rows.length-1) return _cellAt(si,ri+1,keys[0]);
  if (si<_data.length-1) return _cellAt(si+1,0,keys[0]);
  return null;
}
function _prevCell(si,ri,ci,keys) {
  if (ci>0) return _cellAt(si,ri,keys[ci-1]);
  if (ri>0) return _cellAt(si,ri-1,keys[keys.length-1]);
  if (si>0) return _cellAt(si-1,_data[si-1].rows.length-1,keys[keys.length-1]);
  return null;
}
function _cellAt(si,ri,col) { return _container?.querySelector(`.crew-cell-inner[data-si="${si}"][data-ri="${ri}"][data-col="${col}"]`)??null; }
function _selectAll(el) { const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r); }

/* ── Cell drag-select ── */
function _handleCellMouseDown(e) {
  if (e.button!==0||_isDragRow) return;
  const el=e.target.closest('.crew-cell-inner'); if (!el) return;
  const cell={si:Number(el.dataset.si),ri:Number(el.dataset.ri),col:el.dataset.col};
  if (e.shiftKey && _anchorCell) {
    // Shift+click: extend selection from anchor to clicked cell
    _focusCell=cell;
    _applySelection();
    e.preventDefault();
    return;
  }
  _anchorCell=cell; _focusCell={..._anchorCell}; _isSelecting=false; _clearSelection();
}
function _handleCellMouseOver(e) {
  if (!_anchorCell||e.buttons!==1||_isDragRow) return;
  const el=e.target.closest('.crew-cell-inner'); if (!el) return;
  _isSelecting=true;
  _focusCell={si:Number(el.dataset.si),ri:Number(el.dataset.ri),col:el.dataset.col};
  _applySelection();
}
function _handleCellMouseUp() { if (_isSelecting) _applySelection(); _isSelecting=false; }
function _clearSelection() { _container?.querySelectorAll('.crew-selected').forEach(el=>el.classList.remove('crew-selected')); }
function _applySelection() {
  if (!_anchorCell||!_focusCell) return;
  _clearSelection();
  const keys=_getTextColKeys();
  const minSi=Math.min(_anchorCell.si,_focusCell.si),maxSi=Math.max(_anchorCell.si,_focusCell.si);
  const aci=keys.indexOf(_anchorCell.col),fci=keys.indexOf(_focusCell.col);
  const minCi=Math.min(aci,fci),maxCi=Math.max(aci,fci);
  for (let si=minSi;si<=maxSi;si++) {
    const rows=_data[si]?.rows??[];
    const minRi=si===minSi?Math.min(_anchorCell.ri,_focusCell.ri):0;
    const maxRi=si===maxSi?Math.max(_anchorCell.ri,_focusCell.ri):rows.length-1;
    for (let ri=minRi;ri<=maxRi;ri++)
      for (let ci=minCi;ci<=maxCi;ci++) { const el=_cellAt(si,ri,keys[ci]); if (el) el.closest('td')?.classList.add('crew-selected'); }
  }
}

/* ── Copy/Paste ── */
function _handleGlobalKey(e) {
  // Only intercept when crew list is actually rendered (check for crew-specific DOM)
  if (!_container || !_container.querySelector('.crew-table')) {
    document.removeEventListener('keydown', _handleGlobalKey);
    _anchorCell = null; _focusCell = null;
    return;
  }
  if (!_anchorCell) return;
  const ctrl=/mac/i.test(navigator.platform)?e.metaKey:e.ctrlKey;
  if (ctrl&&e.key==='c') { e.preventDefault(); _copySelection(); }
  if (ctrl&&e.key==='v') { e.preventDefault(); _pasteAtAnchor(); }
}
function _copySelection() {
  if (!_anchorCell||!_focusCell) return;
  const keys=_getTextColKeys();
  const minSi=Math.min(_anchorCell.si,_focusCell.si),maxSi=Math.max(_anchorCell.si,_focusCell.si);
  const aci=keys.indexOf(_anchorCell.col),fci=keys.indexOf(_focusCell.col);
  const minCi=Math.min(aci,fci),maxCi=Math.max(aci,fci);
  const lines=[];
  for (let si=minSi;si<=maxSi;si++) {
    const rows=_data[si]?.rows??[];
    const minRi=si===minSi?Math.min(_anchorCell.ri,_focusCell.ri):0;
    const maxRi=si===maxSi?Math.max(_anchorCell.ri,_focusCell.ri):rows.length-1;
    for (let ri=minRi;ri<=maxRi;ri++) {
      const row=rows[ri]; if (!row) continue;
      lines.push(Array.from({length:maxCi-minCi+1},(_,i)=>String(row[keys[minCi+i]]??'')).join('\t'));
    }
  }
  navigator.clipboard.writeText(lines.join('\n')).catch(()=>{});
}
async function _pasteAtAnchor() {
  if (!_anchorCell) return;
  let text; try { text=await navigator.clipboard.readText(); } catch { return; }
  if (!text) return;
  const keys=_getTextColKeys(),aci=keys.indexOf(_anchorCell.col);
  let si=_anchorCell.si,ri=_anchorCell.ri;
  text.split('\n').forEach(rowStr => {
    rowStr.split('\t').forEach((val,di)=>{
      const col=keys[aci+di]; if (!col||!_data[si]) return;
      while (_data[si].rows.length<=ri) _data[si].rows.push(_blankRow());
      _data[si].rows[ri][col]=val;
    });
    ri++;
    if (ri>=(_data[si]?.rows.length??0)&&si<_data.length-1) { si++;ri=0; }
  });
  _save(); _render();
}

/* ── Add Department section (no prompt — editable inline) ── */
function _addSection() {
  _data.push({sectionId:_uid(),sectionName:'NEW DEPARTMENT',rows:[_blankRow(),_blankRow(),_blankRow()]});
  _save(); _render();
  // Focus the new section name for immediate renaming
  const names = _container.querySelectorAll('.crew-sec-name');
  const last  = names[names.length - 1];
  if (last) { last.focus(); _selectAll(last); }
}

/* ── Add check column ── */
function _addCheckCol() {
  const cols = _loadCheckCols();
  const newKey = `check_${_uid()}`;
  cols.push({ key: newKey, label: 'NEW CHECK' });
  _saveCheckCols(cols);
  // Initialize all existing rows with false for the new column
  _data.forEach(sec => sec.rows.forEach(row => { row[newKey] = false; }));
  _save(); _render();
}

/* ── Phone formatter ── */
function _formatPhone(val) {
  const d = val.replace(/\D/g,'');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return val;
}

/* ── Utilities ── */
function _fmtDate(d) { return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function _uid()      { return crypto.randomUUID(); }
function esc(str)    { return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
