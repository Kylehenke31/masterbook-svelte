/* ============================================================
   The Masterbook — dooDs.js
   Day-out-of-Days Report: Cast member work status per shoot day.
   Tracks SW (Start Work), W (Work), WF (Work Finish), SWF
   (Start-Work-Finish, single day).
   ============================================================ */

const BD_KEY       = 'movie-ledger-breakdowns';
const OL_DRAFTS    = 'movie-ledger-one-liner-drafts';
const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';

let _container = null;

/* ── Entry ── */
export function renderDooDs(container) {
  _container = container;
  _renderControls();
}

/* ── Helpers ── */
function _e(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _loadScenes() {
  try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; }
}

function _getDrafts() {
  try { return JSON.parse(localStorage.getItem(OL_DRAFTS)) || {}; } catch { return {}; }
}

function _getDayTypes() {
  try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; }
}

function _getProject() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || {}; } catch { return {}; }
}

function _getProjectName() {
  return _getProject()?.title || 'Untitled Project';
}

/* ── Build shoot-day → date mapping from day types ── */
function _buildShootDays() {
  const dayTypes = _getDayTypes();
  // Collect all dates marked 'shoot', sorted chronologically
  const shootDates = Object.entries(dayTypes)
    .filter(([, type]) => type === 'shoot')
    .map(([dateStr]) => dateStr)
    .sort();
  return shootDates;
}

/* ── Build day-break groups from a draft ── */
function _buildDayGroups(draft, scenes) {
  const sceneMap = {};
  scenes.forEach(s => { sceneMap[s.id] = s; });

  const days = []; // each entry: array of scene objects for that day
  let currentDay = [];

  for (const item of draft.items) {
    if (item.type === 'scene') {
      const scene = sceneMap[item.sceneId];
      if (scene) currentDay.push(scene);
    } else if (item.type === 'daybreak') {
      if (currentDay.length > 0) {
        days.push(currentDay);
        currentDay = [];
      }
    }
    // Skip blanks/dividers
  }
  // Remaining scenes after last day break = final day
  if (currentDay.length > 0) days.push(currentDay);

  return days;
}

/* ── Derive cast work map from day groups ── */
function _buildCastWorkMap(dayGroups) {
  // castWork: { castKey: { castNum, role, days: Set<dayIndex> } }
  const castWork = {};

  dayGroups.forEach((dayScenes, dayIdx) => {
    dayScenes.forEach(scene => {
      (scene.castMembers || []).forEach(cm => {
        const key = cm.castNum || cm.role || cm.name;
        if (!key) return;
        if (!castWork[key]) {
          castWork[key] = { castNum: cm.castNum, role: cm.role || cm.name || '', days: new Set() };
        }
        castWork[key].days.add(dayIdx);
      });
    });
  });

  return castWork;
}

/* ── Classify each day for a cast member ── */
function _classifyDays(workDays, totalDays) {
  const sorted = [...workDays].sort((a, b) => a - b);
  if (sorted.length === 0) return {};

  const result = {};

  // Find contiguous blocks
  const blocks = [];
  let blockStart = sorted[0];
  let blockEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === blockEnd + 1) {
      blockEnd = sorted[i];
    } else {
      blocks.push([blockStart, blockEnd]);
      blockStart = sorted[i];
      blockEnd = sorted[i];
    }
  }
  blocks.push([blockStart, blockEnd]);

  blocks.forEach(([start, end]) => {
    if (start === end) {
      result[start] = 'SWF';
    } else {
      for (let d = start; d <= end; d++) {
        if (d === start) result[d] = 'SW';
        else if (d === end) result[d] = 'WF';
        else result[d] = 'W';
      }
    }
  });

  return result;
}

/* ══════════════════════════════════════════════════════════════
   CONTROLS VIEW
   ══════════════════════════════════════════════════════════════ */
