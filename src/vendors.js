/* ============================================================
   The Masterbook — vendors.js
   Vendor catalogue: track vendors by type, contact info, quotes,
   notes, and file subfolder links.
   ============================================================ */

const VENDORS_KEY = 'movie-ledger-vendors';

let _container = null;
let _vendors   = [];
let _editIdx   = null;   // index of vendor being edited, or null
let _sortKey   = null;   // 'type' or 'name'
let _sortAsc   = true;

/* ── Entry Point ── */
export function renderVendors(container) {
  _container = container;
  _load();
  _renderList();
}

/* ── Persistence ── */
function _load() {
  try { _vendors = JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; } catch { _vendors = []; }
}
function _save() {
  localStorage.setItem(VENDORS_KEY, JSON.stringify(_vendors));
}

/* ── Helpers ── */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formatPhone(val) {
  const d = val.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return val;
}

/* Build type list dynamically from saved vendors */
function _getUsedTypes() {
  const types = [];
  _vendors.forEach(v => {
    if (v.type?.trim() && !types.includes(v.type.trim())) types.push(v.type.trim());
  });
  return types.sort((a, b) => a.localeCompare(b));
}

/* ══════════════════════════════════════════════════════════════
   LIST VIEW — table of all vendors
   ══════════════════════════════════════════════════════════════ */
