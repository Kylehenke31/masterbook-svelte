<script>
  import { navigate } from '../stores/router.js';

  const PROJECT_KEY = 'movie-ledger-project';
  const METHODS = ['CC','PO-CC','PO','Check','Debit','ACH','Return'];

  // ── Load project ────────────────────────────────────────────
  function loadProject() {
    try { return JSON.parse(localStorage.getItem(PROJECT_KEY)) || {}; } catch { return {}; }
  }
  function saveProject(data) {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(data));
  }

  const p = loadProject();

  // ── Form state ──────────────────────────────────────────────
  let title          = $state(p.title          || '');
  let budgetTemplate = $state(p.budgetTemplate || 'commercial');
  let csTemplate     = $state(p.callSheetTemplate || 'commercial');
  let prodNumber     = $state(p.productionNumber || '');
  let company        = $state(p.productionCompany || '');
  let director       = $state(p.director       || '');
  let producer       = $state(p.producer       || '');
  let startDate      = $state(p.startDate      || '');
  let wrapDate       = $state(p.wrapDate       || '');
  let fiscalYear     = $state(p.fiscalYear     || '');
  let defaultSubmitter = $state(p.defaultSubmitter || '');
  let defaultCcLast4   = $state(p.defaultCcLast4   || '');
  let defaultMethod    = $state(p.defaultMethod    || 'CC');
  let dropboxPath    = $state(p.dropboxPath    || '');
  let apiKey         = $state(localStorage.getItem('anthropic-api-key') ? '••••••••••••••••' : '');
  let notes          = $state(p.notes          || '');
  let staff          = $state(p.staff          || []);

  // ── Staff form ──────────────────────────────────────────────
  let showStaffForm = $state(false);
  let sfTitle = $state('');
  let sfName  = $state('');
  let sfEmail = $state('');
  let sfPhone = $state('');
  let sfNameError = $state(false);

  // ── Validation / save status ────────────────────────────────
  let titleError  = $state(false);
  let saveStatus  = $state('');
  let saveTimer   = null;

  // ── Save ────────────────────────────────────────────────────
  function handleSave() {
    if (!title.trim()) { titleError = true; return; }
    titleError = false;

    const data = {
      title: title.trim(),
      budgetTemplate,
      callSheetTemplate: csTemplate,
      productionNumber: prodNumber.trim(),
      productionCompany: company.trim(),
      director: director.trim(),
      producer: producer.trim(),
      startDate, wrapDate,
      fiscalYear: fiscalYear.trim(),
      defaultSubmitter: defaultSubmitter.trim(),
      defaultCcLast4: defaultCcLast4.trim(),
      defaultMethod,
      dropboxPath: dropboxPath.trim(),
      notes: notes.trim(),
      staff,
    };
    saveProject(data);

    if (apiKey && !apiKey.startsWith('•')) {
      localStorage.setItem('anthropic-api-key', apiKey.trim());
    }

    saveStatus = 'Saved ✓';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveStatus = '', 2500);
  }

  // ── Reset ────────────────────────────────────────────────────
  function handleReset() {
    if (!confirm('Clear all project settings? This cannot be undone.')) return;
    localStorage.removeItem(PROJECT_KEY);
    localStorage.removeItem('anthropic-api-key');
    window.location.reload();
  }

  // ── Staff add ────────────────────────────────────────────────
  function addStaff() {
    if (!sfName.trim()) { sfNameError = true; return; }
    staff = [...staff, { id: crypto.randomUUID(), title: sfTitle.trim(), name: sfName.trim(), email: sfEmail.trim(), phone: sfPhone.trim() }];
    sfTitle = ''; sfName = ''; sfEmail = ''; sfPhone = '';
    sfNameError = false;
    showStaffForm = false;
    // Persist staff immediately
    const current = loadProject();
    saveProject({ ...current, staff });
  }

  function removeStaff(id) {
    staff = staff.filter(s => s.id !== id);
    const current = loadProject();
    saveProject({ ...current, staff });
  }
</script>

