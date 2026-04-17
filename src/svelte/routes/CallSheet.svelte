<script>
  /* ── Storage Keys ── */
  const CREW_KEY      = 'movie-ledger-crew';
  const CAST_KEY      = 'movie-ledger-cast';
  const DAYTYPES_KEY  = 'movie-ledger-crew-daytypes';
  const CS_KEY        = 'movie-ledger-callsheets';
  const BD_KEY        = 'movie-ledger-breakdowns';
  const EMAIL_TPL_KEY = 'movie-ledger-cs-email-template';

  const CLIENT_AGENCY_SECTIONS = ['CLIENT', 'AGENCY'];

  /* ── Email tokens ── */
  const EMAIL_TOKENS = [
    { token: '{{DATE}}',             label: 'Date' },
    { token: '{{SHOOT_DAY}}',        label: 'Shoot Day #' },
    { token: '{{TOTAL_SHOOT_DAYS}}', label: 'Total Shoot Days' },
    { token: '{{DAY_TYPE}}',         label: 'Day Type' },
    { token: '{{GENERAL_CALL}}',     label: 'General Call Time' },
    { token: '{{LOCATION_NAME}}',    label: 'Location Name' },
    { token: '{{LOCATION_ADDR}}',    label: 'Location Address' },
    { token: '{{PARKING_INFO}}',     label: 'Parking Info' },
    { token: '{{PARKING_ADDR}}',     label: 'Parking Address' },
    { token: '{{LUNCH_TIME}}',       label: 'Lunch Time' },
    { token: '{{DIRECTOR}}',         label: 'Director' },
    { token: '{{PRODUCER}}',         label: 'Producer' },
    { token: '{{PRODUCTION_CO}}',    label: 'Production Co.' },
    { token: '{{SUNRISE}}',          label: 'Sunrise' },
    { token: '{{SUNSET}}',           label: 'Sunset' },
    { token: '{{HIGH_TEMP}}',        label: 'High Temp' },
    { token: '{{LOW_TEMP}}',         label: 'Low Temp' },
    { token: '{{CONDITIONS}}',       label: 'Conditions' },
    { token: '{{WARNING_BANNER}}',   label: 'Warning Banner' },
    { token: '{{NOTES}}',            label: 'Notes' },
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

  /* ── Svelte 5 state ── */
  let sheets        = $state({});
  let view          = $state('main');
  let activeDate    = $state(null);
  let dateInput     = $state(_todayStr());
  let emailTemplate = $state(DEFAULT_EMAIL_TEMPLATE);
  let savedMsg      = $state('');
  let emailSavedMsg = $state('');
  let emailCopiedMsg = $state('');

  /* ── Derived ── */
  let activeSheet  = $derived(activeDate ? sheets[activeDate] : null);
  let savedDates   = $derived(Object.keys(sheets).sort().reverse());
  let groupedCrew  = $derived(activeDate ? _groupCrewBySection(sheets[activeDate]?.crew || []) : []);
  let emailPreview = $derived(_resolveTokens(emailTemplate, activeDate));

  /* ── Persist on change ── */
  $effect(() => {
    // Access sheets to register dependency; save whenever it changes
    const snap = JSON.stringify(sheets);
    localStorage.setItem(CS_KEY, snap);
  });

  /* ── Persistence ── */
  function _loadSheets() {
    try { sheets = JSON.parse(localStorage.getItem(CS_KEY)) || {}; } catch { sheets = {}; }
  }
  function _saveSheets() { localStorage.setItem(CS_KEY, JSON.stringify(sheets)); }

  /* ── Helpers ── */
  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _getProject()  { try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || null; } catch { return null; } }
  function _getCrewData() { try { return JSON.parse(localStorage.getItem(CREW_KEY)) || []; } catch { return []; } }
  function _getDayTypes() { try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; } }
  function _getProdInfo() { try { return JSON.parse(localStorage.getItem('movie-ledger-prod-info')) || {}; } catch { return {}; } }
  function _getVendors()  { try { return JSON.parse(localStorage.getItem('movie-ledger-vendors')) || []; } catch { return []; } }

  function _formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${d}`;
  }

  function _todayStr() {
    const n = new Date(); n.setDate(n.getDate() + 1);
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  }

  function _calcShootDay(dateStr) {
    const shootDates = Object.entries(_getDayTypes()).filter(([,t]) => t === 'shoot').map(([d]) => d).sort();
    const idx = shootDates.indexOf(dateStr);
    return idx >= 0 ? idx + 1 : null;
  }

  function _getCrewForDate(dateStr) {
    const crew = _getCrewData();
    const results = [];
    crew.forEach(section => {
      if (CLIENT_AGENCY_SECTIONS.includes(section.sectionName?.toUpperCase())) return;
      const sc = [];
      (section.rows || []).forEach(row => {
        if (row[dateStr] === '1' && row.name?.trim())
          sc.push({ position: row.position||'', name: row.name||'', phone: row.phone||'', email: row.email||'' });
      });
      if (sc.length) results.push({ section: section.sectionName, crew: sc });
    });
    return results;
  }

  function _getClientAgencyForDate(dateStr) {
    const crew = _getCrewData();
    const clientContacts = [], agencyContacts = [];
    crew.forEach(section => {
      const secName = section.sectionName?.toUpperCase() || '';
      if (!CLIENT_AGENCY_SECTIONS.includes(secName)) return;
      (section.rows || []).forEach(row => {
        if (row[dateStr] === '1' && row.name?.trim()) {
          const entry = { title: row.position||'', name: row.name||'', email: row.email||'', callTime: '', callLoc: '' };
          if (secName === 'CLIENT') clientContacts.push(entry);
          else agencyContacts.push(entry);
        }
      });
    });
    return { clientContacts, agencyContacts };
  }

  function _loadCastProfiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(CAST_KEY));
      if (!raw) return {};
      if (raw._version === 2) {
        const map = {};
        Object.values(raw.profiles || {}).forEach(p => { if (p.castNum) map[p.castNum] = p; });
        return map;
      }
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
      const days = []; let currentDay = [];
      for (const item of draft.items) {
        if (item.type === 'scene') { const s = sceneMap[item.sceneId]; if (s) currentDay.push(s); }
        else if (item.type === 'daybreak') { if (currentDay.length > 0) { days.push(currentDay); currentDay = []; } }
      }
      if (currentDay.length > 0) days.push(currentDay);
      const daySc = days[dayIdx];
      if (!daySc) return [];
      const seen = new Set(), castList = [];
      daySc.forEach(scene => {
        (scene.castMembers || []).forEach(cm => {
          const key = cm.castNum || cm.role;
          if (!seen.has(key)) { seen.add(key); castList.push(cm); }
        });
      });
      return castList.sort((a, b) => (Number(a.castNum) || 999) - (Number(b.castNum) || 999));
    } catch { return []; }
  }

  function _getCastForDate(dateStr) {
    const results = [];
    const castProfiles = _loadCastProfiles();
    const sceneCast = _getSceneCastForDate(dateStr);
    if (sceneCast.length > 0) {
      sceneCast.forEach(cm => {
        const profile = castProfiles[cm.castNum];
        const num = cm.castNum || '', role = cm.role || '';
        const title = num ? `${num}. ${role}` : role;
        const name = profile?.legalName || profile?.stageName || cm.name || '';
        results.push({ title, name, callTime: '', callLoc: '' });
      });
    }
    return results;
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
    const desc    = scene.description || '';
    const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
    return { sets: setting, setsDesc: desc, cast: castIds, dn: scene.dayNight||'', pages: scene.pageCount||'', location: scene.locationAddress||'' };
  }

  function _buildDefaultSheet(dateStr) {
    const project = _getProject() || {};
    const crewBySection = _getCrewForDate(dateStr);
    const { clientContacts, agencyContacts } = _getClientAgencyForDate(dateStr);
    const shootDay = _calcShootDay(dateStr);
    const dayType  = _getDayTypes()[dateStr] || '';
    const crewEntries = [];
    crewBySection.forEach(({ section, crew }) => {
      crew.forEach(c => crewEntries.push({ section, position: c.position, name: c.name, phone: c.phone, email: c.email, callTime: '', callLoc: '' }));
    });
    const totalShootDays = Object.values(_getDayTypes()).filter(t => t === 'shoot').length;
    const emptyRow = () => ({ scene:'', sets:'', setsDesc:'', cast:'', dn:'', pages:'', location:'' });
    return {
      date: dateStr, shootDay: shootDay ?? '', totalShootDays: totalShootDays || '', dayType,
      generalCall: '', lunchTime: '', secondMeal: '',
      locationName: '', locationAddr1: '', locationAddr2: '',
      parkingInfo: '', parkingAddr: '', parkingAddr2: '', parkingAddr3: '',
      loadingZone: '', loadingAddr: '', loadingAddr2: '', loadingAddr3: '',
      sunrise: '', sunset: '', highTemp: '', lowTemp: '', conditions: '', uvIndex: '', rainChance: '',
      hospitalName: '', hospitalAddr: '', hospitalAddr2: '',
      clientName: project.productionCompany || '', clientAddr: '',
      agencyName: '', agencyAddr: '',
      director: project.director || '', producer: project.producer || '', productionCo: project.productionCompany || '',
      schedule: Array.from({length:8}, emptyRow),
      crew: crewEntries, clientContacts, agencyContacts,
      talentContacts: _getCastForDate(dateStr), vendors: [],
      directContacts: [{ title:'', name:'', phone:'' }],
      notes: '',
      warningBanner: 'NO SET PHOTOS, VIDEOS OR SOCIAL MEDIA POSTS ALLOWED WHILE ON SET. NO VISITORS.',
      report1stAM: '', report1stPM: '', reportCameraWrap: '',
      reportLunch: '', report2ndMeal: '', reportCrewWrap: '',
    };
  }

  /* ── Group crew by section ── */
  function _groupCrewBySection(crew) {
    const groups = []; let current = null;
    crew.forEach(c => {
      if (c.section !== current) { groups.push({ section: c.section, members: [] }); current = c.section; }
      groups[groups.length - 1].members.push(c);
    });
    return groups;
  }

  /* ── Migrate old left/right schedule ── */
  function _migrateSchedule(s) {
    const rows = [];
    const maxLen = Math.max(s.scheduleLeft?.length || 0, s.scheduleRight?.length || 0, 1);
    for (let i = 0; i < maxLen; i++) {
      const L = s.scheduleLeft?.[i] || {};
      rows.push({ scene: L.scene||'', sets: L.location||'', setsDesc:'', cast: L.talent||'', dn:'', pages:'', location: L.time||'' });
    }
    return rows.length ? rows : [{ scene:'', sets:'', setsDesc:'', cast:'', dn:'', pages:'', location:'' }];
  }

  function _ensureSchedule(s) {
    if (!s.schedule) {
      s.schedule = s.scheduleLeft?.length ? _migrateSchedule(s) : Array.from({length:8}, () => ({scene:'',sets:'',setsDesc:'',cast:'',dn:'',pages:'',location:''}));
    }
    if (!s.directContacts) s.directContacts = [{ title:'', name:'', phone:'' }];
    if (!s.clientContacts) s.clientContacts = [];
    if (!s.agencyContacts) s.agencyContacts = [];
    if (!s.talentContacts) s.talentContacts = [];
    if (!s.vendors) s.vendors = [];
  }

  /* ── Header helpers (read-only display) ── */
  function _getAllCrewPositions() {
    const crew = _getCrewData(), positions = [];
    crew.forEach(section => {
      (section.rows || []).forEach(row => {
        if (row.position?.trim() && !positions.includes(row.position.trim())) positions.push(row.position.trim());
      });
    });
    return positions.sort((a,b) => a.localeCompare(b));
  }

  function _findCrewByPosition(position) {
    const crew = _getCrewData();
    for (const section of crew) {
      for (const row of (section.rows || [])) {
        if (row.position?.trim() === position?.trim()) return { name: row.name || '', phone: row.phone || '' };
      }
    }
    return { name: '', phone: '' };
  }

  /* ── Email token resolver ── */
  function _resolveTokens(template, dateStr) {
    const s = (dateStr ? sheets[dateStr] : null) || {};
    const map = {
      '{{DATE}}':             _formatDate(dateStr) || dateStr || '',
      '{{SHOOT_DAY}}':        String(s.shootDay || '—'),
      '{{TOTAL_SHOOT_DAYS}}': String(s.totalShootDays || '—'),
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
    let result = template || '';
    for (const [tok, val] of Object.entries(map)) result = result.replaceAll(tok, val);
    return result;
  }

  /* ── Navigation ── */
  function openEditor(dateStr) {
    if (!sheets[dateStr]) {
      sheets[dateStr] = _buildDefaultSheet(dateStr);
      _saveSheets();
    }
    _ensureSchedule(sheets[dateStr]);
    activeDate = dateStr;
    view = 'editor';
  }

  function openEmailTemplate(dateStr) {
    try { emailTemplate = localStorage.getItem(EMAIL_TPL_KEY) || DEFAULT_EMAIL_TEMPLATE; } catch { emailTemplate = DEFAULT_EMAIL_TEMPLATE; }
    activeDate = dateStr || null;
    view = 'email';
  }

  function goMain() {
    _saveSheets();
    view = 'main';
  }

  function generateSheet() {
    if (!dateInput) return;
    openEditor(dateInput);
  }

  function deleteSheet(dateStr) {
    if (!confirm(`Delete call sheet for ${_formatDate(dateStr)}?`)) return;
    const next = { ...sheets };
    delete next[dateStr];
    sheets = next;
    _saveSheets();
  }

  /* ── Editor actions ── */
  function saveSheet() {
    _saveSheets();
    savedMsg = 'Saved ✓';
    setTimeout(() => { savedMsg = ''; }, 1500);
  }

  function refreshPersonnel() {
    if (!activeDate) return;
    const sheet = sheets[activeDate];
    if (!confirm('Re-pull personnel from Crew & Cast lists? This will replace current crew, client, agency, and talent entries.')) return;
    const fresh = _buildDefaultSheet(activeDate);
    const preserve = (oldArr, newArr) => {
      const map = {};
      (oldArr||[]).forEach(e => { const k=(e.name||'').trim().toLowerCase(); if(k) map[k]={callTime:e.callTime||'',callLoc:e.callLoc||''}; });
      (newArr||[]).forEach(e => { const k=(e.name||'').trim().toLowerCase(); if(map[k]){e.callTime=map[k].callTime;e.callLoc=map[k].callLoc;} });
    };
    preserve(sheet.crew,           fresh.crew);
    preserve(sheet.clientContacts, fresh.clientContacts);
    preserve(sheet.agencyContacts, fresh.agencyContacts);
    preserve(sheet.talentContacts, fresh.talentContacts);
    sheet.crew            = fresh.crew;
    sheet.clientContacts  = fresh.clientContacts;
    sheet.agencyContacts  = fresh.agencyContacts;
    sheet.talentContacts  = fresh.talentContacts;
    sheets = { ...sheets };
    _saveSheets();
  }

  /* ── Schedule rows ── */
  function addSchedRow() {
    sheets[activeDate].schedule.push({scene:'',sets:'',setsDesc:'',cast:'',dn:'',pages:'',location:''});
    sheets = { ...sheets };
  }

  function onSceneBlur(i) {
    const row = sheets[activeDate]?.schedule[i];
    if (!row?.scene?.trim()) return;
    const bdScene = _lookupBreakdownScene(row.scene.trim());
    if (!bdScene) return;
    const fill = _breakdownToSchedRow(bdScene);
    const schedule = sheets[activeDate].schedule;
    schedule[i] = { ...schedule[i], ...fill };
    sheets = { ...sheets };
  }

  /* ── Crew rows ── */
  function addCrewRow() {
    sheets[activeDate].crew.push({section:'',position:'',name:'',phone:'',email:'',callTime:'',callLoc:''});
    sheets = { ...sheets };
  }

  function deleteCrewRow(i) {
    sheets[activeDate].crew.splice(i, 1);
    sheets = { ...sheets };
  }

  /* ── Contact rows ── */
  function addContact(type) {
    const s = sheets[activeDate];
    if (type === 'client') s.clientContacts.push({title:'',name:'',email:'',callTime:'',callLoc:''});
    else if (type === 'agency') s.agencyContacts.push({title:'',name:'',email:'',callTime:'',callLoc:''});
    else if (type === 'talent') s.talentContacts.push({title:'',name:'',callTime:'',callLoc:''});
    else if (type === 'vendor') s.vendors.push({type:'',company:'',contact:'',email:'',callTime:'',callLoc:''});
    sheets = { ...sheets };
  }

  function deleteContact(type, i) {
    const s = sheets[activeDate];
    if (type === 'client') s.clientContacts.splice(i, 1);
    else if (type === 'agency') s.agencyContacts.splice(i, 1);
    else if (type === 'talent') s.talentContacts.splice(i, 1);
    else if (type === 'vendor') s.vendors.splice(i, 1);
    sheets = { ...sheets };
  }

  function onVendorPick(i, vendorName) {
    const vendor = _getVendors().find(v => v.name === vendorName);
    if (!vendor) return;
    const s = sheets[activeDate];
    if (s.vendors[i]) {
      s.vendors[i].type    = vendor.type    || '';
      s.vendors[i].company = vendor.name    || '';
      s.vendors[i].contact = vendor.contact || '';
      s.vendors[i].email   = vendor.email   || '';
    }
    sheets = { ...sheets };
  }

  /* ── Direct contacts ── */
  function addDirectContact() {
    sheets[activeDate].directContacts.push({ title:'', name:'', phone:'' });
    sheets = { ...sheets };
  }

  function deleteDirectContact(i) {
    const dc = sheets[activeDate].directContacts;
    dc.splice(i, 1);
    if (dc.length === 0) dc.push({ title:'', name:'', phone:'' });
    sheets = { ...sheets };
  }

  function onDirectContactPick(i, position) {
    const match = _findCrewByPosition(position);
    sheets[activeDate].directContacts[i] = { title: position, name: match.name, phone: match.phone };
    sheets = { ...sheets };
  }

  /* ── Enter → next row keyboard nav ── */
  function handleTableKeydown(e) {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (el.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const cell = el.closest('td');
    if (!cell) return;
    const row = cell.closest('tr');
    if (!row) return;
    const cellIdx = Array.from(row.cells).indexOf(cell);
    const cellInputs = Array.from(cell.querySelectorAll('input[type="text"]'));
    const inputIdx = cellInputs.indexOf(el);
    let nextRow = row.nextElementSibling;
    if (!nextRow || nextRow.classList.contains('cse-section-row')) {
      nextRow = nextRow?.nextElementSibling;
    }
    if (!nextRow) return;
    const targetCell = nextRow.cells[cellIdx];
    if (targetCell) {
      const inputs = targetCell.querySelectorAll('input[type="text"]');
      const target = inputs[inputIdx] || inputs[0];
      if (target) { target.focus(); target.select(); }
    }
  }

  /* ── Email template actions ── */
  let emailTextarea;

  function insertToken(token) {
    if (!emailTextarea) return;
    const start = emailTextarea.selectionStart;
    const end   = emailTextarea.selectionEnd;
    const val   = emailTemplate;
    emailTemplate = val.slice(0, start) + token + val.slice(end);
    // restore cursor after DOM update
    setTimeout(() => {
      if (emailTextarea) {
        emailTextarea.selectionStart = emailTextarea.selectionEnd = start + token.length;
        emailTextarea.focus();
      }
    }, 0);
  }

  function saveEmailTemplate() {
    localStorage.setItem(EMAIL_TPL_KEY, emailTemplate);
    emailSavedMsg = 'Saved ✓';
    setTimeout(() => { emailSavedMsg = ''; }, 1500);
  }

  function copyResolvedEmail() {
    navigator.clipboard.writeText(_resolveTokens(emailTemplate, activeDate)).then(() => {
      emailCopiedMsg = 'Copied ✓';
      setTimeout(() => { emailCopiedMsg = ''; }, 1500);
    });
  }

  function resetEmailTemplate() {
    if (!confirm('Reset the email template to the default? Your current template will be lost.')) return;
    emailTemplate = DEFAULT_EMAIL_TEMPLATE;
  }

  /* ══════════════════════════════════
     PRINT VIEW (unchanged)
  ══════════════════════════════════ */
  function _openPrintView(dateStr) {
    const s = sheets[dateStr];
    if (!s) return;
    const e  = v => esc(v || '');
    const pi = _getProdInfo();
    const hasClient = !!(pi.clientName || pi.clientAddr || pi.clientCity || pi.clientPhone);
    const hasAgency = !!(pi.agencyName || pi.agencyAddr || pi.agencyCity);

    const crewBySection = _groupCrewBySection(s.crew);
    const rightRows     = _buildRightRowsForPrint(s);

    let leftRows = '';
    crewBySection.forEach(group => {
      leftRows += `<tr class="sec-row"><td colspan="5" class="sec-lbl">${e(group.section)}</td></tr>`;
      group.members.forEach(c => {
        leftRows += `<tr><td>${e(c.position)}</td><td>${e(c.name)}</td><td>${e(c.phone)}</td><td>${e(c.email)}</td><td>${e(c.callLoc)} ${e(c.callTime)}</td></tr>`;
      });
    });

    let rightRowsHTML = '';
    rightRows.forEach(rr => {
      if (rr.isHeader) rightRowsHTML += `<tr class="sec-row"><td colspan="5" class="sec-lbl">${e(rr.label)}</td></tr>`;
      else {
        const locTime = [e(rr.col6), e(rr.col5)].filter(Boolean).join(' ');
        rightRowsHTML += `<tr><td>${e(rr.col1)}</td><td>${e(rr.col2)}</td><td>${e(rr.col3)}</td><td>${e(rr.col4)}</td><td>${locTime}</td></tr>`;
      }
    });

    const schedData  = s.schedule || [];
    const schedRows  = [];
    for (const r of schedData) {
      if (!r.scene&&!r.sets&&!r.cast&&!r.dn&&!r.pages&&!r.location) continue;
      const setsCell = r.setsDesc ? `${e(r.sets)}<br><span class="sc-sets-desc">${e(r.setsDesc)}</span>` : e(r.sets);
      schedRows.push(`<tr><td class="sc-scene">${e(r.scene)}</td><td class="sc-sets">${setsCell}</td><td class="sc-cast">${e(r.cast)}</td><td class="sc-dn">${e(r.dn)}</td><td class="sc-pages">${e(r.pages)}</td><td class="sc-loc">${e(r.location)}</td></tr>`);
    }

    const shootDayLbl = s.shootDay ? `SHOOT DAY ${e(String(s.shootDay))} of ${e(String(s.totalShootDays||''))}` : (s.dayType ? s.dayType.toUpperCase()+' DAY' : '');

    let leftHTML = '';
    if (hasClient) {
      leftHTML += `<div class="ca-box">${pi.clientLogo?'<div class="ca-inner">':''}<div><div class="lbl">CLIENT</div><div class="val">${e(pi.clientName)}${pi.clientAddr?'<br>'+e(pi.clientAddr):''}${pi.clientCity?'<br>'+e(pi.clientCity):''}${pi.clientPhone?'<br>'+e(pi.clientPhone):''}</div></div>${pi.clientLogo?`<img src="${e(pi.clientLogo)}" class="ca-logo" /></div>`:''}</div>`;
    }
    if (hasAgency) {
      leftHTML += `<div class="ca-box">${pi.agencyLogo?'<div class="ca-inner">':''}<div><div class="lbl">AGENCY</div><div class="val">${e(pi.agencyName)}${pi.agencyAddr?'<br>'+e(pi.agencyAddr):''}${pi.agencyCity?'<br>'+e(pi.agencyCity):''}</div></div>${pi.agencyLogo?`<img src="${e(pi.agencyLogo)}" class="ca-logo" /></div>`:''}</div>`;
    }
    if (s.directContacts?.length) {
      const dcRows = s.directContacts.filter(dc => dc.title).map(dc => `<tr><td style="font-size:7px">${e(dc.title)}</td><td style="font-size:7px">${e(dc.name)}</td><td style="font-size:7px">${e(dc.phone)}</td></tr>`).join('');
      if (dcRows) leftHTML += `<table style="width:100%;border-collapse:collapse;margin-top:2px">${dcRows}</table>`;
    }

    let prodLines = [];
    if (pi.prodCoName)  prodLines.push(e(pi.prodCoName));
    if (pi.prodCoAddr)  prodLines.push(e(pi.prodCoAddr));
    if (pi.prodCoCity)  prodLines.push(e(pi.prodCoCity));
    if (pi.prodCoPhone) prodLines.push(e(pi.prodCoPhone));

    const reportLeft  = `1ST AM SHOT: ${e(s.report1stAM)}\n1ST PM SHOT: ${e(s.report1stPM)}\nCAMERA WRAP: ${e(s.reportCameraWrap)}`;
    const reportRight = `LUNCH: ${e(s.reportLunch)}\n2ND MEAL: ${e(s.report2ndMeal)}\nCREW WRAP: ${e(s.reportCrewWrap)}`;

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
    <div class="topbar-title">${pi.titleLogo?`<img src="${e(pi.titleLogo)}" class="title-logo" alt="Title" />`:'CALL SHEET'}</div>
    <div class="topbar-dt">${_formatDate(dateStr)}</div>
  </div>
  <div class="hdr-l">${leftHTML}</div>
  <div class="hdr-c">
    <div>
      <div class="project-title">${e((_getProject()?.title)||'')}</div>
      <div class="call-label">GENERAL CALL:</div>
      <div class="call-time">${e(s.generalCall)}</div>
      <div class="call-sub">*see individual call times*</div>
      <div class="prod-block"><div class="lbl">PRODUCTION</div><div class="prod-co">${prodLines.join('<br>')}</div>${pi.prodCoLogo?`<img src="${e(pi.prodCoLogo)}" class="prod-logo" />`:''}
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
${(s.lunchTime||s.secondMeal)?`<div class="meals">${s.lunchTime?`Lunch RTS: ${e(s.lunchTime)}`:''} ${s.lunchTime&&s.secondMeal?' &nbsp;&nbsp;&nbsp; ':''} ${s.secondMeal?`2nd Meal RTS: ${e(s.secondMeal)}`:''}</div>`:''}
<div class="rpt"><span class="rpt-l">PRODUCTION REPORT:</span><div class="rpt-cols"><div class="rpt-col">${reportLeft.replace(/\n/g,'<br>')}</div><div class="rpt-col">${reportRight.replace(/\n/g,'<br>')}</div></div></div>
${s.notes?`<div class="notes"><span class="notes-l">NOTES</span><br>${e(s.notes)}</div>`:`<div class="notes"><span class="notes-l">NOTES</span></div>`}
</div>
</div>
<div class="ft"><div class="ft-c">**CALL SHEETS ARE CONFIDENTIAL AND NOT FOR REDISTRIBUTION OUTSIDE OF THE PRODUCTION**</div></div>
</div>
<script>(function(){var pg=document.querySelector('.pg');var h=pg.scrollHeight;var lMax=10.5*96-0.6*96;var s=document.createElement('style');s.textContent=h<=lMax?'@page{size:letter}':'@page{size:legal}';document.head.appendChild(s);})();<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }

  /* ── Right rows helper for print (read-only, no inputs) ── */
  function _buildRightRowsForPrint(s) {
    const rows = [];
    if (s.clientContacts?.length) {
      rows.push({ isHeader: true, label: 'CLIENT' });
      s.clientContacts.forEach((c, i) => rows.push({ isHeader: false, type:'contact', idx:i, col1:c.title, col2:c.name, col3:'', col4:c.email, col5:c.callTime, col6:c.callLoc||'' }));
    }
    if (s.agencyContacts?.length) {
      rows.push({ isHeader: true, label: 'AGENCY' });
      s.agencyContacts.forEach((a, i) => rows.push({ isHeader: false, type:'agency', idx:i, col1:a.title, col2:a.name, col3:'', col4:a.email, col5:a.callTime, col6:a.callLoc||'' }));
    }
    if (s.talentContacts?.length) {
      rows.push({ isHeader: true, label: 'TALENT' });
      s.talentContacts.forEach((t, i) => rows.push({ isHeader: false, type:'talent', idx:i, col1:t.title, col2:t.name, col3:'', col4:'', col5:t.callTime, col6:t.callLoc||'' }));
    }
    if (s.vendors?.length) {
      rows.push({ isHeader: true, label: 'VENDORS' });
      s.vendors.forEach((v, i) => rows.push({ isHeader: false, type:'vendor', idx:i, col1:v.type, col2:v.company, col3:v.contact, col4:v.email, col5:v.callTime, col6:v.callLoc||'' }));
    }
    return rows;
  }

  /* ── Init ── */
  _loadSheets();
</script>

<!-- ══════════════════════ MAIN VIEW ══════════════════════ -->
{#if view === 'main'}
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
        <input type="date" id="cs-date-input" bind:value={dateInput} />
        <button class="btn btn--primary" onclick={generateSheet}>Generate Call Sheet</button>
        <button class="btn btn--sm cs-email-tpl-btn" onclick={() => openEmailTemplate(dateInput)}>Call Sheet Email Template</button>
      </div>
    </div>

    {#if savedDates.length}
      <div class="cs-saved">
        <h3 class="cs-saved-title">Saved Call Sheets</h3>
        <div class="cs-saved-list">
          {#each savedDates as d}
            {@const s = sheets[d]}
            <div class="cs-saved-item">
              <span class="cs-saved-date">{_formatDate(d)}{s?.shootDay ? ` — Shoot Day ${s.shootDay}` : ''}</span>
              <div class="cs-saved-actions">
                <button class="btn btn--ghost btn--sm" onclick={() => openEditor(d)}>Edit</button>
                <button class="btn btn--ghost btn--sm" onclick={() => _openPrintView(d)}>Print / PDF</button>
                <button class="btn btn--ghost btn--sm btn--danger-text" onclick={() => deleteSheet(d)}>Delete</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>

<!-- ══════════════════════ EDITOR VIEW ══════════════════════ -->
{:else if view === 'editor' && activeSheet}
  {@const s = activeSheet}
  {@const pi = _getProdInfo()}
  {@const project = _getProject()}
  {@const allPositions = _getAllCrewPositions()}
  {@const allVendors = _getVendors()}

  <div class="cse-toolbar">
    <button class="btn btn--ghost btn--sm" onclick={() => { _saveSheets(); view = 'main'; }}>← Back</button>
    <span class="cse-toolbar-title">Call Sheet — {_formatDate(activeDate)}</span>
    <div class="cse-toolbar-actions">
      <button class="btn btn--ghost btn--sm" onclick={refreshPersonnel}>Refresh Personnel</button>
      <button class="btn btn--ghost btn--sm" onclick={() => { _saveSheets(); _openPrintView(activeDate); }}>Print / PDF</button>
      <button class="btn btn--primary btn--sm" onclick={saveSheet}>{savedMsg || 'Save'}</button>
    </div>
  </div>

  <div class="cse-page-wrap">
    <div class="cse-page">

      <!-- Header top bar -->
      <div class="cse-hdr">
        <div class="cse-hdr-topbar">
          <div class="cse-hdr-shootday">
            SHOOT DAY <input type="text" class="cse-in cse-in--shootday" bind:value={s.shootDay} placeholder="#" />
            of <input type="text" class="cse-in cse-in--shootday" bind:value={s.totalShootDays} placeholder="#" />
            <select bind:value={s.dayType} class="cse-select cse-select--topbar">
              <option value="">Day Type</option>
              <option value="prep">Prep</option>
              <option value="shoot">Shoot</option>
              <option value="wrap">Wrap</option>
              <option value="down">Down</option>
            </select>
          </div>
          <div class="cse-hdr-title">
            {#if pi.titleLogo}
              <img src={pi.titleLogo} class="cse-title-logo" alt="Title" />
            {:else}
              CALL SHEET
            {/if}
          </div>
          <div class="cse-hdr-date">{_formatDate(activeDate)}</div>
        </div>

        <!-- Header left: client/agency boxes + direct contacts -->
        <div class="cse-hdr-left">
          <div class="cse-hdr-left-info">
            {#if pi.clientName || pi.clientAddr || pi.clientCity || pi.clientPhone}
              <div class="cse-client-agency-box">
                <div class="cse-box-inner">
                  <div class="cse-box-text">
                    <div class="cse-label">CLIENT</div>
                    <div class="cse-val">
                      {pi.clientName || ''}{#if pi.clientAddr}<br>{pi.clientAddr}{/if}{#if pi.clientCity}<br>{pi.clientCity}{/if}{#if pi.clientPhone}<br>{pi.clientPhone}{/if}
                    </div>
                  </div>
                  {#if pi.clientLogo}<img src={pi.clientLogo} alt="Client" class="cse-box-logo" />{/if}
                </div>
              </div>
            {/if}
            {#if pi.agencyName || pi.agencyAddr || pi.agencyCity}
              <div class="cse-client-agency-box">
                <div class="cse-box-inner">
                  <div class="cse-box-text">
                    <div class="cse-label">AGENCY</div>
                    <div class="cse-val">
                      {pi.agencyName || ''}{#if pi.agencyAddr}<br>{pi.agencyAddr}{/if}{#if pi.agencyCity}<br>{pi.agencyCity}{/if}
                    </div>
                  </div>
                  {#if pi.agencyLogo}<img src={pi.agencyLogo} alt="Agency" class="cse-box-logo" />{/if}
                </div>
              </div>
            {/if}

            <!-- Direct contacts table -->
            <table class="cse-dc-table">
              <tbody>
                {#each s.directContacts as dc, i}
                  <tr class="cse-dc-row">
                    <td>
                      <select class="cse-dc-select" value={dc.title}
                        onchange={(e) => onDirectContactPick(i, e.target.value)}>
                        <option value="">{dc.title ? '' : 'Title'}</option>
                        {#each allPositions as p}
                          <option value={p} selected={dc.title === p}>{p}</option>
                        {/each}
                      </select>
                    </td>
                    <td class="cse-dc-name">{dc.name || ''}<span class="cse-dc-ghost">{dc.name ? '' : 'Name'}</span></td>
                    <td class="cse-dc-phone">{dc.phone || ''}<span class="cse-dc-ghost">{dc.phone ? '' : 'Phone'}</span></td>
                    <td><button type="button" class="cse-dc-del" onclick={() => deleteDirectContact(i)} title="Remove">✕</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <button type="button" class="cse-dc-add" onclick={addDirectContact}>+</button>
          </div>
        </div>

        <!-- Header center: project title, general call, production -->
        <div class="cse-hdr-center">
          <div class="cse-hdr-center-top">
            <div class="cse-project-title">{project?.title || ''}</div>
            <div class="cse-hdr-call">
              <div class="cse-call-label">GENERAL CALL:</div>
              <div class="cse-call-time">
                <input type="text" class="cse-in cse-in--calltime" bind:value={s.generalCall} placeholder="9:30 AM" />
              </div>
            </div>
            <div class="cse-hdr-sub">*see individual call times*</div>
            <div class="cse-hdr-prod-block">
              <div class="cse-label">PRODUCTION</div>
              <div class="cse-prod-co">
                {#if pi.prodCoName}{pi.prodCoName}<br>{/if}
                {#if pi.prodCoAddr}{pi.prodCoAddr}<br>{/if}
                {#if pi.prodCoCity}{pi.prodCoCity}<br>{/if}
                {#if pi.prodCoPhone}{pi.prodCoPhone}{/if}
              </div>
              {#if pi.prodCoLogo}<img src={pi.prodCoLogo} alt="Production Co." class="cse-prod-logo" />{/if}
            </div>
          </div>
          <div class="cse-hdr-meals">
            Lunch RTS <input type="text" class="cse-in cse-in--center" bind:value={s.lunchTime} placeholder="3:00 PM" /><br>
            2nd Meal RTS: <input type="text" class="cse-in cse-in--center" bind:value={s.secondMeal} placeholder="8:00 PM" />
          </div>
        </div>

        <!-- Header right: locations, parking, loading, weather, hospital -->
        <div class="cse-hdr-right">
          <div class="cse-info-box">
            <div class="cse-label">LOCATIONS</div>
            <div class="cse-val">
              <input type="text" class="cse-in" bind:value={s.locationName} placeholder="Location name" /><br>
              <input type="text" class="cse-in" bind:value={s.locationAddr1} placeholder="Street address" /><br>
              <input type="text" class="cse-in" bind:value={s.locationAddr2} placeholder="City, State ZIP" />
            </div>
          </div>
          <div class="cse-info-box">
            <div class="cse-label">PARKING</div>
            <div class="cse-val">
              <input type="text" class="cse-in" bind:value={s.parkingInfo} placeholder="Parking info" /><br>
              <input type="text" class="cse-in" bind:value={s.parkingAddr} placeholder="Parking address" /><br>
              <input type="text" class="cse-in" bind:value={s.parkingAddr2} placeholder="Parking line 3" /><br>
              <input type="text" class="cse-in" bind:value={s.parkingAddr3} placeholder="Parking line 4" />
            </div>
          </div>
          <div class="cse-info-box">
            <div class="cse-label">LOADING ZONE</div>
            <div class="cse-val">
              <input type="text" class="cse-in" bind:value={s.loadingZone} placeholder="Loading zone" /><br>
              <input type="text" class="cse-in" bind:value={s.loadingAddr} placeholder="Loading address" /><br>
              <input type="text" class="cse-in" bind:value={s.loadingAddr2} placeholder="Loading line 3" /><br>
              <input type="text" class="cse-in" bind:value={s.loadingAddr3} placeholder="Loading line 4" />
            </div>
          </div>
          <div class="cse-hdr-right-bottom">
            <div class="cse-wx">
              High: <input type="text" class="cse-in cse-in--sm" bind:value={s.highTemp} placeholder="67 cloudy" /><br>
              Low: <input type="text" class="cse-in cse-in--sm" bind:value={s.lowTemp} placeholder="48" /><br>
              UV Index: <input type="text" class="cse-in cse-in--sm" bind:value={s.uvIndex} placeholder="4 of 11" /><br>
              Rain: <input type="text" class="cse-in cse-in--sm" bind:value={s.rainChance} placeholder="7% chance" /><br>
              Sunrise: <input type="text" class="cse-in cse-in--sm" bind:value={s.sunrise} placeholder="6:40 am" /><br>
              Sunset: <input type="text" class="cse-in cse-in--sm" bind:value={s.sunset} placeholder="5:30 pm" />
            </div>
            <div class="cse-info-box cse-hdr-hospital">
              <div class="cse-label">NEAREST HOSPITAL</div>
              <div class="cse-val">
                <input type="text" class="cse-in" bind:value={s.hospitalName} placeholder="Hospital name" /><br>
                <input type="text" class="cse-in" bind:value={s.hospitalAddr} placeholder="Hospital address" /><br>
                <input type="text" class="cse-in" bind:value={s.hospitalAddr2} placeholder="City, State ZIP" />
              </div>
            </div>
          </div>
        </div>
      </div><!-- end .cse-hdr -->

      <!-- Warning banner -->
      <div class="cse-warning">
        <input type="text" class="cse-in cse-in--warning" bind:value={s.warningBanner} placeholder="Warning banner text" />
      </div>

      <!-- Schedule table -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <table class="cse-sched" onkeydown={handleTableKeydown}>
        <thead>
          <tr>
            <th class="cse-sched-scene">Scene</th>
            <th class="cse-sched-sets">Sets</th>
            <th class="cse-sched-cast">Cast</th>
            <th class="cse-sched-dn">D/N</th>
            <th class="cse-sched-pages">Pages</th>
            <th class="cse-sched-loc">Location</th>
          </tr>
        </thead>
        <tbody>
          {#each s.schedule as row, i}
            <tr>
              <td class="cse-sched-scene">
                <input type="text" class="cse-in cse-in--sched" bind:value={row.scene} placeholder="Scene"
                  onblur={() => onSceneBlur(i)} />
              </td>
              <td class="cse-sched-sets">
                <input type="text" class="cse-in cse-in--sched cse-in--sets-upper" bind:value={row.sets} placeholder="Sets" />
                <input type="text" class="cse-in cse-in--sched cse-in--sets-desc" bind:value={row.setsDesc} placeholder="Description" />
              </td>
              <td class="cse-sched-cast">
                <input type="text" class="cse-in cse-in--sched" bind:value={row.cast} placeholder="Cast" />
              </td>
              <td class="cse-sched-dn">
                <input type="text" class="cse-in cse-in--sched" bind:value={row.dn} placeholder="D/N" />
              </td>
              <td class="cse-sched-pages">
                <input type="text" class="cse-in cse-in--sched" bind:value={row.pages} placeholder="Pages" />
              </td>
              <td class="cse-sched-loc">
                <input type="text" class="cse-in cse-in--sched" bind:value={row.location} placeholder="Location" />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="cse-add-row-bar">
        <button class="cse-add-btn" onclick={addSchedRow}>+ Row</button>
      </div>

      <!-- Crew split: left crew + right contacts -->
      <div class="cse-crew-split">

        <!-- Left: crew -->
        <div class="cse-crew-left">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <table class="cse-crew cse-crew-tbl-left" onkeydown={handleTableKeydown}>
            <thead>
              <tr><th>Title</th><th>Name</th><th>Phone</th><th>Email</th><th>Report</th></tr>
            </thead>
            <tbody>
              {#each groupedCrew as group}
                <tr class="cse-section-row">
                  <td colspan="5" class="cse-section-label">{group.section}</td>
                </tr>
                {#each group.members as c, localIdx}
                  {@const globalIdx = s.crew.indexOf(c)}
                  <tr>
                    <td><input type="text" class="cse-in cse-in--crew" bind:value={c.position} placeholder="Title" /></td>
                    <td><input type="text" class="cse-in cse-in--crew" bind:value={c.name} placeholder="Name" /></td>
                    <td><input type="text" class="cse-in cse-in--crew" bind:value={c.phone} placeholder="Phone" /></td>
                    <td><input type="text" class="cse-in cse-in--crew" bind:value={c.email} placeholder="Email" /></td>
                    <td class="cse-calltd">
                      <input type="text" class="cse-in cse-in--call" bind:value={c.callLoc} placeholder="Loc" />
                      <input type="text" class="cse-in cse-in--call" bind:value={c.callTime} placeholder="Time" />
                      <button type="button" class="cse-row-del" onclick={() => deleteCrewRow(globalIdx)} title="Remove">✕</button>
                    </td>
                  </tr>
                {/each}
              {/each}
            </tbody>
          </table>
          <div class="cse-add-row-bar">
            <button class="cse-add-btn" onclick={addCrewRow}>+ Crew</button>
          </div>
        </div>

        <!-- Right: client, agency, talent, vendors -->
        <div class="cse-crew-right">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <table class="cse-crew cse-crew-tbl-right" onkeydown={handleTableKeydown}>
            <thead>
              <tr><th>Title</th><th>Name</th><th></th><th>Email</th><th>Report</th></tr>
            </thead>
            <tbody>
              {#if s.clientContacts?.length}
                <tr class="cse-section-row">
                  <td colspan="5" class="cse-section-label cse-right-section">CLIENT</td>
                </tr>
                {#each s.clientContacts as c, i}
                  <tr>
                    <td><input type="text" class="cse-in" bind:value={c.title} placeholder="Title" /></td>
                    <td colspan="2"><input type="text" class="cse-in" bind:value={c.name} placeholder="Name" /></td>
                    <td><input type="text" class="cse-in" bind:value={c.email} placeholder="Email" /></td>
                    <td class="cse-calltd">
                      <input type="text" class="cse-in cse-in--call" bind:value={c.callLoc} placeholder="Loc" />
                      <input type="text" class="cse-in cse-in--call" bind:value={c.callTime} placeholder="Time" />
                      <button type="button" class="cse-row-del" onclick={() => deleteContact('client', i)} title="Remove">✕</button>
                    </td>
                  </tr>
                {/each}
              {/if}

              {#if s.agencyContacts?.length}
                <tr class="cse-section-row">
                  <td colspan="5" class="cse-section-label cse-right-section">AGENCY</td>
                </tr>
                {#each s.agencyContacts as a, i}
                  <tr>
                    <td><input type="text" class="cse-in" bind:value={a.title} placeholder="Title" /></td>
                    <td colspan="2"><input type="text" class="cse-in" bind:value={a.name} placeholder="Name" /></td>
                    <td><input type="text" class="cse-in" bind:value={a.email} placeholder="Email" /></td>
                    <td class="cse-calltd">
                      <input type="text" class="cse-in cse-in--call" bind:value={a.callLoc} placeholder="Loc" />
                      <input type="text" class="cse-in cse-in--call" bind:value={a.callTime} placeholder="Time" />
                      <button type="button" class="cse-row-del" onclick={() => deleteContact('agency', i)} title="Remove">✕</button>
                    </td>
                  </tr>
                {/each}
              {/if}

              {#if s.talentContacts?.length}
                <tr class="cse-section-row">
                  <td colspan="5" class="cse-section-label cse-right-section">TALENT</td>
                </tr>
                {#each s.talentContacts as t, i}
                  <tr>
                    <td><input type="text" class="cse-in" bind:value={t.title} placeholder="#. Role" /></td>
                    <td colspan="2"><input type="text" class="cse-in" bind:value={t.name} placeholder="Name" /></td>
                    <td><input type="text" class="cse-in" bind:value={t.email} placeholder="Email" /></td>
                    <td class="cse-calltd">
                      <input type="text" class="cse-in cse-in--call" bind:value={t.callLoc} placeholder="Loc" />
                      <input type="text" class="cse-in cse-in--call" bind:value={t.callTime} placeholder="Time" />
                      <button type="button" class="cse-row-del" onclick={() => deleteContact('talent', i)} title="Remove">✕</button>
                    </td>
                  </tr>
                {/each}
              {/if}

              {#if s.vendors?.length}
                <tr class="cse-section-row">
                  <td colspan="5" class="cse-section-label cse-right-section">VENDORS</td>
                </tr>
                {#each s.vendors as v, i}
                  <tr>
                    <td>
                      <select class="cse-select cse-vendor-select" style="font-size:8px;max-width:100%;width:100%;"
                        onchange={(e) => onVendorPick(i, e.target.value)}>
                        <option value="">Select vendor…</option>
                        {#each allVendors as vend}
                          <option value={vend.name}>{vend.name}{vend.type ? ` (${vend.type})` : ''}</option>
                        {/each}
                      </select>
                    </td>
                    <td><input type="text" class="cse-in" bind:value={v.company} placeholder="Company" /></td>
                    <td><input type="text" class="cse-in" bind:value={v.contact} placeholder="Contact" /></td>
                    <td><input type="text" class="cse-in" bind:value={v.email} placeholder="Email" /></td>
                    <td class="cse-calltd">
                      <input type="text" class="cse-in cse-in--call" bind:value={v.callLoc} placeholder="Loc" />
                      <input type="text" class="cse-in cse-in--call" bind:value={v.callTime} placeholder="Time" />
                      <button type="button" class="cse-row-del" onclick={() => deleteContact('vendor', i)} title="Remove">✕</button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>

          <div class="cse-add-row-bar">
            <button class="cse-add-btn" onclick={() => addContact('client')}>+ Client</button>
            <button class="cse-add-btn" onclick={() => addContact('agency')}>+ Agency</button>
            <button class="cse-add-btn" onclick={() => addContact('talent')}>+ Talent</button>
            <button class="cse-add-btn" onclick={() => addContact('vendor')}>+ Vendor</button>
          </div>

          <!-- Production report -->
          <div class="cse-report">
            <span class="cse-report-label">PRODUCTION REPORT:</span>
            <div class="cse-report-cols">
              <div class="cse-report-col">
                <div class="cse-report-row"><span class="cse-report-field-label">1ST AM SHOT:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.report1stAM} placeholder="_________" /></div>
                <div class="cse-report-row"><span class="cse-report-field-label">1ST PM SHOT:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.report1stPM} placeholder="_________" /></div>
                <div class="cse-report-row"><span class="cse-report-field-label">CAMERA WRAP:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.reportCameraWrap} placeholder="_________" /></div>
              </div>
              <div class="cse-report-col">
                <div class="cse-report-row"><span class="cse-report-field-label">LUNCH:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.reportLunch} placeholder="_________" /></div>
                <div class="cse-report-row"><span class="cse-report-field-label">2ND MEAL:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.report2ndMeal} placeholder="_________" /></div>
                <div class="cse-report-row"><span class="cse-report-field-label">CREW WRAP:</span> <input type="text" class="cse-in cse-in--crew" bind:value={s.reportCrewWrap} placeholder="_________" /></div>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="cse-notes">
            <span class="cse-notes-label">NOTES</span><br>
            <textarea class="cse-notes-input" rows="2" bind:value={s.notes} placeholder="Additional notes..."></textarea>
          </div>
        </div>
      </div><!-- end .cse-crew-split -->

      <div class="cse-footer">**CALL SHEETS ARE CONFIDENTIAL AND NOT FOR REDISTRIBUTION OUTSIDE OF THE PRODUCTION**</div>

    </div><!-- end .cse-page -->
  </div><!-- end .cse-page-wrap -->

<!-- ══════════════════════ EMAIL TEMPLATE VIEW ══════════════════════ -->
{:else if view === 'email'}
  <section class="cs-section">
    <div class="cs-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
      <div>
        <h2 class="cs-title">Call Sheet Email Template</h2>
        <p class="cs-subtitle">Design a reusable email body. Click a token to insert it at the cursor.</p>
      </div>
      <button class="btn btn--sm" onclick={() => { view = 'main'; }}
        style="font-size:11px;padding:4px 10px;background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);margin-top:4px;">← Back</button>
    </div>

    <div class="cse-token-bar">
      <span class="cse-token-label">Insert Token:</span>
      {#each EMAIL_TOKENS as t}
        <button class="cse-token-pill" onclick={() => insertToken(t.token)}>{t.label}</button>
      {/each}
    </div>

    <div class="cse-editor-wrap">
      <div class="cse-editor-col">
        <div class="cse-col-header">Template Editor</div>
        <textarea
          bind:this={emailTextarea}
          bind:value={emailTemplate}
          class="cse-template-input"
          spellcheck="false"
        ></textarea>
      </div>
      <div class="cse-preview-col">
        <div class="cse-col-header">
          Preview <span class="cse-preview-date">({_formatDate(activeDate) || activeDate || 'no date'})</span>
        </div>
        <div class="cse-preview">{emailPreview}</div>
      </div>
    </div>

    <div class="cse-actions">
      <button class="btn btn--primary btn--sm" onclick={saveEmailTemplate}>{emailSavedMsg || 'Save Template'}</button>
      <button class="btn btn--sm" onclick={copyResolvedEmail}
        style="background:var(--bg-elevated);color:var(--text-secondary);border:1px solid var(--border);">
        {emailCopiedMsg || 'Copy Resolved Email'}
      </button>
      <button class="btn btn--sm btn--danger-text" onclick={resetEmailTemplate} style="margin-left:auto;">Reset to Default</button>
    </div>
  </section>
{/if}

<style>
  :global(body) { }
</style>
