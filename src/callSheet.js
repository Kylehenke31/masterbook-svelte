/* ============================================================
   The Masterbook — callSheet.js
   Call Sheet Generator: WYSIWYG editor that mirrors the PDF layout.
   Auto-populates from Crew List & Project Settings.
   ============================================================ */

const CREW_KEY     = 'movie-ledger-crew';
const CAST_KEY     = 'movie-ledger-cast';
const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
const CS_KEY       = 'movie-ledger-callsheets';
const BD_KEY       = 'movie-ledger-breakdowns';

let _container = null;
let _sheets    = {};

/* ── Entry point ── */
export function renderCallSheet(container) {
  _container = container;
  _loadSheets();
  _renderMain();
}

/* ── Persistence ── */
function _loadSheets() {
  try { _sheets = JSON.parse(localStorage.getItem(CS_KEY)) || {}; } catch { _sheets = {}; }
}
function _saveSheets() { localStorage.setItem(CS_KEY, JSON.stringify(_sheets)); }

/* ── Data helpers ── */
function _getProject() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || null; } catch { return null; }
}
function _getCrewData() {
  try { return JSON.parse(localStorage.getItem(CREW_KEY)) || []; } catch { return []; }
}
function _getDayTypes() {
  try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; }
}

function _getProdInfo() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-prod-info')) || {}; } catch { return {}; }
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${d}`;
}

function _todayStr() {
  /* Default to tomorrow — call sheets are almost always prepared for the next day */
  const n = new Date();
  n.setDate(n.getDate() + 1);
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function _calcShootDay(dateStr) {
  const shootDates = Object.entries(_getDayTypes()).filter(([,t]) => t === 'shoot').map(([d]) => d).sort();
  const idx = shootDates.indexOf(dateStr);
  return idx >= 0 ? idx + 1 : null;
}

const CLIENT_AGENCY_SECTIONS = ['CLIENT', 'AGENCY'];

function _getCrewForDate(dateStr) {
  const crew = _getCrewData();
  const results = [];
  crew.forEach(section => {
    // Skip CLIENT and AGENCY — they auto-fill into the right-side sections
    if (CLIENT_AGENCY_SECTIONS.includes(section.sectionName?.toUpperCase())) return;
    const sc = [];
    (section.rows || []).forEach(row => {
      if (row[dateStr] === '1' && row.name?.trim()) {
        sc.push({ position: row.position||'', name: row.name||'', phone: row.phone||'', email: row.email||'' });
      }
    });
    if (sc.length) results.push({ section: section.sectionName, crew: sc });
  });
  return results;
}

function _getClientAgencyForDate(dateStr) {
  const crew = _getCrewData();
  const clientContacts = [];
  const agencyContacts = [];
  crew.forEach(section => {
    const secName = section.sectionName?.toUpperCase() || '';
    if (!CLIENT_AGENCY_SECTIONS.includes(secName)) return;
    (section.rows || []).forEach(row => {
      if (row[dateStr] === '1' && row.name?.trim()) {
        const entry = { title: row.position||'', name: row.name||'', email: row.email||'', callTime: '' };
        if (secName === 'CLIENT') clientContacts.push(entry);
        else agencyContacts.push(entry);
      }
    });
  });
  return { clientContacts, agencyContacts };
}

function _getCastForDate(dateStr) {
  // Derive cast for date from shooting schedule: find which scenes are on this date,
  // then collect their cast members, pulling profile data if available.
  const results = [];
  const castProfiles = _loadCastProfiles();

  // Try to find scenes for this date from the one-liner draft + calendar
  const sceneCast = _getSceneCastForDate(dateStr);
  if (sceneCast.length > 0) {
    sceneCast.forEach(cm => {
      const profile = castProfiles[cm.castNum];
      const num = cm.castNum || '';
      const role = cm.role || '';
      const title = num ? `${num}. ${role}` : role;
      const name = profile?.legalName || profile?.stageName || cm.name || '';
      results.push({ title, name, callTime: '', callLoc: '' });
    });
  }

  return results;
}

function _loadCastProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(CAST_KEY));
    if (!raw) return {};
    if (raw._version === 2) {
      const map = {};
      Object.values(raw.profiles || {}).forEach(p => {
        if (p.castNum) map[p.castNum] = p;
      });
      return map;
    }
    // v1 fallback
    const map = {};
    (Array.isArray(raw) ? raw : []).forEach(sec => {
      (sec.rows || []).forEach(row => {
        if (row.castNum) map[row.castNum] = { castNum: row.castNum, characterName: row.role, legalName: row.name, stageName: '' };
      });
    });
    return map;
  } catch { return {}; }
}

function _getSceneCastForDate(dateStr) {
  // Map date → shoot day via day types, then find scenes in active draft for that day
  try {
    const dayTypes = _getDayTypes();
    const shootDates = Object.entries(dayTypes).filter(([,t]) => t === 'shoot').map(([d]) => d).sort();
    const dayIdx = shootDates.indexOf(dateStr);
    if (dayIdx < 0) return [];

    const drafts = JSON.parse(localStorage.getItem('movie-ledger-one-liner-drafts')) || {};
    const activeDraftId = localStorage.getItem('movie-ledger-one-liner-active');
    const draft = drafts[activeDraftId] || Object.values(drafts)[0];
    if (!draft) return [];

    const scenes = JSON.parse(localStorage.getItem(BD_KEY)) || [];
    const sceneMap = {};
    scenes.forEach(s => { sceneMap[s.id] = s; });

    // Build day groups from draft
    const days = [];
    let currentDay = [];
    for (const item of draft.items) {
      if (item.type === 'scene') {
        const s = sceneMap[item.sceneId];
        if (s) currentDay.push(s);
      } else if (item.type === 'daybreak') {
        if (currentDay.length > 0) { days.push(currentDay); currentDay = []; }
      }
    }
    if (currentDay.length > 0) days.push(currentDay);

    const daySc = days[dayIdx];
    if (!daySc) return [];

    // Collect unique cast from scenes
    const seen = new Set();
    const castList = [];
    daySc.forEach(scene => {
      (scene.castMembers || []).forEach(cm => {
        const key = cm.castNum || cm.role;
        if (!seen.has(key)) {
          seen.add(key);
          castList.push(cm);
        }
      });
    });
    return castList.sort((a, b) => (Number(a.castNum) || 999) - (Number(b.castNum) || 999));
  } catch { return []; }
}

function _lookupBreakdownScene(sceneNum) {
  if (!sceneNum) return null;
  try {
    const scenes = JSON.parse(localStorage.getItem(BD_KEY)) || [];
    const needle = sceneNum.trim().toLowerCase();
    return scenes.find(s => (s.sceneNum || '').trim().toLowerCase() === needle) || null;
  } catch { return null; }
}

function _breakdownToSchedRow(scene) {
  const setting = [scene.intExt, scene.location].filter(Boolean).join('  ').toUpperCase();
  const desc = scene.description || '';
  const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
  const dn = scene.dayNight || '';
  const pages = scene.pageCount || '';
  const loc = scene.locationAddress || '';
  return { sets: setting, setsDesc: desc, cast: castIds, dn, pages, location: loc };
}

function _getVendors() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-vendors')) || []; } catch { return []; }
}

function _buildDefaultSheet(dateStr) {
  const project = _getProject() || {};
  const crewBySection = _getCrewForDate(dateStr);
  const { clientContacts, agencyContacts } = _getClientAgencyForDate(dateStr);
  const shootDay = _calcShootDay(dateStr);
  const dayType = _getDayTypes()[dateStr] || '';

  const crewEntries = [];
  crewBySection.forEach(({ section, crew }) => {
    crew.forEach(c => crewEntries.push({ section, position: c.position, name: c.name, phone: c.phone, email: c.email, callTime: '', callLoc: '' }));
  });

  const totalShootDays = Object.values(_getDayTypes()).filter(t => t === 'shoot').length;
  const emptyRow = () => ({ scene:'', sets:'', cast:'', dn:'', pages:'', location:'' });
  return {
    date: dateStr, shootDay: shootDay ?? '', totalShootDays: totalShootDays || '', dayType, generalCall: '', lunchTime: '', secondMeal: '',
    locationName: '', locationAddr1: '', locationAddr2: '',
    parkingInfo: '', parkingAddr: '', parkingAddr2: '', parkingAddr3: '', loadingZone: '', loadingAddr: '', loadingAddr2: '', loadingAddr3: '',
    sunrise: '', sunset: '', highTemp: '', lowTemp: '', conditions: '', uvIndex: '', rainChance: '',
    hospitalName: '', hospitalAddr: '', hospitalAddr2: '',
    clientName: project.productionCompany || '', clientAddr: '',
    agencyName: '', agencyAddr: '',
    director: project.director || '', producer: project.producer || '', productionCo: project.productionCompany || '',
    scheduleLeft: Array.from({length:8}, emptyRow), scheduleRight: Array.from({length:8}, emptyRow),
    crew: crewEntries, clientContacts, agencyContacts, talentContacts: _getCastForDate(dateStr), vendors: [],
    directContacts: [{ title:'', name:'', phone:'' }],
    notes: '',
    warningBanner: 'NO SET PHOTOS, VIDEOS OR SOCIAL MEDIA POSTS ALLOWED WHILE ON SET. NO VISITORS.',
  };
}

/* ══════════════════════════════════════════════════════════════
   MAIN — date picker + saved list
   ══════════════════════════════════════════════════════════════ */
function _renderMain() {
  const today = _todayStr();
  const savedDates = Object.keys(_sheets).sort().reverse();

  _container.innerHTML = `
    <section class="cs-section">
      <div class="cs-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
        <div>
          <h2 class="cs-title">Call Sheet Generator</h2>
          <p class="cs-subtitle">Select a date to generate or edit a call sheet.</p>
        </div>
        <a href="#crew" class="btn btn--sm" style="font-size:11px;padding:4px 10px;white-space:nowrap;margin-top:4px;background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);text-decoration:none;">View Crew List</a>
      </div>
      <div class="cs-date-picker">
        <div class="cs-date-row">
          <label for="cs-date-input">Date</label>
          <input type="date" id="cs-date-input" value="${today}" />
          <button class="btn btn--primary" id="cs-generate-btn">Generate Call Sheet</button>
          <button class="btn btn--icon cs-files-btn" id="cs-files-btn" title="Call Sheet Files">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
          </button>
          <button class="btn btn--sm cs-email-tpl-btn" id="cs-email-tpl-btn">Call Sheet Email Template</button>
        </div>
      </div>
      ${savedDates.length ? `
        <div class="cs-saved">
          <h3 class="cs-saved-title">Saved Call Sheets</h3>
          <div class="cs-saved-list">
            ${savedDates.map(d => {
              const s = _sheets[d];
              const shootLabel = s.shootDay ? ` — Shoot Day ${s.shootDay}` : '';
              return `<div class="cs-saved-item">
                <span class="cs-saved-date">${_formatDate(d)}${shootLabel}</span>
                <div class="cs-saved-actions">
                  <button class="btn btn--ghost btn--sm" data-cs-edit="${d}">Edit</button>
                  <button class="btn btn--ghost btn--sm" data-cs-print="${d}">Print / PDF</button>
                  <button class="btn btn--ghost btn--sm btn--danger-text" data-cs-delete="${d}">Delete</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}
    </section>`;

  _container.querySelector('#cs-generate-btn').addEventListener('click', () => {
    const dateStr = _container.querySelector('#cs-date-input').value;
    if (!dateStr) return;
    if (!_sheets[dateStr]) { _sheets[dateStr] = _buildDefaultSheet(dateStr); _saveSheets(); }
    _renderEditor(dateStr);
  });
  _container.querySelector('#cs-files-btn').addEventListener('click', () => {
    /* TODO: open the Call Sheet PDF folder on the system disk */
  });
  _container.querySelector('#cs-email-tpl-btn').addEventListener('click', () => {
    const dateStr = _container.querySelector('#cs-date-input').value || today;
    _renderEmailTemplate(dateStr);
  });
  _container.querySelectorAll('[data-cs-edit]').forEach(b => b.addEventListener('click', () => _renderEditor(b.dataset.csEdit)));
  _container.querySelectorAll('[data-cs-print]').forEach(b => b.addEventListener('click', () => _openPrintView(b.dataset.csPrint)));
  _container.querySelectorAll('[data-cs-delete]').forEach(b => b.addEventListener('click', () => {
    if (!confirm(`Delete call sheet for ${_formatDate(b.dataset.csDelete)}?`)) return;
    delete _sheets[b.dataset.csDelete]; _saveSheets(); _renderMain();
  }));
}

/* ══════════════════════════════════════════════════════════════
   INLINE EDITABLE INPUT
   ══════════════════════════════════════════════════════════════ */
function _in(key, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-cs="${key}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inSched(side, idx, field, val, ph) {
  return `<input type="text" class="cse-in cse-in--sched" data-sched="${side}-${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inCrew(idx, field, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-crew="${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inContact(idx, field, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-contact="${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inVendor(idx, field, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-vendor="${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inAgency(idx, field, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-agency="${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}
function _inTalent(idx, field, val, ph, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<input type="text" class="cse-in${extra}" data-talent="${idx}-${field}" value="${esc(val||'')}" placeholder="${esc(ph||'')}" />`;
}

/* ══════════════════════════════════════════════════════════════
   HEADER LEFT — Client / Agency / Production Co / Direct Contacts
   ══════════════════════════════════════════════════════════════ */
function _getAllCrewPositions() {
  const crew = _getCrewData();
  const positions = [];
  crew.forEach(section => {
    (section.rows || []).forEach(row => {
      if (row.position?.trim() && !positions.includes(row.position.trim())) {
        positions.push(row.position.trim());
      }
    });
  });
  return positions.sort((a, b) => a.localeCompare(b));
}

function _findCrewByPosition(position) {
  const crew = _getCrewData();
  for (const section of crew) {
    for (const row of (section.rows || [])) {
      if (row.position?.trim() === position?.trim()) {
        return { name: row.name || '', phone: row.phone || '' };
      }
    }
  }
  return { name: '', phone: '' };
}

function _buildHeaderLeft(s, dateStr) {
  const pi = _getProdInfo();
  const hasClient = !!(pi.clientName || pi.clientAddr || pi.clientCity || pi.clientPhone);
  const hasAgency = !!(pi.agencyName || pi.agencyAddr || pi.agencyCity);

  // Ensure directContacts exists
  if (!s.directContacts) s.directContacts = [{ title:'', name:'', phone:'' }];

  // Build info sections
  let infoHTML = '';

  if (hasClient) {
    const clientLogoHTML = pi.clientLogo ? `<img src="${esc(pi.clientLogo)}" alt="Client" class="cse-box-logo" />` : '';
    infoHTML += `<div class="cse-client-agency-box"><div class="cse-box-inner"><div class="cse-box-text"><div class="cse-label">CLIENT</div>
      <div class="cse-val">${esc(pi.clientName || '')}${pi.clientAddr ? '<br>' + esc(pi.clientAddr) : ''}${pi.clientCity ? '<br>' + esc(pi.clientCity) : ''}${pi.clientPhone ? '<br>' + esc(pi.clientPhone) : ''}</div></div>${clientLogoHTML}</div></div>`;
  }

  if (hasAgency) {
    const agencyLogoHTML = pi.agencyLogo ? `<img src="${esc(pi.agencyLogo)}" alt="Agency" class="cse-box-logo" />` : '';
    infoHTML += `<div class="cse-client-agency-box"><div class="cse-box-inner"><div class="cse-box-text"><div class="cse-label">AGENCY</div>
      <div class="cse-val">${esc(pi.agencyName || '')}${pi.agencyAddr ? '<br>' + esc(pi.agencyAddr) : ''}${pi.agencyCity ? '<br>' + esc(pi.agencyCity) : ''}</div></div>${agencyLogoHTML}</div></div>`;
  }

  // Direct Contacts
  const positions = _getAllCrewPositions();
  const contactRows = s.directContacts.map((dc, i) => {
    const optionsHTML = positions.map(p => `<option value="${esc(p)}"${dc.title === p ? ' selected' : ''}>${esc(p)}</option>`).join('');
    return `<tr class="cse-dc-row">
      <td><select class="cse-dc-select" data-dc-idx="${i}"><option value="">${dc.title ? '' : 'Title'}</option>${optionsHTML}</select></td>
      <td class="cse-dc-name" data-dc-name="${i}">${esc(dc.name) || '<span class="cse-dc-ghost">Name</span>'}</td>
      <td class="cse-dc-phone" data-dc-phone="${i}">${esc(dc.phone) || '<span class="cse-dc-ghost">Phone</span>'}</td>
      <td><button type="button" class="cse-dc-del" data-dc-del="${i}" title="Remove">✕</button></td>
    </tr>`;
  }).join('');

  infoHTML += `<table class="cse-dc-table">
      <tbody>${contactRows}</tbody>
    </table>
    <button type="button" class="cse-dc-add" id="cs-add-dc" title="Add contact">+</button>`;

  return `<div class="cse-hdr-left-info">${infoHTML}</div>`;
}

function _buildCenterProdBlock(s) {
  const pi = _getProdInfo();
  let lines = [];
  if (pi.prodCoName) lines.push(esc(pi.prodCoName));
  if (pi.prodCoAddr) lines.push(esc(pi.prodCoAddr));
  if (pi.prodCoCity) lines.push(esc(pi.prodCoCity));
  if (pi.prodCoPhone) lines.push(esc(pi.prodCoPhone));
  const prodLogoHTML = pi.prodCoLogo ? `<img src="${esc(pi.prodCoLogo)}" alt="Production Co." class="cse-prod-logo" />` : '';
  return `<div class="cse-hdr-prod-block">
    <div class="cse-label">PRODUCTION</div>
    <div class="cse-prod-co">${lines.join('<br>')}</div>
    ${prodLogoHTML}
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   WYSIWYG EDITOR — mirrors the PDF layout with inline inputs
   ══════════════════════════════════════════════════════════════ */
function _renderEditor(dateStr) {
  const s = _sheets[dateStr];
  if (!s) return;

  const shootDayLabel = s.shootDay ? `SHOOT DAY ${s.shootDay}` : (s.dayType ? s.dayType.toUpperCase() + ' DAY' : '');

  // Group crew by section
  const crewBySection = _groupCrewBySection(s.crew);

  // Build schedule rows
  if (!s.schedule) s.schedule = s.scheduleLeft?.length ? _migrateSchedule(s) : Array.from({length:8}, () => ({scene:'',sets:'',setsDesc:'',cast:'',dn:'',pages:'',location:''}));
  let schedRowsHTML = '';
  for (let i = 0; i < s.schedule.length; i++) {
    const r = s.schedule[i] || {};
    schedRowsHTML += `<tr>
      <td class="cse-sched-scene">${_inSched('S',i,'scene',r.scene,'Scene')}</td>
      <td class="cse-sched-sets">
        <input type="text" class="cse-in cse-in--sched cse-in--sets-upper" data-sched="S-${i}-sets" value="${esc(r.sets||'')}" placeholder="Sets" />
        <input type="text" class="cse-in cse-in--sched cse-in--sets-desc" data-sched="S-${i}-setsDesc" value="${esc(r.setsDesc||'')}" placeholder="Description" />
      </td>
      <td class="cse-sched-cast">${_inSched('S',i,'cast',r.cast,'Cast')}</td>
      <td class="cse-sched-dn">${_inSched('S',i,'dn',r.dn,'D/N')}</td>
      <td class="cse-sched-pages">${_inSched('S',i,'pages',r.pages,'Pages')}</td>
      <td class="cse-sched-loc">${_inSched('S',i,'location',r.location,'Location')}</td>
    </tr>`;
  }

  // Build left-side crew rows
  let globalCrewIdx = 0;
  let leftCrewHTML = '';
  crewBySection.forEach(group => {
    leftCrewHTML += `<tr class="cse-section-row"><td colspan="5" class="cse-section-label">${esc(group.section)}</td></tr>`;
    group.members.forEach((c, mi) => {
      const ci = globalCrewIdx++;
      leftCrewHTML += `<tr>
        <td>${_inCrew(ci,'position',c.position,'Title','cse-in--crew')}</td>
        <td>${_inCrew(ci,'name',c.name,'Name','cse-in--crew')}</td>
        <td>${_inCrew(ci,'phone',c.phone,'Phone','cse-in--crew')}</td>
        <td>${_inCrew(ci,'email',c.email,'Email','cse-in--crew')}</td>
        <td class="cse-calltd">${_inCrew(ci,'callLoc',c.callLoc,'Loc','cse-in--call')} ${_inCrew(ci,'callTime',c.callTime,'Time','cse-in--call')}<button type="button" class="cse-row-del" data-del-type="crew" data-del-idx="${ci}" title="Remove">✕</button></td>
      </tr>`;
    });
  });

  // Build right-side rows (contacts + vendors)
  const rightRows = _buildRightRows(s);
  let rightCrewHTML = '';
  rightRows.forEach((rr, ri) => {
    if (rr.isHeader) {
      rightCrewHTML += `<tr class="cse-section-row"><td colspan="5" class="cse-section-label cse-right-section">${esc(rr.label)}</td></tr>`;
    } else {
      rightCrewHTML += `<tr>${_rightDataCells(rr, ri)}</tr>`;
    }
  });

  _container.innerHTML = `
    <!-- Slim toolbar -->
    <div class="cse-toolbar">
      <button class="btn btn--ghost btn--sm" id="cs-back-btn">← Back</button>
      <span class="cse-toolbar-title">Call Sheet — ${_formatDate(dateStr)}</span>
      <div class="cse-toolbar-actions">
        <button class="btn btn--ghost btn--sm" id="cs-refresh-crew-btn">Refresh Personnel</button>
        <button class="btn btn--ghost btn--sm" id="cs-print-btn">Print / PDF</button>
        <button class="btn btn--primary btn--sm" id="cs-save-btn">Save</button>
      </div>
    </div>

    <!-- WYSIWYG page -->
    <div class="cse-page-wrap">
      <div class="cse-page">

        <!-- HEADER -->
        <div class="cse-hdr">
          <div class="cse-hdr-topbar">
            <div class="cse-hdr-shootday">SHOOT DAY ${_in('shootDay',s.shootDay,'#','cse-in--shootday')} of ${_in('totalShootDays',s.totalShootDays||'','#','cse-in--shootday')}
              <select data-cs="dayType" class="cse-select cse-select--topbar">
                <option value=""${!s.dayType?' selected':''}>Day Type</option>
                <option value="prep"${s.dayType==='prep'?' selected':''}>Prep</option>
                <option value="shoot"${s.dayType==='shoot'?' selected':''}>Shoot</option>
                <option value="wrap"${s.dayType==='wrap'?' selected':''}>Wrap</option>
                <option value="down"${s.dayType==='down'?' selected':''}>Down</option>
              </select>
            </div>
            <div class="cse-hdr-title">${(() => { const pi = _getProdInfo(); return pi.titleLogo ? `<img src="${esc(pi.titleLogo)}" class="cse-title-logo" alt="Title" />` : 'CALL SHEET'; })()}</div>
            <div class="cse-hdr-date">${_formatDate(dateStr)}</div>
          </div>

          <div class="cse-hdr-left">
            ${_buildHeaderLeft(s, dateStr)}
          </div>

          <div class="cse-hdr-center">
            <div class="cse-hdr-center-top">
              <div class="cse-project-title">${esc((_getProject()?.title) || '')}</div>
              <div class="cse-hdr-call">
                <div class="cse-call-label">GENERAL CALL:</div>
                <div class="cse-call-time">${_in('generalCall',s.generalCall,'9:30 AM','cse-in--calltime')}</div>
              </div>
              <div class="cse-hdr-sub">*see individual call times*</div>
              ${_buildCenterProdBlock(s)}
            </div>
            <div class="cse-hdr-meals">
              Lunch RTS ${_in('lunchTime',s.lunchTime,'3:00 PM','cse-in--center')}<br>
              2nd Meal RTS: ${_in('secondMeal',s.secondMeal,'8:00 PM','cse-in--center')}
            </div>
          </div>

          <div class="cse-hdr-right">
            <div class="cse-info-box">
              <div class="cse-label">LOCATIONS</div>
              <div class="cse-val">${_in('locationName',s.locationName,'Location name')}<br>${_in('locationAddr1',s.locationAddr1,'Street address')}<br>${_in('locationAddr2',s.locationAddr2,'City, State ZIP')}</div>
            </div>
            <div class="cse-info-box">
              <div class="cse-label">PARKING</div>
              <div class="cse-val">${_in('parkingInfo',s.parkingInfo,'Parking info')}<br>${_in('parkingAddr',s.parkingAddr,'Parking address')}<br>${_in('parkingAddr2',s.parkingAddr2||'','Parking line 3')}<br>${_in('parkingAddr3',s.parkingAddr3||'','Parking line 4')}</div>
            </div>
            <div class="cse-info-box">
              <div class="cse-label">LOADING ZONE</div>
              <div class="cse-val">${_in('loadingZone',s.loadingZone,'Loading zone')}<br>${_in('loadingAddr',s.loadingAddr,'Loading address')}<br>${_in('loadingAddr2',s.loadingAddr2||'','Loading line 3')}<br>${_in('loadingAddr3',s.loadingAddr3||'','Loading line 4')}</div>
            </div>
            <div class="cse-hdr-right-bottom">
              <div class="cse-wx">
                High: ${_in('highTemp',s.highTemp,'67 cloudy','cse-in--sm')}<br>
                Low: ${_in('lowTemp',s.lowTemp,'48','cse-in--sm')}<br>
                UV Index: ${_in('uvIndex',s.uvIndex,'4 of 11','cse-in--sm')}<br>
                Rain: ${_in('rainChance',s.rainChance,'7% chance','cse-in--sm')}<br>
                Sunrise: ${_in('sunrise',s.sunrise,'6:40 am','cse-in--sm')}<br>
                Sunset: ${_in('sunset',s.sunset,'5:30 pm','cse-in--sm')}
              </div>
              <div class="cse-info-box cse-hdr-hospital">
                <div class="cse-label">NEAREST HOSPITAL</div>
                <div class="cse-val">${_in('hospitalName',s.hospitalName,'Hospital name')}<br>${_in('hospitalAddr',s.hospitalAddr,'Hospital address')}<br>${_in('hospitalAddr2',s.hospitalAddr2||'','City, State ZIP')}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- WARNING -->
        <div class="cse-warning">
          ${_in('warningBanner',s.warningBanner,'Warning banner text','cse-in--warning')}
        </div>

        <!-- SCHEDULE -->
        <table class="cse-sched">
          <thead><tr>
            <th class="cse-sched-scene">Scene</th>
            <th class="cse-sched-sets">Sets</th>
            <th class="cse-sched-cast">Cast</th>
            <th class="cse-sched-dn">D/N</th>
            <th class="cse-sched-pages">Pages</th>
            <th class="cse-sched-loc">Location</th>
          </tr></thead>
          <tbody>${schedRowsHTML}</tbody>
        </table>
        <div class="cse-add-row-bar">
          <button class="cse-add-btn" id="cs-add-sched">+ Row</button>
        </div>

        <!-- CREW — two independent columns -->
        <div class="cse-crew-split">
          <div class="cse-crew-left">
            <table class="cse-crew cse-crew-tbl-left">
              <thead><tr>
                <th>Title</th><th>Name</th><th>Phone</th><th>Email</th><th>Report</th>
              </tr></thead>
              <tbody>${leftCrewHTML}</tbody>
            </table>
            <div class="cse-add-row-bar">
              <button class="cse-add-btn" id="cs-add-crew">+ Crew</button>
            </div>
          </div>
          <div class="cse-crew-right">
            <table class="cse-crew cse-crew-tbl-right">
              <thead><tr>
                <th>Title</th><th>Name</th><th></th><th>Email</th><th>Report</th>
              </tr></thead>
              <tbody>${rightCrewHTML}</tbody>
            </table>
            <div class="cse-add-row-bar">
              <button class="cse-add-btn" id="cs-add-contact">+ Client</button>
              <button class="cse-add-btn" id="cs-add-agency">+ Agency</button>
              <button class="cse-add-btn" id="cs-add-talent">+ Talent</button>
              <button class="cse-add-btn" id="cs-add-vendor">+ Vendor</button>
            </div>
            <div class="cse-report">
              <span class="cse-report-label">PRODUCTION REPORT:</span>
              <div class="cse-report-cols">
                <div class="cse-report-col">
                  <div class="cse-report-row"><span class="cse-report-field-label">1ST AM SHOT:</span> ${_in('report1stAM', s.report1stAM || '', '_________', 'cse-in--crew')}</div>
                  <div class="cse-report-row"><span class="cse-report-field-label">1ST PM SHOT:</span> ${_in('report1stPM', s.report1stPM || '', '_________', 'cse-in--crew')}</div>
                  <div class="cse-report-row"><span class="cse-report-field-label">CAMERA WRAP:</span> ${_in('reportCameraWrap', s.reportCameraWrap || '', '_________', 'cse-in--crew')}</div>
                </div>
                <div class="cse-report-col">
                  <div class="cse-report-row"><span class="cse-report-field-label">LUNCH:</span> ${_in('reportLunch', s.reportLunch || '', '_________', 'cse-in--crew')}</div>
                  <div class="cse-report-row"><span class="cse-report-field-label">2ND MEAL:</span> ${_in('report2ndMeal', s.report2ndMeal || '', '_________', 'cse-in--crew')}</div>
                  <div class="cse-report-row"><span class="cse-report-field-label">CREW WRAP:</span> ${_in('reportCrewWrap', s.reportCrewWrap || '', '_________', 'cse-in--crew')}</div>
                </div>
              </div>
            </div>
            <div class="cse-notes">
              <span class="cse-notes-label">NOTES</span><br>
              <textarea class="cse-notes-input" data-cs="notes" rows="2" placeholder="Additional notes...">${esc(s.notes)}</textarea>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="cse-footer">**CALL SHEETS ARE CONFIDENTIAL AND NOT FOR REDISTRIBUTION OUTSIDE OF THE PRODUCTION**</div>

      </div>
    </div>
  `;

  _wireEditor(dateStr);
}

/* ── Migrate old left/right schedule to new single-table format ── */
function _migrateSchedule(s) {
  const rows = [];
  const maxLen = Math.max(s.scheduleLeft?.length || 0, s.scheduleRight?.length || 0, 1);
  for (let i = 0; i < maxLen; i++) {
    const L = s.scheduleLeft?.[i] || {};
    rows.push({ scene: L.scene || '', sets: L.location || '', cast: L.talent || '', dn: '', pages: '', location: L.time || '' });
  }
  return rows.length ? rows : [{ scene:'', sets:'', cast:'', dn:'', pages:'', location:'' }];
}

/* ── Group crew by section ── */
function _groupCrewBySection(crew) {
  const groups = [];
  let current = null;
  crew.forEach(c => {
    if (c.section !== current) {
      groups.push({ section: c.section, members: [] });
      current = c.section;
    }
    groups[groups.length - 1].members.push(c);
  });
  return groups;
}

/* ── Build right-side rows ── */
function _buildRightRows(s) {
  const rows = [];
  if (s.clientContacts?.length) {
    rows.push({ isHeader: true, label: 'CLIENT' });
    s.clientContacts.forEach((c, i) => rows.push({ isHeader: false, type: 'contact', idx: i, col1: c.title, col2: c.name, col3: '', col4: c.email, col5: c.callTime, col6: c.callLoc || '' }));
  }
  if (s.agencyContacts?.length) {
    rows.push({ isHeader: true, label: 'AGENCY' });
    s.agencyContacts.forEach((a, i) => rows.push({ isHeader: false, type: 'agency', idx: i, col1: a.title, col2: a.name, col3: '', col4: a.email, col5: a.callTime, col6: a.callLoc || '' }));
  }
  if (s.talentContacts?.length) {
    rows.push({ isHeader: true, label: 'TALENT' });
    s.talentContacts.forEach((t, i) => rows.push({ isHeader: false, type: 'talent', idx: i, col1: t.title, col2: t.name, col3: '', col4: '', col5: t.callTime, col6: t.callLoc || '' }));
  }
  if (s.vendors?.length) {
    rows.push({ isHeader: true, label: 'VENDORS' });
    s.vendors.forEach((v, i) => rows.push({ isHeader: false, type: 'vendor', idx: i, col1: v.type, col2: v.company, col3: v.contact, col4: v.email, col5: v.callTime, col6: v.callLoc || '' }));
  }
  return rows;
}

/* ── Right-side data cells (editable) ── */
function _rightDataCells(rr, _ri) {
  const delBtn = `<button type="button" class="cse-row-del" data-del-type="${rr.type}" data-del-idx="${rr.idx}" title="Remove">✕</button>`;
  if (rr.type === 'contact') {
    return `<td>${_inContact(rr.idx,'title',rr.col1,'Title')}</td>
            <td colspan="2">${_inContact(rr.idx,'name',rr.col2,'Name')}</td>
            <td>${_inContact(rr.idx,'email',rr.col4,'Email')}</td>
            <td class="cse-calltd">${_inContact(rr.idx,'callLoc',rr.col6,'Loc','cse-in--call')} ${_inContact(rr.idx,'callTime',rr.col5,'Time','cse-in--call')}${delBtn}</td>`;
  }
  if (rr.type === 'agency') {
    return `<td>${_inAgency(rr.idx,'title',rr.col1,'Title')}</td>
            <td colspan="2">${_inAgency(rr.idx,'name',rr.col2,'Name')}</td>
            <td>${_inAgency(rr.idx,'email',rr.col4,'Email')}</td>
            <td class="cse-calltd">${_inAgency(rr.idx,'callLoc',rr.col6,'Loc','cse-in--call')} ${_inAgency(rr.idx,'callTime',rr.col5,'Time','cse-in--call')}${delBtn}</td>`;
  }
  if (rr.type === 'talent') {
    return `<td>${_inTalent(rr.idx,'title',rr.col1,'#. Role')}</td>
            <td colspan="2">${_inTalent(rr.idx,'name',rr.col2,'Name')}</td>
            <td>${_inTalent(rr.idx,'email',rr.col4||'','Email')}</td>
            <td class="cse-calltd">${_inTalent(rr.idx,'callLoc',rr.col6,'Loc','cse-in--call')} ${_inTalent(rr.idx,'callTime',rr.col5,'Time','cse-in--call')}${delBtn}</td>`;
  }
  if (rr.type === 'vendor') {
    const vendors = _getVendors();
    const vendorOpts = vendors.map(v => `<option value="${esc(v.name)}">${esc(v.name)}${v.type ? ' (' + esc(v.type) + ')' : ''}</option>`).join('');
    const vendorSelect = `<select class="cse-select cse-vendor-select" data-vendor-pick="${rr.idx}" style="font-size:8px;max-width:100%;width:100%;">
      <option value="">Select vendor…</option>${vendorOpts}</select>`;
    return `<td>${vendorSelect}</td>
            <td>${_inVendor(rr.idx,'company',rr.col2,'Company')}</td>
            <td>${_inVendor(rr.idx,'contact',rr.col3,'Contact')}</td>
            <td>${_inVendor(rr.idx,'email',rr.col4,'Email')}</td>
            <td class="cse-calltd">${_inVendor(rr.idx,'callLoc',rr.col6,'Loc','cse-in--call')} ${_inVendor(rr.idx,'callTime',rr.col5,'Time','cse-in--call')}${delBtn}</td>`;
  }
  return `<td colspan="5"></td>`;
}

/* ── Wire editor events ── */
function _wireEditor(dateStr) {
  const sheet = _sheets[dateStr];

  _container.querySelector('#cs-back-btn').addEventListener('click', () => {
    _collectEditorData(dateStr); _saveSheets(); _renderMain();
  });
  _container.querySelector('#cs-save-btn').addEventListener('click', () => {
    _collectEditorData(dateStr); _saveSheets();
    const btn = _container.querySelector('#cs-save-btn');
    btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save'; }, 1500);
  });
  _container.querySelector('#cs-print-btn').addEventListener('click', () => {
    _collectEditorData(dateStr); _saveSheets(); _openPrintView(dateStr);
  });
  _container.querySelector('#cs-refresh-crew-btn').addEventListener('click', () => {
    if (!confirm('Re-pull personnel from Crew & Cast lists? This will replace current crew, client, agency, and talent entries.')) return;
    _collectEditorData(dateStr);
    const fresh = _buildDefaultSheet(dateStr);
    // Preserve existing callTime/callLoc by matching name
    const _preserve = (oldArr, newArr) => {
      const map = {};
      (oldArr || []).forEach(e => { const k = (e.name||'').trim().toLowerCase(); if (k) map[k] = { callTime: e.callTime||'', callLoc: e.callLoc||'' }; });
      (newArr || []).forEach(e => { const k = (e.name||'').trim().toLowerCase(); if (map[k]) { e.callTime = map[k].callTime; e.callLoc = map[k].callLoc; } });
    };
    _preserve(sheet.crew, fresh.crew);
    _preserve(sheet.clientContacts, fresh.clientContacts);
    _preserve(sheet.agencyContacts, fresh.agencyContacts);
    _preserve(sheet.talentContacts, fresh.talentContacts);
    sheet.crew = fresh.crew;
    sheet.clientContacts = fresh.clientContacts;
    sheet.agencyContacts = fresh.agencyContacts;
    sheet.talentContacts = fresh.talentContacts;
    _sheets[dateStr] = sheet; _saveSheets(); _renderEditor(dateStr);
  });

  // Auto-fill schedule rows from Scene Breakdowns when scene number is entered
  _container.querySelectorAll('[data-sched]').forEach(el => {
    const parts = el.dataset.sched.split('-');
    // Only listen on scene field inputs: "S-{idx}-scene"
    if (parts[0] === 'S' && parts[2] === 'scene') {
      el.addEventListener('blur', () => {
        const sceneNum = el.value.trim();
        if (!sceneNum) return;
        const bdScene = _lookupBreakdownScene(sceneNum);
        if (!bdScene) return;
        const fill = _breakdownToSchedRow(bdScene);
        const idx = parts[1];
        // Fill sibling inputs in the same row from breakdown data
        ['sets','setsDesc','cast','dn','pages','location'].forEach(field => {
          const inp = _container.querySelector(`[data-sched="S-${idx}-${field}"]`);
          if (inp) inp.value = fill[field] || '';
        });
      });
    }
  });

  // Add rows
  _container.querySelector('#cs-add-sched').addEventListener('click', () => {
    _collectEditorData(dateStr);
    if (!sheet.schedule) sheet.schedule = [];
    sheet.schedule.push({scene:'',sets:'',setsDesc:'',cast:'',dn:'',pages:'',location:''});
    _saveSheets(); _renderEditor(dateStr);
  });
  _container.querySelector('#cs-add-crew').addEventListener('click', () => {
    _collectEditorData(dateStr); sheet.crew.push({section:'',position:'',name:'',phone:'',email:'',callTime:'',callLoc:''}); _saveSheets(); _renderEditor(dateStr);
  });
  _container.querySelector('#cs-add-contact').addEventListener('click', () => {
    _collectEditorData(dateStr); (sheet.clientContacts=sheet.clientContacts||[]).push({title:'',name:'',email:'',callTime:''}); _saveSheets(); _renderEditor(dateStr);
  });
  _container.querySelector('#cs-add-agency').addEventListener('click', () => {
    _collectEditorData(dateStr); (sheet.agencyContacts=sheet.agencyContacts||[]).push({title:'',name:'',email:'',callTime:'',callLoc:''}); _saveSheets(); _renderEditor(dateStr);
  });
  _container.querySelector('#cs-add-talent').addEventListener('click', () => {
    _collectEditorData(dateStr); (sheet.talentContacts=sheet.talentContacts||[]).push({title:'',name:'',callTime:'',callLoc:''}); _saveSheets(); _renderEditor(dateStr);
  });
  _container.querySelector('#cs-add-vendor').addEventListener('click', () => {
    _collectEditorData(dateStr); (sheet.vendors=sheet.vendors||[]).push({type:'',company:'',contact:'',email:'',callTime:''}); _saveSheets(); _renderEditor(dateStr);
  });

  // Delete buttons for crew, contact, agency, vendor rows
  _container.querySelectorAll('.cse-row-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _collectEditorData(dateStr);
      const type = btn.dataset.delType;
      const idx = parseInt(btn.dataset.delIdx);
      if (type === 'crew') { sheet.crew.splice(idx, 1); }
      else if (type === 'contact') { sheet.clientContacts.splice(idx, 1); }
      else if (type === 'agency') { sheet.agencyContacts.splice(idx, 1); }
      else if (type === 'talent') { sheet.talentContacts.splice(idx, 1); }
      else if (type === 'vendor') { sheet.vendors.splice(idx, 1); }
      _saveSheets(); _renderEditor(dateStr);
    });
  });

  // Vendor dropdown — auto-fill from catalogued vendors
  _container.querySelectorAll('.cse-vendor-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.vendorPick);
      const vendorName = sel.value;
      if (!vendorName) return;
      const vendor = _getVendors().find(v => v.name === vendorName);
      if (!vendor) return;
      _collectEditorData(dateStr);
      if (!sheet.vendors) sheet.vendors = [];
      if (sheet.vendors[idx]) {
        sheet.vendors[idx].type = vendor.type || '';
        sheet.vendors[idx].company = vendor.name || '';
        sheet.vendors[idx].contact = vendor.contact || '';
        sheet.vendors[idx].email = vendor.email || '';
      }
      _saveSheets(); _renderEditor(dateStr);
    });
  });

  // Direct Contacts
  const addDcBtn = _container.querySelector('#cs-add-dc');
  if (addDcBtn) {
    addDcBtn.addEventListener('click', () => {
      _collectEditorData(dateStr);
      if (!sheet.directContacts) sheet.directContacts = [];
      sheet.directContacts.push({ title:'', name:'', phone:'' });
      _saveSheets(); _renderEditor(dateStr);
    });
  }
  _container.querySelectorAll('.cse-dc-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.dcIdx);
      if (!sheet.directContacts) sheet.directContacts = [];
      const title = sel.value;
      const match = _findCrewByPosition(title);
      sheet.directContacts[idx] = { title, name: match.name, phone: match.phone };
      _saveSheets(); _renderEditor(dateStr);
    });
  });
  _container.querySelectorAll('.cse-dc-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.dcDel);
      _collectEditorData(dateStr);
      sheet.directContacts.splice(idx, 1);
      if (sheet.directContacts.length === 0) sheet.directContacts.push({ title:'', name:'', phone:'' });
      _saveSheets(); _renderEditor(dateStr);
    });
  });

  // Enter/Return → move to same column in next row
  _container.querySelectorAll('.cse-page input[type="text"], .cse-page textarea').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (el.tagName === 'TEXTAREA') return; // allow newlines in textareas
      e.preventDefault();
      const cell = el.closest('td');
      if (!cell) return;
      const row = cell.closest('tr');
      if (!row) return;
      const cellIdx = Array.from(row.cells).indexOf(cell);
      // Find position of this input within the cell (there can be multiple)
      const cellInputs = Array.from(cell.querySelectorAll('input[type="text"]'));
      const inputIdxInCell = cellInputs.indexOf(el);

      const nextRow = row.nextElementSibling;
      if (!nextRow || nextRow.classList.contains('cse-section-row')) {
        // Skip section header rows
        const afterHeader = nextRow?.nextElementSibling;
        if (afterHeader) {
          const targetCell = afterHeader.cells[cellIdx];
          if (targetCell) {
            const inputs = targetCell.querySelectorAll('input[type="text"]');
            const target = inputs[inputIdxInCell] || inputs[0];
            if (target) { target.focus(); target.select(); return; }
          }
        }
        return;
      }
      const targetCell = nextRow.cells[cellIdx];
      if (targetCell) {
        const inputs = targetCell.querySelectorAll('input[type="text"]');
        const target = inputs[inputIdxInCell] || inputs[0];
        if (target) { target.focus(); target.select(); }
      }
    });
  });
}