function _renderList() {
  _editIdx = null;

  // Build sorted index array so edit/delete still reference the original index
  const indices = _vendors.map((_, i) => i);
  if (_sortKey) {
    indices.sort((a, b) => {
      const va = (_vendors[a][_sortKey] || '').toLowerCase();
      const vb = (_vendors[b][_sortKey] || '').toLowerCase();
      const cmp = va.localeCompare(vb);
      return _sortAsc ? cmp : -cmp;
    });
  }

  const sortIcon = (key) => _sortKey === key ? (_sortAsc ? ' ▲' : ' ▼') : '';

  const rows = indices.map(i => { const v = _vendors[i]; return `
    <tr class="vnd-row" data-vnd-idx="${i}">
      <td class="vnd-type">${esc(v.type)}</td>
      <td class="vnd-name-cell">${esc(v.name)}</td>
      <td>${esc(v.contact)}</td>
      <td class="vnd-phone-cell">${esc(_formatPhone(v.phone || ''))}</td>
      <td>${esc(v.email)}</td>
      <td class="vnd-addr-cell" title="${esc(v.streetAddress || v.address || '')}${(v.streetAddress || v.address) && v.cityStateZip ? ', ' : ''}${esc(v.cityStateZip || '')}">${esc(v.streetAddress || v.address || '')}${(v.streetAddress || v.address) && v.cityStateZip ? '<br>' : ''}${esc(v.cityStateZip || '')}</td>
      <td class="vnd-quotes-cell">${v.quotes ? `<span class="vnd-tip-wrap" data-tip="${esc(v.quotes)}">${esc(v.quotes)}</span>` : ''}</td>
      <td class="vnd-notes-cell">${v.notes ? `<span class="vnd-tip-wrap" data-tip="${esc(v.notes)}">${esc(v.notes)}</span>` : ''}</td>
      <td class="vnd-folder-cell">
        <button class="btn btn--ghost btn--xs vnd-folder-btn" data-vnd-folder="${i}" title="Open vendor subfolder" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
        </button>
      </td>
      <td class="vnd-actions-cell">
        <button class="btn btn--ghost btn--xs" data-vnd-edit="${i}" title="Edit">✎</button>
        <button class="btn btn--ghost btn--xs btn--danger-text" data-vnd-del="${i}" title="Delete">✕</button>
      </td>
    </tr>`; }).join('');

  _container.innerHTML = `
    <section class="vnd-section">
      <div class="vnd-header">
        <div>
          <h2 class="vnd-title">Vendors</h2>
          <p class="vnd-subtitle">${_vendors.length} vendor${_vendors.length !== 1 ? 's' : ''} catalogued</p>
        </div>
        <div class="vnd-header-actions">
          <button class="btn btn--primary btn--sm" id="vnd-add-btn">+ Add Vendor</button>
        </div>
      </div>

      ${_vendors.length ? `
      <div class="vnd-table-wrap">
        <table class="vnd-table">
          <thead>
            <tr>
              <th class="vnd-th-type vnd-th--sortable" data-vnd-sort="type">Type${sortIcon('type')}</th>
              <th class="vnd-th-name vnd-th--sortable" data-vnd-sort="name">Vendor Name${sortIcon('name')}</th>
              <th class="vnd-th-contact">Primary Contact</th>
              <th class="vnd-th-phone">Phone</th>
              <th class="vnd-th-email">Email</th>
              <th class="vnd-th-addr">Address</th>
              <th class="vnd-th-quotes">Quotes</th>
              <th class="vnd-th-notes">Notes</th>
              <th class="vnd-th-folder"></th>
              <th class="vnd-th-actions"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `
      <div class="vnd-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" style="opacity:.3;margin-bottom:8px;">
          <path d="M3 21V8l9-6 9 6v13"/><path d="M9 21V12h6v9"/><rect x="1" y="8" width="22" height="3" rx="1"/>
        </svg>
        <p>No vendors yet. Click <strong>+ Add Vendor</strong> to get started.</p>
      </div>`}
    </section>`;

  // Wire events
  _container.querySelector('#vnd-add-btn').addEventListener('click', () => _renderForm(null));

  // Sort headers
  _container.querySelectorAll('[data-vnd-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.vndSort;
      if (_sortKey === key) { _sortAsc = !_sortAsc; }
      else { _sortKey = key; _sortAsc = true; }
      _renderList();
    });
  });

  _container.querySelectorAll('[data-vnd-edit]').forEach(btn => {
    btn.addEventListener('click', () => _renderForm(parseInt(btn.dataset.vndEdit)));
  });

  _container.querySelectorAll('[data-vnd-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.vndDel);
      const v = _vendors[idx];
      if (!confirm(`Delete vendor "${v.name || 'Untitled'}"?`)) return;
      _vendors.splice(idx, 1);
      _save();
      _renderList();
    });
  });

  // Row click to edit (except action buttons)
  _container.querySelectorAll('.vnd-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      _renderForm(parseInt(row.dataset.vndIdx));
    });
  });

  // Tooltips for Quotes / Notes
  _wireTooltips();
}

/* ── Tooltip for truncated cells ── */
let _tipEl = null;
function _wireTooltips() {
  _container.querySelectorAll('.vnd-tip-wrap').forEach(span => {
    span.addEventListener('mouseenter', (e) => {
      const text = span.dataset.tip;
      if (!text) return;
      if (!_tipEl) { _tipEl = document.createElement('div'); _tipEl.className = 'vnd-tooltip'; document.body.appendChild(_tipEl); }
      _tipEl.textContent = text;
      _tipEl.style.display = 'block';
      const rect = span.getBoundingClientRect();
      _tipEl.style.left = rect.left + 'px';
      _tipEl.style.top = (rect.bottom + 6) + 'px';
    });
    span.addEventListener('mouseleave', () => {
      if (_tipEl) _tipEl.style.display = 'none';
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   FORM VIEW — add / edit a single vendor
   ══════════════════════════════════════════════════════════════ */
function _renderForm(idx) {
  _editIdx = idx;
  const isNew = idx === null;
  const v = isNew ? { type:'', name:'', contact:'', phone:'', email:'', streetAddress:'', cityStateZip:'', quotes:'', notes:'' } : { ..._vendors[idx] };

  const usedTypes = _getUsedTypes();
  const typeOptions = usedTypes.map(t => `<option value="${esc(t)}">`).join('');

  _container.innerHTML = `
    <section class="vnd-section">
      <div class="vnd-header">
        <div>
          <h2 class="vnd-title">${isNew ? 'Add Vendor' : 'Edit Vendor'}</h2>
          <p class="vnd-subtitle">${isNew ? 'Fill in the vendor details below.' : `Editing: ${esc(v.name) || 'Untitled'}`}</p>
        </div>
        <div class="vnd-header-actions">
          <button class="btn btn--ghost btn--sm" id="vnd-cancel-btn">← Back</button>
        </div>
      </div>

      <div class="vnd-form">
        <!-- Two-column layout: left = identity/address, right = contact info -->
        <div class="vnd-form-row vnd-form-row--2col">
          <div class="vnd-field-group">
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-type">Type</label>
              <input id="vnd-type" class="vnd-input" type="text" list="vnd-type-list" value="${esc(v.type)}" placeholder="e.g. Camera, Catering..." autocomplete="off" />
              <datalist id="vnd-type-list">${typeOptions}</datalist>
            </div>
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-name">Vendor Name</label>
              <input id="vnd-name" class="vnd-input" type="text" value="${esc(v.name)}" placeholder="Company name" />
            </div>
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-street">Street Address</label>
              <input id="vnd-street" class="vnd-input" type="text" value="${esc(v.streetAddress)}" placeholder="123 Main St" />
            </div>
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-csz">City, State, Zip Code</label>
              <input id="vnd-csz" class="vnd-input" type="text" value="${esc(v.cityStateZip)}" placeholder="Los Angeles, CA 90001" />
            </div>
          </div>
          <div class="vnd-field-group">
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-contact">Primary Contact</label>
              <input id="vnd-contact" class="vnd-input" type="text" value="${esc(v.contact)}" placeholder="Contact name" />
            </div>
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-phone">Phone</label>
              <input id="vnd-phone" class="vnd-input" type="tel" value="${esc(v.phone)}" placeholder="(555) 555-5555" />
            </div>
            <div class="vnd-field">
              <label class="vnd-field-label" for="vnd-email">Email</label>
              <input id="vnd-email" class="vnd-input" type="email" value="${esc(v.email)}" placeholder="email@vendor.com" />
            </div>
          </div>
        </div>

        <!-- Quotes -->
        <div class="vnd-form-row">
          <div class="vnd-field">
            <label class="vnd-field-label" for="vnd-quotes">Quotes</label>
            <textarea id="vnd-quotes" class="vnd-input vnd-textarea" rows="3" placeholder="Pricing quotes, bid details, rate info...">${esc(v.quotes)}</textarea>
          </div>
        </div>

        <!-- Notes -->
        <div class="vnd-form-row">
          <div class="vnd-field">
            <label class="vnd-field-label" for="vnd-notes">Notes</label>
            <textarea id="vnd-notes" class="vnd-input vnd-textarea" rows="3" placeholder="Additional notes...">${esc(v.notes)}</textarea>
          </div>
        </div>

        <!-- Subfolder -->
        <div class="vnd-form-row vnd-form-row--folder">
          <div class="vnd-field">
            <label class="vnd-field-label">Vendor Subfolder</label>
            <button class="btn btn--ghost btn--sm vnd-folder-link" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              Open Subfolder
            </button>
            <span class="vnd-folder-note">File structure not yet configured</span>
          </div>
        </div>

        <div class="vnd-form-actions">
          <button class="btn btn--primary" id="vnd-save-btn">${isNew ? 'Add Vendor' : 'Save Changes'}</button>
          <button class="btn btn--ghost" id="vnd-cancel-btn2">Cancel</button>
          ${!isNew ? `<button class="btn btn--ghost btn--danger-text" id="vnd-delete-btn" style="margin-left:auto;">Delete Vendor</button>` : ''}
        </div>
      </div>
    </section>`;

  // Wire
  const cancelBtns = [_container.querySelector('#vnd-cancel-btn'), _container.querySelector('#vnd-cancel-btn2')];
  cancelBtns.forEach(b => b?.addEventListener('click', () => _renderList()));

  // Format phone on blur
  const phoneInput = _container.querySelector('#vnd-phone');
  phoneInput.addEventListener('blur', () => { phoneInput.value = _formatPhone(phoneInput.value.trim()); });

  _container.querySelector('#vnd-save-btn').addEventListener('click', () => {
    const data = {
      type:          _container.querySelector('#vnd-type').value,
      name:          _container.querySelector('#vnd-name').value.trim(),
      contact:       _container.querySelector('#vnd-contact').value.trim(),
      phone:         _formatPhone(_container.querySelector('#vnd-phone').value.trim()),
      email:         _container.querySelector('#vnd-email').value.trim(),
      streetAddress: _container.querySelector('#vnd-street').value.trim(),
      cityStateZip:  _container.querySelector('#vnd-csz').value.trim(),
      quotes:        _container.querySelector('#vnd-quotes').value.trim(),
      notes:         _container.querySelector('#vnd-notes').value.trim(),
    };

    if (!data.name) {
      _container.querySelector('#vnd-name').focus();
      _container.querySelector('#vnd-name').style.borderColor = 'var(--earth-red)';
      return;
    }

    if (isNew) {
      _vendors.push(data);
    } else {
      _vendors[idx] = data;
    }
    _save();
    _renderList();
  });

  if (!isNew) {
    _container.querySelector('#vnd-delete-btn')?.addEventListener('click', () => {
      if (!confirm(`Delete vendor "${v.name || 'Untitled'}"?`)) return;
      _vendors.splice(idx, 1);
      _save();
      _renderList();
    });
  }
}