function _renderControls() {
  const drafts = _getDrafts();
  const draftKeys = Object.keys(drafts);

  const draftOptions = draftKeys.map(id =>
    `<option value="${_e(id)}">${_e(drafts[id].name)}</option>`
  ).join('');

  _container.innerHTML = `
    <section class="ss-section">
      <div class="ss-toolbar">
        <button class="btn btn--ghost btn--sm" id="doods-back">\u2190 Back</button>
        <h2>Day-out-of-Days</h2>
      </div>
      <div class="ss-controls">
        <p class="ss-desc">Generate a Day-out-of-Days report for cast members. Select a Shoot Order draft to determine the day assignments:</p>
        ${draftKeys.length > 0 ? `
        <div class="ss-order-row">
          <label class="ss-radio" style="font-weight:600;">Shoot Order Draft:</label>
          <select class="ss-draft-select" id="doods-draft-pick">${draftOptions}</select>
        </div>
        <button class="btn btn--primary" id="doods-generate" style="margin-top:16px;">Generate & Print / PDF</button>
        ` : '<p class="ss-hint" style="margin-top:8px;">No Shoot Order drafts available. Create one in One-Liner (Shoot Order) first.</p>'}
      </div>
    </section>
  `;

  _container.querySelector('#doods-back').addEventListener('click', () => {
    window.location.hash = '#schedules';
  });

  const genBtn = _container.querySelector('#doods-generate');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      const draftId = _container.querySelector('#doods-draft-pick').value;
      const draft = drafts[draftId];
      if (!draft) { alert('Select a draft.'); return; }
      _generate(draft);
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   GENERATE & PRINT
   ══════════════════════════════════════════════════════════════ */
function _generate(draft) {
  const scenes = _loadScenes();
  const dayGroups = _buildDayGroups(draft, scenes);
  const castWork = _buildCastWorkMap(dayGroups);
  const shootDates = _buildShootDays();
  const totalDays = dayGroups.length;

  // Build date columns — one per shoot day
  const columns = [];
  for (let d = 0; d < totalDays; d++) {
    const dateStr = shootDates[d] || null; // May not have calendar dates assigned
    let monthDay = '';
    let dayOfWeek = '';
    if (dateStr) {
      const dt = new Date(dateStr + 'T12:00:00');
      monthDay = `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
      dayOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
    }
    columns.push({ shootDay: d + 1, date: dateStr, monthDay, dayOfWeek });
  }

  // Detect down days (non-shoot days between first and last shoot date)
  const downDayColumns = [];
  if (shootDates.length >= 2) {
    const firstDate = new Date(shootDates[0] + 'T12:00:00');
    const lastDate = new Date(shootDates[shootDates.length - 1] + 'T12:00:00');
    const dayTypes = _getDayTypes();
    const shootSet = new Set(shootDates);

    const cur = new Date(firstDate);
    while (cur <= lastDate) {
      const ds = cur.toISOString().slice(0, 10);
      if (!shootSet.has(ds)) {
        const dtype = dayTypes[ds] || '';
        downDayColumns.push({
          date: ds,
          monthDay: `${String(cur.getMonth() + 1).padStart(2, '0')}/${String(cur.getDate()).padStart(2, '0')}`,
          dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][cur.getDay()],
          type: dtype // 'hold', 'prep', 'wrap', or '' (holiday/off)
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Merge all columns (shoot + down) in chronological order
  const allColumns = [];
  let si = 0, di = 0;
  const shootCols = [...columns];
  const downCols = [...downDayColumns];

  // If we have dates, interleave chronologically
  if (shootDates.length > 0) {
    const allDates = [];
    shootCols.forEach(c => { if (c.date) allDates.push({ ...c, isShoot: true }); });
    downCols.forEach(c => { allDates.push({ ...c, isShoot: false, shootDay: null }); });
    allDates.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    allColumns.push(...allDates);

    // Add any shoot days without dates at the end
    shootCols.filter(c => !c.date).forEach(c => allColumns.push({ ...c, isShoot: true }));
  } else {
    // No calendar dates — just show shoot day numbers
    shootCols.forEach(c => allColumns.push({ ...c, isShoot: true }));
  }

  // Build sorted cast rows
  const castRows = Object.values(castWork).sort((a, b) => {
    const na = parseInt(a.castNum) || 999;
    const nb = parseInt(b.castNum) || 999;
    return na - nb;
  });

  // Calculate max columns per page (portrait letter = ~7.5in usable width)
  // Character column ~120px, each day column ~30px, summary cols ~200px
  // Available width for day columns: ~7.5in - 120px - 200px ≈ 400px → ~13 day cols per page
  const MAX_DAY_COLS = 18;

  // Paginate columns
  const pages = [];
  let colStart = 0;
  while (colStart < allColumns.length) {
    const isLastPage = colStart + MAX_DAY_COLS >= allColumns.length;
    pages.push({
      cols: allColumns.slice(colStart, colStart + MAX_DAY_COLS),
      isLast: isLastPage
    });
    colStart += MAX_DAY_COLS;
  }

  // If no pages (no columns), still show one page with summary
  if (pages.length === 0) {
    pages.push({ cols: [], isLast: true });
  }

  // Summary stats for each cast member
  const castSummary = castRows.map(cm => {
    const days = _classifyDays(cm.days, totalDays);
    const workCount = cm.days.size;
    const holdCount = 0; // placeholder
    const holidayCount = 0; // placeholder
    const sortedDays = [...cm.days].sort((a, b) => a - b);
    const startDay = sortedDays[0];
    const finishDay = sortedDays[sortedDays.length - 1];
    const startDate = columns[startDay]?.monthDay || '';
    const finishDate = columns[finishDay]?.monthDay || '';
    return { ...cm, days, workCount, holdCount, holidayCount, startDate, finishDate };
  });

  _openPrintView(pages, castSummary, allColumns, totalDays);
}

function _openPrintView(pages, castSummary, allColumns, totalDays) {
  const projectName = _getProjectName();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const totalPages = pages.length;

  let pagesHTML = '';

  pages.forEach((page, pi) => {
    const pageNum = pi + 1;

    // Header rows for this page's columns
    let monthDayHeader = '';
    let dayOfWeekHeader = '';
    let shootDayHeader = '';

    page.cols.forEach(col => {
      const isDown = !col.isShoot;
      const cls = isDown ? ' class="dd-down"' : '';
      monthDayHeader += `<th${cls}>${col.monthDay || ''}</th>`;
      dayOfWeekHeader += `<th${cls}>${col.dayOfWeek || ''}</th>`;
      if (col.isShoot) {
        shootDayHeader += `<th>${col.shootDay || ''}</th>`;
      } else {
        shootDayHeader += `<th class="dd-down"></th>`;
      }
    });

    // Summary columns on last page
    const summaryHeaders = page.isLast ? `
      <th class="dd-sum-hdr">Travel</th>
      <th class="dd-sum-hdr">Work</th>
      <th class="dd-sum-hdr">Hold</th>
      <th class="dd-sum-hdr">Holiday</th>
      <th class="dd-sum-hdr">Start</th>
      <th class="dd-sum-hdr">Finish</th>
      <th class="dd-sum-hdr">TOTAL</th>
    ` : '';

    const summaryLabelRow1 = page.isLast ? '<th></th><th></th><th></th><th></th><th></th><th></th><th></th>' : '';
    const summaryLabelRow2 = page.isLast ? '<th>Co.</th><th></th><th></th><th></th><th></th><th></th><th></th>' : '';

    // Cast data rows
    let rowsHTML = '';
    castSummary.forEach(cm => {
      let cells = '';
      page.cols.forEach(col => {
        const isDown = !col.isShoot;
        if (isDown) {
          cells += '<td class="dd-down"></td>';
        } else {
          const dayIdx = col.shootDay - 1;
          const code = cm.days[dayIdx] || '';
          const cls = code ? ` class="dd-${code.toLowerCase()}"` : '';
          cells += `<td${cls}>${code}</td>`;
        }
      });

      const summaryCells = page.isLast ? `
        <td class="dd-sum-val"></td>
        <td class="dd-sum-val dd-sum-work">${cm.workCount}</td>
        <td class="dd-sum-val">${cm.holdCount || ''}</td>
        <td class="dd-sum-val">${cm.holidayCount || ''}</td>
        <td class="dd-sum-val dd-sum-date">${cm.startDate}</td>
        <td class="dd-sum-val dd-sum-date">${cm.finishDate}</td>
        <td class="dd-sum-val dd-sum-total">${cm.workCount}</td>
      ` : '';

      const label = `${cm.castNum}.${cm.role.toUpperCase()}`;
      rowsHTML += `<tr>
        <td class="dd-cast-label">${_e(label)}</td>
        ${cells}
        ${summaryCells}
      </tr>`;
    });

    pagesHTML += `
      <div class="dd-page">
        <div class="dd-page-header">
          <div class="dd-hdr-left">
            <div class="dd-hdr-date">${dateStr}</div>
            <div class="dd-hdr-time">${timeStr}</div>
          </div>
          <div class="dd-hdr-right">
            <div class="dd-hdr-pagenum">Page ${pageNum} of ${totalPages}</div>
          </div>
        </div>
        <div class="dd-report-title">Day Out of Days Report for Cast Members</div>
        <table class="dd-table">
          <thead>
            <tr class="dd-hdr-row dd-hdr-monthday">
              <th class="dd-cast-hdr">Month/Day</th>
              ${monthDayHeader}
              ${summaryLabelRow1}
            </tr>
            <tr class="dd-hdr-row dd-hdr-dow">
              <th class="dd-cast-hdr">Day of Week</th>
              ${dayOfWeekHeader}
              ${summaryLabelRow2}
            </tr>
            <tr class="dd-hdr-row dd-hdr-shootday">
              <th class="dd-cast-hdr">Shooting Day</th>
              ${shootDayHeader}
              ${summaryHeaders}
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>`;
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Day-out-of-Days \u2014 ${_e(projectName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; background: #fff; }

  .dd-page { padding: 16px 18px; }
  .dd-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px; }
  .dd-hdr-left { font-size: 9px; }
  .dd-hdr-date { font-weight: 400; }
  .dd-hdr-time { font-weight: 400; }
  .dd-hdr-right { text-align: right; font-size: 9px; }
  .dd-hdr-pagenum { font-weight: 400; }
  .dd-report-title { font-size: 12px; font-weight: 700; text-align: center; margin-bottom: 6px; }

  .dd-table { width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; }

  .dd-table th, .dd-table td { border: 1px solid #999; padding: 2px 3px; text-align: center; vertical-align: middle; }

  .dd-cast-hdr { text-align: left; font-weight: 700; font-size: 8px; white-space: nowrap; min-width: 100px; width: 120px; background: #f0f0f0; }
  .dd-cast-label { text-align: left; font-weight: 700; font-size: 8px; white-space: nowrap; padding-left: 4px; }

  .dd-hdr-row th { background: #f0f0f0; font-weight: 700; font-size: 7.5px; }
  .dd-hdr-monthday th { font-size: 7px; }
  .dd-hdr-dow th { font-size: 7px; }
  .dd-hdr-shootday th { font-weight: 700; font-size: 8px; }

  /* Down-day columns — grayed out */
  .dd-down { background: #d9d9d9 !important; }

  /* Work status cell highlights */
  .dd-sw, .dd-w, .dd-wf, .dd-swf { font-weight: 700; font-size: 7.5px; }

  /* Summary header columns */
  .dd-sum-hdr { font-weight: 700; font-size: 7px; background: #f0f0f0; white-space: nowrap; min-width: 32px; }
  .dd-sum-val { font-size: 8px; }
  .dd-sum-work { font-weight: 700; }
  .dd-sum-date { font-size: 7px; white-space: nowrap; }
  .dd-sum-total { font-weight: 700; }

  @media print {
    @page { size: letter landscape; margin: 0.3in 0.25in; }
    body { font-size: 8px; }
    .dd-page { padding: 0; page-break-after: always; }
    .dd-page:last-child { page-break-after: avoid; }
  }
</style>
</head><body>
${pagesHTML}
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=1100,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}
