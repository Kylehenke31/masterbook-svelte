/* ============================================================
   The Masterbook — schedules.js
   Schedules hub: Breakdown, One-Liner, Shooting Schedule,
   Day-out-of-Days, and Prep Schedule generation.
   ============================================================ */

const PROJECT_KEY  = 'movie-ledger-project';
const CALENDAR_KEY = 'movie-ledger-calendar';
const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
const CAL_TZ_KEY   = 'movie-ledger-cal-tz';

let _container = null;
let _activeView = 'hub';   // 'hub' | 'prep-schedule'

const SCHEDULE_TYPES = [
  { id: 'breakdown',       label: 'Breakdown',                icon: 'M4 6h16M4 12h16M4 18h10', desc: 'Master schedule — all other schedules pull from this.', active: true },
  { id: 'one-liner-script',label: 'One-Liner (Script Order)',  icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', desc: 'Scene list ordered by script sequence.', active: true },
  { id: 'one-liner-shoot', label: 'One-Liner (Shoot Order)',   icon: 'M4 6h16M4 10h12M4 14h16M4 18h8', desc: 'Scene list ordered by shooting schedule.', active: true },
  { id: 'prep-schedule',   label: 'Prep Schedule',             icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', desc: 'Generated from Calendar prep events.', active: true },
];

const REPORT_TYPES = [
  { id: 'shooting-sched',  label: 'Shooting Schedule',         icon: 'M4 4h16v16H4zM4 10h16M10 4v16', desc: 'Scene-by-scene booklet in Script or Shoot order.', active: true },
  { id: 'doods',           label: 'Day-out-of-Days',           icon: 'M3 4h18v2H3zM3 9h18v2H3zM3 14h18v2H3zM3 19h18v2H3z', desc: 'Cast/crew work status per shoot day.', active: true },
  { id: 'elements-report', label: 'Elements',                  icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2M7 7h10v10H7z', desc: 'Master list of all elements across scenes. Editable here.', active: true },
];

export function renderSchedules(container) {
  _container = container;
  if (localStorage.getItem('movie-ledger-auto-prep')) {
    localStorage.removeItem('movie-ledger-auto-prep');
    _renderPrepSchedule();
    return;
  }
  _activeView = 'hub';
  _renderHub();
}

function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ────────────────────────────────────────────────────────────
   HUB VIEW
   ──────────────────────────────────────────────────────────── */
function _renderHub() {
  _activeView = 'hub';

  function _makeCards(types) {
    return types.map(t => `
      <div class="sched-card${t.active ? ' sched-card--active' : ''}" data-sched="${t.id}">
        <div class="sched-card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round" width="28" height="28">
            <path d="${t.icon}"/>
          </svg>
        </div>
        <div class="sched-card-body">
          <span class="sched-card-title">${_esc(t.label)}</span>
          <span class="sched-card-desc">${_esc(t.desc)}</span>
        </div>
        ${t.active ? '<span class="sched-card-badge sched-card-badge--ready">Open</span>' : '<span class="sched-card-badge">Coming Soon</span>'}
      </div>
    `).join('');
  }

  _container.innerHTML = `
    <section class="sched-section">
      <h2 class="sched-title">Schedules</h2>
      <p class="sched-subtitle">Production scheduling tools. The Breakdown is the master schedule that feeds all other formats.</p>
      <div class="sched-grid">${_makeCards(SCHEDULE_TYPES)}</div>

      <h2 class="sched-title" style="margin-top:32px;">Reports</h2>
      <p class="sched-subtitle">Production reports generated from your breakdown and schedule data.</p>
      <div class="sched-grid">${_makeCards(REPORT_TYPES)}</div>
    </section>
  `;

  // Wire click on active cards
  _container.querySelectorAll('.sched-card--active').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const id = card.dataset.sched;
      if (id === 'breakdown') { window.location.hash = '#breakdowns'; return; }
      if (id === 'one-liner-shoot') { window.location.hash = '#one-liner'; return; }
      if (id === 'one-liner-script') { window.location.hash = '#script-order'; return; }
      if (id === 'shooting-sched') { window.location.hash = '#shooting-schedule'; return; }
      if (id === 'elements-report') { window.location.hash = '#elements-report'; return; }
      if (id === 'doods') { window.location.hash = '#day-out-of-days'; return; }
      if (id === 'prep-schedule') _renderPrepSchedule();
    });
  });
}

