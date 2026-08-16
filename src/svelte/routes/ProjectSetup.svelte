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
  let startDate      = $state(p.startDate      || '');
  let wrapDate       = $state(p.wrapDate       || '');
  let fiscalYear     = $state(p.fiscalYear     || '');
  let dropboxPath    = $state(p.dropboxPath    || '');
  let apiKey         = $state(localStorage.getItem('anthropic-api-key') ? '••••••••••••••••' : '');

  /* Sections open on the appearance switch's own terms — see Project
     Settings, which this mirrors. Setup is a form somebody is filling in for
     the first time, so its identity section starts open. */
  const OPEN_KEY = 'movie-ledger-psetup-open-sections';
  let openSections = $state((() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const parsed = raw === null ? null : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : ['identity'];
    } catch { return ['identity']; }
  })());

  function onSectionToggle(key, isOpen) {
    openSections = isOpen
      ? [...new Set([...openSections, key])]
      : openSections.filter(k => k !== key);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(openSections)); } catch { /* private mode */ }
  }

  let theme = $state(document.documentElement.dataset.theme || 'dark');
  function onThemeChange(e) {
    theme = e.currentTarget.checked ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('movie-ledger-theme', theme);
  }

  // ── Validation / save status ────────────────────────────────
  let titleError  = $state(false);
  let saveStatus  = $state('');
  let saveTimer   = null;

  // ── Save ────────────────────────────────────────────────────
  function handleSave() {
    if (!title.trim()) { titleError = true; return; }
    titleError = false;

    // Spread the stored project first. This object used to be built from the
    // form alone and written over the top, which is fine while every field has
    // a box and destructive the moment one does not: director, producer, the
    // submission defaults, notes and staff no longer appear on this screen,
    // and rebuilding without them would erase whatever a project already had
    // the first time somebody saved an unrelated change.
    const data = {
      ...loadProject(),
      title: title.trim(),
      budgetTemplate,
      callSheetTemplate: csTemplate,
      productionNumber: prodNumber.trim(),
      productionCompany: company.trim(),
      startDate, wrapDate,
      fiscalYear: fiscalYear.trim(),
      dropboxPath: dropboxPath.trim(),
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

</script>

<section class="setup-section">
  <div class="setup-header">
    <div>
      <h2>Project Setup</h2>
      <p class="setup-subtitle">Configure your production details. All settings are stored locally on this device.</p>
    </div>

    <label class="ps-theme-switch" title="Switch between light and dark mode">
      <span class="ps-theme-switch__icon" aria-hidden="true">☀</span>
      <input type="checkbox" checked={theme === 'dark'} onchange={onThemeChange} />
      <span class="ps-theme-switch__track"><span class="ps-theme-switch__knob"></span></span>
      <span class="ps-theme-switch__icon" aria-hidden="true">☽</span>
      <span class="ps-visually-hidden">Dark mode</span>
    </label>
  </div>

  <form onsubmit={e => { e.preventDefault(); handleSave(); }} novalidate autocomplete="off">

    <!-- ── Project Identity ── -->
    <details class="setup-card ps-collapse" open={openSections.includes('identity')}
      ontoggle={e => onSectionToggle('identity', e.currentTarget.open)}>
      <summary class="setup-card__title ps-summary">
        <span class="ps-caret" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        Project Identity
      </summary>
      <div class="ps-card-body">
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

        </div>
      </div>
    </details>

    <!-- ── Calendar Admin ── -->
    <details class="setup-card ps-collapse" open={openSections.includes('schedule')}
      ontoggle={e => onSectionToggle('schedule', e.currentTarget.open)}>
      <summary class="setup-card__title ps-summary">
        <span class="ps-caret" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        Calendar Admin
      </summary>
      <div class="ps-card-body">
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
    </details>

    <!-- ── File Storage ── -->
    <details class="setup-card ps-collapse" open={openSections.includes('storage')}
      ontoggle={e => onSectionToggle('storage', e.currentTarget.open)}>
      <summary class="setup-card__title ps-summary">
        <span class="ps-caret" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        File Storage
      </summary>
      <div class="ps-card-body">
        <div class="form-grid">
          <div class="field field--full">
            <!-- Same mark as Project Settings. Drawn inline rather than
                 fetched: one less request that has to succeed on the screen
                 people open when filing is not working. -->
            <label class="ps-label-with-mark" for="sp-dropbox">
              <svg class="ps-dropbox-mark" viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" focusable="false">
                <path fill="#0061FF" d="M8 2 0 7.2l8 5.2 8-5.2L8 2Zm16 0-8 5.2 8 5.2 8-5.2L24 2ZM0 17.6l8 5.2 8-5.2-8-5.2-8 5.2Zm24-5.2-8 5.2 8 5.2 8-5.2-8-5.2ZM8 24.5l8 5.2 8-5.2-8-5.2-8 5.2Z"/>
              </svg>
              Dropbox Folder Path
            </label>
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
    </details>

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

  /* .setup-header itself is left to styles.css — it is already flex with
     space-between there, which is what puts the appearance switch in the
     corner. Overriding it here with a plain block put the switch under the
     subtitle. */
  .setup-header h2 { font-size: 1.25rem; margin-bottom: 4px; }
  .setup-subtitle  { font-size: 0.85rem; color: var(--text-muted, #888); }

  /* .setup-card and .setup-card__title come from styles.css, along with the
     .ps-collapse rules that strip the scrim and turn the title into a
     disclosure header. Redeclaring them here matched that specificity and
     left which one won down to stylesheet order. */

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
  .field select {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 7px 10px;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .field input:focus,
  .field select:focus { outline: none; border-color: var(--accent); }

  .field input.invalid { border-color: var(--earth-red, #b84f4f); }

  .field-error { font-size: 0.75rem; color: var(--earth-red, #b84f4f); }


  /* Staff */

  /* Actions */
  .form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0 24px;
  }

  .setup-save-group { display: flex; align-items: center; gap: 12px; }
  .setup-save-status { font-size: 0.85rem; color: var(--accent); }
</style>