/* ── Collect data from inline inputs ── */
function _collectEditorData(dateStr) {
  const sheet = _sheets[dateStr];
  if (!sheet) return;

  _container.querySelectorAll('[data-cs]').forEach(el => { sheet[el.dataset.cs] = el.value; });

  _container.querySelectorAll('[data-sched]').forEach(el => {
    const [side, idx, field] = el.dataset.sched.split('-');
    if (side === 'S') {
      if (!sheet.schedule) sheet.schedule = [];
      const i = parseInt(idx);
      if (!sheet.schedule[i]) sheet.schedule[i] = {};
      sheet.schedule[i][field] = el.value;
    } else {
      const arr = side === 'L' ? sheet.scheduleLeft : sheet.scheduleRight;
      const i = parseInt(idx);
      if (arr?.[i]) arr[i][field] = el.value;
    }
  });

  _container.querySelectorAll('[data-crew]').forEach(el => {
    const [idx, field] = el.dataset.crew.split('-');
    if (sheet.crew[parseInt(idx)]) sheet.crew[parseInt(idx)][field] = el.value;
  });

  _container.querySelectorAll('[data-contact]').forEach(el => {
    const [idx, field] = el.dataset.contact.split('-');
    if (sheet.clientContacts?.[parseInt(idx)]) sheet.clientContacts[parseInt(idx)][field] = el.value;
  });

  _container.querySelectorAll('[data-agency]').forEach(el => {
    const [idx, field] = el.dataset.agency.split('-');
    if (sheet.agencyContacts?.[parseInt(idx)]) sheet.agencyContacts[parseInt(idx)][field] = el.value;
  });

  _container.querySelectorAll('[data-talent]').forEach(el => {
    const [idx, field] = el.dataset.talent.split('-');
    if (sheet.talentContacts?.[parseInt(idx)]) sheet.talentContacts[parseInt(idx)][field] = el.value;
  });

  _container.querySelectorAll('[data-vendor]').forEach(el => {
    const [idx, field] = el.dataset.vendor.split('-');
    if (sheet.vendors?.[parseInt(idx)]) sheet.vendors[parseInt(idx)][field] = el.value;
  });
}

