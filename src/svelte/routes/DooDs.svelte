<script>
  const BD_KEY       = 'movie-ledger-breakdowns';
  const OL_DRAFTS    = 'movie-ledger-one-liner-drafts';
  const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';

  /* ── State ── */
  let selectedDraftId = $state('');

  /* ── Data ── */
  function getScenes() { try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; } }
  function getDayTypes() { try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; } }
  function getProjectName() {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project'))?.title || 'Untitled Project'; }
    catch { return 'Untitled Project'; }
  }

  let drafts    = $derived((() => { try { return JSON.parse(localStorage.getItem(OL_DRAFTS)) || {}; } catch { return {}; } })());
  let draftKeys = $derived(Object.keys(drafts));

  /* ── Build helpers ── */
  function buildShootDays() {
    const dt = getDayTypes();
    return Object.entries(dt).filter(([,t])=>t==='shoot').map(([d])=>d).sort();
  }

  function buildDayGroups(draft) {
    const scenes = getScenes();
    const sceneMap = {};
    scenes.forEach(s => { sceneMap[s.id] = s; });
    const days = [];
    let cur = [];
    for (const item of draft.items) {
      if (item.type === 'scene') { const s = sceneMap[item.sceneId]; if (s) cur.push(s); }
      else if (item.type === 'daybreak') { if (cur.length) { days.push(cur); cur = []; } }
    }
    if (cur.length) days.push(cur);
    return days;
  }

  function buildCastWorkMap(dayGroups) {
    const castWork = {};
    dayGroups.forEach((dayScenes, dayIdx) => {
      dayScenes.forEach(scene => {
        (scene.castMembers || []).forEach(cm => {
          const key = cm.castNum || cm.role || cm.name;
          if (!key) return;
          if (!castWork[key]) castWork[key] = { castNum: cm.castNum, role: cm.role || cm.name || '', days: new Set() };
          castWork[key].days.add(dayIdx);
        });
      });
    });
    return castWork;
  }

  function classifyDays(workDays) {
    const sorted = [...workDays].sort((a,b) => a-b);
    if (!sorted.length) return {};
    const result = {};
    const blocks = [];
    let bStart = sorted[0], bEnd = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === bEnd + 1) bEnd = sorted[i];
      else { blocks.push([bStart, bEnd]); bStart = sorted[i]; bEnd = sorted[i]; }
    }
    blocks.push([bStart, bEnd]);
    blocks.forEach(([s, e]) => {
      if (s === e) result[s] = 'SWF';
      else for (let d = s; d <= e; d++) result[d] = d===s?'SW':d===e?'WF':'W';
    });
    return result;
  }

  /* ── Generate ── */
  function generate() {
    if (!selectedDraftId) { alert('Select a draft.'); return; }
    const draft = drafts[selectedDraftId];
    if (!draft) { alert('Select a draft.'); return; }

    const dayGroups  = buildDayGroups(draft);
    const castWork   = buildCastWorkMap(dayGroups);
    const shootDates = buildShootDays();
    const totalDays  = dayGroups.length;

    const columns = [];
    for (let d = 0; d < totalDays; d++) {
      const dateStr = shootDates[d] || null;
      let monthDay = '', dayOfWeek = '';
      if (dateStr) {
        const dt = new Date(dateStr + 'T12:00:00');
        monthDay   = `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
        dayOfWeek  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
      }
      columns.push({ shootDay: d+1, date: dateStr, monthDay, dayOfWeek });
    }

    // Down day columns
    const downDayColumns = [];
    if (shootDates.length >= 2) {
      const firstDate = new Date(shootDates[0] + 'T12:00:00');
      const lastDate  = new Date(shootDates[shootDates.length-1] + 'T12:00:00');
      const dayTypes  = getDayTypes();
      const shootSet  = new Set(shootDates);
      const cur = new Date(firstDate);
      while (cur <= lastDate) {
        const ds = cur.toISOString().slice(0,10);
        if (!shootSet.has(ds)) {
          downDayColumns.push({
            date: ds,
            monthDay: `${String(cur.getMonth()+1).padStart(2,'0')}/${String(cur.getDate()).padStart(2,'0')}`,
            dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][cur.getDay()],
            type: dayTypes[ds] || '',
          });
        }
        cur.setDate(cur.getDate()+1);
      }
    }

    // Merge chronologically
    const allColumns = [];
    if (shootDates.length > 0) {
      const all = [
        ...columns.filter(c=>c.date).map(c=>({...c,isShoot:true})),
        ...downDayColumns.map(c=>({...c,isShoot:false,shootDay:null})),
      ];
      all.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      allColumns.push(...all);
      columns.filter(c=>!c.date).forEach(c=>allColumns.push({...c,isShoot:true}));
    } else {
      columns.forEach(c=>allColumns.push({...c,isShoot:true}));
    }

    // Cast rows
    const castRows = Object.values(castWork).sort((a,b)=>(parseInt(a.castNum)||999)-(parseInt(b.castNum)||999));

    // Pages (18 day cols per page)
    const MAX_DAY_COLS = 18;
    const pages = [];
    let colStart = 0;
    while (colStart < allColumns.length) {
      pages.push({ cols: allColumns.slice(colStart, colStart+MAX_DAY_COLS), isLast: colStart+MAX_DAY_COLS>=allColumns.length });
      colStart += MAX_DAY_COLS;
    }
    if (!pages.length) pages.push({ cols: [], isLast: true });

    const castSummary = castRows.map(cm => {
      const days = classifyDays(cm.days);
      const sortedDays = [...cm.days].sort((a,b)=>a-b);
      const startDate = columns[sortedDays[0]]?.monthDay || '';
      const finishDate = columns[sortedDays[sortedDays.length-1]]?.monthDay || '';
      return { ...cm, days, workCount: cm.days.size, startDate, finishDate };
    });

    openPrintView(pages, castSummary, columns);
  }

  function openPrintView(pages, castSummary, columns) {
    const projectName = getProjectName();
    const e = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const timeStr = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const totalPages = pages.length;

    let pagesHTML = '';
    pages.forEach((page, pi) => {
      let monthDayHeader='', dayOfWeekHeader='', shootDayHeader='';
      page.cols.forEach(col => {
        const cls = !col.isShoot ? ' class="dd-down"' : '';
        monthDayHeader  += `<th${cls}>${col.monthDay||''}</th>`;
        dayOfWeekHeader += `<th${cls}>${col.dayOfWeek||''}</th>`;
        shootDayHeader  += col.isShoot ? `<th>${col.shootDay||''}</th>` : `<th class="dd-down"></th>`;
      });
      const summaryHeaders = page.isLast ? `<th class="dd-sum-hdr">Travel</th><th class="dd-sum-hdr">Work</th><th class="dd-sum-hdr">Hold</th><th class="dd-sum-hdr">Holiday</th><th class="dd-sum-hdr">Start</th><th class="dd-sum-hdr">Finish</th><th class="dd-sum-hdr">TOTAL</th>` : '';
      const sl1 = page.isLast ? '<th></th><th></th><th></th><th></th><th></th><th></th><th></th>' : '';
      const sl2 = page.isLast ? '<th>Co.</th><th></th><th></th><th></th><th></th><th></th><th></th>' : '';

      let rowsHTML = '';
      castSummary.forEach(cm => {
        let cells = '';
        page.cols.forEach(col => {
          if (!col.isShoot) { cells += '<td class="dd-down"></td>'; }
          else {
            const code = cm.days[col.shootDay-1] || '';
            cells += `<td${code?` class="dd-${code.toLowerCase()}"`:''}>` + code + '</td>';
          }
        });
        const summaryCells = page.isLast ? `<td class="dd-sum-val"></td><td class="dd-sum-val dd-sum-work">${cm.workCount}</td><td class="dd-sum-val"></td><td class="dd-sum-val"></td><td class="dd-sum-val dd-sum-date">${e(cm.startDate)}</td><td class="dd-sum-val dd-sum-date">${e(cm.finishDate)}</td><td class="dd-sum-val dd-sum-total">${cm.workCount}</td>` : '';
        rowsHTML += `<tr><td class="dd-cast-label">${e(cm.castNum+'.'+cm.role.toUpperCase())}</td>${cells}${summaryCells}</tr>`;
      });

      pagesHTML += `<div class="dd-page">
        <div class="dd-page-header"><div class="dd-hdr-left"><div>${e(dateStr)}</div><div>${e(timeStr)}</div></div><div class="dd-hdr-right">Page ${pi+1} of ${totalPages}</div></div>
        <div class="dd-report-title">Day Out of Days Report for Cast Members</div>
        <table class="dd-table"><thead>
          <tr class="dd-hdr-row dd-hdr-monthday"><th class="dd-cast-hdr">Month/Day</th>${monthDayHeader}${sl1}</tr>
          <tr class="dd-hdr-row dd-hdr-dow"><th class="dd-cast-hdr">Day of Week</th>${dayOfWeekHeader}${sl2}</tr>
          <tr class="dd-hdr-row dd-hdr-shootday"><th class="dd-cast-hdr">Shooting Day</th>${shootDayHeader}${summaryHeaders}</tr>
        </thead><tbody>${rowsHTML}</tbody></table>
      </div>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Day-out-of-Days — ${e(projectName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#000;background:#fff}
.dd-page{padding:16px 18px}.dd-page-header{display:flex;justify-content:space-between;margin-bottom:2px;font-size:9px}
.dd-report-title{font-size:12px;font-weight:700;text-align:center;margin-bottom:6px}
.dd-table{width:100%;border-collapse:collapse;font-size:8px;table-layout:fixed}
.dd-table th,.dd-table td{border:1px solid #999;padding:2px 3px;text-align:center;vertical-align:middle}
.dd-cast-hdr{text-align:left;font-weight:700;font-size:8px;white-space:nowrap;min-width:100px;width:120px;background:#f0f0f0}
.dd-cast-label{text-align:left;font-weight:700;font-size:8px;white-space:nowrap;padding-left:4px}
.dd-hdr-row th{background:#f0f0f0;font-weight:700;font-size:7.5px}
.dd-down{background:#d9d9d9!important}
.dd-sw,.dd-w,.dd-wf,.dd-swf{font-weight:700;font-size:7.5px}
.dd-sum-hdr{font-weight:700;font-size:7px;background:#f0f0f0;white-space:nowrap;min-width:32px}
.dd-sum-val{font-size:8px}.dd-sum-work{font-weight:700}.dd-sum-date{font-size:7px;white-space:nowrap}.dd-sum-total{font-weight:700}
@media print{@page{size:letter landscape;margin:0.3in 0.25in}body{font-size:8px}.dd-page{padding:0;page-break-after:always}.dd-page:last-child{page-break-after:avoid}}
</style></head><body>${pagesHTML}
<script>window.onload=()=>{window.print()}<\/script></body></html>`;

    const w = window.open('','_blank','width=1100,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  }
</script>

<section class="ss-section">
  <div class="ss-toolbar">
    <button class="btn btn--ghost btn--sm" onclick={() => window.location.hash = '#schedules'}>← Back</button>
    <h2>Day-out-of-Days</h2>
  </div>

  <div class="ss-controls">
    <p class="ss-desc">Generate a Day-out-of-Days report. Select a Shoot Order draft to determine day assignments:</p>

    {#if draftKeys.length > 0}
      <div class="ss-order-row">
        <label class="ss-radio" style="font-weight:600;">Shoot Order Draft:</label>
        <select class="ss-draft-select" bind:value={selectedDraftId}>
          <option value="">— Select a draft —</option>
          {#each draftKeys as id}
            <option value={id}>{drafts[id].name}</option>
          {/each}
        </select>
      </div>
      <button class="btn btn--primary" style="margin-top:16px;" onclick={generate}>
        Generate &amp; Print / PDF
      </button>
    {:else}
      <p class="ss-hint" style="margin-top:8px;">
        No Shoot Order drafts available. Create one in One-Liner (Shoot Order) first.
      </p>
    {/if}
  </div>
</section>

<style>
  .ss-section { max-width: 600px; }
  .ss-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .ss-toolbar h2 { font-size: 1.1rem; }
  .ss-desc { color: var(--text-muted, #888); font-size: 0.875rem; margin-bottom: 16px; }
  .ss-order-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .ss-radio { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; }
  .ss-hint { font-size: 0.8rem; color: var(--text-muted, #888); }
  .ss-draft-select {
    background: var(--surface-2, #1e1e1e); border: 1px solid var(--border, #333);
    border-radius: 5px; color: var(--text, #eee); font-size: 0.875rem; padding: 5px 8px;
  }
</style>
