<script>
  import { onMount, onDestroy } from 'svelte';
  import { hydrate } from '../../../src/data.js';
  import {
    getProject, saveProject,
    getRegistry, saveRegistry,
    getActiveProjectId, setActiveProjectId,
    registerProject, snapshotProject, restoreProject,
    switchProject, PROJECT_DATA_KEYS,
    refreshProjectStore,
  } from '../stores/project.js';

  let container;

  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _tplLabel(tpl) {
    return tpl === 'feature' ? 'Feature/TV' : 'Commercial';
  }

  function _projectCard(r, isActive) {
    return `
      <div class="pm-card${isActive ? ' pm-card--active' : ''}" data-project-id="${_esc(r.id)}">
        <div class="pm-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
            <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5h3.5l1.5-2H19c1.1 0 2 .9 2 2V17c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8.5z"/>
          </svg>
        </div>
        <h3 class="pm-card__title">${_esc(r.productionNumber ? r.productionNumber + '_' + r.title : r.title)}</h3>
        <p class="pm-card__meta">
          ${_esc(_tplLabel(r.budgetTemplate))}
          ${r.productionNumber ? ' · #' + _esc(r.productionNumber) : ''}
        </p>
        <div class="pm-card__actions">
          ${isActive
            ? `<button class="btn btn--primary btn--sm pm-open-project" data-pid="${_esc(r.id)}">Open Project</button>
               <button class="btn btn--ghost btn--sm pm-settings-btn" data-pid="${_esc(r.id)}">Settings</button>
               <button class="btn btn--ghost btn--sm pm-btn-archive" data-pid="${_esc(r.id)}">Archive</button>`
            : `<button class="btn btn--primary btn--sm pm-switch-btn" data-pid="${_esc(r.id)}">Switch To</button>
               <button class="btn btn--ghost btn--sm pm-btn-archive" data-pid="${_esc(r.id)}">Archive</button>`
          }
        </div>
      </div>`;
  }

  function _render() {
    if (!container) return;
    const project        = getProject();
    const hasProject     = !!project?.title;
    const activeId       = getActiveProjectId();
    const registry       = getRegistry();
    const otherProjects  = registry.filter(r => r.id !== activeId && !r._archived);
    const archivedProjects = registry.filter(r => r._archived);
    const logoSrc        = document.documentElement.dataset.theme === 'light'
      ? '/assets/logo-day.png' : '/assets/logo-night.png';

    container.innerHTML = `
      <section class="pm-section">
        <div class="pm-welcome">
          <img src="${logoSrc}" alt="The Masterbook" class="pm-welcome-logo" />
          <p class="pm-welcome-text">Welcome to Masterbook!</p>
        </div>
        <div class="pm-header">
          <h2 class="pm-title">Project Menu</h2>
          <p class="pm-subtitle">Create, open, or manage your productions.</p>
        </div>

        <div class="pm-cards">
          ${hasProject ? _projectCard({ id: activeId, ...project }, true) : ''}
          ${otherProjects.map(r => _projectCard(r, false)).join('')}

          <!-- Create New Project Card -->
          <div class="pm-card pm-card--create" id="pm-create-card">
            <div class="pm-card__icon pm-card__icon--create">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <h3 class="pm-card__title">Create New Project</h3>
            <p class="pm-card__desc">Start a new production from scratch.</p>
          </div>
        </div>

        ${archivedProjects.length > 0 ? `
          <div class="pm-archived-section">
            <button class="btn btn--ghost btn--sm" id="pm-toggle-archived">
              Show Archived Projects (${archivedProjects.length})
            </button>
            <div class="pm-archived-list hidden" id="pm-archived-list">
              ${archivedProjects.map(r => `
                <div class="pm-card pm-card--archived" data-project-id="${_esc(r.id)}">
                  <div class="pm-card__icon" style="opacity:0.4;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                      <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5h3.5l1.5-2H19c1.1 0 2 .9 2 2V17c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8.5z"/>
                    </svg>
                  </div>
                  <h3 class="pm-card__title" style="opacity:0.6;">${_esc(r.productionNumber ? r.productionNumber + '_' + r.title : r.title)}</h3>
                  <p class="pm-card__meta" style="opacity:0.5;">${_esc(_tplLabel(r.budgetTemplate))} · Archived</p>
                  <div class="pm-card__actions">
                    <button class="btn btn--ghost btn--sm pm-restore-btn" data-pid="${_esc(r.id)}">Restore</button>
                    <button class="btn btn--ghost btn--sm pm-delete-btn" data-pid="${_esc(r.id)}" style="color:var(--red,#e55);">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Create Project Form (hidden by default) -->
        <div class="pm-create-form hidden" id="pm-create-form">
          <h3 class="pm-form-title">New Project</h3>
          <p class="pm-form-subtitle">These fields cannot be changed after project creation.</p>

          <div class="form-grid">
            <div class="field field--full">
              <label for="pm-title">Project Title <span class="req">*</span></label>
              <input type="text" id="pm-title" placeholder="e.g. The Feature Film" maxlength="100" required />
              <span class="field-error" id="pm-err-title"></span>
            </div>
            <div class="field">
              <label for="pm-prod-num">Production Number <span class="req">*</span></label>
              <input type="text" id="pm-prod-num" placeholder="e.g. 2026-001" maxlength="30" required />
              <span class="field-error" id="pm-err-prod-num"></span>
            </div>
            <div class="field">
              <label for="pm-template">Budget Type <span class="req">*</span></label>
              <select id="pm-template">
                <option value="commercial">Commercial</option>
                <option value="feature">Feature/TV (coming soon)</option>
              </select>
            </div>
            <div class="field">
              <label for="pm-cs-template">Call Sheet Type <span class="req">*</span></label>
              <select id="pm-cs-template">
                <option value="commercial">Commercial</option>
                <option value="feature">Feature/TV (coming soon)</option>
              </select>
            </div>
          </div>

          <div class="form-actions" style="margin-top:16px">
            <button class="btn btn--ghost" id="pm-cancel-create">Cancel</button>
            <button class="btn btn--primary" id="pm-confirm-create">Create Project</button>
          </div>
        </div>
      </section>
    `;

    _wire();
  }

  function _wire() {
    const c = container;

    // Open project → go to Purchase Log
    c.querySelectorAll('.pm-open-project').forEach(btn => {
      btn.addEventListener('click', () => { window.location.hash = '#log'; });
    });

    // Settings
    c.querySelectorAll('.pm-settings-btn').forEach(btn => {
      btn.addEventListener('click', () => { window.location.hash = '#settings'; });
    });

    // Archive active or non-active project
    c.querySelectorAll('.pm-btn-archive').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid     = btn.dataset.pid;
        const isActive = pid === getActiveProjectId();
        const reg     = getRegistry();
        const entry   = reg.find(r => r.id === pid);
        if (!entry) return;
        if (!confirm(`Archive project "${entry.title}"?\n\nThe project data will be hidden but can be restored later.`)) return;

        if (isActive) {
          const p = getProject();
          if (p) {
            p._archived   = true;
            p._archivedAt = new Date().toISOString();
            saveProject(p);
          }
        }
        entry._archived = true;
        saveRegistry(reg);

        if (isActive) {
          snapshotProject(pid);
          const next = reg.find(r => !r._archived && r.id !== pid);
          if (next) {
            restoreProject(next.id);
            setActiveProjectId(next.id);
          } else {
            for (const key of PROJECT_DATA_KEYS) localStorage.removeItem(key);
            setActiveProjectId('');
          }
          refreshProjectStore();
          hydrate();
        }

        _render();
      });
    });

    // Switch to another project
    c.querySelectorAll('.pm-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchProject(btn.dataset.pid);
        hydrate();
        _render();
      });
    });

    // Restore archived project
    c.querySelectorAll('.pm-restore-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid   = btn.dataset.pid;
        const reg   = getRegistry();
        const entry = reg.find(r => r.id === pid);
        if (!entry) return;
        entry._archived = false;
        saveRegistry(reg);
        _render();
      });
    });

    // Delete archived project permanently
    c.querySelectorAll('.pm-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid   = btn.dataset.pid;
        const reg   = getRegistry();
        const entry = reg.find(r => r.id === pid);
        if (!entry) return;
        if (!confirm(`Permanently delete "${entry.title}"? This cannot be undone.`)) return;
        for (const key of PROJECT_DATA_KEYS) localStorage.removeItem(`ml-${pid}-${key}`);
        saveRegistry(reg.filter(r => r.id !== pid));
        _render();
      });
    });

    // Toggle archived section
    c.querySelector('#pm-toggle-archived')?.addEventListener('click', () => {
      const list = c.querySelector('#pm-archived-list');
      const toggleBtn = c.querySelector('#pm-toggle-archived');
      if (!list) return;
      const showing = !list.classList.contains('hidden');
      list.classList.toggle('hidden');
      const archivedCount = getRegistry().filter(r => r._archived).length;
      toggleBtn.textContent = showing
        ? `Show Archived Projects (${archivedCount})`
        : 'Hide Archived Projects';
    });

    // Create card → show form
    const createCard = c.querySelector('#pm-create-card');
    const createForm = c.querySelector('#pm-create-form');
    if (createCard && createForm) {
      createCard.addEventListener('click', () => {
        createForm.classList.remove('hidden');
        createCard.classList.add('hidden');
        c.querySelector('#pm-title')?.focus();
      });
    }

    // Cancel create
    c.querySelector('#pm-cancel-create')?.addEventListener('click', () => {
      createForm?.classList.add('hidden');
      createCard?.classList.remove('hidden');
    });

    // Confirm create
    c.querySelector('#pm-confirm-create')?.addEventListener('click', () => {
      const title   = c.querySelector('#pm-title')?.value.trim();
      const prodNum = c.querySelector('#pm-prod-num')?.value.trim();
      const tpl     = c.querySelector('#pm-template')?.value || 'commercial';
      const csTpl   = c.querySelector('#pm-cs-template')?.value || 'commercial';

      let valid = true;
      const errTitle = c.querySelector('#pm-err-title');
      const errNum   = c.querySelector('#pm-err-prod-num');

      if (!title) {
        if (errTitle) errTitle.textContent = 'Project title is required.';
        c.querySelector('#pm-title')?.classList.add('invalid');
        c.querySelector('#pm-title')?.focus();
        valid = false;
      } else {
        if (errTitle) errTitle.textContent = '';
        c.querySelector('#pm-title')?.classList.remove('invalid');
      }

      if (!prodNum) {
        if (errNum) errNum.textContent = 'Production number is required.';
        c.querySelector('#pm-prod-num')?.classList.add('invalid');
        if (valid) c.querySelector('#pm-prod-num')?.focus();
        valid = false;
      } else {
        if (errNum) errNum.textContent = '';
        c.querySelector('#pm-prod-num')?.classList.remove('invalid');
      }

      if (!valid) return;

      // Snapshot current project before clearing
      const currentId = getActiveProjectId();
      if (currentId) snapshotProject(currentId);

      // Clear all project data for the new project
      for (const key of PROJECT_DATA_KEYS) localStorage.removeItem(key);

      const newProject = {
        title,
        productionNumber: prodNum,
        budgetTemplate: tpl,
        callSheetTemplate: csTpl,
        _createdAt: new Date().toISOString(),
      };

      const newId = crypto.randomUUID();
      saveProject(newProject);
      registerProject(newId, newProject);
      setActiveProjectId(newId);
      snapshotProject(newId);
      hydrate();
      refreshProjectStore();

      window.location.hash = '#settings';
    });
  }

  onMount(() => {
    _render();

    // If the page navigates to #home with an intent to open the create form
    // (e.g. from profile dropdown "New Project"), auto-open it.
    const intent = sessionStorage.getItem('pm-intent');
    if (intent === 'create') {
      sessionStorage.removeItem('pm-intent');
      const createCard = container?.querySelector('#pm-create-card');
      const createForm = container?.querySelector('#pm-create-form');
      if (createCard && createForm) {
        createForm.classList.remove('hidden');
        createCard.classList.add('hidden');
        container.querySelector('#pm-title')?.focus();
      }
    }
  });

  onDestroy(() => {
    if (container) container.innerHTML = '';
  });
</script>

<div bind:this={container} class="pm-root"></div>

<style>
  .pm-root {
    width: 100%;
  }

  /* All downstream CSS lives in the global stylesheet (src/style.css).
     Only component-scoped overrides go here. */
</style>
