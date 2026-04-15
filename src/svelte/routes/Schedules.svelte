<script>
  import { onMount } from 'svelte';
  import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

  const PROJECT_KEY  = 'movie-ledger-project';
  const CALENDAR_KEY = 'movie-ledger-calendar';
  const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
  const CAL_TZ_KEY   = 'movie-ledger-cal-tz';

  const SCHEDULE_TYPES = [
    { id: 'breakdown',        label: 'Breakdown',               icon: 'M4 6h16M4 12h16M4 18h10',                                                                                         desc: 'Master schedule — all other schedules pull from this.',          active: true },
    { id: 'one-liner-script', label: 'One-Liner (Script Order)', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',                                                                                 desc: 'Scene list ordered by script sequence.',                         active: true },
    { id: 'one-liner-shoot',  label: 'One-Liner (Shoot Order)',  icon: 'M4 6h16M4 10h12M4 14h16M4 18h8',                                                                                  desc: 'Scene list ordered by shooting schedule.',                       active: true },
    { id: 'prep-schedule',    label: 'Prep Schedule',            icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', desc: 'Generated from Calendar prep events.', active: true },
  ];
  const REPORT_TYPES = [
    { id: 'shooting-sched',  label: 'Shooting Schedule',  icon: 'M4 4h16v16H4zM4 10h16M10 4v16',                                                            desc: 'Scene-by-scene booklet in Script or Shoot order.',                active: true },
    { id: 'doods',           label: 'Day-out-of-Days',    icon: 'M3 4h18v2H3zM3 9h18v2H3zM3 14h18v2H3zM3 19h18v2H3z',                                       desc: 'Cast/crew work status per shoot day.',                           active: true },
    { id: 'elements-report', label: 'Elements',           icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2M7 7h10v10H7z',                       desc: 'Master list of all elements across scenes. Editable here.',      active: true },
  ];

  /* ── State ── */
  let view = $state('hub'); // 'hub' | 'prep'

  /* ── Prep data ── */
  let prepDays    = $state([]);
  let projectInfo = $state({});
  let timezone    = $state('');
  let pdfBytes    = $state(null);
  let pdfUrl      = $state('');
  let pdfLoading  = $state(false);

  function loadPrepData() {
    const proj = (() => { try { return JSON.parse(localStorage.getItem(PROJECT_KEY)); } catch { return null; } })();
    projectInfo = proj || {};
    timezone = localStorage.getItem(CAL_TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    const events   = (() => { try { return JSON.parse(localStorage.getItem(CALENDAR_KEY)) || {}; } catch { return {}; } })();
    const dayTypes = (() => { try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; } })();
    prepDays = collectPrepDays(events, dayTypes);
  }

  function collectPrepDays(events, dayTypes) {
    const prepDates = new Set();
    for (const [dk, dt] of Object.entries(dayTypes)) { if (dt === 'prep') prepDates.add(dk); }
    for (const [dk, evList] of Object.entries(events)) { for (const ev of evList) { if (ev.type === 'prep') prepDates.add(dk); } }
    const result = [];
    for (const dk of [...prepDates].sort()) {
      const dayEvts = events[dk] || [];
      const evts = dayEvts.length > 0 ? [...dayEvts].sort((a, b) => {
        if (a.allDay && !b.allDay) return -1; if (!a.allDay && b.allDay) return 1;
        return (a.time||'').localeCompare(b.time||'');
      }) : [{ id: '_empty', time: '', allDay: true, text: 'Prep Day (no events scheduled)', location: '', address: '', info: '', attendees: [], type: 'prep' }];
      result.push({ date: dk, events: evts });
    }
    return result;
  }

  /* ── Navigation ── */
  function goHub() {
    view = 'hub';
    pdfBytes = null;
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = ''; }
  }
  function goPrep() { loadPrepData(); view = 'prep'; }

  function handleCard(id) {
    if (id === 'breakdown')        window.location.hash = '#breakdowns';
    else if (id === 'one-liner-shoot') window.location.hash = '#one-liner';
    else if (id === 'one-liner-script') window.location.hash = '#script-order';
    else if (id === 'shooting-sched')  window.location.hash = '#shooting-schedule';
    else if (id === 'elements-report') window.location.hash = '#elements-report';
    else if (id === 'doods')       window.location.hash = '#day-out-of-days';
    else if (id === 'prep-schedule') goPrep();
  }

  onMount(() => {
    if (localStorage.getItem('movie-ledger-auto-prep')) {
      localStorage.removeItem('movie-ledger-auto-prep');
      goPrep();
    }
  });

  /* ── Date formatting ── */
  function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return isNaN(d) ? str : d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  }
  function fmtDateLong(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return isNaN(d) ? str : d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  }
  function fmtTime12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  /* ── PDF generation ── */
  async function generatePDF() {
    pdfLoading = true;
    try {
      const bytes = await buildPrepPDF();
      pdfBytes = bytes;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      pdfUrl = URL.createObjectURL(blob);
    } catch (err) {
      console.error('PDF error:', err);
      alert('Error generating PDF: ' + err.message);
    }
    pdfLoading = false;
  }

  function downloadPDF() {
    if (!pdfBytes) return;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Prep_Schedule_${(projectInfo.title||'Project').replace(/\s+/g,'_')}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function buildPrepPDF() {
    const pdfDoc     = await PDFDocument.create();
    const fontReg    = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageW      = PageSizes.Letter[0];
    const pageH      = PageSizes.Letter[1];
    const margin     = 50;
    const contentW   = pageW - margin * 2;

    const title      = projectInfo.title || 'Untitled Project';
    const prodCo     = projectInfo.productionCompany || '';
    const officeAddr = projectInfo.officeAddress || '';
    const startDate  = projectInfo.startDate ? fmtDate(projectInfo.startDate) : '';
    const wrapDate   = projectInfo.wrapDate  ? fmtDate(projectInfo.wrapDate)  : '';

    const black     = rgb(0,0,0);
    const darkGray  = rgb(0.3,0.3,0.3);
    const medGray   = rgb(0.5,0.5,0.5);
    const lightGray = rgb(0.85,0.85,0.85);
    const prepBlue  = rgb(0.18,0.42,0.65);
    const white     = rgb(1,1,1);

    let page = pdfDoc.addPage(PageSizes.Letter);
    let y    = pageH - margin;

    function drawFooter(pg) {
      pg.drawText('Generated by The Masterbook', { x: margin, y: 30, font: fontReg, size: 7, color: medGray });
    }
    function ensureSpace(needed) {
      if (y - needed < margin + 30) { drawFooter(page); page = pdfDoc.addPage(PageSizes.Letter); y = pageH - margin; }
    }
    function wrapText(text, font, size, maxW) {
      const words = text.split(/\s+/); const lines = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; } else { cur = test; }
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    }
    function splitAddress(addr) {
      if (!addr) return [];
      const parts = addr.trim().split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) return [parts[0], parts.slice(1).join(', ')];
      if (parts.length === 2) return [parts[0], parts[1]];
      return [addr.trim()];
    }

    // Header
    page.drawText(title.toUpperCase(), { x: margin, y, font: fontBold, size: 18, color: black }); y -= 22;
    page.drawText('PREP SCHEDULE',     { x: margin, y, font: fontBold, size: 13, color: prepBlue }); y -= 18;
    page.drawLine({ start:{x:margin,y}, end:{x:pageW-margin,y}, thickness:1.5, color:prepBlue }); y -= 16;

    const infoLines = [];
    if (prodCo)     infoLines.push(`Production Company: ${prodCo}`);
    if (officeAddr) infoLines.push(`Production Office: ${officeAddr}`);
    if (startDate)  infoLines.push(`Principal Photography Start: ${startDate}`);
    if (wrapDate)   infoLines.push(`Estimated Wrap: ${wrapDate}`);
    infoLines.push(`Time Zone: ${timezone.replace(/_/g,' ')}`);
    infoLines.push(`Generated: ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`);
    for (const line of infoLines) { page.drawText(line, { x:margin, y, font:fontReg, size:9, color:darkGray }); y -= 13; }
    y -= 6;
    page.drawLine({ start:{x:margin,y}, end:{x:pageW-margin,y}, thickness:0.5, color:lightGray }); y -= 20;

    if (!prepDays.length) {
      page.drawText('No prep events found.', { x:margin, y, font:fontReg, size:11, color:medGray });
    } else {
      for (const day of prepDays) {
        ensureSpace(Math.min(28 + day.events.length * 42, 120));
        const barH = 20;
        page.drawRectangle({ x:margin, y:y-barH+4, width:contentW, height:barH, color:prepBlue });
        page.drawText(fmtDateLong(day.date), { x:margin+8, y:y-barH+10, font:fontBold, size:10, color:white });
        y -= barH + 8;

        for (const ev of day.events) {
          ensureSpace(48);
          const timeStr = ev.allDay ? 'ALL DAY' : fmtTime12(ev.time);
          const nameX = margin + 80;
          const locX  = pageW - margin - 180;

          if (timeStr) page.drawText(timeStr, { x:margin+8, y, font:fontBold, size:9, color:prepBlue });
          page.drawText(ev.text||'Event', { x:nameX, y, font:fontBold, size:10, color:black });

          let locY = y;
          if (ev.location) { page.drawText(ev.location, { x:locX, y:locY, font:fontBold, size:9, color:darkGray }); locY -= 12; }
          if (ev.address) {
            for (const al of splitAddress(ev.address)) { page.drawText(al, { x:locX, y:locY, font:fontReg, size:8, color:medGray }); locY -= 11; }
          }
          y -= 13;
          if (ev.location || ev.address) y = Math.min(y, locY + 2);

          if (ev.info) {
            for (const il of wrapText(ev.info, fontReg, 8, contentW - 88)) {
              ensureSpace(12); page.drawText(il, { x:nameX, y, font:fontReg, size:8, color:medGray }); y -= 11;
            }
          }
          if (ev.attendees?.length) {
            for (const al of wrapText('Attendees: '+ev.attendees.join(', '), fontReg, 8, contentW-88)) {
              ensureSpace(12); page.drawText(al, { x:nameX, y, font:fontReg, size:8, color:medGray }); y -= 11;
            }
          }
          y -= 6;
          page.drawLine({ start:{x:margin+8,y:y+2}, end:{x:pageW-margin-8,y:y+2}, thickness:0.3, color:lightGray });
          y -= 6;
        }
        y -= 8;
      }
    }
    drawFooter(page);
    return await pdfDoc.save();
  }

  /* ── Derived totals ── */
  let totalPrepEvents = $derived(prepDays.reduce((s, d) => s + d.events.length, 0));
