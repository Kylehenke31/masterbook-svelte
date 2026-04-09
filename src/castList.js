/* ============================================================
   The Masterbook — castList.js
   Cast Profiles — master-detail view.
   Each cast member has a full profile: headshot, names, sizes,
   contacts, hold/off days, terms, travel.
   ============================================================ */

const CAST_KEY = 'movie-ledger-cast';

const DEFAULT_SECTIONS = [
  'PRINCIPAL CAST', 'SUPPORTING CAST', 'DAY PLAYERS', 'BACKGROUND',
];

/* ── Module State ── */
let _container = null;
let _store     = null;   // { _version: 2, sections: [], profiles: {} }
let _activeId  = null;   // currently selected profile ID

/* ── Entry Point ── */
export function renderCastList(container) {
  _container = container;
  _load();
  _render();
}

/* ══════════════════════════════════════════════════════════════
   PERSISTENCE & MIGRATION
   ══════════════════════════════════════════════════════════════ */
function _load() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(CAST_KEY)); } catch { raw = null; }

  if (raw && raw._version === 2) {
    _store = raw;
  } else if (Array.isArray(raw) && raw.length > 0) {
    _store = _migrate(raw);
    _save();
  } else {
    _store = _defaultStore();
    _save();
  }

  // Ensure at least one profile is selected
  if (_activeId && !_store.profiles[_activeId]) _activeId = null;
  if (!_activeId) {
    for (const sec of _store.sections) {
      if (sec.memberIds.length > 0) { _activeId = sec.memberIds[0]; break; }
    }
  }
}

function _save() {
  localStorage.setItem(CAST_KEY, JSON.stringify(_store));
}

function _defaultStore() {
  return {
    _version: 2,
    sections: DEFAULT_SECTIONS.map(name => ({ sectionId: _uid(), sectionName: name, memberIds: [] })),
    profiles: {},
  };
}

function _migrate(oldData) {
  // Backup v1 data
  localStorage.setItem('movie-ledger-cast-v1-backup', JSON.stringify(oldData));

  const store = { _version: 2, sections: [], profiles: {} };

  oldData.forEach(sec => {
    const memberIds = [];
    (sec.rows || []).forEach(row => {
      // Skip completely blank rows
      if (!row.castNum && !row.role && !row.name) return;

      const id = row.id || _uid();
      store.profiles[id] = _blankProfile(id);
      const p = store.profiles[id];
      p.castNum = row.castNum || '';
      p.characterName = row.role || '';
      p.legalName = row.name || '';
      p.contacts.personal.phone = row.phone || '';
      p.contacts.personal.email = row.email || '';
      p.contacts.agency.company = row.rep || '';
      p.contacts.agency.name = row.agentName || '';
      p.contacts.agency.phone = row.agentPhone || '';
      p.contacts.agency.email = row.agentEmail || '';
      p.travel = row.travel || '';
      p.notes = row.notes || '';
      p.deal = row.deal || '';
      memberIds.push(id);
    });
    store.sections.push({
      sectionId: sec.sectionId || _uid(),
      sectionName: sec.sectionName || 'CAST',
      memberIds,
    });
  });

  return store;
}

function _blankProfile(id) {
  return {
    id: id || _uid(),
    castNum: '',
    characterName: '',
    stageName: '',
    legalName: '',
    headshot: null,
    terms: '',
    sizes: { hair:'', eyes:'', height:'', weight:'', chest:'', waist:'', inseam:'', suit:'', shoe:'', hat:'', additional:'' },
    holdDays: [],
    offDays: [],
    travel: '',
    contacts: {
      personal: { phone:'', email:'', address:'' },
      agency:   { company:'', name:'', phone:'', email:'', address:'' },
      manager:  { company:'', name:'', phone:'', email:'', address:'' },
    },
    notes: '',
    deal: '',
  };
}