/* ────────────────────────────────────────────────────────────
   PREP SCHEDULE VIEW
   Two-column layout: settings on left, PDF preview on right.
   Pulls prep events from Calendar localStorage.
   ──────────────────────────────────────────────────────────── */
function _renderPrepSchedule() {
  _activeView = 'prep-schedule';

  const proj = _getProject();
  const events = _getCalendarEvents();
  const dayTypes = _getDayTypes();
  const tz = localStorage.getItem(CAL_TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

  // Gather all prep events: events on days marked as 'prep' OR events with type === 'prep'
  const prepDays = _collectPrepDays(events, dayTypes);

  const title = proj?.title || 'Untitled Project';
  const prodCo = proj?.productionCompany || '';
  const officeAddr = proj?.officeAddress || '';
  const startDate = proj?.startDate || '';
  const wrapDate = proj?.wrapDate || '';

  _container.innerHTML = `
    <section class="sched-section">
      <div class="sched-back-row">
        <button class="btn btn--ghost btn--sm" id="sched-back">&larr; Back to Schedules</button>
      </div>
      <h2 class="sched-title">Prep Schedule</h2>
      <p class="sched-subtitle">Generated from Calendar prep events. Edit events on the Calendar tab, then return here to generate the PDF.</p>

      <div class="prep-layout">
        <!-- Left: Settings & Event Summary -->
        <div class="prep-left">
          <div class="prep-info-card">
            <h3>Project Info</h3>
            <div class="prep-info-row"><span class="prep-info-label">Project:</span> <span>${_esc(title)}</span></div>
            ${prodCo ? `<div class="prep-info-row"><span class="prep-info-label">Production Co:</span> <span>${_esc(prodCo)}</span></div>` : ''}
            ${officeAddr ? `<div class="prep-info-row"><span class="prep-info-label">Office Address:</span> <span>${_esc(officeAddr)}</span></div>` : ''}
            ${startDate ? `<div class="prep-info-row"><span class="prep-info-label">PP Start:</span> <span>${_fmtDate(startDate)}</span></div>` : ''}
            ${wrapDate ? `<div class="prep-info-row"><span class="prep-info-label">Est. Wrap:</span> <span>${_fmtDate(wrapDate)}</span></div>` : ''}
            <div class="prep-info-row"><span class="prep-info-label">Time Zone:</span> <span>${_esc(tz.replace(/_/g, ' '))}</span></div>
          </div>

          <div class="prep-info-card">
            <h3>Prep Events (${prepDays.reduce((s, d) => s + d.events.length, 0)})</h3>
            ${prepDays.length === 0 ? '<p style="color:var(--text-muted);font-size:12px;">No prep events found. Add events with the Prep type on the Calendar tab.</p>' : ''}
            <div class="prep-event-list">
              ${prepDays.map(day => `
                <div class="prep-day-group">
                  <div class="prep-day-label">${_fmtDateLong(day.date)}</div>
                  ${day.events.map(ev => `
                    <div class="prep-event-item">
                      <span class="prep-event-time">${ev.allDay ? 'ALL DAY' : (ev.time || '')}</span>
                      <span class="prep-event-name">${_esc(ev.text || 'Event')}</span>
                      ${ev.location ? `<span class="prep-event-loc-inline">${_esc(ev.location)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>

          <button class="btn btn--primary" id="prep-gen-pdf" style="margin-top:16px;width:100%;">
            Generate Prep Calendar PDF
          </button>
          <button class="btn btn--ghost" id="prep-download-pdf" style="margin-top:8px;width:100%;display:none;">
            Download PDF
          </button>
        </div>

        <!-- Right: PDF Preview -->
        <div class="prep-right">
          <div class="prep-preview-placeholder" id="prep-preview-area">
            <p>Click "Generate Prep Calendar PDF" to preview.</p>
          </div>
        </div>
      </div>
    </section>
  `;

  _container.querySelector('#sched-back')?.addEventListener('click', () => _renderHub());

  _container.querySelector('#prep-gen-pdf')?.addEventListener('click', async () => {
    const btn = _container.querySelector('#prep-gen-pdf');
    btn.textContent = 'Generating…';
    btn.disabled = true;
    try {
      const pdfBytes = await _generatePrepPDF(proj, prepDays, tz);
      _showPrepPreview(pdfBytes);
      _container.querySelector('#prep-download-pdf').style.display = '';
      _container.querySelector('#prep-download-pdf').onclick = () => _downloadPDF(pdfBytes, `Prep_Schedule_${title.replace(/\s+/g,'_')}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      const area = _container.querySelector('#prep-preview-area');
      if (area) area.innerHTML = `<p style="color:#f87171;">Error generating PDF: ${_esc(err.message)}</p>`;
    }
    btn.textContent = 'Regenerate PDF';
    btn.disabled = false;
  });
}

/* ── Collect prep days ── */
function _collectPrepDays(events, dayTypes) {
  const prepDates = new Set();

  // Days explicitly marked as 'prep'
  for (const [dk, dt] of Object.entries(dayTypes)) {
    if (dt === 'prep') prepDates.add(dk);
  }

  // Days with any event that has type 'prep'
  for (const [dk, evList] of Object.entries(events)) {
    for (const ev of evList) {
      if (ev.type === 'prep') prepDates.add(dk);
    }
  }

  // Build sorted array of { date, events[] }
  const result = [];
  const sortedDates = [...prepDates].sort();
  for (const dk of sortedDates) {
    const dayEvts = events[dk] || [];
    // Include ALL events on prep days (not just prep-typed ones)
    const evts = dayEvts.length > 0 ? [...dayEvts].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.time || '').localeCompare(b.time || '');
    }) : [{ id: '_empty', time: '', allDay: true, text: 'Prep Day (no events scheduled)', location: '', address: '', info: '', attendees: [], type: 'prep' }];
    result.push({ date: dk, events: evts });
  }
  return result;
}