<section class="setup-section">
  <div class="setup-header">
    <div>
      <h2>Project Setup</h2>
      <p class="setup-subtitle">Configure your production details. All settings are stored locally on this device.</p>
    </div>
  </div>

  <form onsubmit={e => { e.preventDefault(); handleSave(); }} novalidate autocomplete="off">

    <!-- ── Project Identity ── -->
    <div class="setup-card">
      <h3 class="setup-card__title">Project Identity</h3>
      <div class="form-grid">

        <div class="field field--full">
          <label for="sp-title">Project Title <span class="req">*</span></label>
          <input type="text" id="sp-title" bind:value={title} placeholder="Production title"
            maxlength="100" class:invalid={titleError} oninput={() => titleError = false} />
          {#if titleError}<span class="field-error">Project title is required.</span>{/if}
        </div>

        <div class="field">
          <label for="sp-budget-template">Budget Type</label>
          <select id="sp-budget-template" bind:value={budgetTemplate}>
            <option value="commercial">Commercial</option>
            <option value="feature">Feature/TV (coming soon)</option>
          </select>
        </div>

        <div class="field">
          <label for="sp-cs-template">Call Sheet Type</label>
          <select id="sp-cs-template" bind:value={csTemplate}>
            <option value="commercial">Commercial</option>
            <option value="feature">Feature/TV (coming soon)</option>
          </select>
        </div>

        <div class="field">
          <label for="sp-number">Production Number</label>
          <input type="text" id="sp-number" bind:value={prodNumber} placeholder="Production number or code" maxlength="30" />
        </div>

        <div class="field">
          <label for="sp-company">Production Company</label>
          <input type="text" id="sp-company" bind:value={company} placeholder="LLC or company name" maxlength="80" />
        </div>

        <div class="field">
          <label for="sp-director">Director</label>
          <input type="text" id="sp-director" bind:value={director} placeholder="Director full name" maxlength="80" />
        </div>

        <div class="field">
          <label for="sp-producer">Producer</label>
          <input type="text" id="sp-producer" bind:value={producer} placeholder="Producer full name" maxlength="80" />
        </div>

      </div>
    </div>

    <!-- ── Schedule ── -->
    <div class="setup-card">
      <h3 class="setup-card__title">Schedule</h3>
      <div class="form-grid">
        <div class="field">
          <label for="sp-start">Principal Photography Start</label>
          <input type="date" id="sp-start" bind:value={startDate} />
        </div>
        <div class="field">
          <label for="sp-wrap">Estimated Wrap Date</label>
          <input type="date" id="sp-wrap" bind:value={wrapDate} />
        </div>
        <div class="field">
          <label for="sp-fiscal-year">Fiscal Year</label>
          <input type="text" id="sp-fiscal-year" bind:value={fiscalYear} placeholder="Fiscal year range" maxlength="20" />
        </div>
      </div>
    </div>

    <!-- ── Staff Members ── -->
    <div class="setup-card">
      <h3 class="setup-card__title">Staff Members</h3>
      <p class="setup-hint" style="margin-bottom:12px">Staff added here will be auto-imported into the Crew List.</p>

      <div class="staff-list">
        {#if staff.length === 0 && !showStaffForm}
          <p class="staff-empty">No staff members added yet.</p>
        {/if}
        {#each staff as s (s.id)}
          <div class="staff-card">
            <div class="staff-card__info">
              <span class="staff-card__name">{s.name || '—'}</span>
              <span class="staff-card__title-text">{s.title || ''}</span>
              <span class="staff-card__contact">{[s.email, s.phone].filter(Boolean).join(' · ')}</span>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" onclick={() => removeStaff(s.id)}>Remove</button>
          </div>
        {/each}
      </div>

      {#if !showStaffForm}
        <button type="button" class="btn btn--ghost btn--sm" style="margin-top:10px"
          onclick={() => showStaffForm = true}>+ Add Staff Member</button>
      {:else}
        <div class="staff-add-form">
          <div class="form-grid" style="margin-top:12px">
            <div class="field">
              <label for="sf-title">Title / Role</label>
              <input type="text" id="sf-title" bind:value={sfTitle} placeholder="Title or role" maxlength="80" />
            </div>
            <div class="field">
              <label for="sf-name">Full Name <span class="req">*</span></label>
              <input type="text" id="sf-name" bind:value={sfName} placeholder="Full name" maxlength="80"
                class:invalid={sfNameError} oninput={() => sfNameError = false} />
              {#if sfNameError}<span class="field-error">Name is required.</span>{/if}
            </div>
            <div class="field">
              <label for="sf-email">Email Address</label>
              <input type="email" id="sf-email" bind:value={sfEmail} placeholder="Email address" maxlength="120" />
            </div>
            <div class="field">
              <label for="sf-phone">Phone Number</label>
              <input type="tel" id="sf-phone" bind:value={sfPhone} placeholder="Phone number" maxlength="30" />
            </div>
          </div>
          <div class="staff-add-actions">
            <button type="button" class="btn btn--primary btn--sm" onclick={addStaff}>Add to Staff</button>
            <button type="button" class="btn btn--ghost btn--sm"
              onclick={() => { showStaffForm = false; sfTitle=''; sfName=''; sfEmail=''; sfPhone=''; sfNameError=false; }}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Submission Defaults ── -->
    <div class="setup-card">
      <h3 class="setup-card__title">Submission Defaults</h3>
      <div class="form-grid">
        <div class="field">
          <label for="sp-submitter">Default Submitter Name</label>
          <input type="text" id="sp-submitter" bind:value={defaultSubmitter} placeholder="Your full name" maxlength="80" />
          <span class="setup-hint">Used as your name on submissions and in the profile button.</span>
        </div>
        <div class="field">
          <label for="sp-cc-last4">Default CC Last 4 Digits</label>
          <input type="text" id="sp-cc-last4" bind:value={defaultCcLast4} maxlength="4" placeholder="Last 4 digits" inputmode="numeric" />
          <span class="setup-hint">Pre-fills CC Last 4 on new submissions.</span>
        </div>
        <div class="field">
          <label for="sp-default-method">Default Payment Method</label>
          <select id="sp-default-method" bind:value={defaultMethod}>
            {#each METHODS as m}<option value={m}>{m}</option>{/each}
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
          <input type="text" id="sp-dropbox" bind:value={dropboxPath} placeholder="Local Dropbox path for receipt folders" maxlength="300" />
          <span class="setup-hint">Local Dropbox path where receipt folders are stored. Used as a reference — no cloud connection is made.</span>
        </div>
        <div class="field field--full">
          <label for="sp-api-key">Anthropic API Key</label>
          <input type="password" id="sp-api-key" bind:value={apiKey} placeholder="sk-ant-…" maxlength="200" autocomplete="off" />
          <span class="setup-hint">Required for AI-powered receipt autofill. Stored locally in your browser only.</span>
        </div>
      </div>
    </div>

    <!-- ── Notes ── -->
    <div class="setup-card">
      <h3 class="setup-card__title">Project Notes</h3>
      <div class="form-grid">
        <div class="field field--full">
          <label for="sp-notes">Notes</label>
          <textarea id="sp-notes" bind:value={notes} rows="4" placeholder="Additional notes or production reminders…"></textarea>
        </div>
      </div>
    </div>

    <!-- ── Actions ── -->
    <div class="form-actions setup-actions">
      <button type="button" class="btn btn--ghost" onclick={handleReset}>Reset to Defaults</button>
      <div class="setup-save-group">
        {#if saveStatus}<span class="setup-save-status">{saveStatus}</span>{/if}
        <button type="submit" class="btn btn--primary">Save Project Settings</button>
      </div>
    </div>

  </form>
</section>

<style>
  .setup-section { max-width: 860px; }

  .setup-header  { margin-bottom: 24px; }
  .setup-header h2 { font-size: 1.25rem; margin-bottom: 4px; }
  .setup-subtitle  { font-size: 0.85rem; color: var(--text-muted, #888); }

  .setup-card {
    background: var(--surface-1, #161616);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .setup-card__title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #888);
    margin-bottom: 16px;
  }

  .setup-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #666);
    margin-top: 4px;
    display: block;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .field { display: flex; flex-direction: column; gap: 4px; }
  .field--full { grid-column: 1 / -1; }

  .field label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
  }

  .req { color: var(--earth-red, #b84f4f); }

  .field input,
  .field select,
  .field textarea {
    background: var(--surface-2, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text, #eee);
    font-size: 0.875rem;
    padding: 7px 10px;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus { outline: none; border-color: var(--accent, #6a8a6a); }

  .field input.invalid,
  .field select.invalid { border-color: var(--earth-red, #b84f4f); }

  .field-error { font-size: 0.75rem; color: var(--earth-red, #b84f4f); }

  .field textarea { resize: vertical; }

  /* Staff */
  .staff-list    { display: flex; flex-direction: column; gap: 8px; }
  .staff-empty   { font-size: 0.85rem; color: var(--text-muted, #888); }

  .staff-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-2, #1e1e1e);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
    padding: 10px 12px;
  }

  .staff-card__info  { display: flex; flex-direction: column; gap: 2px; }
  .staff-card__name  { font-size: 0.875rem; font-weight: 500; }
  .staff-card__title-text { font-size: 0.8rem; color: var(--text-muted, #888); }
  .staff-card__contact    { font-size: 0.75rem; color: var(--text-muted, #666); }

  .staff-add-form { margin-top: 12px; }
  .staff-add-actions { display: flex; gap: 8px; margin-top: 12px; }

  /* Actions */
  .form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 24px;
  }

  .setup-save-group { display: flex; align-items: center; gap: 12px; }
  .setup-save-status { font-size: 0.85rem; color: var(--accent, #6a8a6a); }
</style>
