<script>
  import { onMount, onDestroy } from 'svelte';
  import { getProject, saveProject, refreshProjectStore } from '../stores/project.js';
  import { startDropboxAuth, disconnectDropbox, isDropboxConnected, provisionProjectFolders } from '../lib/dropbox.js';

  let container;

  const PROD_INFO_KEY = 'movie-ledger-prod-info';

  /* ── Collapsible sections ──────────────────────────────────────
     Which sections are expanded, remembered between visits. This is a
     preference about the screen rather than data about the production, so it
     is stored under its own key and deliberately not in the project — it is
     not worth syncing, and it should not differ per project when the person
     using it is the same.

     _render() rebuilds the whole page from a string on several occasions,
     which is why the state has to live outside the DOM at all: without this,
     removing a logo would silently close every section you had opened. */
  const OPEN_KEY = 'movie-ledger-ps-open-sections';

  /* Project Identity alone on a first visit. A new project lands on this
     screen straight from creation, so opening nothing would present a
     brand-new production as nine closed drawers with no hint of what to fill
     in; opening everything would be the scrolling this is meant to end. */
  const DEFAULT_OPEN = ['identity'];

  function _openSections() {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw === null) return DEFAULT_OPEN;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : DEFAULT_OPEN;
    } catch { return DEFAULT_OPEN; }
  }

  function _saveOpenSections(keys) {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(keys)); } catch { /* private mode */ }
  }

  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  function _render() {
    if (!container) return;
    const project  = getProject() ?? {};
    let prodInfo   = {};
    try { prodInfo = JSON.parse(localStorage.getItem(PROD_INFO_KEY)) || {}; } catch { prodInfo = {}; }

    const v  = (key, fb = '') => _esc(project[key] ?? fb);
    const pv = (key, fb = '') => _esc(prodInfo[key] ?? fb);
    const theme = document.documentElement.dataset.theme || 'dark';

    // Emits the open attribute for a section, and the header that toggles it.
    const open = new Set(_openSections());
    const sec  = (key, title) =>
      `<details class="setup-card ps-collapse" data-ps-sec="${key}"${open.has(key) ? ' open' : ''}>
        <summary class="setup-card__title ps-summary">
          <span class="ps-caret" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
          ${title}
        </summary>
        <div class="ps-card-body">`;

    container.innerHTML = `
      <section class="setup-section">
        <div class="setup-header">
          <div>
            <h2>Project Settings</h2>
            <p class="setup-subtitle">Manage your production. Locked fields were set during project creation.</p>
          </div>

          <!-- Appearance was a section of its own for a single switch. It is a
               preference about the app rather than a setting of the
               production, so it sits in the corner as a switch instead of
               taking a ninth of the page. A real checkbox underneath, so it is
               reachable by keyboard and announced as on or off; the track and
               knob are drawn from it. -->
          <label class="ps-theme-switch" title="Switch between light and dark mode">
            <span class="ps-theme-switch__icon" aria-hidden="true">☀</span>
            <input type="checkbox" id="ps-theme-toggle" ${theme === 'dark' ? 'checked' : ''} />
            <span class="ps-theme-switch__track"><span class="ps-theme-switch__knob"></span></span>
            <span class="ps-theme-switch__icon" aria-hidden="true">☽</span>
            <span class="ps-visually-hidden">Dark mode</span>
          </label>
        </div>

        <form id="settings-form" novalidate autocomplete="off">

          <!-- ── Project Identity ── -->
          ${sec('identity', 'Project Identity')}
            <div class="form-grid">
              <div class="field field--full">
                <label>Project Title</label>
                <input type="text" value="${v('title')}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Production Number</label>
                <input type="text" value="${v('productionNumber')}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Budget Type</label>
                <input type="text" value="${project.budgetTemplate === 'feature' ? 'Feature/TV' : 'Commercial'}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label>Call Sheet Type</label>
                <input type="text" value="${(project.callSheetTemplate || project.budgetTemplate) === 'feature' ? 'Feature/TV' : 'Commercial'}" disabled class="ps-locked" />
              </div>
              <div class="field">
                <label for="ps-company">Production Company</label>
                <input type="text" id="ps-company" name="productionCompany" value="${v('productionCompany')}" maxlength="80" />
              </div>
            </div>
          </div>
        </details>

          <!-- ── Calendar Admin ── -->
          ${sec('schedule', 'Calendar Admin')}
            <div class="form-grid">
              <div class="field">
                <label for="ps-start">Principal Photography Start</label>
                <input type="date" id="ps-start" name="startDate" value="${v('startDate')}" />
              </div>
              <div class="field">
                <label for="ps-wrap">Estimated Wrap Date</label>
                <input type="date" id="ps-wrap" name="wrapDate" value="${v('wrapDate')}" />
              </div>
            </div>
          </div>
        </details>

          <!-- ── Top Sheet Info ── -->
          ${sec('prodinfo', 'Top Sheet Info')}
            <p class="setup-hint" style="margin-bottom:12px">Used by the Budget Top Sheet, Hot Costs, and Call Sheets.</p>
            <div class="form-grid" style="margin-bottom:14px">
              <div class="field field--full">
                <label for="ps-office-address">Production Office Address</label>
                <input type="text" id="ps-office-address" name="officeAddress" value="${v('officeAddress')}" maxlength="200" />
                <span class="setup-hint">Used in Prep Calendar, Call Sheets, and other documents.</span>
              </div>
            </div>
            <div id="ps-prod-info-fields"></div>
          </div>
        </details>

          <!-- ── Invites & Permissions ──
               The only people-list left on this screen. A Staff Members
               section used to sit below it holding a second, loginless roster
               that fed the Crew List — two forms for "who is on this job",
               neither of which was the Crew List itself. -->
          ${sec('access', 'Invites & Permissions')}
            <p class="setup-hint" style="margin-bottom:12px">
              Who can sign in to this production, and what each person can reach.
              Separate from the Crew List — invite only the people who need an account.
            </p>
            <button type="button" class="btn btn--ghost btn--sm" id="ps-btn-access">
              Manage Access →
            </button>
          </div>
        </details>

          
          
          <!-- ── File Storage ── -->
          ${sec('storage', 'File Storage')}
            <div class="form-grid">
              <div class="field field--full">
                <label for="ps-dropbox">Dropbox Folder Path</label>
                <input type="text" id="ps-dropbox" name="dropboxPath" value="${v('dropboxPath')}" maxlength="300" />
                <span class="setup-hint">Local Dropbox path where receipt folders are stored. Used as a reference only.</span>
              </div>
              <div class="field field--full">
                <!-- The Dropbox mark, drawn inline rather than fetched: four
                     parallelograms meeting at a point. An <img> would be one
                     more request that has to succeed, and this screen is
                     exactly where someone looks when Dropbox is not working. -->
                <label class="ps-label-with-mark">
                  <svg class="ps-dropbox-mark" viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" focusable="false">
                    <path fill="#0061FF" d="M8 2 0 7.2l8 5.2 8-5.2L8 2Zm16 0-8 5.2 8 5.2 8-5.2L24 2ZM0 17.6l8 5.2 8-5.2-8-5.2-8 5.2Zm24-5.2-8 5.2 8 5.2 8-5.2-8-5.2ZM8 24.5l8 5.2 8-5.2-8-5.2-8 5.2Z"/>
                  </svg>
                  Dropbox Connection
                </label>
                <div class="dropbox-connect-row">
                  <span id="ps-dropbox-status" class="dropbox-status">Checking connection…</span>
                  <button type="button" id="ps-dropbox-connect" class="btn btn--primary btn--sm hidden">Connect Dropbox</button>
                  <button type="button" id="ps-dropbox-recreate" class="btn btn--ghost btn--sm hidden">Recreate Project Folders</button>
                  <button type="button" id="ps-dropbox-disconnect" class="btn btn--ghost btn--sm hidden">Disconnect</button>
                </div>
                <span class="setup-hint">Connects your Dropbox account so CC Log receipts can be filed into "05. LOGS" automatically once a charge is approved.</span>
              </div>
              <div class="field field--full">
                <label for="ps-api-key">Anthropic API Key</label>
                <input type="password" id="ps-api-key" name="anthropicApiKey"
                  value="${localStorage.getItem('anthropic-api-key') ? '••••••••••••••••' : ''}" maxlength="200" autocomplete="off" />
                <span class="setup-hint">Required for AI-powered receipt autofill. Stored locally in your browser only.</span>
              </div>
            </div>
          </div>
        </details>

          
          
          <!-- ── Actions ── -->
          <div class="form-actions setup-actions">
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
    // No placeholder. A grey example inside an empty box reads as a filled
    // field at a glance, and on a form of mostly-empty cells that is the whole
    // page lying about its own state.
    const piF = (key, label, type = 'text') =>
      `<div class="field"><label>${label}</label><input type="${type}" data-pi-key="${key}" value="${pv(key)}" /></div>`;

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
      ${piSection('Production Company', `
        ${piF('prodCoName', 'Company Name')}
        ${piF('prodCoAddr', 'Address')}
        ${piF('prodCoCity', 'City, State ZIP')}
        ${piF('prodCoPhone', 'Phone')}
      `)}
      ${piSection('Client', `
        ${piF('clientName', 'Name')}
        ${piF('clientAddr', 'Address')}
        ${piF('clientCity', 'City, State ZIP')}
        ${piF('clientPhone', 'Phone')}
      `)}
      ${piSection('Agency', `
        ${piF('agencyName', 'Name')}
        ${piF('agencyAddr', 'Address')}
        ${piF('agencyCity', 'City, State ZIP')}
        ${piF('otherPhone', 'Other Phone')}
      `)}
      ${piSection('Production Schedule', `
        ${piF('shootDates', 'Shoot Dates')}
        ${piF('deliveryDate', 'Delivery Date')}
        ${piF('shootingFormat', 'Shooting Format')}
        ${piF('deliveryFormat', 'Delivery Format')}
        ${piF('otBasedOn', 'OT Based On')}
      `)}
      ${piSection('Shoot Days', `
        ${piF('buildStrikeDays', 'Build/Strike Days', 'number')}
        ${piF('buildStrikeHours', 'Build/Strike Hrs', 'number')}
        ${piF('prelightDays', 'Prelight Days', 'number')}
        ${piF('prelightHours', 'Prelight Hrs', 'number')}
        ${piF('studioDays', 'Studio Days', 'number')}
        ${piF('studioHours', 'Studio Hrs', 'number')}
        ${piF('locationDays', 'Location Days', 'number')}
        ${piF('locations', 'Location(s)', 'number')}
      `)}
      ${piSection('Top Sheet Notes', `
        <div class="field field--full">
          <textarea data-pi-key="notes" rows="3">${pv('notes')}</textarea>
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

  async function _refreshDropboxStatus(c) {
    const statusEl      = c.querySelector('#ps-dropbox-status');
    const connectBtn    = c.querySelector('#ps-dropbox-connect');
    const recreateBtn   = c.querySelector('#ps-dropbox-recreate');
    const disconnectBtn = c.querySelector('#ps-dropbox-disconnect');
    if (!statusEl) return;
    try {
      const connected = await isDropboxConnected();
      statusEl.textContent = connected ? '✔ Connected' : 'Not connected';
      statusEl.classList.toggle('dropbox-status--connected', connected);
      connectBtn?.classList.toggle('hidden', connected);
      recreateBtn?.classList.toggle('hidden', !connected);
      disconnectBtn?.classList.toggle('hidden', !connected);
    } catch (e) {
      statusEl.textContent = 'Could not check connection status.';
      connectBtn?.classList.remove('hidden');
      recreateBtn?.classList.add('hidden');
      disconnectBtn?.classList.add('hidden');
    }
  }

  function _wire(c) {
    const form = c.querySelector('#settings-form');

    // Theme switch. A checkbox now, so the state is the control's own — the
    // knob follows :checked in CSS and there is no label to keep in step.
    // 'change' rather than 'click' so the keyboard reaches it too.
    c.querySelector('#ps-theme-toggle')?.addEventListener('change', e => {
      const next = e.currentTarget.checked ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('movie-ledger-theme', next);
    });

    // Dropbox connection
    c.querySelector('#ps-dropbox-connect')?.addEventListener('click', () => { startDropboxAuth(); });
    c.querySelector('#ps-dropbox-recreate')?.addEventListener('click', async () => {
      const btn = c.querySelector('#ps-dropbox-recreate');
      const statusEl = c.querySelector('#ps-dropbox-status');
      btn.disabled = true;
      const prevText = statusEl.textContent;
      statusEl.textContent = 'Creating folders…';
      try {
        const result = await provisionProjectFolders(getProject());
        statusEl.textContent = result.failedCount
          ? `✔ Connected — ${result.totalCount - result.failedCount}/${result.totalCount} folders created (see console for details)`
          : `✔ Connected — all ${result.totalCount} folders created`;
        statusEl.classList.add('dropbox-status--connected');
      } catch (e) {
        statusEl.textContent = `Folder creation failed: ${e.message}`;
      } finally {
        btn.disabled = false;
      }
    });
    c.querySelector('#ps-dropbox-disconnect')?.addEventListener('click', async () => {
      if (!confirm('Disconnect Dropbox? CC Log receipts will stop being filed automatically until you reconnect.')) return;
      await disconnectDropbox();
      _refreshDropboxStatus(c);
    });
    _refreshDropboxStatus(c);

    c.querySelector('#ps-btn-access')?.addEventListener('click', () => {
      window.location.hash = '#members';
    });

    // Remember which sections are open. Read from the DOM on every toggle
    // rather than tracking a running list, so the stored state is whatever is
    // actually on screen — including any section opened by the browser itself
    // to reveal a search hit or a focused field.
    c.querySelectorAll('details[data-ps-sec]').forEach(d => {
      d.addEventListener('toggle', () => {
        _saveOpenSections(
          [...c.querySelectorAll('details[data-ps-sec]')]
            .filter(x => x.open)
            .map(x => x.dataset.psSec)
        );
      });
    });

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

      // Fields that no longer have an input on this screen. This object is
      // rebuilt from the form on every save, so anything without a field is
      // dropped — removing the Director box would not just stop you editing
      // the director, it would erase the one already stored the next time
      // somebody saved an unrelated setting. They are still set during project
      // creation, and still read: director and producer print on Hot Costs and
      // the budget top sheet, and defaultSubmitter is the name and initials on
      // the profile button.
      for (const key of ['director', 'producer', 'defaultSubmitter',
                         'defaultCcLast4', 'defaultMethod', 'notes']) {
        if (current[key] !== undefined) data[key] = current[key];
      }
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
      }

      // Saving settings is the last step of setting a project up, so it ends
      // by putting the person inside the project rather than leaving them on
      // the form they just finished. My Book rather than the Purchase Log:
      // everyone has their own book whatever their grants, where the expense
      // log needs Expenses and would bounce a crew member straight back out.
      setTimeout(() => { window.location.hash = '#my-book'; }, 600);
    });
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

  :global(.dropbox-connect-row) {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  :global(.dropbox-status) {
    font-size: 0.85rem;
    color: var(--text-muted, #888);
  }
  :global(.dropbox-status--connected) {
    color: var(--earth-green, #7aaa7a);
    font-weight: 600;
  }

  /* Scoped badge/lock indicator */

  :global(.ps-locked) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.setup-save-status.saved) {
    color: var(--green, #4caf50);
    font-size: 0.875rem;
  }

  /* One row, always. These are four slots of a fixed 80px, and they were
     wrapping Production Co. onto a line of its own — not because there was no
     space, but because the label under it is the longest of the four and
     flex-wrap measures the whole slot. Nothing here needs to wrap: four
     fixed-width thumbnails fit any width this form is usable at. */
  :global(.pi-logos-row) {
    display: flex;
    flex-wrap: nowrap;
    gap: 16px;
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
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    background: var(--bg-elevated, #2a2a2a);
  }

  :global(.pi-logo-label:hover) {
    border-color: var(--gold, #8cabcf);
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
