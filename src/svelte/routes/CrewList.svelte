<script>
  import { onMount } from 'svelte';
  import { getBudgetLineMap } from '../../budget.js';

  let { tab = 'crew', setTab = () => {} } = $props();

  /* ── Constants ── */
  const CREW_KEY      = 'movie-ledger-crew';
  const SCHED_KEY     = 'movie-ledger-crew-schedule';
  const DAYTYPES_KEY  = 'movie-ledger-crew-daytypes';
  const CHECKCOLS_KEY = 'movie-ledger-crew-checkcols';
  const HIDDENCOLS_KEY = 'movie-ledger-crew-hiddencols';
  const DEFAULT_START = '2026-03-16';
  const DEFAULT_WEEKS = 8;
  const HANDLE_W      = 10;

  /**
   * Position is 132 because that is what the longest real job titles need.
   * Measured at the table's own 10px: "Key Hair & Makeup Artist" is 112px of
   * text and "Director of Photography" 106px, plus the cell's 8px of padding.
   * At 100 the DP was being cut off, and it is not even the longest one.
   *
   * The sticky offsets are computed rather than written down. They used to be,
   * and `left: HANDLE_W + 100` had to be edited by hand every time the column
   * beside it changed width — miss it and the two frozen columns overlap.
   */
  const LEFT_COLS = (() => {
    const cols = [
      { key: 'position', label: 'POSITION', width: 132, frozen: true },
      { key: 'name',     label: 'NAME',     width: 120, frozen: true },
      { key: 'phone',    label: 'PHONE',    width: 96  },
      { key: 'email',    label: 'EMAIL',    width: 148 },
      { key: 'rate',     label: 'RATE',     width: 64  },
      { key: 'kitFee',   label: 'KIT FEE',  width: 58  },
    ];
    let x = HANDLE_W;
    for (const c of cols) if (c.frozen) { c.left = x; x += c.width; }
    return cols;
  })();

  const DEFAULT_CHECK_COLS = [
    { key: 'hired',           label: 'HIRED' },
    { key: 'onboardEmailed',  label: 'ONBOARD EMAILED' },
    { key: 'onboardComplete', label: 'ONBOARD COMPL.' },
  ];

  const DEFAULT_SECTIONS = [
    'CLIENT','AGENCY',
    'PAYROLL','PRODUCTION','CAMERA','ELECTRIC','SOUND',
    'GRIP','HMU','PRODUCTION DESIGN','TRANSPORTATION','BACKGROUND',
  ];
  const DAY_NAMES    = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const TYPE_CLASSES = ['crew-col--prep','crew-col--shoot','crew-col--wrap','crew-col--hold'];

  /* ── Position suggestions ─────────────────────────────────────────
   * Positions are typed into the crew list and separately into the budget as
   * line descriptions. Typing them twice means they drift — "Gaffer" here and
   * "Gaffer " or "Key Grip/Gaffer" there — and once they drift nothing can be
   * matched between the two. Suggesting what the budget already calls things
   * is what keeps a crew member and a budget line referring to each other.
   *
   * Read from the budget's own line map rather than a list kept in parallel,
   * so a position renamed in the budget is what gets offered here.
   */
  let budgetPositions = $state([]);
  let suggestFor  = $state(null);   // { si, ri } of the cell being typed into
  let suggestList = $state([]);
  let suggestAt   = $state({ x: 0, y: 0 });
  let suggestIdx  = $state(0);

  function loadBudgetPositions() {
    try {
      const seen = new Set();
      for (const info of getBudgetLineMap().values()) {
        const d = (info.description || '').trim();
        if (d && !info.isFringeLine) seen.add(d);
      }
      budgetPositions = [...seen].sort((a, b) => a.localeCompare(b));
    } catch { budgetPositions = []; }
  }

  function openSuggestions(el, si, ri) {
    const typed = el.textContent.trim().toLowerCase();
    // Nothing typed yet is not a prompt to list the entire budget at them.
    if (!typed) { suggestFor = null; return; }
    const hits = budgetPositions
      .filter(p => p.toLowerCase().includes(typed) && p.toLowerCase() !== typed)
      .slice(0, 8);
    if (!hits.length) { suggestFor = null; return; }
    const r = el.getBoundingClientRect();
    suggestAt   = { x: Math.round(r.left), y: Math.round(r.bottom) };
    suggestList = hits;
    suggestIdx  = 0;
    suggestFor  = { si, ri };
  }

  function applySuggestion(value) {
    if (!suggestFor) return;
    const { si, ri } = suggestFor;
    setCellValue(si, ri, 'position', value);
    suggestFor = null;
    // Re-render so the cell shows the chosen text — the action that owns the
    // cell's content only writes when the element is not focused.
    const el = cellAt(si, ri, 'position');
    if (el) { el.textContent = value; el.blur(); }
  }

  /* ── State ── */
  let data      = $state([]);
  let numWeeks  = $state(DEFAULT_WEEKS);
  let dayTypes  = $state({});
  let checkCols = $state([...DEFAULT_CHECK_COLS]);

  /**
   * Left-hand columns the user has put away. Only the money ones can be
   * hidden — a crew list with no Position or Name is not a crew list, and
   * Phone and Email are the reason most people open this screen.
   *
   * Hiding rather than deleting: the values stay in the data and come back
   * untouched, which matters because this is what gets shown in a room where
   * not everyone should be reading rates.
   */
  const HIDEABLE = [
    { key: 'rate',   label: 'Rate' },
    { key: 'kitFee', label: 'Kit Fee' },
  ];
  let hiddenCols = $state([]);

  /** Which document to print is now a choice, so the button carries a menu. */
  let printMenuOpen = $state(false);

  /* ── Load ── */
  (function _load() {
    try { data      = JSON.parse(localStorage.getItem(CREW_KEY))     || _defaultData();    } catch { data = _defaultData(); }
    try { numWeeks  = JSON.parse(localStorage.getItem(SCHED_KEY))?.numWeeks || DEFAULT_WEEKS; } catch { numWeeks = DEFAULT_WEEKS; }
    try { dayTypes  = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {};                } catch { dayTypes = {}; }
    try {
      const stored = JSON.parse(localStorage.getItem(CHECKCOLS_KEY));
      if (Array.isArray(stored)) checkCols = stored;
    } catch {}
    try {
      const stored = JSON.parse(localStorage.getItem(HIDDENCOLS_KEY));
      if (Array.isArray(stored)) hiddenCols = stored;
    } catch {}
    _ensureRequiredSections();
    _autoImportStaff();
  })();

  function _defaultData() {
    return DEFAULT_SECTIONS.map(name => ({ sectionId: _uid(), sectionName: name, rows: [_blankRow()] }));
  }

  function _ensureRequiredSections() {
    const required = ['CLIENT', 'AGENCY'];
    const existing = data.map(s => s.sectionName?.toUpperCase());
    for (let i = required.length - 1; i >= 0; i--) {
      if (!existing.includes(required[i])) {
        data.unshift({ sectionId: _uid(), sectionName: required[i], rows: [_blankRow()] });
      }
    }
  }

  function _blankRow() {
    const row = { id: _uid() };
    [...LEFT_COLS, ..._rightCols()].forEach(c => { if (!c.computed) row[c.key] = c.check ? false : ''; });
    return row;
  }

  function _rightCols() {
    return [
      { key: '_days', label: '# DAYS', computed: true, width: 28 },
      ...checkCols.map(c => ({ key: c.key, label: c.label, check: true, width: 28 })),
      { key: 'notes', label: 'NOTES', width: 120 },
    ];
  }

  /* ── Save ── */
  function _notifyPersonnelChanged() {
    window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'personnel' } }));
  }

  function save() {
    localStorage.setItem(CREW_KEY,     JSON.stringify(data));
    localStorage.setItem(SCHED_KEY,    JSON.stringify({ numWeeks }));
    localStorage.setItem(DAYTYPES_KEY, JSON.stringify(dayTypes));
    _notifyPersonnelChanged();
  }

  function toggleHiddenCol(key) {
    hiddenCols = hiddenCols.includes(key)
      ? hiddenCols.filter(k => k !== key)
      : [...hiddenCols, key];
    localStorage.setItem(HIDDENCOLS_KEY, JSON.stringify(hiddenCols));
  }

  function saveCheckCols() {
    localStorage.setItem(CHECKCOLS_KEY, JSON.stringify(checkCols));
    _notifyPersonnelChanged();
  }

  /* ── Derived ── */
  // Every place that walks the left columns uses this rather than LEFT_COLS,
  // so a hidden column disappears from the header, the rows, the section
  // banners, keyboard navigation and copy/paste in one move. Missing one of
  // those is how a hidden column ends up still reachable by Tab.
  let visibleLeftCols = $derived(LEFT_COLS.filter(c => !hiddenCols.includes(c.key)));

  let dateCols = $derived.by(() => {
    const [sy, sm, sd] = _getStartDate().split('-').map(Number);
    const raw   = new Date(sy, sm - 1, sd);
    const start = new Date(raw);
    start.setDate(raw.getDate() - raw.getDay());
    const cols = [];
    for (let w = 0; w < numWeeks; w++) {
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
  });

  let rightCols = $derived(_rightCols());

  let weekGroups = $derived.by(() => {
    const groups = [];
    for (let w = 0; w < numWeeks; w++) {
      const wCols = dateCols.slice(w * 7, w * 7 + 7);
      groups.push(`WK ${w+1} · ${wCols[0].shortDate}–${wCols[6].shortDate}`);
    }
    return groups;
  });

  let rangeLabel = $derived.by(() => {
    if (!dateCols.length) return '';
    const f = new Date(dateCols[0].dateStr  + 'T00:00:00');
    const l = new Date(dateCols[dateCols.length-1].dateStr + 'T00:00:00');
    return `${_fmtDate(f)} – ${_fmtDate(l)}`;
  });

  let allRows = $derived(data.flatMap(s => s.rows));

  /* ── Project / staff ── */
  function _getProject() {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || null; } catch { return null; }
  }
  function _getStartDate() { return _getProject()?.startDate || DEFAULT_START; }

  function _autoImportStaff() {
    const project = _getProject();
    if (!project?.staff?.length) return;
    const prod = data.find(s => s.sectionName === 'PRODUCTION');
    if (!prod) return;
    project.staff.forEach(m => {
      if (prod.rows.some(r => r.name?.trim().toLowerCase() === m.name?.trim().toLowerCase())) return;
      const row = _blankRow();
      row.position = m.title || ''; row.name = m.name || '';
      row.email = m.email || '';    row.phone = m.phone || '';
      prod.rows.push(row);
    });
    save();
  }

  function reImportStaff() { _autoImportStaff(); save(); }

  /* ── Helpers ── */
  function _iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function _fmtDate(d) { return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function _uid() { return crypto.randomUUID(); }

  function formatPhone(val) {
    const d = val.replace(/\D/g,'');
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return val;
  }

  function countDays(row) { return dateCols.filter(c => row[c.key] === '1').length; }

  function dayTypeClass(dateKey) {
    const t = dayTypes[dateKey];
    return t ? `crew-col--${t}` : '';
  }

  /* ── Row / section mutations ── */
  function toggleDay(si, ri, col) {
    data[si].rows[ri][col] = data[si].rows[ri][col] === '1' ? '' : '1';
    save();
  }

  function setDayType(dateKey, value) {
    dayTypes[dateKey] = value;
    save();
  }

  function setSectionName(si, name) {
    data[si].sectionName = name || data[si].sectionName;
    save();
  }

  function setCellValue(si, ri, col, val) {
    if (col === 'phone') val = formatPhone(val);
    data[si].rows[ri][col] = val;
    save();
  }

  function setCheckbox(si, ri, col, checked) {
    data[si].rows[ri][col] = checked;
    save();
  }

  function addRow(si) {
    data[si].rows.push(_blankRow());
    save();
  }

  function deleteRow(si, ri) {
    if (data[si].rows.length === 1) data[si].rows[ri] = _blankRow();
    else data[si].rows.splice(ri, 1);
    save();
  }

  function addSection() {
    data.push({ sectionId: _uid(), sectionName: 'NEW DEPARTMENT', rows: [_blankRow(), _blankRow(), _blankRow()] });
    save();
  }

  function deleteSection(si) {
    const name = data[si]?.sectionName || 'this department';
    if (!confirm(`Delete department "${name}" and all its rows?`)) return;
    data.splice(si, 1);
    save();
  }

  function addCheckCol() {
    const newKey = `check_${_uid()}`;
    checkCols.push({ key: newKey, label: 'NEW CHECK' });
    data.forEach(sec => sec.rows.forEach(row => { row[newKey] = false; }));
    saveCheckCols();
    save();
  }

  function renameCheckCol(colKey, label) {
    const col = checkCols.find(c => c.key === colKey);
    if (col && label) col.label = label;
    saveCheckCols();
  }

  function deleteCheckCol(colKey) {
    const idx = checkCols.findIndex(c => c.key === colKey);
    if (idx === -1) return;
    if (!confirm(`Remove column "${checkCols[idx].label}"?`)) return;
    checkCols.splice(idx, 1);
    saveCheckCols();
    save();
  }

  /* ── Row drag ── */
  let dragSrc    = null;
  let dragTarget = null;
  let isDragRow  = false;

  function onDragHandleDown(e, si, ri, rowEl) {
    e.preventDefault();
    dragSrc = { si, ri, el: rowEl };
    isDragRow = true;
    rowEl.classList.add('crew-row--dragging');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
  }

  function onDragMove(e) {
    if (!isDragRow || !dragSrc) return;
    const el  = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('.crew-row');
    clearDropLines();
    if (!row || row === dragSrc.el) { dragTarget = null; return; }
    const rect  = row.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    row.classList.add(above ? 'crew-drop-above' : 'crew-drop-below');
    dragTarget = {
      si:    Number(row.dataset.si),
      ri:    Number(row.dataset.ri),
      above,
    };
  }

  function onDragEnd() {
    isDragRow = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);
    clearDropLines();
    dragSrc?.el?.classList.remove('crew-row--dragging');
    if (dragSrc && dragTarget) { moveRow(dragSrc, dragTarget); save(); }
    dragSrc = dragTarget = null;
  }

  function clearDropLines() {
    document.querySelectorAll('.crew-drop-above,.crew-drop-below').forEach(el =>
      el.classList.remove('crew-drop-above','crew-drop-below')
    );
  }

  function moveRow(src, target) {
    const [row] = data[src.si].rows.splice(src.ri, 1);
    if (data[src.si].rows.length === 0) data[src.si].rows.push(_blankRow());
    let tgtRi = target.ri;
    if (src.si === target.si && src.ri < tgtRi) tgtRi--;
    const insertAt = target.above ? tgtRi : tgtRi + 1;
    if (!data[target.si]) return;
    data[target.si].rows.splice(Math.max(0, Math.min(insertAt, data[target.si].rows.length)), 0, row);
  }

  /* ── Department reordering ──
     The rows are inside the section object, so moving a department is a single
     splice of `data` and its people come with it — there is no separate list of
     rows to keep in step. */
  let secDragSi     = $state(null);   // department being dragged
  let secDropSi     = $state(null);   // department it would land against
  let secDropBelow  = $state(false);

  function onSecDragDown(e, si) {
    e.preventDefault();
    secDragSi = si;
    document.addEventListener('mousemove', onSecDragMove);
    document.addEventListener('mouseup',   onSecDragEnd);
  }

  function onSecDragMove(e) {
    if (secDragSi === null) return;
    const el  = document.elementFromPoint(e.clientX, e.clientY);
    // Anywhere in a department counts, not just its banner — aiming at a 26px
    // header while dragging is fussy, and the rows below it are the same thing.
    const row = el?.closest('.crew-sec-row, .crew-row');
    if (!row) { secDropSi = null; return; }
    const si = Number(row.dataset.secSi);
    if (Number.isNaN(si) || si === secDragSi) { secDropSi = null; return; }
    // Measured against the whole department, not the one row under the
    // pointer. A department is many rows tall, and using the row's own midpoint
    // meant the answer flipped between above and below as you moved down it.
    const bounds = sectionBounds(si);
    if (!bounds) { secDropSi = null; return; }
    secDropSi    = si;
    secDropBelow = e.clientY > bounds.top + bounds.height / 2;
  }

  /** Top and height of every row belonging to one department. */
  function sectionBounds(si) {
    const parts = document.querySelectorAll(`[data-sec-si="${si}"]`);
    if (!parts.length) return null;
    const first = parts[0].getBoundingClientRect();
    const last  = parts[parts.length - 1].getBoundingClientRect();
    return { top: first.top, height: last.bottom - first.top };
  }

  function onSecDragEnd() {
    document.removeEventListener('mousemove', onSecDragMove);
    document.removeEventListener('mouseup',   onSecDragEnd);
    if (secDragSi !== null && secDropSi !== null) moveSection(secDragSi, secDropSi, secDropBelow);
    secDragSi = secDropSi = null;
    secDropBelow = false;
  }

  function moveSection(from, to, below) {
    const [sec] = data.splice(from, 1);
    // Removing the department shifts everything after it down by one, so a
    // target past the old position has to come back by one to stay put.
    let at = to > from ? to - 1 : to;
    if (below) at += 1;
    data.splice(Math.max(0, Math.min(at, data.length)), 0, sec);
    save();
  }

  /* ── Cell selection ── */
  let anchorCell  = null;
  let focusCell   = null;
  let isSelecting = false;

  function handleCellMouseDown(e, si, ri, col) {
    if (e.button !== 0 || isDragRow) return;
    const cell = { si, ri, col };
    if (e.shiftKey && anchorCell) {
      focusCell = cell;
      applySelection();
      e.preventDefault();
      return;
    }
    anchorCell = cell;
    focusCell  = { ...cell };
    isSelecting = false;
    clearSelection();
  }

  function handleCellMouseOver(e, si, ri, col) {
    if (!anchorCell || e.buttons !== 1 || isDragRow) return;
    isSelecting = true;
    focusCell = { si, ri, col };
    applySelection();
  }

  function handleCellMouseUp() {
    if (isSelecting) applySelection();
    isSelecting = false;
  }

  function clearSelection() {
    document.querySelectorAll('.crew-selected').forEach(el => el.classList.remove('crew-selected'));
  }

  function getTextColKeys() {
    return [...visibleLeftCols.map(c=>c.key), ...rightCols.filter(c=>!c.check&&!c.computed).map(c=>c.key)];
  }

  function cellAt(si, ri, col) {
    return document.querySelector(`.crew-cell-inner[data-si="${si}"][data-ri="${ri}"][data-col="${col}"]`) ?? null;
  }

  function applySelection() {
    if (!anchorCell || !focusCell) return;
    clearSelection();
    const keys   = getTextColKeys();
    const minSi  = Math.min(anchorCell.si, focusCell.si);
    const maxSi  = Math.max(anchorCell.si, focusCell.si);
    const aci    = keys.indexOf(anchorCell.col);
    const fci    = keys.indexOf(focusCell.col);
    const minCi  = Math.min(aci, fci);
    const maxCi  = Math.max(aci, fci);
    for (let si = minSi; si <= maxSi; si++) {
      const rows  = data[si]?.rows ?? [];
      const minRi = si === minSi ? Math.min(anchorCell.ri, focusCell.ri) : 0;
      const maxRi = si === maxSi ? Math.max(anchorCell.ri, focusCell.ri) : rows.length - 1;
      for (let ri = minRi; ri <= maxRi; ri++)
        for (let ci = minCi; ci <= maxCi; ci++) {
          const el = cellAt(si, ri, keys[ci]);
          if (el) el.closest('td')?.classList.add('crew-selected');
        }
    }
  }

  /* ── Keyboard nav ── */
  function handleCellKeydown(e, si, ri, col) {
    const keys = getTextColKeys();
    const ci   = keys.indexOf(col);

    if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey ? prevCell(si,ri,ci,keys) : nextCell(si,ri,ci,keys);
      if (next) { next.focus(); selectAll(next); }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.target.blur();
      const below = cellAt(si,ri+1,col) ?? cellAt(si+1,0,col);
      if (below) { below.focus(); selectAll(below); }
    } else if (e.key === 'Escape') {
      e.target.blur();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Only at the ends of the text. In the middle of a word the arrow keys
      // belong to the caret — jumping cells there would make a cell you cannot
      // edit without the mouse.
      if (!atTextEdge(e.target, e.key === 'ArrowLeft' ? 'start' : 'end')) return;
      const next = e.key === 'ArrowLeft'
        ? prevCell(si, ri, ci, keys)
        : nextCell(si, ri, ci, keys);
      if (next) { e.preventDefault(); next.focus(); selectAll(next); }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = e.key === 'ArrowUp'
        ? (cellAt(si,ri-1,col) ?? cellAt(si-1,(data[si-1]?.rows.length??1)-1,col))
        : (cellAt(si,ri+1,col) ?? cellAt(si+1,0,col));
      if (next) { e.preventDefault(); next.focus(); selectAll(next); }
    }
  }

  /**
   * Is the caret at the very start or end of this cell's text?
   *
   * A selection counts as being at both ends, so arriving in a cell with its
   * contents selected — which is what every other move here does — lets you
   * carry straight on in either direction without an extra keypress.
   */
  function atTextEdge(el, which) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return true;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return true;
    const len = el.textContent.length;
    if (!range.collapsed) {
      // Whole contents selected: treat as either edge.
      const pre = range.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      return pre.toString().length === 0 && range.toString().length === len;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const offset = pre.toString().length;
    return which === 'start' ? offset === 0 : offset === len;
  }

  function nextCell(si,ri,ci,keys) {
    if (ci < keys.length-1) return cellAt(si,ri,keys[ci+1]);
    if (ri < data[si].rows.length-1) return cellAt(si,ri+1,keys[0]);
    if (si < data.length-1) return cellAt(si+1,0,keys[0]);
    return null;
  }
  function prevCell(si,ri,ci,keys) {
    if (ci > 0) return cellAt(si,ri,keys[ci-1]);
    if (ri > 0) return cellAt(si,ri-1,keys[keys.length-1]);
    if (si > 0) return cellAt(si-1,data[si-1].rows.length-1,keys[keys.length-1]);
    return null;
  }
  function selectAll(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  /* ── Copy / Paste ── */
  function handleGlobalKey(e) {
    if (!anchorCell) return;
    const ctrl = /mac/i.test(navigator.platform) ? e.metaKey : e.ctrlKey;
    if (ctrl && e.key === 'c') { e.preventDefault(); copySelection(); }
    // Paste is deliberately not handled here. Cancelling the keystroke stops
    // the browser ever firing a paste event, and the event is the only way to
    // read the clipboard without asking the user for permission.
  }

  function copySelection() {
    if (!anchorCell || !focusCell) return;
    const keys  = getTextColKeys();
    const minSi = Math.min(anchorCell.si, focusCell.si);
    const maxSi = Math.max(anchorCell.si, focusCell.si);
    const aci   = keys.indexOf(anchorCell.col);
    const fci   = keys.indexOf(focusCell.col);
    const minCi = Math.min(aci, fci);
    const maxCi = Math.max(aci, fci);
    const lines = [];
    for (let si = minSi; si <= maxSi; si++) {
      const rows  = data[si]?.rows ?? [];
      const minRi = si === minSi ? Math.min(anchorCell.ri, focusCell.ri) : 0;
      const maxRi = si === maxSi ? Math.max(anchorCell.ri, focusCell.ri) : rows.length-1;
      for (let ri = minRi; ri <= maxRi; ri++) {
        const row = rows[ri]; if (!row) continue;
        lines.push(Array.from({length:maxCi-minCi+1},(_,i)=>String(row[keys[minCi+i]]??'')).join('\t'));
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).catch(()=>{});
  }

  /**
   * Paste into a cell, including a block copied out of a spreadsheet.
   *
   * On the paste event rather than on Cmd+V, because the event carries the
   * clipboard with it. Reading the clipboard by API needs a permission the
   * user has to grant and which fails silently when they have not — which is
   * why pasting appeared to do nothing at all.
   *
   * Always plain text: the default would drop a spreadsheet's HTML into a
   * contenteditable, styling and all.
   */
  function handleCellPaste(e, si, ri, col) {
    const text = e.clipboardData?.getData('text/plain');
    if (text == null) return;
    e.preventDefault();

    // Excel and Sheets end lines with \r\n, and leave a trailing newline on a
    // block copy. Left in, the first gives every value an invisible carriage
    // return and the second overwrites a row with blanks.
    const grid = text
      .replace(/\r\n?/g, '\n')
      .replace(/\n+$/, '')
      .split('\n')
      .map(line => line.split('\t'));

    // One value pasted into one cell is a plain edit, not a grid write — it
    // should land at the caret like any other paste.
    if (grid.length === 1 && grid[0].length === 1) {
      document.execCommand('insertText', false, grid[0][0]);
      return;
    }

    const keys = getTextColKeys();
    const ci   = keys.indexOf(col);
    if (ci === -1) return;

    // Before writing anything. blur() fires its handler synchronously, and that
    // handler saves whatever text the cell is showing — which is still the old
    // value, since the browser's own paste was cancelled. Blurring afterwards
    // put that stale value straight back over the top-left cell of the paste.
    e.target.blur();

    let s2 = si, r2 = ri;
    for (const cells of grid) {
      if (!data[s2]) break;
      while (data[s2].rows.length <= r2) data[s2].rows.push(_blankRow());
      cells.forEach((val, di) => {
        const key = keys[ci + di];
        if (key) data[s2].rows[r2][key] = val;
      });
      r2++;
      // Runs off the end of a department into the next one, rather than
      // inventing rows past the end of the list.
      if (r2 >= data[s2].rows.length && s2 < data.length - 1) { s2++; r2 = 0; }
    }
    save();
  }


  /* ── Print ──
     The roster, not the day grid. Eight weeks is 56 day columns; on landscape
     Letter that is about twice the width of the page, and scaled to fit it
     comes out at five pixels a column — a grid nobody can read. The # Days
     total carries what the grid says, and the schedule has its own documents.

     Hidden columns stay hidden. Putting Rate back into the printout would
     defeat the reason for hiding it, which is having something you can hand
     round a room. */
  function exportCrewPdf(mode = 'roster') {
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const proj  = _getProject();
    const title = [proj?.productionNumber, proj?.title].filter(Boolean).join('_') || 'Crew List';

    const cols = [
      ...visibleLeftCols.map(c => ({ key: c.key, label: c.label })),
      { key: '_days', label: '# DAYS' },
    ];

    const body = data.map(sec => {
      // A department nobody has been put into yet prints as a heading with
      // nothing under it, which reads as an oversight. Skip it.
      const rows = (sec.rows ?? []).filter(r => cols.some(c => c.key !== '_days' && String(r[c.key] ?? '').trim()));
      if (!rows.length) return '';
      return `
        <tr class="sec"><td colspan="${cols.length}">${esc(sec.sectionName)}</td></tr>
        ${rows.map(r => `<tr>${cols.map(c => `<td>${esc(
            c.key === '_days'  ? (countDays(r) || '')
          : c.key === 'phone'  ? formatPhone(r.phone ?? '')
          : r[c.key])}</td>`).join('')}</tr>`).join('')}`;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — ${mode === 'grid' ? 'Day Grid' : 'Crew List'}</title>
<style>
  @page { size: letter landscape; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font: 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  .sub { font-size: 10px; color: #555; margin: 0 0 10px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
       border-bottom: 1.5px solid #111; padding: 4px 6px; }
  td { padding: 3px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  /* Repeat on every page: a department that breaks across a page boundary
     otherwise leaves the second half with no heading. */
  thead { display: table-header-group; }
  tr.sec td { font-weight: 700; font-size: 10px; letter-spacing: 0.05em;
              background: #eee; border-bottom: 1px solid #999; padding: 4px 6px; }
  tr { break-inside: avoid; }

  /* Each chunk of weeks starts a new sheet. The very first one only skips the
     break when the grid is the whole document — printed after the roster it
     has to start its own sheet, or it lands under the contact table. */
  section.page { break-before: page; }
  ${mode === 'grid' ? 'section.page:first-of-type { break-before: auto; }' : ''}
  h2 { font-size: 12px; margin: 0 0 6px; }

  /* Sized to its columns rather than to the page. At width:100% a final page
     holding two weeks instead of four stretched its days to double width, so
     the last sheet did not match the ones before it. */
  table.grid { table-layout: fixed; width: auto; }
  table.grid th.nm, table.grid td.nm {
    width: 125px; font-size: 9px; text-align: left;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  table.grid th.wk { font-size: 8px; text-align: center; border-bottom: 1px solid #999; }
  table.grid th.d, table.grid td.d {
    width: 26px; text-align: center; font-size: 8px; padding: 2px 0;
    border-left: 1px solid #e4e4e4;
  }
  table.grid th.d { border-bottom: 1px solid #111; }
  table.grid td.d { font-size: 9px; }
  .dt { font-size: 7px; color: #666; }
  /* Weekends and day types are tints rather than colours — this is a document
     that gets photocopied. */
  .we    { background: #f2f2f2; }
  .t-prep  { background: #e9eef4; }
  .t-shoot { background: #dfe7ef; }
  .t-wrap  { background: #eeeae4; }
  .t-hold  { background: #f0f0f0; }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="sub">${mode === 'grid' ? 'Day Grid' : 'Crew List'} &middot; ${esc(rangeLabel)}</p>
${mode === 'grid' ? '' : `
<table>
  <thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${body || `<tr><td colspan="${cols.length}">No crew entered yet.</td></tr>`}</tbody>
</table>`}
${mode === 'roster' ? '' : gridPagesHTML(esc)}
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

    const w = window.open('', '_blank', 'width=1100,height=800');
    if (w) { w.document.write(html); w.document.close(); }
  }

  /**
   * The day grid, four weeks to a page.
   *
   * Landscape Letter leaves about 980px inside the margins; Position and Name
   * take 250 of it, so roughly 26px a day column — 28 days fits, and cutting on
   * a week boundary means no week is ever split across two sheets. Longer jobs
   * simply run to more pages, which is what a wall calendar does too.
   *
   * Position and Name repeat on every page. Without them the later sheets are
   * columns of dots against nothing.
   */
  function gridPagesHTML(esc) {
    const DAYS_PER_PAGE = 28;
    const pages = [];
    for (let i = 0; i < dateCols.length; i += DAYS_PER_PAGE) {
      const chunk = dateCols.slice(i, i + DAYS_PER_PAGE);
      const weeks = [];
      for (let w = 0; w < chunk.length; w += 7) {
        const wk = chunk.slice(w, w + 7);
        weeks.push({ span: wk.length, label: `WK ${wk[0].weekNum} · ${wk[0].shortDate}–${wk[wk.length-1].shortDate}` });
      }

      const body = data.map(sec => {
        const rows = (sec.rows ?? []).filter(r => String(r.position ?? '').trim() || String(r.name ?? '').trim());
        if (!rows.length) return '';
        return `
          <tr class="sec"><td colspan="${chunk.length + 2}">${esc(sec.sectionName)}</td></tr>
          ${rows.map(r => `<tr>
            <td class="nm">${esc(r.position)}</td>
            <td class="nm">${esc(r.name)}</td>
            ${chunk.map(c => `<td class="d${c.isWeekend ? ' we' : ''}${dayTypes[c.key] ? ' t-' + dayTypes[c.key] : ''}">${r[c.key] === '1' ? '●' : ''}</td>`).join('')}
          </tr>`).join('')}`;
      }).join('');

      pages.push(`
        <section class="page">
          <h2>${esc(chunk[0].shortDate)} – ${esc(chunk[chunk.length-1].shortDate)}</h2>
          <table class="grid">
            <thead>
              <tr><th class="nm" rowspan="3">POSITION</th><th class="nm" rowspan="3">NAME</th>
                  ${weeks.map(w => `<th class="wk" colspan="${w.span}">${esc(w.label)}</th>`).join('')}</tr>
              <tr>${chunk.map(c => `<th class="d${c.isWeekend ? ' we' : ''}">${(dayTypes[c.key] || '').charAt(0).toUpperCase()}</th>`).join('')}</tr>
              <tr>${chunk.map(c => `<th class="d${c.isWeekend ? ' we' : ''}">${c.dayLetter}<br><span class="dt">${esc(c.shortDate)}</span></th>`).join('')}</tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </section>`);
    }
    return pages.join('');
  }

  const closePrintMenu = () => { printMenuOpen = false; };

  /* ── Mount / cleanup ── */
  onMount(() => {
    // Read once on open. The budget is not being edited from this screen, so
    // re-reading on every keystroke would parse the whole thing for nothing.
    loadBudgetPositions();
    document.addEventListener('click',    closePrintMenu);
    document.addEventListener('mouseup',  handleCellMouseUp);
    document.addEventListener('keydown',  handleGlobalKey);
    return () => {
      document.removeEventListener('click',    closePrintMenu);
      document.removeEventListener('mouseup',  handleCellMouseUp);
      document.removeEventListener('keydown',  handleGlobalKey);
    };
  });

  /* ── Protected sections (can't delete) ── */
  const PROTECTED = ['CLIENT','AGENCY','PRODUCTION'];
  function isProtected(sec) { return PROTECTED.includes(sec.sectionName?.toUpperCase()); }
  /* ── Editable cell text ──────────────────────────────────────────
   * Set imperatively instead of rendered as {value}.
   *
   * A contenteditable whose content comes from an expression is edited by two
   * parties. Svelte creates a text node and keeps a reference to it; typing
   * makes the browser create or replace text nodes of its own. On blur the
   * value is written to state, Svelte re-renders and writes to *its* node —
   * which is no longer the one the browser left behind. Both survive, and the
   * cell reads "DanaDana".
   *
   * With no expression inside the element Svelte creates no node to fight
   * over, and this owns the content outright.
   */
  function cellText(node, value) {
    node.textContent = value ?? '';
    return {
      update(next) {
        const v = next ?? '';
        // Never while the cell is being edited: assigning textContent collapses
        // the selection to the start, so a re-render mid-typing would throw the
        // caret to the front of the cell on every keystroke.
        if (document.activeElement === node) return;
        if (node.textContent !== v) node.textContent = v;
      },
    };
  }

</script>

<div class="crew-inner">
  <!-- Toolbar -->
  <div class="crew-toolbar">
    <!-- Crew/Cast toggle -->
    <div class="personnel-toggle">
      <div class="personnel-toggle-track">
        <button class="personnel-toggle-btn" class:personnel-toggle-btn--active={tab==='crew'} onclick={() => setTab('crew')}>Crew</button>
        <button class="personnel-toggle-btn" class:personnel-toggle-btn--active={tab==='cast'} onclick={() => setTab('cast')}>Cast</button>
        <span class="personnel-toggle-slider" style="transform:translateX({tab==='cast'?'100%':'0'})"></span>
      </div>
    </div>

    <span class="crew-date-range">{rangeLabel}</span>

    <div class="crew-toolbar-actions">
      <button class="btn btn--ghost btn--sm" onclick={reImportStaff}>↓ Re-import Staff</button>
      <button class="btn btn--ghost btn--sm" onclick={addSection}>+ Department</button>
      <button class="btn btn--ghost btn--sm" onclick={addCheckCol}>+ Column</button>
      {#each HIDEABLE as h}
        <button class="btn btn--ghost btn--sm"
          title={hiddenCols.includes(h.key) ? `Show the ${h.label} column` : `Hide the ${h.label} column`}
          onclick={() => toggleHiddenCol(h.key)}>
          {hiddenCols.includes(h.key) ? 'Show' : 'Hide'} {h.label}
        </button>
      {/each}
      <button class="btn btn--ghost btn--sm" onclick={() => { numWeeks++; save(); }}>+ Week</button>
      <button class="btn btn--ghost btn--sm" onclick={() => { if (numWeeks > 1) { numWeeks--; save(); } }} disabled={numWeeks <= 1}>− Week</button>
      <!-- Same mark and the same menu shape as the budget's print button, so the
           one control that makes a PDF looks and behaves the same wherever you
           meet it. Two documents now, so which one is a choice made before
           pressing rather than after. -->
      <div class="bud-menu-wrap">
        <button class="btn btn--ghost btn--sm bud-icon-btn" title="Print"
          aria-haspopup="menu" aria-expanded={printMenuOpen}
          onclick={e => { e.stopPropagation(); printMenuOpen = !printMenuOpen; }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          <span class="bud-caret" aria-hidden="true">▾</span>
        </button>
        {#if printMenuOpen}
          <div class="bud-menu" role="menu">
            <button class="bud-menu-item" role="menuitem"
              onclick={() => { printMenuOpen = false; exportCrewPdf('roster'); }}>Crew List</button>
            <button class="bud-menu-item" role="menuitem"
              onclick={() => { printMenuOpen = false; exportCrewPdf('grid'); }}>Day Grid</button>
            <button class="bud-menu-item" role="menuitem"
              onclick={() => { printMenuOpen = false; exportCrewPdf('both'); }}>Both</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Scrollable table -->
  <div class="crew-scroll-wrap">
    <table class="crew-table" cellspacing="0" cellpadding="0">
      <thead>
        <!-- Row 1: week groups -->
        <tr class="crew-header-row crew-header-row--weeks">
          <th class="crew-th crew-th--handle" rowspan="3"></th>
          {#each visibleLeftCols as c}
            <th class="crew-th crew-th--left" rowspan="3"
                style="width:{c.width}px;min-width:{c.width}px;{c.frozen?`position:sticky;left:${c.left}px;z-index:30;`:''}">{c.label}</th>
          {/each}
          {#each weekGroups as label}
            <th class="crew-th crew-th--week-group" colspan="7">{label}</th>
          {/each}
          {#each rightCols as c, i}
            {@const isNotes = c.key === 'notes'}
            <th class="crew-th crew-th--right{i===0?' crew-cell--right-first':''}{isNotes?' crew-th--right-notes':''}"
                rowspan="3" style="width:{c.width}px;min-width:{c.width}px;">
              {#if c.check}
                <span class="crew-col-label" contenteditable="plaintext-only"
                  use:cellText={c.label}
                  onblur={e => renameCheckCol(c.key, e.target.textContent.trim())}
                  onkeydown={e => e.key === 'Enter' && e.target.blur()}></span>
                <button class="btn btn--ghost btn--sm crew-del-col" title="Remove column"
                  onclick={() => deleteCheckCol(c.key)}>✕</button>
              {:else}
                {c.label}
              {/if}
            </th>
          {/each}
          <th class="crew-th crew-th--actions" rowspan="3"></th>
        </tr>

        <!-- Row 2: day-type selectors -->
        <tr class="crew-header-row crew-header-row--daytypes">
          {#each dateCols as c}
            {@const type = dayTypes[c.key] || ''}
            <th class="crew-th crew-th--daytype{c.isWeekend?' crew-th--weekend':''}{c.isWeekStart?' crew-th--week-start':''}{type?' crew-col--'+type:''}"
                data-col={c.key}>
              <select class="crew-daytype-select" onchange={e => setDayType(c.key, e.target.value)} title="Day type">
                <option value="">—</option>
                <option value="prep"  selected={type==='prep'}>PREP</option>
                <option value="shoot" selected={type==='shoot'}>SHOOT</option>
                <option value="wrap"  selected={type==='wrap'}>WRAP</option>
                <option value="hold"  selected={type==='hold'}>HOLD</option>
              </select>
            </th>
          {/each}
        </tr>

        <!-- Row 3: day letters -->
        <tr class="crew-header-row crew-header-row--days">
          {#each dateCols as c}
            {@const type = dayTypes[c.key] || ''}
            <th class="crew-th crew-th--day{c.isWeekend?' crew-th--weekend':''}{c.isWeekStart?' crew-th--week-start':''}{type?' crew-col--'+type:''}"
                data-col={c.key} title={c.dateStr}>
              <span class="crew-day-name">{c.dayLetter}</span>
              <span class="crew-day-date">{c.shortDate}</span>
            </th>
          {/each}
        </tr>
      </thead>

      <tbody>
        {#each data as sec, si (sec.sectionId)}
          <!-- Section header row -->
          <tr class="crew-sec-row" data-sec-si={si}
              class:crew-sec-row--dragging={secDragSi === si}
              class:crew-sec-drop-above={secDropSi === si && !secDropBelow}
              class:crew-sec-drop-below={secDropSi === si && secDropBelow}>
            <td class="crew-cell crew-cell--sticky crew-sec-handle" style="left:0;width:{HANDLE_W}px;">
              <span class="crew-handle-nub" title="Drag to reorder this department"
                onmousedown={e => onSecDragDown(e, si)}>⠿</span>
            </td>
            <td class="crew-cell crew-cell--sticky crew-sec-name-cell" colspan="2"
                style="position:sticky;left:{HANDLE_W}px;z-index:2;">
              <span class="crew-sec-name" contenteditable="plaintext-only"
                use:cellText={sec.sectionName}
                onblur={e => setSectionName(si, e.target.textContent.trim())}
                onkeydown={e => e.key === 'Enter' && e.target.blur()}></span>
              <button class="btn btn--ghost btn--sm crew-add-row" title="Add row"
                onclick={() => addRow(si)}>+</button>
            </td>
            {#each visibleLeftCols.slice(2) as _}
              <td class="crew-cell crew-sec-bg"></td>
            {/each}
            {#each dateCols as c}
              {@const tc = dayTypeClass(c.key)}
              <td class="crew-cell crew-sec-bg{c.isWeekStart?' crew-cell--week-start':''}{tc?' '+tc:''}" data-col={c.key}></td>
            {/each}
            {#each rightCols as _, i}
              <td class="crew-cell crew-sec-bg{i===0?' crew-cell--right-first':''}"></td>
            {/each}
            <td class="crew-cell crew-sec-bg crew-cell--del">
              {#if !isProtected(sec)}
                <button class="btn btn--ghost btn--sm crew-del-section" title="Delete department"
                  onclick={() => deleteSection(si)}>✕</button>
              {/if}
            </td>
          </tr>

          <!-- Data rows -->
          {#each sec.rows as row, ri (row.id)}
            {@const numDays = countDays(row)}
            <tr class="crew-row" data-si={si} data-ri={ri} data-row-id={row.id}
                data-sec-si={si}>
              <!-- Drag handle -->
              <td class="crew-cell crew-cell--sticky crew-cell--handle" style="left:0">
                <span class="crew-handle-nub" title="Drag to reorder"
                  onmousedown={e => {
                    const rowEl = e.target.closest('.crew-row');
                    onDragHandleDown(e, si, ri, rowEl);
                  }}>⠿</span>
              </td>

              <!-- Left cols (contenteditable) -->
              {#each visibleLeftCols as c}
                <td class="crew-cell crew-cell--left{c.frozen?' crew-cell--sticky':''}"
                    style={c.frozen?`position:sticky;left:${c.left}px;z-index:2;`:''}>
                  <div class="crew-cell-inner" contenteditable="plaintext-only"
                    data-si={si} data-ri={ri} data-col={c.key}
                    use:cellText={c.key === 'phone' ? formatPhone(row[c.key] ?? '') : (row[c.key] ?? '')}
                    oninput={e => { if (c.key === 'position') openSuggestions(e.target, si, ri); }}
                    onblur={e => {
                      setCellValue(si, ri, c.key, e.target.textContent.trim());
                      // Closed on a timer so a click on a suggestion lands first —
                      // blur fires before the click that caused it.
                      if (c.key === 'position') setTimeout(() => { suggestFor = null; }, 150);
                    }}
                    onkeydown={e => {
                      if (c.key === 'position' && suggestFor && suggestFor.si === si && suggestFor.ri === ri) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); suggestIdx = (suggestIdx + 1) % suggestList.length; return; }
                        if (e.key === 'ArrowUp')   { e.preventDefault(); suggestIdx = (suggestIdx - 1 + suggestList.length) % suggestList.length; return; }
                        if (e.key === 'Enter')     { e.preventDefault(); applySuggestion(suggestList[suggestIdx]); return; }
                        if (e.key === 'Escape')    { suggestFor = null; return; }
                      }
                      handleCellKeydown(e, si, ri, c.key);
                    }}
                    onpaste={e => handleCellPaste(e, si, ri, c.key)}
                    onmousedown={e => handleCellMouseDown(e, si, ri, c.key)}
                    onmouseover={e => handleCellMouseOver(e, si, ri, c.key)}
                  ></div>
                </td>
              {/each}

              <!-- Day cells -->
              {#each dateCols as c}
                {@const on = row[c.key] === '1'}
                {@const tc = dayTypeClass(c.key)}
                <td class="crew-cell crew-cell--day{c.isWeekend?' crew-cell--weekend':''}{c.isWeekStart?' crew-cell--week-start':''}{on?' crew-cell--on':''}{tc?' '+tc:''}"
                    data-si={si} data-ri={ri} data-col={c.key} title={c.dateStr}
                    onclick={() => { if (!isDragRow) toggleDay(si, ri, c.key); }}>
                  <span class="crew-day-dot">{on ? '1' : ''}</span>
                </td>
              {/each}

              <!-- Right cols -->
              {#each rightCols as c, i}
                {#if c.computed}
                  <td class="crew-cell crew-cell--right crew-cell--computed crew-cell--right-first">
                    <span class="crew-days-count">{numDays || ''}</span>
                  </td>
                {:else if c.check}
                  <td class="crew-cell crew-cell--right crew-cell--check">
                    <input type="checkbox" class="crew-check"
                      checked={!!row[c.key]}
                      onchange={e => setCheckbox(si, ri, c.key, e.target.checked)} />
                  </td>
                {:else}
                  <td class="crew-cell crew-cell--right{i===0?' crew-cell--right-first':''}">
                    <div class="crew-cell-inner" contenteditable="plaintext-only"
                      data-si={si} data-ri={ri} data-col={c.key}
                      use:cellText={row[c.key] ?? ''}
                      onblur={e => setCellValue(si, ri, c.key, e.target.textContent.trim())}
                      onkeydown={e => handleCellKeydown(e, si, ri, c.key)}
                      onpaste={e => handleCellPaste(e, si, ri, c.key)}
                      onmousedown={e => handleCellMouseDown(e, si, ri, c.key)}
                      onmouseover={e => handleCellMouseOver(e, si, ri, c.key)}
                    ></div>
                  </td>
                {/if}
              {/each}

              <!-- Delete row -->
              <td class="crew-cell crew-cell--del">
                <button class="crew-del-btn btn btn--ghost btn--sm" title="Delete row"
                  onclick={() => deleteRow(si, ri)}>✕</button>
              </td>
            </tr>
          {/each}
        {/each}
      </tbody>

      <!-- Footer totals -->
      <tfoot>
        <tr class="crew-total-row">
          <td class="crew-cell crew-cell--sticky" style="left:0;width:{HANDLE_W}px;"></td>
          {#each visibleLeftCols as c, i}
            <td class="crew-cell crew-cell--left{c.frozen?' crew-cell--sticky':''} crew-total-label"
                style={c.frozen?`position:sticky;left:${c.left}px;z-index:2;`:''}>
              {i === 0 ? 'TOTAL' : ''}
            </td>
          {/each}
          {#each dateCols as c}
            {@const count = allRows.filter(r => r[c.key] === '1').length}
            {@const tc = dayTypeClass(c.key)}
            <td class="crew-cell crew-cell--day crew-total-day{c.isWeekStart?' crew-cell--week-start':''}{tc?' '+tc:''}"
                data-col={c.key} title={c.dateStr}>{count > 0 ? count : ''}</td>
          {/each}
          {#each rightCols as _, i}
            <td class="crew-cell crew-cell--right{i===0?' crew-cell--right-first':''}"></td>
          {/each}
          <td class="crew-cell crew-cell--del"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<!-- Positions the budget already knows. Fixed rather than inside the table:
     the crew grid scrolls in both directions and clips its overflow, so a
     dropdown parented to a cell would be cut off at the edge of the view. -->
{#if suggestFor && suggestList.length}
  <ul class="crew-suggest" style="left:{suggestAt.x}px; top:{suggestAt.y}px;" role="listbox">
    {#each suggestList as item, i}
      <li>
        <button type="button" class="crew-suggest-item" class:crew-suggest-item--on={i === suggestIdx}
          role="option" aria-selected={i === suggestIdx}
          onmousedown={e => { e.preventDefault(); applySuggestion(item); }}>{item}</button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* Scope the del-col button inside the vertical right header */
  :global(.crew-del-col) {
    display: none;
    position: absolute;
    top: 2px;
    right: 2px;
  }
  :global(.crew-th--right:hover .crew-del-col) {
    display: block;
  }
  :global(.crew-th--right) {
    position: relative;
  }
</style>
