<script>
  import { onMount, onDestroy } from 'svelte';
  import { hydrate } from '../../../src/data.js';
  import {
    getProject, saveProject,
    getRegistry, saveRegistry,
    getActiveProjectId, setActiveProjectId,
    registerProject, snapshotProject, restoreProject,
    switchProject, PROJECT_DATA_KEYS,
    refreshProjectStore, ensureProjectInCloud,
  } from '../stores/project.js';

  // The document-level close handler is bound once, not on every re-render —
  // _wire() runs again after each render, and rebinding would stack listeners.
  let _docCloseBound = false;

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

  /**
   * One project, as a line.
   *
   * The name carries the primary action — open it if it is the one already
   * loaded, switch to it otherwise — and the ⋯ holds everything else. Keeping
   * the old handler class names means the existing wiring still finds these.
   */
  function _projectRow(r, isActive) {
    const label = _esc(r.productionNumber ? r.productionNumber + '_' + r.title : r.title);
    return `
      <div class="pm-row" data-project-id="${_esc(r.id)}">
        <button class="pm-row-open ${isActive ? 'pm-open-project' : 'pm-switch-btn'}"
                data-pid="${_esc(r.id)}" title="${isActive ? 'Open' : 'Switch to'} ${label}">
          <span class="pm-row-caret" aria-hidden="true">&gt;</span>
          <span class="pm-row-name">${label}</span>
        </button>
        <button class="pm-row-more" data-pid="${_esc(r.id)}"
                aria-label="More options for ${label}" aria-expanded="false">···</button>
        <div class="pm-row-menu hidden" data-menu-for="${_esc(r.id)}">
          <button class="pm-row-menu-item pm-settings-btn" data-pid="${_esc(r.id)}">Settings</button>
          <button class="pm-row-menu-item pm-btn-archive" data-pid="${_esc(r.id)}">Archive</button>
        </div>
      </div>`;
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
    // Always the dark mark here, whatever the theme. This screen is a pale
    // photograph rather than the app's dark surface, so the light logo — which
    // is correct everywhere else — washes out against the sky.
    //
    // Served from the root, where public/ actually puts it. The /assets/ path
    // this used resolves in dev but is where Vite writes hashed build output,
    // so it is not a path to rely on.
    const logoSrc = '/logo-day.png';

    container.innerHTML = `
      <!-- Outside the section, which is left-padded to hold the menu. Inside
           it the mark centred on the menu's column rather than on the screen,
           which read as slightly off. -->
      <div class="pm-welcome">
        <img src="${logoSrc}" alt="The Masterbook" class="pm-welcome-logo" />
      </div>

      <section class="pm-section">

        <!-- A list of things to open, not a grid of cards. Each project is one
             line: a caret, its name, and a ⋯ holding the things you rarely do
             to it. Settings and Archive as permanent buttons put three
             controls of equal weight on every row, when the one you want is
             almost always the name. -->
        <nav class="pm-menu">
          <div class="pm-rows">
            ${hasProject ? _projectRow({ id: activeId, ...project }, true) : ''}
            ${otherProjects.map(r => _projectRow(r, false)).join('')}
          </div>

          <button class="pm-link" id="pm-create-card">+ New Project</button>
          ${archivedProjects.length > 0
            ? `<button class="pm-link" id="pm-toggle-archived">Archive</button>` : ''}
          <button class="pm-link" id="pm-account">Account</button>
        </nav>

        ${archivedProjects.length > 0 ? `
          <div class="pm-archived-section">
            <!-- The Archive entry in the menu above is this list's only toggle.
                 A second button here duplicated both the control and its id. -->
            <!-- Archived projects read as a list like the live ones, rather
                 than as stacked cards. They are the same kind of thing, seen
                 in the same place, and the card layout gave three lines and a
                 32px icon to something nobody is looking for. -->
            <div class="pm-archived-list hidden" id="pm-archived-list">
              ${archivedProjects.map(r => `
                <div class="pm-arch-row" data-project-id="${_esc(r.id)}">
                  <span class="pm-arch-name">${_esc(r.productionNumber ? r.productionNumber + '_' + r.title : r.title)}</span>
                  <span class="pm-arch-actions">
                    <button class="pm-arch-btn pm-restore-btn" data-pid="${_esc(r.id)}">Restore</button>
                    <button class="pm-arch-btn pm-arch-btn--danger pm-delete-btn" data-pid="${_esc(r.id)}">Delete</button>
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Create Project Form (hidden by default). Takes the screen on its
             own: the menu behind it is a list of things you are not doing
             while filling this in, and leaving it there gave the photograph
             two competing blocks of text to hold. -->
        <div class="pm-create-form hidden" id="pm-create-form">
          <button class="pm-back" id="pm-back-to-menu" aria-label="Back to project menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h3 class="pm-form-title">New Project</h3>
          <p class="pm-form-subtitle">These fields cannot be changed after project creation.</p>

          <div class="form-grid pm-form-grid">
            <div class="field field--full">
              <label for="pm-title">Project Title <span class="req">*</span></label>
              <input type="text" id="pm-title" maxlength="100" required />
              <span class="field-error" id="pm-err-title"></span>
            </div>
            <div class="field">
              <label for="pm-cs-template">Call Sheet Type <span class="req">*</span></label>
              <select id="pm-cs-template">
                <option value="commercial">Commercial</option>
                <option value="feature">Feature/TV (coming soon)</option>
              </select>
            </div>
            <div class="field">
              <label for="pm-template">Budget Type <span class="req">*</span></label>
              <select id="pm-template">
                <option value="commercial">Commercial</option>
                <option value="feature">Feature/TV (coming soon)</option>
              </select>
            </div>
            <div class="field">
              <label for="pm-prod-num">Production Number <span class="req">*</span></label>
              <input type="text" id="pm-prod-num" maxlength="30" required />
              <span class="field-error" id="pm-err-prod-num"></span>
            </div>
          </div>

          <div class="form-actions pm-form-actions">
            <button class="btn btn--ghost pm-form-btn" id="pm-cancel-create">Cancel</button>
            <button class="btn btn--primary pm-form-btn" id="pm-confirm-create">Create Project</button>
          </div>
        </div>
      </section>
    `;

    _wire();
  }

  function _wire() {
    const c = container;

    /* ── Per-project ⋯ menus ──
       One open at a time, and a click anywhere else closes it. Without that,
       opening a second leaves the first hanging over the list. */
    const closeRowMenus = (except) => {
      c.querySelectorAll('.pm-row-menu').forEach(m => {
        if (m !== except) m.classList.add('hidden');
      });
      c.querySelectorAll('.pm-row-more').forEach(b => b.setAttribute('aria-expanded', 'false'));
    };

    c.querySelectorAll('.pm-row-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = btn.parentElement.querySelector('.pm-row-menu');
        const willOpen = menu.classList.contains('hidden');
        closeRowMenus(willOpen ? menu : null);
        menu.classList.toggle('hidden', !willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
      });
    });

    // Clicking into a menu must not close it before the item handler runs.
    c.querySelectorAll('.pm-row-menu').forEach(m => {
      m.addEventListener('click', e => e.stopPropagation());
    });

    if (!_docCloseBound) {
      document.addEventListener('click', () => {
        container?.querySelectorAll('.pm-row-menu').forEach(m => m.classList.add('hidden'));
        container?.querySelectorAll('.pm-row-more').forEach(b => b.setAttribute('aria-expanded', 'false'));
      });
      _docCloseBound = true;
    }

    c.querySelector('#pm-account')?.addEventListener('click', () => {
      window.location.hash = '#account';
    });

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
      btn.addEventListener('click', async () => {
        switchProject(btn.dataset.pid);
        hydrate();
        // Switching used to re-render the menu and stop there, so clicking a
        // project loaded it and then left you looking at the list you clicked
        // from — indistinguishable from nothing having happened. Clicking a
        // project's name means "take me into it".
        await ensureProjectInCloud().catch(() => {});
        refreshProjectStore();
        window.location.hash = '#log';
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
      // The menu entry is a plain word, so it says what it will do next.
      toggleBtn.textContent = showing ? 'Archive' : 'Hide Archive';
    });

    // Create card → show form
    const createCard = c.querySelector('#pm-create-card');
    const createForm = c.querySelector('#pm-create-form');
    // The menu and the form are two views of this screen, not a form appended
    // to a menu. Only one is on the picture at a time.
    const menuNav = c.querySelector('.pm-menu');
    const archived = c.querySelector('.pm-archived-section');
    const showCreate = (show) => {
      createForm?.classList.toggle('hidden', !show);
      menuNav?.classList.toggle('hidden', show);
      archived?.classList.toggle('hidden', show);
    };

    c.querySelector('#pm-back-to-menu')?.addEventListener('click', () => {
      showCreate(false);
    });

    if (createCard && createForm) {
      createCard.addEventListener('click', () => {
        showCreate(true);
        c.querySelector('#pm-title')?.focus();
      });
    }

    // Cancel create
    c.querySelector('#pm-cancel-create')?.addEventListener('click', () => {
      showCreate(false);
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

      // Order matters. saveProject reads the *active* id to decide what it is
      // saving and where to sync it, so the new id has to be active before it
      // runs, and registered before syncRegistryEntry looks for it.
      //
      // Saving first was two bugs at once. On a fresh install there was no
      // active id, so saveProject skipped the cloud entirely — the project
      // existed only in localStorage, no row was inserted, the trigger that
      // makes the creator an admin never fired, and everything gated on
      // membership then failed. Uploading a receipt was the first thing to
      // notice, with an RLS error nobody could act on. And where a project
      // *was* already open, the new project's data was written under the old
      // project's id, overwriting it.
      const newId = crypto.randomUUID();
      setActiveProjectId(newId);
      registerProject(newId, newProject);
      saveProject(newProject);
      snapshotProject(newId);
      hydrate();
      refreshProjectStore();

      // Confirm the project actually landed in the cloud and that its creator
      // is its admin, before letting them into it.
      //
      // saveProject syncs fire-and-forget, so without this the first thing
      // anyone does in a brand new project races the row that has to exist for
      // them to be allowed to do it — and losing that race looks like an
      // unreadable RLS error on whatever they tried, not like a project that
      // was never saved. Waiting a moment here is worth never seeing that.
      ensureProjectInCloud().then(r => {
        if (r?.failed || (r?.reason && r.reason !== 'granted')) {
          console.warn('[project] new project may not be usable yet:', r);
        }
      });

      window.location.hash = '#settings';
    });
  }

  // The profile dropdown's New Project button used to jump here with a
  // sessionStorage flag so this screen opened the create form on arrival. That
  // button is gone — the dropdown points at this menu instead, where creating
  // a project sits beside the ones that already exist. Nothing sets the flag,
  // so the code that read it went with it.
  onMount(() => {
    _render();
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