</script>

{#if view === 'hub'}
  <section class="sched-section">
    <h2 class="sched-title">Schedules</h2>
    <p class="sched-subtitle">Production scheduling tools. The Breakdown is the master schedule that feeds all other formats.</p>

    <div class="sched-grid">
      {#each SCHEDULE_TYPES as t}
        <div class="sched-card{t.active ? ' sched-card--active' : ''}"
             role={t.active ? 'button' : undefined}
             tabindex={t.active ? 0 : undefined}
             onclick={() => t.active && handleCard(t.id)}
             onkeydown={e => (e.key==='Enter'||e.key===' ') && t.active && handleCard(t.id)}>
          <div class="sched-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round" width="28" height="28">
              <path d={t.icon}/>
            </svg>
          </div>
          <div class="sched-card-body">
            <span class="sched-card-title">{t.label}</span>
            <span class="sched-card-desc">{t.desc}</span>
          </div>
          {#if t.active}
            <span class="sched-card-badge sched-card-badge--ready">Open</span>
          {:else}
            <span class="sched-card-badge">Coming Soon</span>
          {/if}
        </div>
      {/each}
    </div>

    <h2 class="sched-title" style="margin-top:32px;">Reports</h2>
    <p class="sched-subtitle">Production reports generated from your breakdown and schedule data.</p>

    <div class="sched-grid">
      {#each REPORT_TYPES as t}
        <div class="sched-card{t.active ? ' sched-card--active' : ''}"
             role={t.active ? 'button' : undefined}
             tabindex={t.active ? 0 : undefined}
             onclick={() => t.active && handleCard(t.id)}
             onkeydown={e => (e.key==='Enter'||e.key===' ') && t.active && handleCard(t.id)}>
          <div class="sched-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round" width="28" height="28">
              <path d={t.icon}/>
            </svg>
          </div>
          <div class="sched-card-body">
            <span class="sched-card-title">{t.label}</span>
            <span class="sched-card-desc">{t.desc}</span>
          </div>
          {#if t.active}
            <span class="sched-card-badge sched-card-badge--ready">Open</span>
          {:else}
            <span class="sched-card-badge">Coming Soon</span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

{:else}
  <!-- Prep Schedule view -->
  <section class="sched-section">
    <div class="sched-back-row">
      <button class="btn btn--ghost btn--sm" onclick={goHub}>← Back to Schedules</button>
    </div>
    <h2 class="sched-title">Prep Schedule</h2>
    <p class="sched-subtitle">Generated from Calendar prep events. Edit events on the Calendar tab, then return here to generate the PDF.</p>

    <div class="prep-layout">
      <!-- Left: Settings & Event Summary -->
      <div class="prep-left">
        <div class="prep-info-card">
          <h3>Project Info</h3>
          <div class="prep-info-row"><span class="prep-info-label">Project:</span> <span>{projectInfo.title || '—'}</span></div>
          {#if projectInfo.productionCompany}
            <div class="prep-info-row"><span class="prep-info-label">Production Co:</span> <span>{projectInfo.productionCompany}</span></div>
          {/if}
          {#if projectInfo.officeAddress}
            <div class="prep-info-row"><span class="prep-info-label">Office Address:</span> <span>{projectInfo.officeAddress}</span></div>
          {/if}
          {#if projectInfo.startDate}
            <div class="prep-info-row"><span class="prep-info-label">PP Start:</span> <span>{fmtDate(projectInfo.startDate)}</span></div>
          {/if}
          {#if projectInfo.wrapDate}
            <div class="prep-info-row"><span class="prep-info-label">Est. Wrap:</span> <span>{fmtDate(projectInfo.wrapDate)}</span></div>
          {/if}
          <div class="prep-info-row"><span class="prep-info-label">Time Zone:</span> <span>{timezone.replace(/_/g,' ')}</span></div>
        </div>

        <div class="prep-info-card">
          <h3>Prep Events ({totalPrepEvents})</h3>
          {#if prepDays.length === 0}
            <p style="color:var(--text-muted);font-size:12px;">No prep events found. Add events with the Prep type on the Calendar tab.</p>
          {:else}
            <div class="prep-event-list">
              {#each prepDays as day}
                <div class="prep-day-group">
                  <div class="prep-day-label">{fmtDateLong(day.date)}</div>
                  {#each day.events as ev}
                    <div class="prep-event-item">
                      <span class="prep-event-time">{ev.allDay ? 'ALL DAY' : (ev.time || '')}</span>
                      <span class="prep-event-name">{ev.text || 'Event'}</span>
                      {#if ev.location}<span class="prep-event-loc-inline">{ev.location}</span>{/if}
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <button class="btn btn--primary" style="margin-top:16px;width:100%;"
                onclick={generatePDF} disabled={pdfLoading}>
          {pdfLoading ? 'Generating…' : pdfBytes ? 'Regenerate PDF' : 'Generate Prep Calendar PDF'}
        </button>
        {#if pdfBytes}
          <button class="btn btn--ghost" style="margin-top:8px;width:100%;" onclick={downloadPDF}>
            Download PDF
          </button>
        {/if}
      </div>

      <!-- Right: PDF Preview -->
      <div class="prep-right">
        {#if pdfUrl}
          <iframe src="{pdfUrl}#toolbar=1" class="prep-pdf-iframe" title="Prep Schedule PDF"></iframe>
        {:else}
          <div class="prep-preview-placeholder">
            <p>Click "Generate Prep Calendar PDF" to preview.</p>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .sched-section { max-width: 900px; }
  .sched-title   { font-size: 1.15rem; font-weight: 700; margin-bottom: 4px; }
  .sched-subtitle { font-size: 0.82rem; color: var(--text-muted, #888); margin-bottom: 18px; }
  .sched-back-row { margin-bottom: 16px; }

  .sched-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 8px;
  }
  .sched-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 14px 12px;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    background: var(--bg-elevated, #1e1e1e);
    opacity: 0.55;
    position: relative;
  }
  .sched-card--active {
    opacity: 1;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .sched-card--active:hover { background: var(--bg-hover, #2a2a2a); border-color: var(--gold, #c9a84c); }
  .sched-card-icon { color: var(--text-muted, #888); }
  .sched-card-body { display: flex; flex-direction: column; gap: 3px; flex: 1; }
  .sched-card-title { font-size: 0.85rem; font-weight: 600; }
  .sched-card-desc  { font-size: 0.75rem; color: var(--text-muted, #888); }
  .sched-card-badge {
    font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;
    background: var(--bg-surface, #1a1a1a); color: var(--text-muted, #888);
    align-self: flex-start;
  }
  .sched-card-badge--ready { background: var(--gold, #c9a84c); color: #000; }

  /* Prep layout */
  .prep-layout  { display: flex; gap: 24px; align-items: flex-start; }
  .prep-left    { flex: 0 0 300px; display: flex; flex-direction: column; gap: 12px; }
  .prep-right   { flex: 1; min-height: 400px; }

  .prep-info-card {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .prep-info-card h3 { font-size: 0.82rem; font-weight: 700; margin-bottom: 8px; color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: 0.04em; }
  .prep-info-row { display: flex; gap: 6px; font-size: 0.8rem; margin-bottom: 4px; }
  .prep-info-label { color: var(--text-muted, #888); white-space: nowrap; }

  .prep-event-list { display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto; }
  .prep-day-group {}
  .prep-day-label { font-size: 0.75rem; font-weight: 700; color: var(--gold, #c9a84c); margin-bottom: 3px; }
  .prep-event-item { display: flex; gap: 6px; font-size: 0.75rem; align-items: baseline; padding: 1px 0; }
  .prep-event-time { font-size: 0.7rem; color: var(--text-muted, #888); white-space: nowrap; min-width: 56px; }
  .prep-event-name { flex: 1; }
  .prep-event-loc-inline { font-size: 0.7rem; color: var(--text-muted, #888); font-style: italic; }

  .prep-pdf-iframe {
    width: 100%; height: 650px; border: 1px solid var(--border, #333); border-radius: 6px;
  }
  .prep-preview-placeholder {
    width: 100%; height: 400px; display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border, #333); border-radius: 6px;
    color: var(--text-muted, #888); font-size: 0.875rem;
  }
</style>