/* ══════════════════════════════════════════════════════════════
   PRINT / PDF VIEW — same layout, no inputs
   ══════════════════════════════════════════════════════════════ */
function _openPrintView(dateStr) {
  const s = _sheets[dateStr];
  if (!s) return;
  const e = v => esc(v || '');
  const pi = _getProdInfo();
  const hasClient = !!(pi.clientName || pi.clientAddr || pi.clientCity || pi.clientPhone);
  const hasAgency = !!(pi.agencyName || pi.agencyAddr || pi.agencyCity);

  const crewBySection = _groupCrewBySection(s.crew);
  const rightRows = _buildRightRows(s);

  // Build left crew rows
  let leftRows = '';
  crewBySection.forEach(group => {
    leftRows += `<tr class="sec-row"><td colspan="5" class="sec-lbl">${e(group.section)}</td></tr>`;
    group.members.forEach(c => {
      leftRows += `<tr><td>${e(c.position)}</td><td>${e(c.name)}</td><td>${e(c.phone)}</td><td>${e(c.email)}</td><td>${e(c.callLoc)} ${e(c.callTime)}</td></tr>`;
    });
  });

  // Build right rows
  let rightRowsHTML = '';
  rightRows.forEach(rr => {
    if (rr.isHeader) rightRowsHTML += `<tr class="sec-row"><td colspan="5" class="sec-lbl">${e(rr.label)}</td></tr>`;
    else {
      const locTime = [e(rr.col6), e(rr.col5)].filter(Boolean).join(' ');
      rightRowsHTML += `<tr><td>${e(rr.col1)}</td><td>${e(rr.col2)}</td><td>${e(rr.col3)}</td><td>${e(rr.col4)}</td><td>${locTime}</td></tr>`;
    }
  });

  // Production report fields (two-column layout)
  const reportLeft  = `1ST AM SHOT: ${e(s.report1stAM)}\n1ST PM SHOT: ${e(s.report1stPM)}\nCAMERA WRAP: ${e(s.reportCameraWrap)}`;
  const reportRight = `LUNCH: ${e(s.reportLunch)}\n2ND MEAL: ${e(s.report2ndMeal)}\nCREW WRAP: ${e(s.reportCrewWrap)}`;

  const schedRows = [];
  const schedData = s.schedule || [];
  for (let i = 0; i < schedData.length; i++) {
    const r = schedData[i] || {};
    if (!r.scene&&!r.sets&&!r.cast&&!r.dn&&!r.pages&&!r.location) continue;
    const setsCell = r.setsDesc ? `${e(r.sets)}<br><span class="sc-sets-desc">${e(r.setsDesc)}</span>` : e(r.sets);
    schedRows.push(`<tr><td class="sc-scene">${e(r.scene)}</td><td class="sc-sets">${setsCell}</td><td class="sc-cast">${e(r.cast)}</td><td class="sc-dn">${e(r.dn)}</td><td class="sc-pages">${e(r.pages)}</td><td class="sc-loc">${e(r.location)}</td></tr>`);
  }

  const shootDayLbl = s.shootDay ? `SHOOT DAY ${e(String(s.shootDay))} of ${e(String(s.totalShootDays||''))}` : (s.dayType ? s.dayType.toUpperCase()+' DAY' : '');

  // Client/Agency left column
  let leftHTML = '';
  if (hasClient) {
    leftHTML += `<div class="ca-box">${pi.clientLogo ? '<div class="ca-inner">' : ''}<div><div class="lbl">CLIENT</div><div class="val">${e(pi.clientName)}${pi.clientAddr?'<br>'+e(pi.clientAddr):''}${pi.clientCity?'<br>'+e(pi.clientCity):''}${pi.clientPhone?'<br>'+e(pi.clientPhone):''}</div></div>${pi.clientLogo ? `<img src="${e(pi.clientLogo)}" class="ca-logo" /></div>` : ''}</div>`;
  }
  if (hasAgency) {
    leftHTML += `<div class="ca-box">${pi.agencyLogo ? '<div class="ca-inner">' : ''}<div><div class="lbl">AGENCY</div><div class="val">${e(pi.agencyName)}${pi.agencyAddr?'<br>'+e(pi.agencyAddr):''}${pi.agencyCity?'<br>'+e(pi.agencyCity):''}</div></div>${pi.agencyLogo ? `<img src="${e(pi.agencyLogo)}" class="ca-logo" /></div>` : ''}</div>`;
  }
  // Direct contacts
  if (s.directContacts?.length) {
    const dcRows = s.directContacts.filter(dc => dc.title).map(dc => `<tr><td style="font-size:7px">${e(dc.title)}</td><td style="font-size:7px">${e(dc.name)}</td><td style="font-size:7px">${e(dc.phone)}</td></tr>`).join('');
    if (dcRows) leftHTML += `<table style="width:100%;border-collapse:collapse;margin-top:2px">${dcRows}</table>`;
  }

  // Production company center
  let prodLines = [];
  if (pi.prodCoName) prodLines.push(e(pi.prodCoName));
  if (pi.prodCoAddr) prodLines.push(e(pi.prodCoAddr));
  if (pi.prodCoCity) prodLines.push(e(pi.prodCoCity));
  if (pi.prodCoPhone) prodLines.push(e(pi.prodCoPhone));

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Call Sheet — ${_formatDate(dateStr)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.3;color:#000}
@page{margin:.3in .35in}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.pg{width:100%;max-width:8.5in;margin:0 auto}
.hdr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;border:1px solid #000;padding:4px 6px;margin-bottom:2px}
.topbar{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px}
.topbar-title{font-size:15px;font-weight:bold;text-align:center;flex:1}
.topbar-sd{font-size:11px;font-weight:bold;min-width:140px}
.topbar-dt{font-size:11px;font-weight:bold;text-align:right;min-width:140px}
.hdr-l,.hdr-c,.hdr-r{font-size:8.5px}
.hdr-c{display:flex;flex-direction:column;justify-content:space-between;text-align:center}
.hdr-r{text-align:right}
.lbl{font-weight:bold;font-size:8px;text-transform:uppercase;color:#333;margin-bottom:1px}
.val{margin-bottom:4px}
.ca-box{border:.5px solid #999;padding:2px 4px;margin-bottom:3px}
.ca-inner{display:flex;align-items:center;justify-content:space-between}
.ca-logo{max-width:48px;max-height:28px;object-fit:contain;flex-shrink:0;margin-right:4px}
.project-title{font-size:18px;font-weight:700;text-align:center;margin-bottom:10px}
.call-label{font-size:9px;font-weight:bold;text-transform:uppercase;margin-top:4px}
.call-time{font-size:17px;font-weight:bold;margin:2px 0}
.call-sub{font-size:7.5px;font-style:italic;color:#888;margin-bottom:4px}
.meals{font-size:8.5px;padding:3px 6px;margin-top:3px;font-weight:600}
.prod-block{margin-top:12px;text-align:center}.prod-co{font-size:8.5px;line-height:1.4}
.title-logo{max-height:28px;max-width:200px;object-fit:contain}
.prod-logo{max-width:56px;max-height:30px;object-fit:contain;margin-top:3px}
.warn{background:#000;color:#fff;text-align:center;font-size:7.5px;font-weight:bold;padding:3px 4px;letter-spacing:.3px;margin-bottom:2px}
.info-box{border:0.5px solid #999;padding:2px 4px;margin-bottom:3px}
.wx{font-size:8px;line-height:1.4}
.hdr-rb{display:flex;gap:6px;margin-top:3px}
.hdr-hosp{flex:1;min-width:0}
table.sched{width:100%;border-collapse:collapse;margin-bottom:2px}
.sched th{font-size:8px;font-weight:bold;text-align:left;border-bottom:1.5px solid #000;padding:2px 3px}
.sched td{font-size:8.5px;padding:1.5px 3px;border-bottom:.5px solid #ccc}
.sc-scene{width:8%}.sc-sets{width:32%;text-transform:uppercase;font-weight:700}.sc-cast{width:20%}.sc-dn{width:6%}.sc-pages{width:8%}.sc-loc{width:20%}
.sc-sets-desc{font-style:italic;font-size:7.5px;font-weight:400;text-transform:none}
.crew-split{display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:start}
.crew-left{border-right:1px solid #999}
table.crew{width:100%;border-collapse:collapse}
.crew th{font-size:7.5px;font-weight:bold;text-align:left;border-bottom:1.5px solid #000;padding:2px 3px}
.crew td{font-size:8px;padding:1.5px 3px;border-bottom:.5px solid #ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}
.sec-row{background:#e8e8e8}.sec-lbl{font-size:8px;font-weight:bold;padding:2px 3px}
.rpt{border:1px solid #000;padding:3px 6px;margin-top:3px;font-size:8px}
.rpt-l{font-weight:bold;font-size:7.5px}
.rpt-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
.rpt-col{font-size:8px;line-height:2.0}
.notes{padding:3px 6px;margin-top:2px;font-size:8px;min-height:30px}
.notes-l{font-weight:bold;font-size:7.5px}
.ft{font-size:7px;text-align:center;margin-top:4px;color:#666}
.ft-c{font-weight:bold;font-size:6.5px;text-transform:uppercase}
</style></head><body>
<div class="pg">
<div class="hdr">
  <div class="topbar">
    <div class="topbar-sd">${shootDayLbl}</div>
    <div class="topbar-title">${pi.titleLogo ? `<img src="${e(pi.titleLogo)}" class="title-logo" alt="Title" />` : 'CALL SHEET'}</div>
    <div class="topbar-dt">${_formatDate(dateStr)}</div>
  </div>
  <div class="hdr-l">${leftHTML}</div>
  <div class="hdr-c">
    <div>
      <div class="project-title">${e((_getProject()?.title) || '')}</div>
      <div class="call-label">GENERAL CALL:</div>
      <div class="call-time">${e(s.generalCall)}</div>
      <div class="call-sub">*see individual call times*</div>
      <div class="prod-block">
        <div class="lbl">PRODUCTION</div>
        <div class="prod-co">${prodLines.join('<br>')}</div>
        ${pi.prodCoLogo ? `<img src="${e(pi.prodCoLogo)}" class="prod-logo" />` : ''}
      </div>
    </div>
  </div>
  <div class="hdr-r">
    <div class="info-box"><div class="lbl">LOCATIONS</div><div class="val">${e(s.locationName)}<br>${e(s.locationAddr1)}<br>${e(s.locationAddr2)}</div></div>
    <div class="info-box"><div class="lbl">PARKING</div><div class="val">${e(s.parkingInfo)}<br>${e(s.parkingAddr)}${s.parkingAddr2?'<br>'+e(s.parkingAddr2):''}${s.parkingAddr3?'<br>'+e(s.parkingAddr3):''}</div></div>
    <div class="info-box"><div class="lbl">LOADING ZONE</div><div class="val">${e(s.loadingZone)}<br>${e(s.loadingAddr)}${s.loadingAddr2?'<br>'+e(s.loadingAddr2):''}${s.loadingAddr3?'<br>'+e(s.loadingAddr3):''}</div></div>
    <div class="hdr-rb">
      <div class="wx">${s.highTemp?`High: ${e(s.highTemp)}`:''} ${s.lowTemp?`<br>Low: ${e(s.lowTemp)}`:''} ${s.uvIndex?`<br>UV Index: ${e(s.uvIndex)}`:''} ${s.rainChance?`<br>Rain: ${e(s.rainChance)}`:''} ${s.sunrise?`<br>Sunrise: ${e(s.sunrise)}`:''} ${s.sunset?`<br>Sunset: ${e(s.sunset)}`:''}</div>
      <div class="info-box hdr-hosp"><div class="lbl">NEAREST HOSPITAL</div><div class="val">${e(s.hospitalName)}<br>${e(s.hospitalAddr)}${s.hospitalAddr2?'<br>'+e(s.hospitalAddr2):''}</div></div>
    </div>
  </div>
</div>
${s.warningBanner?`<div class="warn">${e(s.warningBanner)}</div>`:''}
${schedRows.length?`<table class="sched"><thead><tr><th class="sc-scene">Scene</th><th class="sc-sets">Sets</th><th class="sc-cast">Cast</th><th class="sc-dn">D/N</th><th class="sc-pages">Pages</th><th class="sc-loc">Location</th></tr></thead><tbody>${schedRows.join('')}</tbody></table>`:''}
<div class="crew-split">
<div class="crew-left">
<table class="crew"><thead><tr><th>Title</th><th>Name</th><th>Phone</th><th>Email</th><th>Report</th></tr></thead><tbody>${leftRows}</tbody></table>
</div>
<div class="crew-right">
<table class="crew"><thead><tr><th>Title</th><th>Name</th><th></th><th>Email</th><th>Report</th></tr></thead><tbody>${rightRowsHTML}</tbody></table>
${(s.lunchTime||s.secondMeal)?`<div class="meals">${s.lunchTime?`Lunch RTS: ${e(s.lunchTime)}`:''}${s.lunchTime&&s.secondMeal?' &nbsp;&nbsp;&nbsp; ':''}${s.secondMeal?`2nd Meal RTS: ${e(s.secondMeal)}`:''}</div>`:''}
<div class="rpt"><span class="rpt-l">PRODUCTION REPORT:</span><div class="rpt-cols"><div class="rpt-col">${reportLeft.replace(/\n/g,'<br>')}</div><div class="rpt-col">${reportRight.replace(/\n/g,'<br>')}</div></div></div>
${s.notes?`<div class="notes"><span class="notes-l">NOTES</span><br>${e(s.notes)}</div>`:`<div class="notes"><span class="notes-l">NOTES</span></div>`}
</div>
</div>
<div class="ft"><div class="ft-c">**CALL SHEETS ARE CONFIDENTIAL AND NOT FOR REDISTRIBUTION OUTSIDE OF THE PRODUCTION**</div></div>
</div>
<script>
(function(){
  var pg = document.querySelector('.pg');
  var h = pg.scrollHeight;
  var letterMax = 10.5 * 96 - 0.6 * 96; // 10.5in minus margins in px (~950px)
  var style = document.createElement('style');
  if (h <= letterMax) {
    style.textContent = '@page{size:letter}';
  } else {
    style.textContent = '@page{size:legal}';
  }
  document.head.appendChild(style);
})();
</script>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}


/* ══════════════════════════════════════════════════════════════
   EMAIL TEMPLATE EDITOR
   Lets the user design a reusable email body with dynamic tokens
   that auto-fill from the call sheet for the selected date.
   ══════════════════════════════════════════════════════════════ */

const EMAIL_TPL_KEY = 'movie-ledger-cs-email-template';

/* Available tokens the user can insert */
const EMAIL_TOKENS = [
  { token: '{{DATE}}',           label: 'Date',              example: 'Friday, March 20' },
  { token: '{{SHOOT_DAY}}',      label: 'Shoot Day #',       example: '14' },
  { token: '{{TOTAL_SHOOT_DAYS}}', label: 'Total Shoot Days', example: '25' },
  { token: '{{DAY_TYPE}}',       label: 'Day Type',          example: 'SHOOT' },
  { token: '{{GENERAL_CALL}}',   label: 'General Call Time',  example: '7:00 AM' },
  { token: '{{LOCATION_NAME}}',  label: 'Location Name',     example: 'Warner Bros Stage 12' },
  { token: '{{LOCATION_ADDR}}',  label: 'Location Address',   example: '4000 Warner Blvd, Burbank' },
  { token: '{{PARKING_INFO}}',   label: 'Parking Info',       example: 'Lot G — enter via Gate 4' },
  { token: '{{PARKING_ADDR}}',   label: 'Parking Address',    example: '3701 W Oak St' },
  { token: '{{LUNCH_TIME}}',     label: 'Lunch Time',         example: '1:00 PM' },
  { token: '{{DIRECTOR}}',       label: 'Director',           example: 'Michael Mann' },
  { token: '{{PRODUCER}}',       label: 'Producer',           example: 'Art Linson' },
  { token: '{{PRODUCTION_CO}}',  label: 'Production Co.',     example: 'Forward Pass' },
  { token: '{{SUNRISE}}',        label: 'Sunrise',            example: '6:58 AM' },
  { token: '{{SUNSET}}',         label: 'Sunset',             example: '7:12 PM' },
  { token: '{{HIGH_TEMP}}',      label: 'High Temp',          example: '72°F' },
  { token: '{{LOW_TEMP}}',       label: 'Low Temp',           example: '55°F' },
  { token: '{{CONDITIONS}}',     label: 'Conditions',         example: 'Partly Cloudy' },
  { token: '{{WARNING_BANNER}}', label: 'Warning Banner',     example: 'NO SET PHOTOS…' },
  { token: '{{NOTES}}',          label: 'Notes',              example: '' },
];

const DEFAULT_EMAIL_TEMPLATE = `Hi Team,

Attached is the Call Sheet for {{DATE}} — Shoot Day {{SHOOT_DAY}}.

General Call: {{GENERAL_CALL}}
Location: {{LOCATION_NAME}}
Address: {{LOCATION_ADDR}}
Parking: {{PARKING_INFO}} — {{PARKING_ADDR}}

Please review the attached call sheet for full details including schedule, crew list, and contact information.

{{WARNING_BANNER}}

Thank you,
{{PRODUCTION_CO}}`;

function _loadEmailTemplate() {
  try { return localStorage.getItem(EMAIL_TPL_KEY) || DEFAULT_EMAIL_TEMPLATE; } catch { return DEFAULT_EMAIL_TEMPLATE; }
}

function _saveEmailTemplate(text) {
  localStorage.setItem(EMAIL_TPL_KEY, text);
}

function _resolveTokens(template, dateStr) {
  const s = _sheets[dateStr] || {};
  const map = {
    '{{DATE}}':             _formatDate(dateStr) || dateStr,
    '{{SHOOT_DAY}}':        s.shootDay || '—',
    '{{TOTAL_SHOOT_DAYS}}': s.totalShootDays || '—',
    '{{DAY_TYPE}}':         s.dayType || '—',
    '{{GENERAL_CALL}}':     s.generalCall || '—',
    '{{LOCATION_NAME}}':    s.locationName || '—',
    '{{LOCATION_ADDR}}':    [s.locationAddr1, s.locationAddr2].filter(Boolean).join(', ') || '—',
    '{{PARKING_INFO}}':     s.parkingInfo || '—',
    '{{PARKING_ADDR}}':     s.parkingAddr || '—',
    '{{LUNCH_TIME}}':       s.lunchTime || '—',
    '{{DIRECTOR}}':         s.director || '—',
    '{{PRODUCER}}':         s.producer || '—',
    '{{PRODUCTION_CO}}':    s.productionCo || '—',
    '{{SUNRISE}}':          s.sunrise || '—',
    '{{SUNSET}}':           s.sunset || '—',
    '{{HIGH_TEMP}}':        s.highTemp || '—',
    '{{LOW_TEMP}}':         s.lowTemp || '—',
    '{{CONDITIONS}}':       s.conditions || '—',
    '{{WARNING_BANNER}}':   s.warningBanner || '',
    '{{NOTES}}':            s.notes || '',
  };
  let result = template;
  for (const [tok, val] of Object.entries(map)) {
    result = result.replaceAll(tok, val);
  }
  return result;
}

function _renderEmailTemplate(dateStr) {
  const template = _loadEmailTemplate();

  _container.innerHTML = `
    <section class="cs-section">
      <div class="cs-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
        <div>
          <h2 class="cs-title">Call Sheet Email Template</h2>
          <p class="cs-subtitle">Design a reusable email body. Click a token to insert it at the cursor.</p>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <button class="btn btn--sm" id="cse-back-btn" style="font-size:11px;padding:4px 10px;background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);">← Back</button>
        </div>
      </div>

      <div class="cse-token-bar">
        <span class="cse-token-label">Insert Token:</span>
        ${EMAIL_TOKENS.map(t => `<button class="cse-token-pill" data-token="${esc(t.token)}" title="${esc(t.example)}">${esc(t.label)}</button>`).join('')}
      </div>

      <div class="cse-editor-wrap">
        <div class="cse-editor-col">
          <div class="cse-col-header">Template Editor</div>
          <textarea id="cse-template-input" class="cse-template-input" spellcheck="false">${esc(template)}</textarea>
        </div>
        <div class="cse-preview-col">
          <div class="cse-col-header">
            Preview
            <span class="cse-preview-date">(${_formatDate(dateStr) || dateStr})</span>
          </div>
          <div id="cse-preview" class="cse-preview"></div>
        </div>
      </div>

      <div class="cse-actions">
        <button class="btn btn--primary btn--sm" id="cse-save-btn">Save Template</button>
        <button class="btn btn--sm" id="cse-copy-btn" style="background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);">Copy Resolved Email</button>
        <button class="btn btn--sm btn--danger-text" id="cse-reset-btn" style="margin-left:auto;">Reset to Default</button>
      </div>
    </section>`;

  const textarea = _container.querySelector('#cse-template-input');
  const preview  = _container.querySelector('#cse-preview');

  function updatePreview() {
    const resolved = _resolveTokens(textarea.value, dateStr);
    preview.textContent = resolved;
  }
  updatePreview();

  textarea.addEventListener('input', updatePreview);

  /* Token insertion */
  _container.querySelectorAll('.cse-token-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const token = pill.dataset.token;
      const start = textarea.selectionStart;
      const end   = textarea.selectionEnd;
      const val   = textarea.value;
      textarea.value = val.slice(0, start) + token + val.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
      textarea.focus();
      updatePreview();
    });
  });

  /* Back */
  _container.querySelector('#cse-back-btn').addEventListener('click', () => _renderMain());

  /* Save */
  _container.querySelector('#cse-save-btn').addEventListener('click', () => {
    _saveEmailTemplate(textarea.value);
    const btn = _container.querySelector('#cse-save-btn');
    btn.textContent = 'Saved ✓'; setTimeout(() => { btn.textContent = 'Save Template'; }, 1500);
  });

  /* Copy resolved */
  _container.querySelector('#cse-copy-btn').addEventListener('click', () => {
    const resolved = _resolveTokens(textarea.value, dateStr);
    navigator.clipboard.writeText(resolved).then(() => {
      const btn = _container.querySelector('#cse-copy-btn');
      btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy Resolved Email'; }, 1500);
    });
  });

  /* Reset */
  _container.querySelector('#cse-reset-btn').addEventListener('click', () => {
    if (!confirm('Reset the email template to the default? Your current template will be lost.')) return;
    textarea.value = DEFAULT_EMAIL_TEMPLATE;
    updatePreview();
  });
}
