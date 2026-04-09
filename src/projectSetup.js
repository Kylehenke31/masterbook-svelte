/* ============================================================
   The Masterbook — projectSetup.js
   Project configuration page — saved to localStorage under
   'movie-ledger-project'.
   ============================================================ */

import { getProject, saveProject } from './app.js';

/* ── Entry Point ── */
export function renderProjectSetup(container, onSave) {
  const project = getProject() ?? {};
  container.innerHTML = buildHTML(project);
  attachListeners(container, onSave);
}

/* ── HTML ── */
function buildHTML(p) {
  const v = (key, fallback = '') => esc(p[key] ?? fallback);
  const staff = p.staff ?? [];

  return `
    <section class="setup-section">
      <div class="setup-header">
        <div>
          <h2>Project Setup</h2>
          <p class="setup-subtitle">Configure your production details. All settings are stored locally on this device.</p>
        </div>
      </div>

      <form id="setup-form" novalidate autocomplete="off">

        <!-- ── Project Identity ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Project Identity</h3>
          <div class="form-grid">

            <div class="field field--full">
              <label for="sp-title">Project Title <span class="req">*</span></label>
              <input type="text" id="sp-title" name="title" value="${v('title')}"
                placeholder="Production title" maxlength="100" required />
              <span class="field-error" id="err-sp-title"></span>
            </div>

            <div class="field">
              <label for="sp-budget-template">Budget Type</label>
              <select id="sp-budget-template" name="budgetTemplate">
                <option value="commercial"${(p.budgetTemplate ?? 'commercial') === 'commercial' ? ' selected' : ''}>Commercial</option>
                <option value="feature"${p.budgetTemplate === 'feature' ? ' selected' : ''}>Feature/TV (coming soon)</option>
              </select>
            </div>

            <div class="field">
              <label for="sp-cs-template">Call Sheet Type</label>
              <select id="sp-cs-template" name="callSheetTemplate">
                <option value="commercial"${(p.callSheetTemplate ?? 'commercial') === 'commercial' ? ' selected' : ''}>Commercial</option>
                <option value="feature"${p.callSheetTemplate === 'feature' ? ' selected' : ''}>Feature/TV (coming soon)</option>
              </select>
            </div>

            <div class="field">
              <label for="sp-number">Production Number</label>
              <input type="text" id="sp-number" name="productionNumber" value="${v('productionNumber')}"
                placeholder="Production number or code" maxlength="30" />
            </div>

            <div class="field">
              <label for="sp-company">Production Company</label>
              <input type="text" id="sp-company" name="productionCompany" value="${v('productionCompany')}"
                placeholder="LLC or company name" maxlength="80" />
            </div>

            <div class="field">
              <label for="sp-director">Director</label>
              <input type="text" id="sp-director" name="director" value="${v('director')}"
                placeholder="Director full name" maxlength="80" />
            </div>

            <div class="field">
              <label for="sp-producer">Producer</label>
              <input type="text" id="sp-producer" name="producer" value="${v('producer')}"
                placeholder="Producer full name" maxlength="80" />
            </div>

          </div>
        </div>

        <!-- ── Schedule ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Schedule</h3>
          <div class="form-grid">

            <div class="field">
              <label for="sp-start">Principal Photography Start</label>
              <input type="date" id="sp-start" name="startDate" value="${v('startDate')}" />
            </div>

            <div class="field">
              <label for="sp-wrap">Estimated Wrap Date</label>
              <input type="date" id="sp-wrap" name="wrapDate" value="${v('wrapDate')}" />
            </div>

            <div class="field">
              <label for="sp-fiscal-year">Fiscal Year</label>
              <input type="text" id="sp-fiscal-year" name="fiscalYear" value="${v('fiscalYear')}"
                placeholder="Fiscal year range" maxlength="20" />
            </div>

          </div>
        </div>

        <!-- ── Staff Members ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Staff Members</h3>
          <p class="setup-hint" style="margin-bottom:12px">Staff added here will be auto-imported into the Crew List.</p>

          <div class="staff-list" id="staff-list">
            ${staff.map(s => staffCardHTML(s)).join('')}
            ${staff.length === 0 ? '<p class="staff-empty">No staff members added yet.</p>' : ''}
          </div>

          <button type="button" class="btn btn--ghost btn--sm" id="btn-add-staff" style="margin-top:10px">
            + Add Staff Member
          </button>

          <div class="staff-add-form hidden" id="staff-add-form">
            <div class="form-grid" style="margin-top:12px">
              <div class="field">
                <label for="sf-title">Title / Role</label>
                <input type="text" id="sf-title" placeholder="Title or role" maxlength="80" />
              </div>
              <div class="field">
                <label for="sf-name">Full Name <span class="req">*</span></label>
                <input type="text" id="sf-name" placeholder="Full name" maxlength="80" />
              </div>
              <div class="field">
                <label for="sf-email">Email Address</label>
                <input type="email" id="sf-email" placeholder="Email address" maxlength="120" />
              </div>
              <div class="field">
                <label for="sf-phone">Phone Number</label>
                <input type="tel" id="sf-phone" placeholder="Phone number" maxlength="30" />
              </div>
            </div>
            <div class="staff-add-actions">
              <button type="button" class="btn btn--primary btn--sm" id="btn-staff-confirm">Add to Staff</button>
              <button type="button" class="btn btn--ghost btn--sm" id="btn-staff-cancel">Cancel</button>
            </div>
          </div>
        </div>

        <!-- ── Submission Defaults ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Submission Defaults</h3>
          <div class="form-grid">

            <div class="field">
              <label for="sp-submitter">Default Submitter Name</label>
              <input type="text" id="sp-submitter" name="defaultSubmitter" value="${v('defaultSubmitter')}"
                placeholder="Your full name" maxlength="80" />
              <span class="setup-hint">Used as your name on submissions and in the profile button.</span>
            </div>

            <div class="field">
              <label for="sp-cc-last4">Default CC Last 4 Digits</label>
              <input type="text" id="sp-cc-last4" name="defaultCcLast4" value="${v('defaultCcLast4')}"
                maxlength="4" pattern="[0-9]{4}" placeholder="Last 4 digits" inputmode="numeric" />
              <span class="setup-hint">Pre-fills CC Last 4 on new submissions.</span>
            </div>

            <div class="field">
              <label for="sp-default-method">Default Payment Method</label>
              <select id="sp-default-method" name="defaultMethod">
                ${['CC','PO-CC','PO','Check','Debit','ACH','Return'].map(m =>
                  `<option value="${m}"${p.defaultMethod === m ? ' selected' : ''}>${m}</option>`
                ).join('')}
              </select>
            </div>

          </div>
        </div>

        <!-- ── File Storage ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">File Storage</h3>
          <div class="form-grid">

            <div class="field field--full">
              <label for="sp-dropbox">Dropbox Folder Path</label>
              <input type="text" id="sp-dropbox" name="dropboxPath" value="${v('dropboxPath')}"
                placeholder="Local Dropbox path for receipt folders" maxlength="300" />
              <span class="setup-hint">Local Dropbox path where receipt folders are stored. Used as a reference — no cloud connection is made by this app.</span>
            </div>

            <div class="field field--full">
              <label for="sp-api-key">Anthropic API Key</label>
              <input type="password" id="sp-api-key" name="anthropicApiKey"
                value="${localStorage.getItem('anthropic-api-key') ? '••••••••••••••••' : ''}"
                placeholder="sk-ant-…" maxlength="200" autocomplete="off" />
              <span class="setup-hint">Required for AI-powered receipt autofill. Stored locally in your browser only.</span>
              <span class="field-error" id="err-sp-api-key"></span>
            </div>

          </div>
        </div>

        <!-- ── Notes ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Project Notes</h3>
          <div class="form-grid">
            <div class="field field--full">
              <label for="sp-notes">Notes</label>
              <textarea id="sp-notes" name="notes" rows="4"
                placeholder="Additional notes or production reminders…"
              >${v('notes')}</textarea>
            </div>
          </div>
        </div>

        <!-- ── Actions ── -->
        <div class="form-actions setup-actions">
          <button type="button" id="btn-setup-reset" class="btn btn--ghost">Reset to Defaults</button>
          <div class="setup-save-group">
            <span class="setup-save-status" id="setup-save-status"></span>
            <button type="submit" class="btn btn--primary">Save Project Settings</button>
          </div>
        </div>

      </form>
    </section>
  `;
}