/* ── Data helpers ── */
function _getProject() {
  try { return JSON.parse(localStorage.getItem(PROJECT_KEY)); } catch { return null; }
}
function _getCalendarEvents() {
  try { return JSON.parse(localStorage.getItem(CALENDAR_KEY)) || {}; } catch { return {}; }
}
function _getDayTypes() {
  try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; }
}

function _fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function _fmtDateLong(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function _fmtDateShort(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function _fmtTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ────────────────────────────────────────────────────────────
   PDF GENERATION (using pdf-lib loaded from CDN)
   ──────────────────────────────────────────────────────────── */
async function _generatePrepPDF(proj, prepDays, tz) {
  const { PDFDocument, StandardFonts, rgb, PageSizes } = PDFLib;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = PageSizes.Letter[0]; // 612
  const pageH = PageSizes.Letter[1]; // 792
  const margin = 50;
  const contentW = pageW - margin * 2;

  const title     = proj?.title || 'Untitled Project';
  const prodCo    = proj?.productionCompany || '';
  const officeAddr = proj?.officeAddress || '';
  const startDate = proj?.startDate ? _fmtDate(proj.startDate) : '';
  const wrapDate  = proj?.wrapDate ? _fmtDate(proj.wrapDate) : '';

  // Colors
  const black     = rgb(0, 0, 0);
  const darkGray  = rgb(0.3, 0.3, 0.3);
  const medGray   = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const prepBlue  = rgb(0.18, 0.42, 0.65);
  const white     = rgb(1, 1, 1);

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y = pageH - margin;

  function ensureSpace(needed) {
    if (y - needed < margin + 30) {
      // Draw footer on current page
      _drawFooter(page, fontRegular, margin, pageW, medGray);
      page = pdfDoc.addPage(PageSizes.Letter);
      y = pageH - margin;
    }
  }

  // ── Header ──
  // Title
  page.drawText(title.toUpperCase(), { x: margin, y, font: fontBold, size: 18, color: black });
  y -= 22;
  page.drawText('PREP SCHEDULE', { x: margin, y, font: fontBold, size: 13, color: prepBlue });
  y -= 18;

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1.5, color: prepBlue });
  y -= 16;

  // Info rows
  const infoLines = [];
  if (prodCo) infoLines.push(`Production Company: ${prodCo}`);
  if (officeAddr) infoLines.push(`Production Office: ${officeAddr}`);
  if (startDate) infoLines.push(`Principal Photography Start: ${startDate}`);
  if (wrapDate) infoLines.push(`Estimated Wrap: ${wrapDate}`);
  infoLines.push(`Time Zone: ${tz.replace(/_/g, ' ')}`);
  infoLines.push(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);

  for (const line of infoLines) {
    page.drawText(line, { x: margin, y, font: fontRegular, size: 9, color: darkGray });
    y -= 13;
  }
  y -= 6;

  // Divider
  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: lightGray });
  y -= 20;

  // ── Prep Days ──
  if (prepDays.length === 0) {
    page.drawText('No prep events found.', { x: margin, y, font: fontRegular, size: 11, color: medGray });
    y -= 16;
  } else {
    for (const day of prepDays) {
      // Estimate space needed: header + events
      const neededHeight = 28 + day.events.length * 42;
      ensureSpace(Math.min(neededHeight, 120));

      // Day header bar
      const barH = 20;
      page.drawRectangle({
        x: margin, y: y - barH + 4, width: contentW, height: barH,
        color: prepBlue,
      });
      page.drawText(_fmtDateLong(day.date), {
        x: margin + 8, y: y - barH + 10, font: fontBold, size: 10, color: white,
      });
      y -= barH + 8;

      // Events
      for (const ev of day.events) {
        ensureSpace(48);

        const timeStr = ev.allDay ? 'ALL DAY' : _fmtTime12(ev.time);
        const nameStr = ev.text || 'Event';

        // Layout: Time (left) | Event name (center) | Location + Address (right)
        const nameX = margin + 80;
        const locX  = pageW - margin - 180;  // right-aligned block for location

        // Time
        if (timeStr) {
          page.drawText(timeStr, { x: margin + 8, y, font: fontBold, size: 9, color: prepBlue });
        }

        // Event name
        page.drawText(nameStr, { x: nameX, y, font: fontBold, size: 10, color: black });

        // Location + Address (right-aligned, same starting y as event name)
        let locY = y;
        if (ev.location) {
          page.drawText(ev.location, { x: locX, y: locY, font: fontBold, size: 9, color: darkGray });
          locY -= 12;
        }
        if (ev.address) {
          // Split address into street line and city/state/zip line
          const addrLines = _splitAddress(ev.address);
          for (const aLine of addrLines) {
            page.drawText(aLine, { x: locX, y: locY, font: fontRegular, size: 8, color: medGray });
            locY -= 11;
          }
        }

        // Move y down to whichever column is lower (event detail or location block)
        y -= 13;
        if (ev.location || ev.address) {
          y = Math.min(y, locY + 2);
        }

        // Info (below event name, full width)
        if (ev.info) {
          const infoLines = _wrapText(ev.info, fontRegular, 8, contentW - 88);
          for (const il of infoLines) {
            ensureSpace(12);
            page.drawText(il, { x: nameX, y, font: fontRegular, size: 8, color: medGray });
            y -= 11;
          }
        }
        // Attendees
        if (ev.attendees && ev.attendees.length > 0) {
          const attStr = 'Attendees: ' + ev.attendees.join(', ');
          const attLines = _wrapText(attStr, fontRegular, 8, contentW - 88);
          for (const al of attLines) {
            ensureSpace(12);
            page.drawText(al, { x: nameX, y, font: fontRegular, size: 8, color: medGray });
            y -= 11;
          }
        }

        y -= 6;

        // Light separator between events
        page.drawLine({ start: { x: margin + 8, y: y + 2 }, end: { x: pageW - margin - 8, y: y + 2 }, thickness: 0.3, color: lightGray });
        y -= 6;
      }

      y -= 8;
    }
  }

  // Footer on last page
  _drawFooter(page, fontRegular, margin, pageW, medGray);

  return await pdfDoc.save();
}

function _drawFooter(page, font, margin, pageW, color) {
  page.drawText('Generated by The Masterbook', {
    x: margin, y: 30, font, size: 7, color,
  });
}

function _wrapText(text, font, size, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    const tw = font.widthOfTextAtSize(test, size);
    if (tw > maxW && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/* ── Address formatting ── */
function _splitAddress(addr) {
  if (!addr) return [];
  const trimmed = addr.trim();
  // Try splitting on comma — typically "123 Main St, City, ST 12345"
  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    // Street is first part, rest is city/state/zip
    return [parts[0], parts.slice(1).join(', ')];
  }
  if (parts.length === 2) {
    return [parts[0], parts[1]];
  }
  // Single part — return as one line
  return [trimmed];
}

/* ── Preview ── */
function _showPrepPreview(pdfBytes) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const area = _container.querySelector('#prep-preview-area');
  if (area) {
    area.innerHTML = `<iframe src="${url}#toolbar=1" class="prep-pdf-iframe"></iframe>`;
  }
}

function _downloadPDF(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
