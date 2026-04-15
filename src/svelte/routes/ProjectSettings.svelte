<script>
  import { onMount, onDestroy } from 'svelte';
  import { getProject, saveProject, refreshProjectStore } from '../stores/project.js';

  let container;

  const PROD_INFO_KEY = 'movie-ledger-prod-info';

  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _settingsStaffCard(s) {
    return `
      <div class="staff-card" data-staff-id="${_esc(s.id)}">
        <div class="staff-card__info">
          <span class="staff-card__name">${_esc(s.name || '—')}</span>
          <span class="staff-card__title">${_esc(s.title || '')}</span>
          <span class="staff-card__contact">${[s.email, s.phone].filter(Boolean).map(_esc).join(' · ')}</span>
        </div>
        <button type="button" class="btn btn--ghost btn--sm staff-remove-btn" data-staff-id="${_esc(s.id)}">Remove</button>
      </div>`;
  }

  function _render() {
    if (!container) return;
    const project  = getProject() ?? {};
    let prodInfo   = {};
    try { prodInfo = JSON.parse(localStorage.getItem(PROD_INFO_KEY)) || {}; } catch { prodInfo = {}; }

    const v  = (key, fb = '') => _esc(project[key] ?? fb);
    const pv = (key, fb = '') => _esc(prodInfo[key] ?? fb);
    const staff = project.staff ?? [];
    const staffHTML = staff.length > 0
      ? staff.map(s => _settingsStaffCard(s)).join('')
      : '<p class="staff-empty">No staff members added yet.</p>';

    const theme = document.documentElement.dataset.theme || 'dark';

    container.innerHTML = `
      <section class="setup-section">
        <div class="setup-header">
          <div>
            <h2>Project Settings</h2>
            <p class="setup-subtitle">Manage your production. Locked fields were set during project creation.</p>
          </div>
        </div>

        <form id="settings-form" novalidate autocomplete="off">

          <!-- ── Project Identity ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Project Identity</h3>
            <div class="form-grid">
              <div class="field field--full">
                <label>Project Title <span class="ps-lock-badge">LOCKED</span></label>
                <input type="text" value="${v('title')}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Production Number <span class="ps-lock-badge">LOCKED</span></label>
                <input type="text" value="${v('productionNumber')}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Budget Type <span class="ps-lock-badge">LOCKED</span></label>
                <input type="text" value="${project.budgetTemplate === 'feature' ? 'Feature/TV' : 'Commercial'}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Call Sheet Type <span class="ps-lock-badge">LOCKED</span></label>
                <input type="text" value="${(project.callSheetTemplate || project.budgetTemplate) === 'feature' ? 'Feature/TV' : 'Commercial'}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label for="ps-company">Production Company</label>
                <input type="text" id="ps-company" name="productionCompany" value="${v('productionCompany')}" placeholder="LLC or company name" maxlength="80" />
              </div>
              <div class="field">
                <label for="ps-director">Director</label>
                <input type="text" id="ps-director" name="director" value="${v('director')}" placeholder="Director full name" maxlength="80" />
              </div>
              <div class="field">
                <label for="ps-producer">Producer</label>
                <input type="text" id="ps-producer" name="producer" value="${v('producer')}" placeholder="Producer full name" maxlength="80" />
              </div>
            </div>
          </div>

          <!-- ── Schedule ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Schedule</h3>
            <div class="form-grid">
              <div class="field">
                <label for="ps-start">Principal Photography Start</label>
                <input type="date" id="ps-start" name="startDate" value="${v('startDate')}" />
              </div>
              <div class="field">
                <label for="ps-wrap">Estimated Wrap Date</label>
                <input type="date" id="ps-wrap" name="wrapDate" value="${v('wrapDate')}" />
              </div>
              <div class="field">
                <label for="ps-fiscal">Fiscal Year</label>
                <input type="text" id="ps-fiscal" name="fiscalYear" value="${v('fiscalYear')}" placeholder="Fiscal year range" maxlength="20" />
              </div>
              <div class="field field--full">
                <label for="ps-office-address">Production Office Address</label>
                <input type="text" id="ps-office-address" name="officeAddress" value="${v('officeAddress')}"
                  placeholder="123 Main St, Suite 100, Los Angeles, CA 90001" maxlength="200" />
                <span class="setup-hint">Used in Prep Calendar, Call Sheets, and other documents.</span>
              </div>
            </div>
          </div>

          <!-- ── Production Info ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Production Info</h3>
            <p class="setup-hint" style="margin-bottom:12px">Used by the Budget Top Sheet, Hot Costs, and Call Sheets.</p>
            <div id="ps-prod-info-fields"></div>
          </div>

          <!-- ── Staff Members ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Staff Members</h3>
            <p class="setup-hint" style="margin-bottom:12px">Staff added here will be auto-imported into the Crew List.</p>
            <div class="staff-list" id="ps-staff-list">${staffHTML}</div>
            <button type="button" class="btn btn--ghost btn--sm" id="ps-btn-add-staff" style="margin-top:10px">
              + Add Staff Member
            </button>
            <div class="staff-add-form hidden" id="ps-staff-add-form">
              <div class="form-grid" style="margin-top:12px">
                <div class="field">
                  <label for="ps-sf-title">Title / Role</label>
                  <input type="text" id="ps-sf-title" placeholder="Title or role" maxlength="80" />
                </div>
                <div class="field">
                  <label for="ps-sf-name">Full Name <span class="req">*</span></label>
                  <input type="text" id="ps-sf-name" placeholder="Full name" maxlength="80" />
                </div>
                <div class="field">
                  <label for="ps-sf-email">Email Address</label>
                  <input type="email" id="ps-sf-email" placeholder="Email address" maxlength="120" />
                </div>
                <div class="field">
                  <label for="ps-sf-phone">Phone Number</label>
                  <input type="tel" id="ps-sf-phone" placeholder="Phone number" maxlength="30" />
                </div>
              </div>
              <div class="staff-add-actions">
                <button type="button" class="btn btn--primary btn--sm" id="ps-btn-staff-confirm">Add to Staff</button>
                <button type="button" class="btn btn--ghost btn--sm" id="ps-btn-staff-cancel">Cancel</button>
              </div>
            </div>
          </div>

          <!-- ── Submission Defaults ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Submission Defaults</h3>
            <div class="form-grid">
              <div class="field">
                <label for="ps-submitter">Default Submitter Name</label>
                <input type="text" id="ps-submitter" name="defaultSubmitter" value="${v('defaultSubmitter')}"
                  placeholder="Your full name" maxlength="80" />
                <span class="setup-hint">Used as your name on submissions and in the profile button.</span>
              </div>
              <div class="field">
                <label for="ps-cc-last4">Default CC Last 4 Digits</label>
                <input type="text" id="ps-cc-last4" name="defaultCcLast4" value="${v('defaultCcLast4')}"
                  maxlength="4" pattern="[0-9]{4}" placeholder="Last 4 digits" inputmode="numeric" />
                <span class="setup-hint">Pre-fills CC Last 4 on new submissions.</span>
              </div>
              <div class="field">
                <label for="ps-default-method">Default Payment Method</label>
                <select id="ps-default-method" name="defaultMethod">
                  ${['CC','PO-CC','PO','Check','Debit','ACH','Return'].map(m =>
                    `<option value="${m}"${project.defaultMethod === m ? ' selected' : ''}>${m}</option>`
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
                <label for="ps-dropbox">Dropbox Folder Path</label>
                <input type="text" id="ps-dropbox" name="dropboxPath" value="${v('dropboxPath')}"
                  placeholder="Local Dropbox path for receipt folders" maxlength="300" />
                <span class="setup-hint">Local Dropbox path where receipt folders are stored. Used as a reference — no cloud connection is made by this app.</span>
              </div>
              <div class="field field--full">
                <label for="ps-api-key">Anthropic API Key</label>
                <input type="password" id="ps-api-key" name="anthropicApiKey"
                  value="${localStorage.getItem('anthropic-api-key') ? '••••••••••••••••' : ''}"
                  placeholder="sk-ant-…" maxlength="200" autocomplete="off" />
                <span class="setup-hint">Required for AI-powered receipt autofill. Stored locally in your browser only.</span>
              </div>
            </div>
          </div>

          <!-- ── Notes ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Project Notes</h3>
            <div class="form-grid">
              <div class="field field--full">
                <label for="ps-notes">Notes</label>
                <textarea id="ps-notes" name="notes" rows="4"
                  placeholder="Additional notes or production reminders…">${v('notes')}</textarea>
              </div>
            </div>
          </div>

          <!-- ── Appearance ── -->
          <div class="setup-card">
            <h3 class="setup-card__title">Appearance</h3>
            <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
              <button type="button" id="ps-theme-toggle" class="btn btn--ghost btn--sm ps-theme-btn">
                <span class="ps-theme-icon">${theme === 'dark' ? '☽' : '☀'}</span>
                <span class="ps-theme-label">${theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
              </button>
              <span class="setup-hint" style="margin:0;">Click to switch between light and dark mode.</span>
            </div>
          </div>

          <!-- ── Actions ── -->
          <div class="form-actions setup-actions">
            <button type="button" id="ps-btn-back" class="btn btn--ghost">← Back to Project</button>
            <div class="setup-save-group">
              <span class="setup-save-status" id="ps-save-status"></span>
              <button type="submit" class="btn btn--primary">Save Settings</button>
            </div>
          </div>

        </form>
      </section>
    `;

    _buildProdInfoFields(container, prodInfo, pv);
    _wire(container);
  }

  function _buildProdInfoFields(c, prodInfo, pv) {
    const piF = (key, label, ph = '', type = 'text') =>
      `<div class="field"><label>${label}</label><input type="${type}" data-pi-key="${key}" value="${pv(key)}" placeholder="${ph}" /></div>`;

    const piSection = (heading, fields) =>
      `<div style="margin-bottom:14px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">${heading}</div>
        <div class="form-grid">${fields}</div>
      </div>`;

    const piLogoSlot = (key, label, inputId) => `
      <div class="pi-logo-slot">
        <label class="pi-logo-label" for="${inputId}">
          ${prodInfo[key] ? `<img src="${_esc(prodInfo[key])}" class="pi-logo-img has-logo" />` : ''}
          <span class="pi-logo-placeholder"${prodInfo[key] ? ' style="display:none"' : ''}>+ Upload</span>
        </label>
        <input type="file" id="${inputId}" data-logo-key="${key}" accept="image/*" hidden />
        <span class="pi-logo-sublabel">${label}</span>
        ${prodInfo[key] ? `<button type="button" class="pi-logo-remove" data-logo-key="${key}">✕</button>` : ''}
      </div>`;

    c.querySelector('#ps-prod-info-fields').innerHTML = `
      ${piSection('Logos', `
        <div class="pi-logos-row">
          ${piLogoSlot('titleLogo', 'Title Logo', 'pi-logo-title')}
          ${piLogoSlot('clientLogo', 'Client', 'pi-logo-client')}
          ${piLogoSlot('agencyLogo', 'Agency', 'pi-logo-agency')}
          ${piLogoSlot('prodCoLogo', 'Production Co.', 'pi-logo-prodco')}
        </div>
      `)}
      ${piSection('Project', `
        ${piF('productionName', 'Production Name', 'Enter production name…')}
        ${piF('jobName', 'Job Name', 'Enter job name…')}
        ${piF('jobNumber', 'Job Number', 'e.g. 2025-001')}
      `)}
      ${piSection('Production Company', `
        ${piF('prodCoName', 'Company Name', 'Company name')}
        ${piF('prodCoAddr', 'Address', 'Street address')}
        ${piF('prodCoCity', 'City, State ZIP', 'City, ST 00000')}
        ${piF('prodCoPhone', 'Phone', '(000) 000-0000')}
      `)}
      ${piSection('Client', `
        ${piF('clientName', 'Name', 'Client name')}
        ${piF('clientAddr', 'Address', 'Street address')}
        ${piF('clientCity', 'City, State ZIP', 'City, ST 00000')}
        ${piF('clientPhone', 'Phone', '(000) 000-0000')}
        ${piF('clientFax', 'Fax', '(000) 000-0000')}
      `)}
      ${piSection('Agency', `
        ${piF('agencyName', 'Name', 'Agency name')}
        ${piF('agencyAddr', 'Address', 'Street address')}
        ${piF('agencyCity', 'City, State ZIP', 'City, ST 00000')}
        ${piF('otherPhone', 'Other Phone', '(000) 000-0000')}
      `)}
      ${piSection('Production Schedule', `
        ${piF('shootDates', 'Shoot Dates', 'e.g. Jan 10–14, 2025')}
        ${piF('deliveryDate', 'Delivery Date', 'e.g. Feb 1, 2025')}
        ${piF('shootingFormat', 'Shooting Format', 'e.g. Arri Alexa')}
        ${piF('deliveryFormat', 'Delivery Format', 'e.g. DCP, ProRes')}
        ${piF('otBasedOn', 'OT Based On', '1.5')}
      `)}
      ${piSection('Shoot Days', `
        ${piF('buildStrikeDays', 'Build/Strike Days', '0', 'number')}
        ${piF('buildStrikeHours', 'Build/Strike Hrs', '0', 'number')}
        ${piF('prelightDays', 'Prelight Days', '0', 'number')}
        ${piF('prelightHours', 'Prelight Hrs', '0', 'number')}
        ${piF('studioDays', 'Studio Days', '0', 'number')}
        ${piF('studioHours', 'Studio Hrs', '0', 'number')}
        ${piF('locationDays', 'Location Days', '0', 'number')}
        ${piF('locations', 'Location(s)', '0', 'number')}
      `)}
      ${piSection('Top Sheet Notes', `
        <div class="field field--full">
          <textarea data-pi-key="notes" rows="3" placeholder="Production notes for top sheet…">${pv('notes')}</textarea>
        </div>
      `)}
    `;

    // Auto-save production info fields on input
    c.querySelectorAll('[data-pi-key]').forEach(el => {
      el.addEventListener('input', () => {
        prodInfo[el.dataset.piKey] = el.value;
        localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
      });
    });

    // Logo uploads
    c.querySelectorAll('input[data-logo-key]').forEach(inp => {
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          prodInfo[inp.dataset.logoKey] = ev.target.result;
          localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
          _render();
        };
        reader.readAsDataURL(file);
      });
    });

    c.querySelectorAll('.pi-logo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        delete prodInfo[btn.dataset.logoKey];
        localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
        _render();
      });
    });
  }

  function _wire(c) {
    const form = c.querySelector('#settings-form');

    // Theme toggle
    c.querySelector('#ps-theme-toggle')?.addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
      html.dataset.theme = next;
      localStorage.setItem('movie-ledger-theme', next);
      // Update button label in-place
      const btn = c.querySelector('#ps-theme-toggle');
      if (btn) {
        btn.querySelector('.ps-theme-icon').textContent = next === 'dark' ? '☽' : '☀';
        btn.querySelector('.ps-theme-label').textContent = next === 'dark' ? 'Dark Mode' : 'Light Mode';
      }
    });

    // Back button
    c.querySelector('#ps-btn-back')?.addEventListener('click', () => {
      window.location.hash = '#log';
    });

    // Staff: show add form
    c.querySelector('#ps-btn-add-staff')?.addEventListener('click', () => {
      c.querySelector('#ps-staff-add-form')?.classList.remove('hidden');
      c.querySelector('#ps-sf-name')?.focus();
    });

    c.querySelector('#ps-btn-staff-cancel')?.addEventListener('click', () => {
      _resetStaffForm(c);
    });

    c.querySelector('#ps-btn-staff-confirm')?.addEventListener('click', () => {
      const nameEl = c.querySelector('#ps-sf-name');
      if (!nameEl?.value.trim()) { nameEl?.focus(); return; }

      const newMember = {
        id:    crypto.randomUUID(),
        title: c.querySelector('#ps-sf-title')?.value.trim() || '',
        name:  nameEl.value.trim(),
        email: c.querySelector('#ps-sf-email')?.value.trim() || '',
        phone: c.querySelector('#ps-sf-phone')?.value.trim() || '',
      };

      const current = getProject() ?? {};
      current.staff = current.staff ?? [];
      current.staff.push(newMember);
      saveProject(current);

      const list = c.querySelector('#ps-staff-list');
      list?.querySelector('.staff-empty')?.remove();
      list?.insertAdjacentHTML('beforeend', _settingsStaffCard(newMember));
      _resetStaffForm(c);
      _wireStaffRemove(c);
    });

    _wireStaffRemove(c);

    // Main form submit
    form?.addEventListener('submit', e => {
      e.preventDefault();

      const fd   = new FormData(form);
      const data = {};
      for (const [k, val] of fd.entries()) {
        if (k === 'anthropicApiKey') continue;
        data[k] = val.trim();
      }

      // Preserve immutable fields and staff
      const current = getProject() ?? {};
      data.title             = current.title;
      data.productionNumber  = current.productionNumber;
      data.budgetTemplate    = current.budgetTemplate;
      data.callSheetTemplate = current.callSheetTemplate;
      data._createdAt        = current._createdAt;
      data.staff             = current.staff ?? [];
      if (current._archived)   data._archived   = current._archived;
      if (current._archivedAt) data._archivedAt = current._archivedAt;

      saveProject(data);
      refreshProjectStore();

      // Handle API key (don't save placeholder dots)
      const apiKeyVal = form.querySelector('#ps-api-key')?.value ?? '';
      if (apiKeyVal && !apiKeyVal.startsWith('•')) {
        localStorage.setItem('anthropic-api-key', apiKeyVal.trim());
      }

      const statusEl = c.querySelector('#ps-save-status');
      if (statusEl) {
        statusEl.textContent = 'Saved ✓';
        statusEl.classList.add('saved');
        setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('saved'); }, 2500);
      }
    });
  }

  function _wireStaffRemove(c) {
    // De-dupe listeners by replacing nodes first
    c.querySelectorAll('#ps-staff-list .staff-remove-btn').forEach(btn => {
      const clone = btn.cloneNode(true);
      btn.replaceWith(clone);
    });
    c.querySelectorAll('#ps-staff-list .staff-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id      = btn.dataset.staffId;
        const current = getProject() ?? {};
        current.staff = (current.staff ?? []).filter(s => s.id !== id);
        saveProject(current);
        btn.closest('.staff-card')?.remove();
        const list = c.querySelector('#ps-staff-list');
        if (list && !list.querySelector('.staff-card')) {
          list.insertAdjacentHTML('beforeend', '<p class="staff-empty">No staff members added yet.</p>');
        }
      });
    });
  }

  function _resetStaffForm(c) {
    ['#ps-sf-title','#ps-sf-name','#ps-sf-email','#ps-sf-phone'].forEach(sel => {
      const el = c.querySelector(sel);
      if (el) el.value = '';
    });
    c.querySelector('#ps-staff-add-form')?.classList.add('hidden');
  }

  onMount(() => {
    _render();
  });

  onDestroy(() => {
    if (container) container.innerHTML = '';
  });