function staffCardHTML(s) {
  return `
    <div class="staff-card" data-staff-id="${esc(s.id)}">
      <div class="staff-card__info">
        <span class="staff-card__name">${esc(s.name || '—')}</span>
        <span class="staff-card__title">${esc(s.title || '')}</span>
        <span class="staff-card__contact">${[s.email, s.phone].filter(Boolean).map(esc).join(' · ')}</span>
      </div>
      <button type="button" class="btn btn--ghost btn--sm staff-remove-btn" data-staff-id="${esc(s.id)}">Remove</button>
    </div>
  `;
}

/* ── Listeners ── */
function attachListeners(container, onSave) {
  const form = container.querySelector('#setup-form');
  const project = getProject() ?? {};
  if (!project.staff) project.staff = [];

  // Show/hide add staff form
  container.querySelector('#btn-add-staff').addEventListener('click', () => {
    container.querySelector('#staff-add-form').classList.remove('hidden');
    container.querySelector('#sf-name').focus();
  });

  container.querySelector('#btn-staff-cancel').addEventListener('click', () => {
    resetStaffForm(container);
  });

  container.querySelector('#btn-staff-confirm').addEventListener('click', () => {
    const nameEl = container.querySelector('#sf-name');
    if (!nameEl.value.trim()) { nameEl.focus(); return; }

    const newMember = {
      id: crypto.randomUUID(),
      title: container.querySelector('#sf-title').value.trim(),
      name:  nameEl.value.trim(),
      email: container.querySelector('#sf-email').value.trim(),
      phone: container.querySelector('#sf-phone').value.trim(),
    };

    const current = getProject() ?? {};
    current.staff = current.staff ?? [];
    current.staff.push(newMember);
    saveProject(current);

    // Re-render staff list
    const list = container.querySelector('#staff-list');
    const emptyMsg = list.querySelector('.staff-empty');
    if (emptyMsg) emptyMsg.remove();
    list.insertAdjacentHTML('beforeend', staffCardHTML(newMember));

    resetStaffForm(container);
    attachRemoveListeners(container);
  });

  attachRemoveListeners(container);

  // Main form submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validate(container)) return;

    const fd   = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (k === 'anthropicApiKey') continue;
      data[k] = v.trim();
    }

    // Preserve staff array
    const current = getProject() ?? {};
    data.staff = current.staff ?? [];

    saveProject(data);

    const apiKeyInput = form.querySelector('#sp-api-key');
    const apiKeyVal   = apiKeyInput?.value ?? '';
    if (apiKeyVal && !apiKeyVal.startsWith('•')) {
      localStorage.setItem('anthropic-api-key', apiKeyVal.trim());
    }

    const statusEl = container.querySelector('#setup-save-status');
    if (statusEl) {
      statusEl.textContent = 'Saved ✓';
      statusEl.classList.add('saved');
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('saved'); }, 2500);
    }

    onSave?.();
  });

  container.querySelector('#btn-setup-reset').addEventListener('click', () => {
    if (confirm('Clear all project settings? This cannot be undone.')) {
      localStorage.removeItem('movie-ledger-project');
      localStorage.removeItem('anthropic-api-key');
      renderProjectSetup(container, onSave);
    }
  });
}