/* ══════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════ */
function _render() {
  _container.innerHTML = `
    <div class="cast-inner">
      <div class="crew-toolbar">
        <div class="crew-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="cast-add-member">+ Add Cast Member</button>
          <button class="btn btn--ghost btn--sm" id="cast-add-section">+ Group</button>
        </div>
      </div>
      <div class="cp-layout">
        <div class="cp-sidebar" id="cp-sidebar">
          ${_buildSidebar()}
        </div>
        <div class="cp-detail" id="cp-detail">
          ${_activeId ? _buildProfile(_store.profiles[_activeId]) : '<div class="cp-empty">Select or add a cast member to view their profile.</div>'}
        </div>
      </div>
    </div>
  `;

  _attachListeners();
}

/* ── Sidebar ── */
function _buildSidebar() {
  let html = '';
  _store.sections.forEach(sec => {
    html += `<div class="cp-sec-group" data-secid="${sec.sectionId}">
      <div class="cp-sec-header">
        <span class="cp-sec-name" contenteditable="plaintext-only" data-secid="${sec.sectionId}">${_e(sec.sectionName)}</span>
        <button class="cp-sec-add" data-secid="${sec.sectionId}" title="Add to ${_e(sec.sectionName)}">+</button>
      </div>`;
    sec.memberIds.forEach(mid => {
      const p = _store.profiles[mid];
      if (!p) return;
      const isActive = mid === _activeId;
      const label = p.castNum ? `${p.castNum}. ${p.characterName || 'Untitled'}` : (p.characterName || 'Untitled');
      const thumb = p.headshot ? `<img class="cp-thumb" src="${p.headshot}" alt="" />` : '<div class="cp-thumb cp-thumb--empty"></div>';
      html += `<div class="cp-member-card${isActive ? ' cp-member-card--active' : ''}" data-mid="${mid}">
        ${thumb}
        <div class="cp-member-info">
          <div class="cp-member-char">${_e(label)}</div>
          <div class="cp-member-actor">${_e(p.legalName || p.stageName || '')}</div>
        </div>
        <button class="cp-member-del" data-mid="${mid}" title="Delete">\u2715</button>
      </div>`;
    });
    html += '</div>';
  });
  return html;
}

