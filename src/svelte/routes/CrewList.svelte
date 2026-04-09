<script>
  import { onMount } from 'svelte';

  let { tab = 'crew', setTab = () => {} } = $props();

  /* ── Constants ── */
  const CREW_KEY      = 'movie-ledger-crew';
  const SCHED_KEY     = 'movie-ledger-crew-schedule';
  const DAYTYPES_KEY  = 'movie-ledger-crew-daytypes';
  const CHECKCOLS_KEY = 'movie-ledger-crew-checkcols';
  const DEFAULT_START = '2026-03-16';
  const DEFAULT_WEEKS = 8;
  const HANDLE_W      = 10;

  const LEFT_COLS = [
    { key: 'position', label: 'POSITION', width: 100, frozen: true, left: HANDLE_W },
    { key: 'name',     label: 'NAME',     width: 120, frozen: true, left: HANDLE_W + 100 },
    { key: 'phone',    label: 'PHONE',    width: 96  },
    { key: 'email',    label: 'EMAIL',    width: 148 },
    { key: 'rate',     label: 'RATE',     width: 64  },
    { key: 'kitFee',   label: 'KIT FEE',  width: 58  },
  ];

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

  /* ── State ── */
  let data      = $state([]);
  let numWeeks  = $state(DEFAULT_WEEKS);
  let dayTypes  = $state({});
  let checkCols = $state([...DEFAULT_CHECK_COLS]);

  /* ── Load ── */
  (function _load() {
    try { data      = JSON.parse(localStorage.getItem(CREW_KEY))     || _defaultData();    } catch { data = _defaultData(); }
    try { numWeeks  = JSON.parse(localStorage.getItem(SCHED_KEY))?.numWeeks || DEFAULT_WEEKS; } catch { numWeeks = DEFAULT_WEEKS; }
    try { dayTypes  = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {};                } catch { dayTypes = {}; }
    try {
      const stored = JSON.parse(localStorage.getItem(CHECKCOLS_KEY));
      if (Array.isArray(stored)) checkCols = stored;
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
  function save() {
    localStorage.setItem(CREW_KEY,     JSON.stringify(data));
    localStorage.setItem(SCHED_KEY,    JSON.stringify({ numWeeks }));
    localStorage.setItem(DAYTYPES_KEY, JSON.stringify(dayTypes));
  }

  function saveCheckCols() {
    localStorage.setItem(CHECKCOLS_KEY, JSON.stringify(checkCols));
  }

  /* ── Derived ── */
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
    return [...LEFT_COLS.map(c=>c.key), ...rightCols.filter(c=>!c.check&&!c.computed).map(c=>c.key)];
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
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = e.key === 'ArrowUp'
        ? (cellAt(si,ri-1,col) ?? cellAt(si-1,(data[si-1]?.rows.length??1)-1,col))
        : (cellAt(si,ri+1,col) ?? cellAt(si+1,0,col));
      if (next) { e.preventDefault(); next.focus(); selectAll(next); }
    }
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
    if (ctrl && e.key === 'v') { e.preventDefault(); pasteAtAnchor(); }
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

  async function pasteAtAnchor() {
    if (!anchorCell) return;
    let text; try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text) return;
    const keys = getTextColKeys();
    const aci  = keys.indexOf(anchorCell.col);
    let si = anchorCell.si, ri = anchorCell.ri;
    text.split('\n').forEach(rowStr => {
      rowStr.split('\t').forEach((val, di) => {
        const col = keys[aci+di]; if (!col || !data[si]) return;
        while (data[si].rows.length <= ri) data[si].rows.push(_blankRow());
        data[si].rows[ri][col] = val;
      });
      ri++;
      if (ri >= (data[si]?.rows.length ?? 0) && si < data.length-1) { si++; ri = 0; }
    });
    save();
  }

  /* ── Mount / cleanup ── */
  onMount(() => {
    document.addEventListener('mouseup',  handleCellMouseUp);
    document.addEventListener('keydown',  handleGlobalKey);
    return () => {
      document.removeEventListener('mouseup',  handleCellMouseUp);
      document.removeEventListener('keydown',  handleGlobalKey);
    };
  });

  /* ── Protected sections (can't delete) ── */
  const PROTECTED = ['CLIENT','AGENCY','PRODUCTION'];
  function isProtected(sec) { return PROTECTED.includes(sec.sectionName?.toUpperCase()); }
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
      <button class="btn btn--ghost btn--sm" onclick={() => { numWeeks++; save(); }}>+ Week</button>
      <button class="btn btn--ghost btn--sm" onclick={() => { if (numWeeks > 1) { numWeeks--; save(); } }} disabled={numWeeks <= 1}>− Week</button>
    </div>
  </div>

  <!-- Scrollable table -->
  <div class="crew-scroll-wrap">
    <table class="crew-table" cellspacing="0" cellpadding="0">
      <thead>
        <!-- Row 1: week groups -->
        <tr class="crew-header-row crew-header-row--weeks">
          <th class="crew-th crew-th--handle" rowspan="3"></th>
          {#each LEFT_COLS as c}
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
                  onblur={e => renameCheckCol(c.key, e.target.textContent.trim())}
                  onkeydown={e => e.key === 'Enter' && e.target.blur()}>{c.label}</span>
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
          <tr class="crew-sec-row">
            <td class="crew-cell crew-cell--sticky crew-sec-handle" style="left:0;width:{HANDLE_W}px;"></td>
            <td class="crew-cell crew-cell--sticky crew-sec-name-cell" colspan="2"
                style="position:sticky;left:{HANDLE_W}px;z-index:2;">
              <span class="crew-sec-name" contenteditable="plaintext-only"
                onblur={e => setSectionName(si, e.target.textContent.trim())}
                onkeydown={e => e.key === 'Enter' && e.target.blur()}>{sec.sectionName}</span>
              <button class="btn btn--ghost btn--sm crew-add-row" title="Add row"
                onclick={() => addRow(si)}>+</button>
            </td>
            {#each LEFT_COLS.slice(2) as _}
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
            <tr class="crew-row" data-si={si} data-ri={ri} data-row-id={row.id}>
              <!-- Drag handle -->
              <td class="crew-cell crew-cell--sticky crew-cell--handle" style="left:0">
                <span class="crew-handle-nub" title="Drag to reorder"
                  onmousedown={e => {
                    const rowEl = e.target.closest('.crew-row');
                    onDragHandleDown(e, si, ri, rowEl);
                  }}>⠿</span>
              </td>

              <!-- Left cols (contenteditable) -->
              {#each LEFT_COLS as c}
                <td class="crew-cell crew-cell--left{c.frozen?' crew-cell--sticky':''}"
                    style={c.frozen?`position:sticky;left:${c.left}px;z-index:2;`:''}>
                  <div class="crew-cell-inner" contenteditable="plaintext-only"
                    data-si={si} data-ri={ri} data-col={c.key}
                    onblur={e => setCellValue(si, ri, c.key, e.target.textContent.trim())}
                    onkeydown={e => handleCellKeydown(e, si, ri, c.key)}
                    onmousedown={e => handleCellMouseDown(e, si, ri, c.key)}
                    onmouseover={e => handleCellMouseOver(e, si, ri, c.key)}
                  >{c.key === 'phone' ? formatPhone(row[c.key] ?? '') : (row[c.key] ?? '')}</div>
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
                      onblur={e => setCellValue(si, ri, c.key, e.target.textContent.trim())}
                      onkeydown={e => handleCellKeydown(e, si, ri, c.key)}
                      onmousedown={e => handleCellMouseDown(e, si, ri, c.key)}
                      onmouseover={e => handleCellMouseOver(e, si, ri, c.key)}
                    >{row[c.key] ?? ''}</div>
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
          {#each LEFT_COLS as c, i}
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