function attachRemoveListeners(container) {
  container.querySelectorAll('.staff-remove-btn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // remove old listeners
  });
  container.querySelectorAll('.staff-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.staffId;
      const current = getProject() ?? {};
      current.staff = (current.staff ?? []).filter(s => s.id !== id);
      saveProject(current);
      btn.closest('.staff-card').remove();
      const list = container.querySelector('#staff-list');
      if (!list.querySelector('.staff-card')) {
        list.insertAdjacentHTML('beforeend', '<p class="staff-empty">No staff members added yet.</p>');
      }
    });
  });
}

function resetStaffForm(container) {
  ['#sf-title','#sf-name','#sf-email','#sf-phone'].forEach(sel => {
    const el = container.querySelector(sel);
    if (el) el.value = '';
  });
  container.querySelector('#staff-add-form').classList.add('hidden');
}

/* ── Validation ── */
function validate(container) {
  const titleEl = container.querySelector('#sp-title');
  const errEl   = container.querySelector('#err-sp-title');
  if (!titleEl.value.trim()) {
    if (errEl) errEl.textContent = 'Project title is required.';
    titleEl.classList.add('invalid');
    titleEl.focus();
    return false;
  }
  if (errEl) errEl.textContent = '';
  titleEl.classList.remove('invalid');
  return true;
}

/* ── Helpers ── */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