/* ── Profile Editor ── */
function _buildProfile(p) {
  if (!p) return '';

  const sizeCols = [
    [['hair','Hair'],['eyes','Eyes'],['height','Height'],['weight','Weight']],
    [['chest','Chest'],['waist','Waist'],['inseam','Inseam'],['suit','Suit']],
    [['shoe','Shoe'],['hat','Hat'],['additional','Addt.']],
  ];

  const sizeGrid = sizeCols.map(col =>
    `<div class="cp-size-col">${col.map(([k, lbl]) =>
      `<div class="cp-size-field">
        <label>${lbl}</label>
        <input type="text" data-size="${k}" value="${_e(p.sizes[k])}" />
      </div>`
    ).join('')}</div>`
  ).join('');

  const holdChips = (p.holdDays || []).map(d =>
    `<span class="cp-date-chip">${_fmtDateShort(d)}<button class="cp-chip-x" data-type="holdDays" data-date="${d}">\u2715</button></span>`
  ).join('') || '<span class="cp-chip-empty">None</span>';

  const offChips = (p.offDays || []).map(d =>
    `<span class="cp-date-chip cp-date-chip--off">${_fmtDateShort(d)}<button class="cp-chip-x" data-type="offDays" data-date="${d}">\u2715</button></span>`
  ).join('') || '<span class="cp-chip-empty">None</span>';

  return `
    <div class="cp-profile" data-pid="${p.id}">
      <!-- Top row: headshot + names -->
      <div class="cp-top-row">
        <div class="cp-headshot-wrap">
          <div class="cp-headshot" id="cp-headshot">
            ${p.headshot ? `<img src="${p.headshot}" alt="Headshot" />` : '<span class="cp-headshot-placeholder">Profile Picture<br>(Headshot)</span>'}
          </div>
          <input type="file" id="cp-headshot-input" accept="image/*" hidden />
          <button class="btn btn--ghost btn--sm cp-headshot-btn" id="cp-upload-btn">Upload</button>
          ${p.headshot ? '<button class="btn btn--ghost btn--sm cp-headshot-btn" id="cp-remove-headshot">Remove</button>' : ''}
        </div>
        <div class="cp-names-grid">
          <div class="cp-field">
            <label>Cast #</label>
            <input type="text" data-key="castNum" value="${_e(p.castNum)}" maxlength="6" style="width:60px;" />
          </div>
          <div class="cp-field">
            <label>Character Name</label>
            <input type="text" data-key="characterName" value="${_e(p.characterName)}" maxlength="35" class="cp-name-input" />
          </div>
          <div class="cp-field">
            <label>Stage Name</label>
            <input type="text" data-key="stageName" value="${_e(p.stageName)}" maxlength="35" class="cp-name-input" />
          </div>
          <div class="cp-field">
            <label>Legal Name</label>
            <input type="text" data-key="legalName" value="${_e(p.legalName)}" maxlength="35" class="cp-name-input" />
          </div>
        </div>
      </div>

      <!-- Sizes + Schedule side by side -->
      <div class="cp-mid-row">
        <div class="cp-card cp-card--half">
          <h4 class="cp-card-title">Sizes</h4>
          <div class="cp-sizes-grid">${sizeGrid}</div>
        </div>
        <div class="cp-card cp-card--half">
          <h4 class="cp-card-title">Schedule</h4>
          <div class="cp-date-section">
            <label>Hold Days</label>
            <div class="cp-chips" id="cp-hold-chips">${holdChips}</div>
            <div class="cp-date-add">
              <input type="date" id="cp-hold-date" />
              <button class="btn btn--ghost btn--sm" id="cp-add-hold">+ Add</button>
            </div>
          </div>
          <div class="cp-date-section" style="margin-top:10px;">
            <label>Off Days</label>
            <div class="cp-chips" id="cp-off-chips">${offChips}</div>
            <div class="cp-date-add">
              <input type="date" id="cp-off-date" />
              <button class="btn btn--ghost btn--sm" id="cp-add-off">+ Add</button>
            </div>
          </div>
          <div class="cp-field" style="margin-top:10px;">
            <label>Travel</label>
            <input type="text" data-key="travel" value="${_e(p.travel)}" />
          </div>
        </div>
      </div>

      <!-- Contacts -->
      <div class="cp-card">
        <h4 class="cp-card-title">Contacts</h4>
        <div class="cp-contacts-grid">
          <div class="cp-contact-col">
            <div class="cp-contact-heading">Personal</div>
            <div class="cp-field"><label>Phone</label><input type="tel" data-contact="personal.phone" value="${_e(p.contacts.personal.phone)}" /></div>
            <div class="cp-field"><label>Email</label><input type="email" data-contact="personal.email" value="${_e(p.contacts.personal.email)}" /></div>
            <div class="cp-field"><label>Address</label><input type="text" data-contact="personal.address" value="${_e(p.contacts.personal.address)}" /></div>
          </div>
          <div class="cp-contact-col">
            <div class="cp-contact-heading">Agency</div>
            <div class="cp-field"><label>Agency Co.</label><input type="text" data-contact="agency.company" value="${_e(p.contacts.agency.company)}" /></div>
            <div class="cp-field"><label>Agent Name</label><input type="text" data-contact="agency.name" value="${_e(p.contacts.agency.name)}" /></div>
            <div class="cp-field"><label>Phone</label><input type="tel" data-contact="agency.phone" value="${_e(p.contacts.agency.phone)}" /></div>
            <div class="cp-field"><label>Email</label><input type="email" data-contact="agency.email" value="${_e(p.contacts.agency.email)}" /></div>
            <div class="cp-field"><label>Address</label><input type="text" data-contact="agency.address" value="${_e(p.contacts.agency.address)}" /></div>
          </div>
          <div class="cp-contact-col">
            <div class="cp-contact-heading">Manager</div>
            <div class="cp-field"><label>Management Co.</label><input type="text" data-contact="manager.company" value="${_e(p.contacts.manager.company)}" /></div>
            <div class="cp-field"><label>Manager Name</label><input type="text" data-contact="manager.name" value="${_e(p.contacts.manager.name)}" /></div>
            <div class="cp-field"><label>Phone</label><input type="tel" data-contact="manager.phone" value="${_e(p.contacts.manager.phone)}" /></div>
            <div class="cp-field"><label>Email</label><input type="email" data-contact="manager.email" value="${_e(p.contacts.manager.email)}" /></div>
            <div class="cp-field"><label>Address</label><input type="text" data-contact="manager.address" value="${_e(p.contacts.manager.address)}" /></div>
          </div>
        </div>
      </div>

      <!-- Terms & Notes -->
      <div class="cp-card">
        <h4 class="cp-card-title">Additional</h4>
        <div class="cp-field"><label>Terms</label><textarea data-key="deal" rows="2">${_e(p.deal)}</textarea></div>
        <div class="cp-field" style="margin-top:6px;"><label>Notes</label><textarea data-key="notes" rows="3">${_e(p.notes)}</textarea></div>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ══════════════════════════════════════════════════════════════ */
function _attachListeners() {
  const sidebar = _container.querySelector('#cp-sidebar');
  const detail  = _container.querySelector('#cp-detail');

  /* Toolbar buttons */
  _container.querySelector('#cast-add-member')?.addEventListener('click', () => {
    const sec = _store.sections[0];
    if (!sec) return;
    _addMember(sec.sectionId);
  });

  _container.querySelector('#cast-add-section')?.addEventListener('click', () => {
    _store.sections.push({ sectionId: _uid(), sectionName: 'NEW GROUP', memberIds: [] });
    _save();
    _render();
  });

  /* Sidebar: select profile */
  sidebar.querySelectorAll('.cp-member-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.cp-member-del')) return;
      _activeId = card.dataset.mid;
      _render();
    });
  });

  /* Sidebar: delete profile */
  sidebar.querySelectorAll('.cp-member-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      const p = _store.profiles[mid];
      if (!confirm(`Delete ${p?.characterName || 'this cast member'}?`)) return;
      delete _store.profiles[mid];
      _store.sections.forEach(sec => {
        sec.memberIds = sec.memberIds.filter(id => id !== mid);
      });
      if (_activeId === mid) _activeId = null;
      _save();
      _load(); // re-pick active
      _render();
    });
  });

  /* Sidebar: add to section */
  sidebar.querySelectorAll('.cp-sec-add').forEach(btn => {
    btn.addEventListener('click', () => {
      _addMember(btn.dataset.secid);
    });
  });

  /* Sidebar: edit section name */
  sidebar.querySelectorAll('.cp-sec-name').forEach(el => {
    el.addEventListener('blur', () => {
      const sec = _store.sections.find(s => s.sectionId === el.dataset.secid);
      if (sec) { sec.sectionName = el.textContent.trim() || 'UNTITLED'; _save(); }
    });
  });

  /* Detail panel: auto-save fields */
  if (!_activeId || !_store.profiles[_activeId]) return;

  /* Text/select inputs */
  detail.querySelectorAll('input[data-key], textarea[data-key]').forEach(input => {
    input.addEventListener('blur', () => {
      const p = _store.profiles[_activeId];
      if (!p) return;
      p[input.dataset.key] = input.value;
      _save();
      _refreshSidebar();
    });
  });

  /* Size inputs */
  detail.querySelectorAll('input[data-size]').forEach(input => {
    input.addEventListener('blur', () => {
      const p = _store.profiles[_activeId];
      if (!p) return;
      p.sizes[input.dataset.size] = input.value;
      _save();
    });
  });

  /* Contact inputs */
  detail.querySelectorAll('input[data-contact]').forEach(input => {
    input.addEventListener('blur', () => {
      const p = _store.profiles[_activeId];
      if (!p) return;
      const [group, field] = input.dataset.contact.split('.');
      p.contacts[group][field] = input.value;
      _save();
    });
  });

  /* Headshot upload */
  const uploadBtn = detail.querySelector('#cp-upload-btn');
  const fileInput = detail.querySelector('#cp-headshot-input');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        // Resize to 200x200 max
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max = 200;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else       { w = Math.round(w * max / h); h = max; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const p = _store.profiles[_activeId];
          if (p) { p.headshot = canvas.toDataURL('image/jpeg', 0.7); _save(); _render(); }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* Remove headshot */
  detail.querySelector('#cp-remove-headshot')?.addEventListener('click', () => {
    const p = _store.profiles[_activeId];
    if (p) { p.headshot = null; _save(); _render(); }
  });

  /* Hold Days: add/remove */
  detail.querySelector('#cp-add-hold')?.addEventListener('click', () => {
    const input = detail.querySelector('#cp-hold-date');
    if (!input.value) return;
    const p = _store.profiles[_activeId];
    if (!p) return;
    if (!p.holdDays.includes(input.value)) {
      p.holdDays.push(input.value);
      p.holdDays.sort();
      _save(); _render();
    }
  });

  detail.querySelector('#cp-add-off')?.addEventListener('click', () => {
    const input = detail.querySelector('#cp-off-date');
    if (!input.value) return;
    const p = _store.profiles[_activeId];
    if (!p) return;
    if (!p.offDays.includes(input.value)) {
      p.offDays.push(input.value);
      p.offDays.sort();
      _save(); _render();
    }
  });

  detail.querySelectorAll('.cp-chip-x').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _store.profiles[_activeId];
      if (!p) return;
      const type = btn.dataset.type; // 'holdDays' | 'offDays'
      const date = btn.dataset.date;
      p[type] = p[type].filter(d => d !== date);
      _save(); _render();
    });
  });
}

/* ── Sidebar refresh without full re-render ── */
function _refreshSidebar() {
  const sidebar = _container.querySelector('#cp-sidebar');
  if (sidebar) sidebar.innerHTML = _buildSidebar();
  // Re-attach sidebar listeners only
  const sidebarEl = _container.querySelector('#cp-sidebar');
  sidebarEl.querySelectorAll('.cp-member-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.cp-member-del')) return;
      _activeId = card.dataset.mid;
      _render();
    });
  });
  sidebarEl.querySelectorAll('.cp-member-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mid = btn.dataset.mid;
      if (!confirm('Delete this cast member?')) return;
      delete _store.profiles[mid];
      _store.sections.forEach(sec => { sec.memberIds = sec.memberIds.filter(id => id !== mid); });
      if (_activeId === mid) _activeId = null;
      _save(); _load(); _render();
    });
  });
  sidebarEl.querySelectorAll('.cp-sec-add').forEach(btn => {
    btn.addEventListener('click', () => _addMember(btn.dataset.secid));
  });
  sidebarEl.querySelectorAll('.cp-sec-name').forEach(el => {
    el.addEventListener('blur', () => {
      const sec = _store.sections.find(s => s.sectionId === el.dataset.secid);
      if (sec) { sec.sectionName = el.textContent.trim() || 'UNTITLED'; _save(); }
    });
  });
}

/* ── Add member ── */
function _addMember(secId) {
  const sec = _store.sections.find(s => s.sectionId === secId);
  if (!sec) return;
  const profile = _blankProfile();
  _store.profiles[profile.id] = profile;
  sec.memberIds.push(profile.id);
  _activeId = profile.id;
  _save();
  _render();
}

/* ── Utilities ── */
function _uid() { return crypto.randomUUID(); }
function _e(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}
