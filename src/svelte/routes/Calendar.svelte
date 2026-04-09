<script>
  import { onMount } from 'svelte';

  const PROJECT_KEY  = 'movie-ledger-project';
  const CALENDAR_KEY = 'movie-ledger-calendar';
  const ACCT_CAL_KEY = 'movie-ledger-calendar-accounting';
  const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
  const CREW_KEY     = 'movie-ledger-crew';
  const CAL_TZ_KEY   = 'movie-ledger-cal-tz';

  let container;

  // Module state (imperative)
  let _events    = {};
  let _dayTypes  = {};
  let _viewYear  = 0;
  let _viewMonth = 0;
  let _startDate = null;
  let _wrapDate  = null;
  let _timezone  = '';
  let _selectedDayKey = null;
  let _calMode   = 'production';

  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAY_TYPE_OPTS = [
    { value: '',      label: 'None' },
    { value: 'prep',  label: 'Prep' },
    { value: 'shoot', label: 'Shoot' },
    { value: 'hold',  label: 'Hold' },
    { value: 'wrap',  label: 'Wrap' },
  ];

  /* ── Persistence ── */
  function _loadAll() {
    const evKey = _calMode === 'accounting' ? ACCT_CAL_KEY : CALENDAR_KEY;
    try { _events   = JSON.parse(localStorage.getItem(evKey))  || {}; } catch { _events   = {}; }
    try { _dayTypes = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { _dayTypes = {}; }
    _timezone = localStorage.getItem(CAL_TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    try {
      const proj = JSON.parse(localStorage.getItem(PROJECT_KEY));
      _startDate = _parseDate(proj?.startDate);
      _wrapDate  = _parseDate(proj?.wrapDate);
    } catch { _startDate = null; _wrapDate = null; }
  }
  function _saveEvents()   { localStorage.setItem(_calMode === 'accounting' ? ACCT_CAL_KEY : CALENDAR_KEY, JSON.stringify(_events)); }
  function _saveDayTypes() { localStorage.setItem(DAYTYPES_KEY, JSON.stringify(_dayTypes)); }
  function _saveTZ()       { localStorage.setItem(CAL_TZ_KEY, _timezone); }

  /* ── Helpers ── */
  function _parseDate(str) {
    if (!str) return null;
    const d = new Date(str + 'T00:00:00');
    return isNaN(d) ? null : d;
  }
  function _uid()   { return Math.random().toString(36).slice(2, 10); }
  function _key(d)  { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function _esc(s)  { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return _key(d);
  }
  function _isShootRange(dk) {
    if (!_startDate || !_wrapDate) return false;
    return dk >= _key(_startDate) && dk <= _key(_wrapDate);
  }
  function _getCrewNames() {
    try {
      const data = JSON.parse(localStorage.getItem(CREW_KEY)) || [];
      const names = [];
      data.forEach(sec => (sec.rows || []).forEach(r => { if (r.name?.trim()) names.push(r.name.trim()); }));
      return [...new Set(names)].sort();
    } catch { return []; }
  }
  function _tzAbbrev() {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: _timezone, timeZoneName: 'short' });
      const tzPart = fmt.formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      return tzPart?.value || '';
    } catch { return ''; }
  }
  function _sortEvents(evts) {
    return [...evts].sort((a, b) => {
      const aM = a.allDay && a.endDate, bM = b.allDay && b.endDate;
      if (aM && !bM) return -1; if (!aM && bM) return 1;
      if (a.allDay && !b.allDay) return -1; if (!a.allDay && b.allDay) return 1;
      return (a.time || '').localeCompare(b.time || '');
    });
  }
  function _buildSpanMap() {
    const spanMap = {};
    for (const [originDk, evList] of Object.entries(_events)) {
      for (const ev of evList) {
        if (ev.allDay && ev.endDate && ev.endDate > originDk) {
          let cur = originDk;
          while (cur <= ev.endDate) {
            if (!spanMap[cur]) spanMap[cur] = [];
            let seg = 'mid';
            if (cur === originDk && cur === ev.endDate) seg = 'only';
            else if (cur === originDk) seg = 'start';
            else if (cur === ev.endDate) seg = 'end';
            spanMap[cur].push({ ev, originDk, segment: seg });
            cur = _addDays(cur, 1);
          }
        }
      }
    }
    return spanMap;
  }

  /* ── TZ options ── */
  function _buildTZOptions() {
    const zones = [
      'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'America/Anchorage','Pacific/Honolulu','America/Phoenix',
      'Europe/London','Europe/Paris','Europe/Berlin',
      'Asia/Tokyo','Asia/Shanghai','Asia/Kolkata',
      'Australia/Sydney','Pacific/Auckland',
    ];
    return zones.map(z => {
      let timeStr = '';
      try { timeStr = new Date().toLocaleTimeString('en-US', { timeZone: z, hour: 'numeric', minute: '2-digit', hour12: true }); } catch {}
      const label = z.replace(/_/g,' ') + (timeStr ? ` (${timeStr})` : '');
      return `<option value="${z}"${z === _timezone ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  /* ── Render ── */
  function _render() {
    if (!container) return;
    const todayKey = _key(new Date());
    const startKey = _startDate ? _key(_startDate) : null;
    const wrapKey  = _wrapDate  ? _key(_wrapDate)  : null;

    const firstDay    = new Date(_viewYear, _viewMonth, 1);
    const startDow    = firstDay.getDay();
    const daysInMonth = new Date(_viewYear, _viewMonth + 1, 0).getDate();

    const dayHeaders = DAY_NAMES.map(d => `<th class="cal-dow">${d}</th>`).join('');
    const spanMap    = _buildSpanMap();

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<td class="cal-cell cal-cell--empty"></td>';

    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(_viewYear, _viewMonth, day);
      const dk = _key(dt);
      const isToday = dk === todayKey;
      const isStart = dk === startKey;
      const isWrap  = dk === wrapKey;
      const dtype   = _dayTypes[dk] || '';

      const localEvts  = _sortEvents(_events[dk] || []);
      const spans      = spanMap[dk] || [];

      let cls = 'cal-cell';
      if (isToday) cls += ' cal-cell--today';
      if (isStart) cls += ' cal-cell--start';
      if (isWrap)  cls += ' cal-cell--wrap';
      if (dtype === 'prep')       cls += ' cal-cell--prep';
      else if (dtype === 'shoot') cls += ' cal-cell--shoot';
      else if (dtype === 'hold')  cls += ' cal-cell--hold';
      else if (dtype === 'wrap')  cls += ' cal-cell--wrap-day';
      else if (_isShootRange(dk)) cls += ' cal-cell--shoot';

      const dotHTML = dtype ? `<span class="cal-daytype-dot cal-daytype-dot--${dtype}"></span>` : '';

      const spanHTML = spans.map(s => {
        const segCls   = `cal-span cal-span--${s.segment}`;
        const showLabel = s.segment === 'start' || s.segment === 'only';
        const showDel   = s.segment === 'start' || s.segment === 'only';
        return `<div class="${segCls}" data-dk="${s.originDk}" data-eid="${s.ev.id}" title="${_esc(s.ev.text||'Event')}${s.ev.location?'\n'+s.ev.location:''}">
          ${showLabel ? `<span class="cal-span-text">${_esc(s.ev.text||'Event')}</span>` : ''}
          ${showDel   ? `<button class="cal-event-del" data-dk="${s.originDk}" data-eid="${s.ev.id}" title="Remove">✕</button>` : ''}
        </div>`;
      }).join('');

      const multiDayIds = new Set(spans.map(s => s.ev.id));
      const regularEvts = localEvts.filter(ev => !multiDayIds.has(ev.id));

      const eventsHTML = regularEvts.map(ev => {
        const evCls   = ev.type ? ` cal-event--${ev.type === 'wrap' ? 'wrap-ev' : ev.type}` : '';
        const timeStr = ev.allDay ? 'ALL DAY' : (ev.time || '');
        const timeBadge = timeStr ? `<span class="cal-event-time">${_esc(timeStr)}</span>` : '';
        return `<div class="cal-event${evCls}" data-dk="${dk}" data-eid="${ev.id}" title="${_esc((ev.location||'')+(ev.info?'\n'+ev.info:''))}">
          ${timeBadge}<span class="cal-event-text">${_esc(ev.text||'Event')}</span>
          <button class="cal-event-del" data-dk="${dk}" data-eid="${ev.id}" title="Remove">✕</button>
        </div>`;
      }).join('');

      const badges = [];
      if (isStart) badges.push('<span class="cal-badge cal-badge--start">PP START</span>');
      if (isWrap)  badges.push('<span class="cal-badge cal-badge--wrap">EST. WRAP</span>');

      cells += `<td class="${cls}" data-dk="${dk}">
        <div class="cal-day-header">
          <span class="cal-day-num" data-dk="${dk}" title="Click to set day type">${day}</span>${dotHTML}
          ${badges.join('')}
        </div>
        <div class="cal-events">${spanHTML}${eventsHTML}</div>
        <button class="cal-add-btn" data-dk="${dk}" title="Add event">+</button>
      </td>`;

      if (dt.getDay() === 6 && day < daysInMonth) cells += '</tr><tr>';
    }
    const lastDow = new Date(_viewYear, _viewMonth, daysInMonth).getDay();
    for (let i = lastDow + 1; i <= 6; i++) cells += '<td class="cal-cell cal-cell--empty"></td>';

    const startFmt = _startDate ? _startDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';
    const wrapFmt  = _wrapDate  ? _wrapDate.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})  : '—';
    const tzAbr    = _tzAbbrev();

    container.innerHTML = `
      <section class="cal-section">
        <div class="cal-mode-bar">
          <button class="btn btn--sm ${_calMode==='production'?'btn--primary':'btn--ghost'}" id="cal-mode-prod">Production Calendar</button>
          <button class="btn btn--sm ${_calMode==='accounting'?'btn--primary':'btn--ghost'}" id="cal-mode-acct">Accounting Calendar</button>
        </div>
        <h2 class="cal-title">${_calMode==='accounting'?'Accounting':'Production'} Calendar</h2>
        <div class="cal-info-bar">
          <span class="cal-info-item"><strong>Principal Photography Start:</strong> ${startFmt}</span>
          <span class="cal-info-item"><strong>Estimated Wrap:</strong> ${wrapFmt}</span>
          <span class="cal-info-item">
            <strong>Time Zone:</strong>
            <select class="cal-tz-select" id="cal-tz">${_buildTZOptions()}</select>
            ${tzAbr?`<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">(${tzAbr})</span>`:''}
          </span>
        </div>
        <div class="cal-nav">
          <button class="btn btn--ghost btn--sm" id="cal-prev">←</button>
          <span class="cal-month-label">${MONTH_NAMES[_viewMonth]} ${_viewYear}</span>
          <button class="btn btn--ghost btn--sm" id="cal-next">→</button>
          <button class="btn btn--ghost btn--sm" id="cal-today">Today</button>
        </div>
        <div class="cal-grid-wrap">
          <table class="cal-grid">
            <thead><tr>${dayHeaders}</tr></thead>
            <tbody><tr>${cells}</tr></tbody>
          </table>
        </div>
        <div class="cal-legend">
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--prep"></span>Prep</span>
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--shoot"></span>Shoot</span>
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--hold"></span>Hold</span>
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--wrap-day"></span>Wrap</span>
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--start"></span>PP Start</span>
          <span class="cal-legend-item"><span class="cal-legend-swatch cal-legend--today"></span>Today</span>
          <button class="btn btn--ghost btn--sm" id="cal-gen-prep" style="margin-left:auto;">Generate Prep Schedule</button>
        </div>
        <div class="cal-day-panel${_selectedDayKey?' cal-day-panel--open':''}" id="cal-day-panel">
          ${_selectedDayKey ? _buildDayPanel(_selectedDayKey) : ''}
        </div>
      </section>
    `;

    _attachListeners();
  }

  /* ── Listeners ── */
  function _attachListeners() {
    container.querySelector('#cal-mode-prod')?.addEventListener('click', () => {
      if (_calMode === 'production') return;
      _calMode = 'production'; _selectedDayKey = null; _loadAll(); _render();
    });
    container.querySelector('#cal-mode-acct')?.addEventListener('click', () => {
      if (_calMode === 'accounting') return;
      _calMode = 'accounting'; _selectedDayKey = null; _loadAll(); _render();
    });
    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      _viewMonth--; if (_viewMonth < 0) { _viewMonth = 11; _viewYear--; } _render();
    });
    container.querySelector('#cal-next')?.addEventListener('click', () => {
      _viewMonth++; if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; } _render();
    });
    container.querySelector('#cal-today')?.addEventListener('click', () => {
      const now = new Date(); _viewYear = now.getFullYear(); _viewMonth = now.getMonth(); _render();
    });
    container.querySelector('#cal-tz')?.addEventListener('change', e => {
      _timezone = e.target.value; _saveTZ(); _render();
    });
    container.querySelector('#cal-gen-prep')?.addEventListener('click', () => {
      localStorage.setItem('movie-ledger-auto-prep', '1');
      window.location.hash = '#schedules';
    });

    // Day number → day-type popup
    container.querySelectorAll('.cal-day-num').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); _showDayTypePopup(el.dataset.dk, el); });
    });
    // Add event
    container.querySelectorAll('.cal-add-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _showEventPrompt(btn.dataset.dk, null); });
    });
    // Edit event (regular)
    container.querySelectorAll('.cal-event').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.cal-event-del')) return;
        e.stopPropagation();
        const { dk, eid } = el.dataset;
        const ev = (_events[dk] || []).find(v => v.id === eid);
        if (ev) _showEventPrompt(dk, ev);
      });
    });
    // Edit event (span bar)
    container.querySelectorAll('.cal-span').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.cal-event-del')) return;
        e.stopPropagation();
        const { dk, eid } = el.dataset;
        const ev = (_events[dk] || []).find(v => v.id === eid);
        if (ev) _showEventPrompt(dk, ev);
      });
    });
    // Hover tooltip
    container.querySelectorAll('.cal-event, .cal-span').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const { dk, eid } = el.dataset;
        const ev = (_events[dk] || []).find(e => e.id === eid);
        if (!ev) return;
        const tip = document.createElement('div');
        tip.className = 'cal-hover-tooltip';
        const lines = [];
        lines.push(`<strong>${_esc(ev.text || 'Event')}</strong>`);
        lines.push(ev.allDay ? 'ALL DAY' : (ev.time || ''));
        if (ev.location) lines.push(ev.location);
        if (ev.address)  lines.push(ev.address);
        if (ev.info)     lines.push(ev.info);
        if (ev.attendees?.length) lines.push('Attendees: ' + ev.attendees.join(', '));
        tip.innerHTML = lines.filter(Boolean).join('<br>');
        el.style.position = 'relative';
        tip.style.bottom = '100%';
        tip.style.left = '0';
        el.appendChild(tip);
      });
      el.addEventListener('mouseleave', () => { el.querySelector('.cal-hover-tooltip')?.remove(); });
    });
    // Delete event
    container.querySelectorAll('.cal-event-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const { dk, eid } = btn.dataset;
        if (!_events[dk]) return;
        _events[dk] = _events[dk].filter(ev => ev.id !== eid);
        if (_events[dk].length === 0) delete _events[dk];
        _saveEvents(); _render();
      });
    });
    // Day cell click → day panel
    container.querySelectorAll('.cal-cell[data-dk]').forEach(cell => {
      cell.addEventListener('click', e => {
        if (e.target.closest('.cal-add-btn, .cal-event, .cal-span, .cal-day-num, .cal-prompt, .cal-daytype-popup')) return;
        _selectedDayKey = cell.dataset.dk;
        _updateDayPanel();
      });
    });
    // Day panel close
    const panel = container.querySelector('#cal-day-panel');
    if (panel && _selectedDayKey) {
      panel.querySelector('#cal-day-panel-close')?.addEventListener('click', () => {
        _selectedDayKey = null; _updateDayPanel();
      });
    }
  }

  /* ── Day-type popup ── */
  function _showDayTypePopup(dk, anchorEl) {
    _closePopups();
    const cell = anchorEl.closest('.cal-cell');
    if (!cell) return;
    const current = _dayTypes[dk] || '';
    const popup = document.createElement('div');
    popup.className = 'cal-daytype-popup';
    popup.addEventListener('click', e => e.stopPropagation());
    popup.innerHTML = DAY_TYPE_OPTS.map(opt =>
      `<label><input type="radio" name="daytype-${dk}" value="${opt.value}"${opt.value===current?' checked':''}> ${opt.label}</label>`
    ).join('');
    cell.style.position = 'relative';
    cell.appendChild(popup);
    popup.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value) _dayTypes[dk] = radio.value; else delete _dayTypes[dk];
        _saveDayTypes(); popup.remove(); _render();
      });
    });
    const closer = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closer); } };
    setTimeout(() => document.addEventListener('click', closer), 0);
  }

  /* ── Rich event prompt ── */
  function _showEventPrompt(dk, existingEv) {
    _closePopups();
    const cell = container.querySelector(`.cal-cell[data-dk="${dk}"]`);
    if (!cell) return;
    const isEdit = !!existingEv;
    const crewNames = _getCrewNames();
    let attendees = isEdit ? [...(existingEv.attendees || [])] : [];

    const prompt = document.createElement('div');
    prompt.className = 'cal-prompt';
    prompt.addEventListener('click', e => e.stopPropagation());

    const checkedType   = isEdit ? (existingEv.type || '') : '';
    const isAllDayInit  = isEdit && existingEv.allDay;
    const hasEndDate    = isEdit && existingEv.endDate;

    prompt.innerHTML = `
      <div class="cal-prompt-row">
        <div style="flex:0 0 auto;">
          <div class="cal-prompt-label">Time *</div>
          <input class="cal-prompt-field cal-prompt-field--time" type="time" id="cal-ev-time"
            value="${isEdit?_esc(existingEv.time||''):''}"${isAllDayInit?' disabled':''}>
        </div>
        <div style="flex:0 0 auto;display:flex;align-items:flex-end;">
          <label style="font-size:10px;cursor:pointer;display:flex;align-items:center;gap:3px;">
            <input type="checkbox" id="cal-ev-allday"${isAllDayInit?' checked':''}> All Day
          </label>
        </div>
      </div>
      <div class="cal-prompt-row cal-prompt-enddate-row"${!isAllDayInit?' style="display:none"':''}>
        <div style="flex:1;">
          <div class="cal-prompt-label">End Date (leave blank for single day)</div>
          <input class="cal-prompt-field" type="date" id="cal-ev-enddate"
            value="${hasEndDate?_esc(existingEv.endDate):''}" min="${dk}">
        </div>
      </div>
      <div class="cal-prompt-row">
        <input class="cal-prompt-field" type="text" id="cal-ev-text" placeholder="Event name" maxlength="80"
          value="${isEdit?_esc(existingEv.text||''):''}">
      </div>
      <div class="cal-prompt-row">
        <input class="cal-prompt-field" type="text" id="cal-ev-location" placeholder="Location name"
          value="${isEdit?_esc(existingEv.location||''):''}">
      </div>
      <div class="cal-prompt-row">
        <input class="cal-prompt-field" type="text" id="cal-ev-address" placeholder="Location address"
          value="${isEdit?_esc(existingEv.address||''):''}">
      </div>
      <div class="cal-prompt-row">
        <input class="cal-prompt-field" type="text" id="cal-ev-info" placeholder="Info / notes"
          value="${isEdit?_esc(existingEv.info||''):''}">
      </div>
      <div class="cal-prompt-row cal-prompt-row--full">
        <div class="cal-prompt-label">Attendees</div>
        <div class="cal-attendee-wrap">
          <input class="cal-prompt-field" type="text" id="cal-ev-attendee" placeholder="Type a name..." autocomplete="off">
          <div class="cal-attendee-list" id="cal-attendee-tags"></div>
        </div>
      </div>
      <div class="cal-prompt-checks">
        <label><input type="checkbox" name="cal-ev-type" value="prep"${checkedType==='prep'?' checked':''}> Prep</label>
        <label><input type="checkbox" name="cal-ev-type" value="shoot"${checkedType==='shoot'?' checked':''}> Shoot</label>
        <label><input type="checkbox" name="cal-ev-type" value="wrap"${checkedType==='wrap'?' checked':''}> Wrap</label>
      </div>
      <div class="cal-prompt-actions">
        <button class="btn btn--primary btn--sm cal-prompt-save">${isEdit?'Save Changes':'Add Event'}</button>
        <button class="btn btn--ghost btn--sm cal-prompt-cancel">Cancel</button>
      </div>
    `;

    cell.style.position = 'relative';
    cell.appendChild(prompt);

    const timeInput    = prompt.querySelector('#cal-ev-time');
    const allDayCheck  = prompt.querySelector('#cal-ev-allday');
    const endDateRow   = prompt.querySelector('.cal-prompt-enddate-row');
    const endDateInput = prompt.querySelector('#cal-ev-enddate');
    const textInput    = prompt.querySelector('#cal-ev-text');
    const attendeeInput = prompt.querySelector('#cal-ev-attendee');
    const tagsWrap     = prompt.querySelector('#cal-attendee-tags');

    allDayCheck.addEventListener('change', () => {
      timeInput.disabled = allDayCheck.checked;
      endDateRow.style.display = allDayCheck.checked ? '' : 'none';
      if (!allDayCheck.checked) endDateInput.value = '';
    });

    function _renderAttendeeTags() {
      tagsWrap.innerHTML = attendees.map(n =>
        `<span class="cal-attendee-tag">${_esc(n)}<button data-att="${_esc(n)}">✕</button></span>`
      ).join('');
      tagsWrap.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          attendees = attendees.filter(a => a !== btn.dataset.att);
          _renderAttendeeTags();
        });
      });
    }
    function _addAttendee(name) {
      if (attendees.includes(name)) return;
      attendees.push(name);
      _renderAttendeeTags();
      attendeeInput.value = '';
      if (sugBox) { sugBox.remove(); sugBox = null; }
    }
    if (attendees.length) _renderAttendeeTags();

    let sugBox = null;
    attendeeInput.addEventListener('input', () => {
      const q = attendeeInput.value.trim().toLowerCase();
      if (sugBox) { sugBox.remove(); sugBox = null; }
      if (!q) return;
      const matches = crewNames.filter(n => n.toLowerCase().includes(q) && !attendees.includes(n)).slice(0, 8);
      if (!matches.length) return;
      sugBox = document.createElement('div');
      sugBox.className = 'cal-suggest-dropdown';
      matches.forEach(name => {
        const item = document.createElement('div');
        item.className = 'cal-suggest-item';
        item.textContent = name;
        item.addEventListener('mousedown', e => { e.preventDefault(); _addAttendee(name); });
        sugBox.appendChild(item);
      });
      attendeeInput.parentElement.appendChild(sugBox);
    });
    attendeeInput.addEventListener('blur', () => { setTimeout(() => { if (sugBox) { sugBox.remove(); sugBox = null; } }, 150); });
    attendeeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = attendeeInput.value.trim(); if (v) _addAttendee(v); }
    });

    const save = () => {
      const isAllDay = allDayCheck.checked;
      const time     = isAllDay ? '' : timeInput.value;
      if (!isAllDay && !time) { timeInput.focus(); return; }
      const text     = textInput.value.trim();
      const location = prompt.querySelector('#cal-ev-location').value.trim();
      const address  = prompt.querySelector('#cal-ev-address').value.trim();
      const info     = prompt.querySelector('#cal-ev-info').value.trim();
      const typeCheck = prompt.querySelector('input[name="cal-ev-type"]:checked');
      const type     = typeCheck ? typeCheck.value : '';
      const endDate  = isAllDay ? (endDateInput.value || '') : '';
      const evData   = { time, allDay: isAllDay, text: text||'Event', location, address, info, attendees: [...attendees], type };
      if (endDate && endDate > dk) evData.endDate = endDate; else delete evData.endDate;
      if (isEdit) {
        const dayEvts = _events[dk] || [];
        const idx = dayEvts.findIndex(ev => ev.id === existingEv.id);
        if (idx >= 0) { dayEvts[idx] = { ...dayEvts[idx], ...evData }; if (!evData.endDate) delete dayEvts[idx].endDate; }
      } else {
        if (!_events[dk]) _events[dk] = [];
        _events[dk].push({ id: _uid(), ...evData });
      }
      _saveEvents(); _render();
    };

    prompt.querySelector('.cal-prompt-save').addEventListener('click', e => { e.stopPropagation(); save(); });
    prompt.querySelector('.cal-prompt-cancel').addEventListener('click', e => { e.stopPropagation(); prompt.remove(); });
    textInput.focus();
  }

  /* ── Day panel ── */
  function _buildDayPanel(dk) {
    const d = new Date(dk + 'T00:00:00');
    const longDate = isNaN(d) ? dk : d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    const dtype    = _dayTypes[dk] || '';
    const dtypeBadge = dtype ? `<span class="cal-day-panel-badge cal-day-panel-badge--${dtype}">${dtype.charAt(0).toUpperCase()+dtype.slice(1)}</span>` : '';
    const localEvts = _sortEvents(_events[dk] || []);
    const spanEvts  = [];
    for (const [originDk, evList] of Object.entries(_events)) {
      for (const ev of evList) {
        if (ev.allDay && ev.endDate && ev.endDate >= dk && originDk <= dk && originDk !== dk)
          spanEvts.push(ev);
      }
    }
    const allEvts = [...spanEvts, ...localEvts];
    let eventsHTML = '';
    if (!allEvts.length) {
      eventsHTML = '<div class="cal-day-panel-empty">No events scheduled</div>';
    } else {
      eventsHTML = allEvts.map(ev => {
        const timeStr = ev.allDay ? 'ALL DAY' : (ev.time || '');
        const lines = [];
        lines.push(`<div class="cal-day-panel-ev-name">${_esc(ev.text||'Event')}</div>`);
        if (timeStr)         lines.push(`<div class="cal-day-panel-ev-time">${_esc(timeStr)}</div>`);
        if (ev.location)     lines.push(`<div class="cal-day-panel-ev-detail"><strong>Location:</strong> ${_esc(ev.location)}</div>`);
        if (ev.address)      lines.push(`<div class="cal-day-panel-ev-detail"><strong>Address:</strong> ${_esc(ev.address)}</div>`);
        if (ev.info)         lines.push(`<div class="cal-day-panel-ev-detail"><strong>Info:</strong> ${_esc(ev.info)}</div>`);
        if (ev.attendees?.length) lines.push(`<div class="cal-day-panel-ev-detail"><strong>Attendees:</strong> ${_esc(ev.attendees.join(', '))}</div>`);
        return `<div class="cal-day-panel-ev">${lines.join('')}</div>`;
      }).join('');
    }
    return `
      <div class="cal-day-panel-header">
        <span class="cal-day-panel-date">${longDate}</span>
        <button class="cal-day-panel-close" id="cal-day-panel-close" title="Close">&times;</button>
      </div>
      ${dtypeBadge}
      <div class="cal-day-panel-events">${eventsHTML}</div>
    `;
  }

  function _updateDayPanel() {
    const panel = container.querySelector('#cal-day-panel');
    if (!panel) return;
    if (_selectedDayKey) {
      panel.classList.add('cal-day-panel--open');
      panel.innerHTML = _buildDayPanel(_selectedDayKey);
      panel.querySelector('#cal-day-panel-close')?.addEventListener('click', () => {
        _selectedDayKey = null;
        panel.classList.remove('cal-day-panel--open');
        panel.innerHTML = '';
      });
    } else {
      panel.classList.remove('cal-day-panel--open');
      panel.innerHTML = '';
    }
  }

  function _closePopups() {
    container.querySelector('.cal-prompt')?.remove();
    container.querySelector('.cal-daytype-popup')?.remove();
  }

  onMount(() => {
    _loadAll();
    const anchor = _startDate || new Date();
    _viewYear  = anchor.getFullYear();
    _viewMonth = anchor.getMonth();
    _render();
  });
</script>

<div bind:this={container}></div>