</script>

<div bind:this={container} class="ps-root"></div>

<style>
  .ps-root {
    width: 100%;
    max-width: 860px;
    margin: 0 auto;
  }

  /* Scoped badge/lock indicator */
  :global(.ps-lock-badge) {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: var(--bg-elevated, #2a2a2a);
    color: var(--text-muted, #888);
    border: 1px solid var(--border, #333);
    border-radius: 3px;
    padding: 1px 4px;
    vertical-align: middle;
    margin-left: 4px;
  }

  :global(.ps-locked) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.setup-save-status.saved) {
    color: var(--green, #4caf50);
    font-size: 0.875rem;
  }

  :global(.pi-logos-row) {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    padding: 8px 0;
  }

  :global(.pi-logo-slot) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  :global(.pi-logo-label) {
    width: 80px;
    height: 60px;
    border: 1px dashed var(--border, #444);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    background: var(--bg-elevated, #2a2a2a);
  }

  :global(.pi-logo-label:hover) {
    border-color: var(--gold, #c9a84c);
  }

  :global(.pi-logo-img) {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  :global(.pi-logo-placeholder) {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
  }

  :global(.pi-logo-sublabel) {
    font-size: 0.7rem;
    color: var(--text-muted, #888);
  }

  :global(.pi-logo-remove) {
    font-size: 0.7rem;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    padding: 0;
  }

  :global(.pi-logo-remove:hover) {
    color: var(--red, #e55);
  }
</style>
