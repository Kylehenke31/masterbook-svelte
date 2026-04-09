/* ============================================================
   The Masterbook — app.js
   Entry point: shell, declarative router, theme toggle,
   Project Menu, Project Settings.
   ============================================================ */

import { hydrate }              from './data.js?v=6';
import { renderPurchaseLog }   from './purchaseLog.js?v=33';
import { renderSubmissionForm } from './submissionForm.js?v=33';
import { renderProjectSetup }  from './projectSetup.js?v=3';
import { renderPersonnel }     from './personnel.js?v=2';
import { renderBudget, renderBudgetOverview, renderHotCosts } from './budget.js?v=26';
import { renderCallSheet }    from './callSheet.js?v=35';
import { renderVendors }     from './vendors.js?v=10';
import { renderInsurance }  from './insurance.js?v=6';
import { renderCalendar }  from './calendar.js?v=8';
import { renderSchedules } from './schedules.js?v=9';
import { renderBreakdowns } from './breakdowns.js?v=22';
import { renderFiles }     from './files.js?v=1';
import { renderOneLiner }  from './oneLiner.js?v=7';
import { renderScriptOrder } from './scriptOrder.js?v=2';
import { renderShootingSchedule } from './shootingSchedule.js?v=3';
import { renderElementsReport } from './elementsReport.js?v=1';
import { renderDooDs } from './dooDs.js?v=1';

/* ────────────────────────────────────────────────────────────
   ROUTE TABLE
   ──────────────────────────────────────────────────────────── */
const ROUTES = {
  'home':         { render: renderProjectMenu,   label: 'Project Menu',     nav: false, sidebar: false, group: null,         requiresProject: false },
  'log':          { render: renderPurchaseLog,    label: 'Purchase Log',     nav: true,  sidebar: false, group: null,         requiresProject: true  },
  'submit':       { render: null /* special */,   label: 'New Submission',   nav: false, sidebar: false, group: null,         requiresProject: true  },
  'crew':         { render: renderPersonnel,       label: 'Personnel',        nav: true,  sidebar: false, group: null,         requiresProject: true  },
  'calendar':     { render: renderCalendar,        label: 'Calendar',         nav: true,  sidebar: false, group: 'calendar',   requiresProject: true  },
  'schedules':    { render: renderSchedules,       label: 'Schedules',        nav: false, sidebar: true,  group: 'schedules',  requiresProject: true  },
  'breakdowns':   { render: renderBreakdowns,     label: 'Breakdowns',       nav: false, sidebar: false, group: 'schedules',  requiresProject: true  },
  'one-liner':    { render: renderOneLiner,      label: 'One-Liner',        nav: false, sidebar: false, group: 'schedules',  requiresProject: true  },
  'script-order': { render: renderScriptOrder,  label: 'Script Order',     nav: false, sidebar: false, group: 'schedules',  requiresProject: true  },
  'shooting-schedule': { render: renderShootingSchedule, label: 'Shooting Schedule', nav: false, sidebar: false, group: 'schedules', requiresProject: true },
  'elements-report':   { render: renderElementsReport,   label: 'Elements Report',   nav: false, sidebar: false, group: 'schedules', requiresProject: true },
  'day-out-of-days':   { render: renderDooDs,             label: 'Day-out-of-Days',   nav: false, sidebar: false, group: 'schedules', requiresProject: true },
  'budget':       { render: renderBudgetOverview, label: 'Budget Overview',  nav: false, sidebar: true,  group: 'budget',     requiresProject: true  },
  'budget-lines': { render: renderBudget,         label: 'Line Items',       nav: false, sidebar: true,  group: 'budget',     requiresProject: true  },
  'hot-costs':    { render: renderHotCosts,       label: 'Hot Costs',        nav: false, sidebar: true,  group: 'budget',     requiresProject: true  },
  'call-sheet':   { render: renderCallSheet,       label: 'Call Sheet',       nav: false, sidebar: true,  group: 'call-sheet', requiresProject: true  },
  'insurance':    { render: renderInsurance,       label: 'Insurance',        nav: false, sidebar: true,  group: 'insurance',  requiresProject: true  },
  'vendors':      { render: renderVendors,         label: 'Vendors',          nav: true,  sidebar: false, group: 'vendors',    requiresProject: true  },
  'files':        { render: renderFiles,          label: 'Files',            nav: false, sidebar: true,  group: 'files',      requiresProject: true  },
  'setup':        { render: null /* special */,   label: 'Project Setup',    nav: false, sidebar: false, group: null,         requiresProject: false },
  'settings':     { render: null /* special */,   label: 'Project Settings', nav: false, sidebar: false, group: null,         requiresProject: true  },
};

/* ── Restore theme before shell renders to avoid flash ── */
(function restoreTheme() {
  const saved = localStorage.getItem('movie-ledger-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  const theme = document.documentElement.dataset.theme || 'dark';
  const sidebarLogo = document.getElementById('sidebar-logo');
  if (sidebarLogo) sidebarLogo.src = theme === 'light' ? 'assets/logo-day.png' : 'assets/logo-night.png';
})();

/* ────────────────────────────────────────────────────────────
   MULTI-PROJECT REGISTRY
   Each project gets a UUID. All project-specific localStorage
   keys are swapped in/out when switching projects.
   ──────────────────────────────────────────────────────────── */
const REGISTRY_KEY  = 'movie-ledger-project-registry';   // [{id, title, productionNumber, budgetTemplate, _createdAt, _archived}]
const ACTIVE_ID_KEY = 'movie-ledger-active-project-id';

/* All localStorage keys that belong to a project (swapped on switch) */
const PROJECT_DATA_KEYS = [
  'movie-ledger-project', 'movie-ledger-v2', 'movie-ledger-budget',
  'movie-ledger-crew', 'movie-ledger-cast', 'movie-ledger-cast-checkcols',
  'movie-ledger-personnel-tab', 'movie-ledger-breakdowns', 'movie-ledger-elements',
  'movie-ledger-one-liner-drafts', 'movie-ledger-one-liner-active',
  'movie-ledger-calendar', 'movie-ledger-crew-daytypes', 'movie-ledger-cal-tz',
  'movie-ledger-vendors', 'movie-ledger-ins-cert', 'movie-ledger-files',
  'movie-ledger-prod-info', 'movie-ledger-callsheets', 'movie-ledger-one-liner',
  'movie-ledger-script-order', 'movie-ledger-calendar-accounting',
  'movie-ledger-daytypes-accounting', 'movie-ledger-cs-email-template',
  'movie-ledger-crew-schedule', 'movie-ledger-cast-v1-backup',
  'movie-ledger-counters-v2', 'movie-ledger-budget-lock',
  'movie-ledger-hot-costs', 'movie-ledger-fringe-actuals',
  'movie-ledger-auto-prep', 'anthropic-api-key',
];

function _getRegistry() {
  try { return JSON.parse(localStorage.getItem(REGISTRY_KEY)) || []; } catch { return []; }
}

function _saveRegistry(reg) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

function _getActiveProjectId() {
  return localStorage.getItem(ACTIVE_ID_KEY) || null;
}

function _setActiveProjectId(id) {
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

/* Snapshot current active project data → namespaced keys */
function _snapshotProject(projectId) {
  if (!projectId) return;
  for (const key of PROJECT_DATA_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      localStorage.setItem(`ml-${projectId}-${key}`, val);
    } else {
      localStorage.removeItem(`ml-${projectId}-${key}`);
    }
  }
}

/* Restore namespaced keys → active project data */
function _restoreProject(projectId) {
  // Clear current project data
  for (const key of PROJECT_DATA_KEYS) {
    localStorage.removeItem(key);
  }
  if (!projectId) return;
  // Restore from namespace
  for (const key of PROJECT_DATA_KEYS) {
    const val = localStorage.getItem(`ml-${projectId}-${key}`);
    if (val !== null) {
      localStorage.setItem(key, val);
    }
  }
}

/* Switch from current project to target project */
function _switchProject(targetId) {
  const currentId = _getActiveProjectId();
  if (currentId === targetId) return;
  // Save current project state
  if (currentId) _snapshotProject(currentId);
  // Restore target
  _restoreProject(targetId);
  _setActiveProjectId(targetId);
  // Sync registry metadata with actual project data
  _syncRegistryEntry(targetId);
}

/* Keep registry entry in sync with actual project data */
function _syncRegistryEntry(projectId) {
  const reg = _getRegistry();
  const p = getProject();
  const entry = reg.find(r => r.id === projectId);
  if (entry && p) {
    entry.title = p.title || entry.title;
    entry.productionNumber = p.productionNumber || entry.productionNumber;
    entry.budgetTemplate = p.budgetTemplate || entry.budgetTemplate;
    entry._archived = p._archived || false;
    _saveRegistry(reg);
  }
}

/* Register a new project in the registry */
function _registerProject(projectId, projectData) {
  const reg = _getRegistry();
  // Avoid duplicates
  if (!reg.find(r => r.id === projectId)) {
    reg.push({
      id: projectId,
      title: projectData.title || '',
      productionNumber: projectData.productionNumber || '',
      budgetTemplate: projectData.budgetTemplate || 'commercial',
      _createdAt: projectData._createdAt || new Date().toISOString(),
      _archived: false,
    });
    _saveRegistry(reg);
  }
}

/* One-time migration: wrap existing single project into registry */
function _migrateToMultiProject() {
  const reg = _getRegistry();
  const activeId = _getActiveProjectId();
  // Already migrated
  if (reg.length > 0 || activeId) return;
  // Check if an existing project exists
  const p = getProject();
  if (!p?.title) return;
  // Assign an ID and register
  const id = crypto.randomUUID();
  _registerProject(id, p);
  _setActiveProjectId(id);
  _snapshotProject(id);
}

/* Run migration on boot */
_migrateToMultiProject();

/* ── Boot ── */
hydrate();
renderShell();
router(currentRoute());

/* ────────────────────────────────────────────────────────────
   SHELL
   ──────────────────────────────────────────────────────────── */
function renderShell() {
  const project      = getProject();
  const hasProject   = !!project?.title;
  const folderName   = _projectFolderName(project);
  const headerText   = hasProject ? folderName : 'Set Up Project';
  const headerTarget = hasProject ? '#settings' : '#setup';
  const titleClass   = hasProject ? 'header-project-title has-project' : 'header-project-title';
  const userInitials = getUserInitials();

  document.getElementById('app').innerHTML = `
    <header class="app-header">
      <nav class="app-nav" aria-label="Main navigation">
        <a href="#log"  class="nav-link" data-route="log">Purchase Log</a>
        <a href="#calendar" class="nav-link" data-route="calendar">Calendar</a>
        <a href="#crew" class="nav-link" data-route="crew">Personnel</a>
        <a href="#vendors" class="nav-link" data-route="vendors">Vendors</a>
      </nav>

      <span
        class="${titleClass}"
        id="header-project-title"
        data-target="${headerTarget}"
        title="${hasProject ? folderName : 'Click to set up project'}"
        role="button"
        tabindex="0"
      >${_esc(headerText)}</span>

      <div class="profile-wrap" id="profile-wrap">
        <button
          id="profile-btn"
          class="btn btn--icon btn--profile"
          aria-label="User profile"
          title="User profile"
        >${userInitials}</button>
        <div class="profile-dropdown hidden" id="profile-dropdown"></div>
      </div>
    </header>

    <main id="main" class="app-main" role="main"></main>

    <footer class="app-footer">
      The Masterbook &copy; ${new Date().getFullYear()}
    </footer>
  `;

  // Profile button → toggle dropdown
  document.getElementById('profile-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    _toggleProfileDropdown();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('profile-dropdown');
    if (dd && !dd.classList.contains('hidden') && !e.target.closest('#profile-wrap')) {
      dd.classList.add('hidden');
    }
  });

  // Header project title → settings or setup
  const titleEl = document.getElementById('header-project-title');
  titleEl.addEventListener('click', () => {
    window.location.hash = titleEl.dataset.target;
  });
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') window.location.hash = titleEl.dataset.target;
  });

  // Route on hash change
  window.addEventListener('hashchange', () => router(currentRoute()));

  // Update active nav on click
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => setActiveNav(link.dataset.route));
  });

  setActiveNav(currentRoute());
  _wireSidebar();
}

/* ────────────────────────────────────────────────────────────
   MACRO SIDEBAR
   ──────────────────────────────────────────────────────────── */
function _wireSidebar() {
  document.querySelectorAll('.macro-btn[data-route-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = '#' + btn.dataset.routeTarget;
    });
  });
  _updateSidebarActive(currentRoute());
}

function _updateSidebarActive(route) {
  const def = ROUTES[route];
  document.querySelectorAll('.macro-btn[data-route-target]').forEach(btn => {
    const target = btn.dataset.routeTarget;
    const targetDef = ROUTES[target];
    // Active if: exact route match, OR same non-null group
    const isActive = target === route
      || (def?.group && targetDef?.group === def.group)
      || (target === 'home' && route === 'home');
    btn.classList.toggle('macro-active', isActive);
  });
}

/* ────────────────────────────────────────────────────────────
   ROUTER
   ──────────────────────────────────────────────────────────── */
function router(route) {
  const main = document.getElementById('main');
  if (!main) return;

  const def = ROUTES[route] || ROUTES['home'];

  // Guard: redirect to home if project required but none exists
  if (def.requiresProject && !getProject()?.title) {
    window.location.hash = '#home';
    return;
  }

  setActiveNav(route);

  // Special-case routes that need callbacks or custom handling
  switch (route) {
    case 'submit':
      renderSubmissionForm(main, result => {
        if (result === 'submitted' || result === 'cancel') {
          window.location.hash = '#log';
          // Force immediate re-render — don't rely on async hashchange
          router('log');
        }
      });
      return;

    case 'setup':
      renderProjectSetup(main, () => {
        _refreshHeader();
      });
      return;

    case 'settings':
      renderProjectSettings(main);
      return;

    default:
      if (def.render) {
        def.render(main);
      } else {
        renderProjectMenu(main);
      }
  }
}

/* ────────────────────────────────────────────────────────────
   PROJECT MENU (Home / Landing Page)
   ──────────────────────────────────────────────────────────── */
function renderProjectMenu(container) {
  const project = getProject();
  const hasProject = !!project?.title;
  const activeId = _getActiveProjectId();
  const registry = _getRegistry();

  // Separate active, other non-archived, and archived projects
  const otherProjects = registry.filter(r => r.id !== activeId && !r._archived);
  const archivedProjects = registry.filter(r => r._archived);

  const logoSrc = document.documentElement.dataset.theme === 'light' ? 'assets/logo-day.png' : 'assets/logo-night.png';

  const _tplLabel = (tpl) => tpl === 'feature' ? 'Feature/TV' : 'Commercial';

  const _projectCard = (r, isActive) => `
    <div class="pm-card ${isActive ? 'pm-card--active' : ''}" data-project-id="${_esc(r.id)}">
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
          <button class="btn btn--ghost btn--sm" id="pm-toggle-archived">Show Archived Projects (${archivedProjects.length})</button>
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

  _wireProjectMenu(container);
}

function _wireProjectMenu(container) {
  // Open project → go to Purchase Log
  container.querySelectorAll('.pm-open-project').forEach(btn => {
    btn.addEventListener('click', () => { window.location.hash = '#log'; });
  });

  // Settings
  container.querySelectorAll('.pm-settings-btn').forEach(btn => {
    btn.addEventListener('click', () => { window.location.hash = '#settings'; });
  });

  // Archive
  container.querySelectorAll('.pm-btn-archive').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      const isActive = pid === _getActiveProjectId();
      const reg = _getRegistry();
      const entry = reg.find(r => r.id === pid);
      if (!entry) return;
      if (!confirm(`Archive project "${entry.title}"?\n\nThe project data will be hidden but can be restored later.`)) return;

      if (isActive) {
        const p = getProject();
        if (p) {
          p._archived = true;
          p._archivedAt = new Date().toISOString();
          saveProject(p);
        }
      }
      entry._archived = true;
      _saveRegistry(reg);

      // If we archived the active project, snapshot it and switch to another if available
      if (isActive) {
        _snapshotProject(pid);
        const next = reg.find(r => !r._archived && r.id !== pid);
        if (next) {
          _restoreProject(next.id);
          _setActiveProjectId(next.id);
        } else {
          // No other projects — clear active data
          for (const key of PROJECT_DATA_KEYS) localStorage.removeItem(key);
          _setActiveProjectId('');
        }
      }

      _refreshHeader();
      renderProjectMenu(container);
    });
  });

  // Switch to another project
  container.querySelectorAll('.pm-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.pid;
      _switchProject(targetId);
      hydrate();
      _refreshHeader();
      renderProjectMenu(container);
    });
  });

  // Restore archived project
  container.querySelectorAll('.pm-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      const reg = _getRegistry();
      const entry = reg.find(r => r.id === pid);
      if (!entry) return;
      entry._archived = false;
      _saveRegistry(reg);
      renderProjectMenu(container);
    });
  });

  // Delete archived project permanently
  container.querySelectorAll('.pm-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      const reg = _getRegistry();
      const entry = reg.find(r => r.id === pid);
      if (!entry) return;
      if (!confirm(`Permanently delete "${entry.title}"? This cannot be undone.`)) return;
      // Remove namespaced data
      for (const key of PROJECT_DATA_KEYS) {
        localStorage.removeItem(`ml-${pid}-${key}`);
      }
      // Remove from registry
      const newReg = reg.filter(r => r.id !== pid);
      _saveRegistry(newReg);
      renderProjectMenu(container);
    });
  });

  // Toggle archived section
  container.querySelector('#pm-toggle-archived')?.addEventListener('click', () => {
    const list = container.querySelector('#pm-archived-list');
    const btn = container.querySelector('#pm-toggle-archived');
    if (list) {
      const showing = !list.classList.contains('hidden');
      list.classList.toggle('hidden');
      btn.textContent = showing ? `Show Archived Projects (${_getRegistry().filter(r => r._archived).length})` : 'Hide Archived Projects';
    }
  });

  // Create card → show form
  const createCard = container.querySelector('#pm-create-card');
  const createForm = container.querySelector('#pm-create-form');
  if (createCard && createForm) {
    createCard.addEventListener('click', () => {
      createForm.classList.remove('hidden');
      createCard.classList.add('hidden');
      container.querySelector('#pm-title')?.focus();
    });
  }

  // Cancel create
  const cancelBtn = container.querySelector('#pm-cancel-create');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      createForm.classList.add('hidden');
      createCard.classList.remove('hidden');
    });
  }

  // Confirm create
  const confirmBtn = container.querySelector('#pm-confirm-create');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const title   = container.querySelector('#pm-title')?.value.trim();
      const prodNum = container.querySelector('#pm-prod-num')?.value.trim();
      const tpl     = container.querySelector('#pm-template')?.value || 'commercial';
      const csTpl   = container.querySelector('#pm-cs-template')?.value || 'commercial';

      // Validate
      let valid = true;
      const errTitle = container.querySelector('#pm-err-title');
      const errNum   = container.querySelector('#pm-err-prod-num');

      if (!title) {
        if (errTitle) errTitle.textContent = 'Project title is required.';
        container.querySelector('#pm-title')?.classList.add('invalid');
        container.querySelector('#pm-title')?.focus();
        valid = false;
      } else {
        if (errTitle) errTitle.textContent = '';
        container.querySelector('#pm-title')?.classList.remove('invalid');
      }

      if (!prodNum) {
        if (errNum) errNum.textContent = 'Production number is required.';
        container.querySelector('#pm-prod-num')?.classList.add('invalid');
        if (valid) container.querySelector('#pm-prod-num')?.focus();
        valid = false;
      } else {
        if (errNum) errNum.textContent = '';
        container.querySelector('#pm-prod-num')?.classList.remove('invalid');
      }

      if (!valid) return;

      // Snapshot current project before clearing
      const currentId = _getActiveProjectId();
      if (currentId) _snapshotProject(currentId);

      // Clear all project data keys for the new project
      for (const key of PROJECT_DATA_KEYS) {
        localStorage.removeItem(key);
      }

      const newProject = {
        title,
        productionNumber: prodNum,
        budgetTemplate: tpl,
        callSheetTemplate: csTpl,
        _createdAt: new Date().toISOString(),
      };

      // Register and activate new project
      const newId = crypto.randomUUID();
      saveProject(newProject);
      _registerProject(newId, newProject);
      _setActiveProjectId(newId);
      _snapshotProject(newId);

      _refreshHeader();
      window.location.hash = '#settings';
    });
  }
}

/* ────────────────────────────────────────────────────────────
   PROJECT SETTINGS (post-creation, locked immutable fields)
   ──────────────────────────────────────────────────────────── */
function renderProjectSettings(container) {
  const project = getProject() ?? {};

  // Production info (shared with budget)
  const PROD_INFO_KEY = 'movie-ledger-prod-info';
  let prodInfo = {};
  try { prodInfo = JSON.parse(localStorage.getItem(PROD_INFO_KEY)) || {}; } catch { prodInfo = {}; }

  // Fields that are editable vs locked
  const v = (key, fallback = '') => _esc(project[key] ?? fallback);
  const pv = (key, fallback = '') => _esc(prodInfo[key] ?? fallback);
  const staff = project.staff ?? [];

  const staffHTML = staff.length > 0
    ? staff.map(s => _settingsStaffCard(s)).join('')
    : '<p class="staff-empty">No staff members added yet.</p>';

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
              <input type="text" id="ps-company" name="productionCompany" value="${v('productionCompany')}"
                placeholder="LLC or company name" maxlength="80" />
            </div>

            <div class="field">
              <label for="ps-director">Director</label>
              <input type="text" id="ps-director" name="director" value="${v('director')}"
                placeholder="Director full name" maxlength="80" />
            </div>

            <div class="field">
              <label for="ps-producer">Producer</label>
              <input type="text" id="ps-producer" name="producer" value="${v('producer')}"
                placeholder="Producer full name" maxlength="80" />
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
              <input type="text" id="ps-fiscal" name="fiscalYear" value="${v('fiscalYear')}"
                placeholder="Fiscal year range" maxlength="20" />
            </div>

            <div class="field field--full">
              <label for="ps-office-address">Production Office Address</label>
              <input type="text" id="ps-office-address" name="officeAddress" value="${v('officeAddress')}"
                placeholder="123 Main St, Suite 100, Los Angeles, CA 90001" maxlength="200" />
              <span class="setup-hint">Used in Prep Calendar, Call Sheets, and other documents.</span>
            </div>

          </div>
        </div>

        <!-- ── Production Info (for Budget Top Sheet / Call Sheets) ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Production Info</h3>
          <p class="setup-hint" style="margin-bottom:12px">Used by the Budget Top Sheet, Hot Costs, and Call Sheets.</p>
          <div id="ps-prod-info-fields"></div>
        </div>

        <!-- ── Staff Members ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Staff Members</h3>
          <p class="setup-hint" style="margin-bottom:12px">Staff added here will be auto-imported into the Crew List.</p>

          <div class="staff-list" id="ps-staff-list">
            ${staffHTML}
          </div>

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
                placeholder="Additional notes or production reminders…"
              >${v('notes')}</textarea>
            </div>
          </div>
        </div>

        <!-- ── Appearance ── -->
        <div class="setup-card">
          <h3 class="setup-card__title">Appearance</h3>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
            <button type="button" id="ps-theme-toggle" class="btn btn--ghost btn--sm ps-theme-btn">
              <span class="ps-theme-icon">${document.documentElement.dataset.theme === 'dark' ? '\u263D' : '\u2609'}</span>
              <span class="ps-theme-label">${document.documentElement.dataset.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
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

  /* ── Populate Production Info fields ── */
  const piField = (key, label, ph = '', type = 'text') => `
    <div class="form-grid"><div class="field">
      <label>${label}</label>
      <input type="${type}" data-pi-key="${key}" value="${pv(key)}" placeholder="${ph}" />
    </div></div>`;

  const piSection = (heading, fields) => `
    <div style="margin-bottom:14px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">${heading}</div>
      <div class="form-grid">${fields}</div>
    </div>`;

  const piF = (key, label, ph='', type='text') => `<div class="field"><label>${label}</label><input type="${type}" data-pi-key="${key}" value="${pv(key)}" placeholder="${ph}" /></div>`;

  container.querySelector('#ps-prod-info-fields').innerHTML = `
    ${piSection('Logos', `
      <div class="pi-logos-row">
        <div class="pi-logo-slot">
          <label class="pi-logo-label" for="pi-logo-title">
            ${prodInfo.titleLogo ? `<img src="${_esc(prodInfo.titleLogo)}" class="pi-logo-img has-logo" />` : ''}
            <span class="pi-logo-placeholder"${prodInfo.titleLogo ? ' style="display:none"' : ''}>+ Upload</span>
          </label>
          <input type="file" id="pi-logo-title" data-logo-key="titleLogo" accept="image/*" hidden />
          <span class="pi-logo-sublabel">Title Logo</span>
          ${prodInfo.titleLogo ? '<button type="button" class="pi-logo-remove" data-logo-key="titleLogo">✕</button>' : ''}
        </div>
        <div class="pi-logo-slot">
          <label class="pi-logo-label" for="pi-logo-client">
            ${prodInfo.clientLogo ? `<img src="${_esc(prodInfo.clientLogo)}" class="pi-logo-img has-logo" />` : ''}
            <span class="pi-logo-placeholder"${prodInfo.clientLogo ? ' style="display:none"' : ''}>+ Upload</span>
          </label>
          <input type="file" id="pi-logo-client" data-logo-key="clientLogo" accept="image/*" hidden />
          <span class="pi-logo-sublabel">Client</span>
          ${prodInfo.clientLogo ? '<button type="button" class="pi-logo-remove" data-logo-key="clientLogo">✕</button>' : ''}
        </div>
        <div class="pi-logo-slot">
          <label class="pi-logo-label" for="pi-logo-agency">
            ${prodInfo.agencyLogo ? `<img src="${_esc(prodInfo.agencyLogo)}" class="pi-logo-img has-logo" />` : ''}
            <span class="pi-logo-placeholder"${prodInfo.agencyLogo ? ' style="display:none"' : ''}>+ Upload</span>
          </label>
          <input type="file" id="pi-logo-agency" data-logo-key="agencyLogo" accept="image/*" hidden />
          <span class="pi-logo-sublabel">Agency</span>
          ${prodInfo.agencyLogo ? '<button type="button" class="pi-logo-remove" data-logo-key="agencyLogo">✕</button>' : ''}
        </div>
        <div class="pi-logo-slot">
          <label class="pi-logo-label" for="pi-logo-prodco">
            ${prodInfo.prodCoLogo ? `<img src="${_esc(prodInfo.prodCoLogo)}" class="pi-logo-img has-logo" />` : ''}
            <span class="pi-logo-placeholder"${prodInfo.prodCoLogo ? ' style="display:none"' : ''}>+ Upload</span>
          </label>
          <input type="file" id="pi-logo-prodco" data-logo-key="prodCoLogo" accept="image/*" hidden />
          <span class="pi-logo-sublabel">Production Co.</span>
          ${prodInfo.prodCoLogo ? '<button type="button" class="pi-logo-remove" data-logo-key="prodCoLogo">✕</button>' : ''}
        </div>
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

  /* Auto-save production info fields */
  container.querySelectorAll('[data-pi-key]').forEach(el => {
    el.addEventListener('input', () => {
      prodInfo[el.dataset.piKey] = el.value;
      localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
    });
  });

  /* Logo uploads */
  container.querySelectorAll('[data-logo-key]').forEach(inp => {
    if (inp.tagName === 'INPUT') {
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          prodInfo[inp.dataset.logoKey] = ev.target.result;
          localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
          renderProjectSettings(container);
        };
        reader.readAsDataURL(file);
      });
    } else if (inp.classList.contains('pi-logo-remove')) {
      inp.addEventListener('click', () => {
        delete prodInfo[inp.dataset.logoKey];
        localStorage.setItem(PROD_INFO_KEY, JSON.stringify(prodInfo));
        renderProjectSettings(container);
      });
    }
  });

  _wireProjectSettings(container);
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
    </div>
  `;
}

function _wireProjectSettings(container) {
  const form = container.querySelector('#settings-form');

  // Theme toggle
  container.querySelector('#ps-theme-toggle')?.addEventListener('click', toggleTheme);

  // Back button
  container.querySelector('#ps-btn-back')?.addEventListener('click', () => {
    window.location.hash = '#log';
  });

  // Staff: show/hide add form
  container.querySelector('#ps-btn-add-staff')?.addEventListener('click', () => {
    container.querySelector('#ps-staff-add-form').classList.remove('hidden');
    container.querySelector('#ps-sf-name')?.focus();
  });

  container.querySelector('#ps-btn-staff-cancel')?.addEventListener('click', () => {
    _resetSettingsStaffForm(container);
  });

  container.querySelector('#ps-btn-staff-confirm')?.addEventListener('click', () => {
    const nameEl = container.querySelector('#ps-sf-name');
    if (!nameEl?.value.trim()) { nameEl?.focus(); return; }

    const newMember = {
      id: crypto.randomUUID(),
      title: container.querySelector('#ps-sf-title')?.value.trim() || '',
      name:  nameEl.value.trim(),
      email: container.querySelector('#ps-sf-email')?.value.trim() || '',
      phone: container.querySelector('#ps-sf-phone')?.value.trim() || '',
    };

    const current = getProject() ?? {};
    current.staff = current.staff ?? [];
    current.staff.push(newMember);
    saveProject(current);

    const list = container.querySelector('#ps-staff-list');
    const emptyMsg = list?.querySelector('.staff-empty');
    if (emptyMsg) emptyMsg.remove();
    list?.insertAdjacentHTML('beforeend', _settingsStaffCard(newMember));

    _resetSettingsStaffForm(container);
    _wireSettingsStaffRemove(container);
  });

  _wireSettingsStaffRemove(container);

  // Main form submit
  form?.addEventListener('submit', e => {
    e.preventDefault();

    const fd   = new FormData(form);
    const data = {};
    for (const [k, val] of fd.entries()) {
      if (k === 'anthropicApiKey') continue;
      data[k] = val.trim();
    }

    // Preserve immutable fields & staff from existing project
    const current = getProject() ?? {};
    data.title            = current.title;
    data.productionNumber = current.productionNumber;
    data.budgetTemplate   = current.budgetTemplate;
    data.callSheetTemplate = current.callSheetTemplate;
    data._createdAt       = current._createdAt;
    data.staff            = current.staff ?? [];
    if (current._archived) data._archived = current._archived;
    if (current._archivedAt) data._archivedAt = current._archivedAt;

    saveProject(data);

    // Handle API key
    const apiKeyInput = form.querySelector('#ps-api-key');
    const apiKeyVal   = apiKeyInput?.value ?? '';
    if (apiKeyVal && !apiKeyVal.startsWith('•')) {
      localStorage.setItem('anthropic-api-key', apiKeyVal.trim());
    }

    const statusEl = container.querySelector('#ps-save-status');
    if (statusEl) {
      statusEl.textContent = 'Saved ✓';
      statusEl.classList.add('saved');
      setTimeout(() => { statusEl.textContent = ''; statusEl.classList.remove('saved'); }, 2500);
    }

    _refreshHeader();
  });
}

function _wireSettingsStaffRemove(container) {
  container.querySelectorAll('#ps-staff-list .staff-remove-btn').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  container.querySelectorAll('#ps-staff-list .staff-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.staffId;
      const current = getProject() ?? {};
      current.staff = (current.staff ?? []).filter(s => s.id !== id);
      saveProject(current);
      btn.closest('.staff-card')?.remove();
      const list = container.querySelector('#ps-staff-list');
      if (list && !list.querySelector('.staff-card')) {
        list.insertAdjacentHTML('beforeend', '<p class="staff-empty">No staff members added yet.</p>');
      }
    });
  });
}

function _resetSettingsStaffForm(container) {
  ['#ps-sf-title','#ps-sf-name','#ps-sf-email','#ps-sf-phone'].forEach(sel => {
    const el = container.querySelector(sel);
    if (el) el.value = '';
  });
  container.querySelector('#ps-staff-add-form')?.classList.add('hidden');
}

/* ────────────────────────────────────────────────────────────
   COMING SOON PLACEHOLDER
   ──────────────────────────────────────────────────────────── */
function renderComingSoon(container) {
  const route = currentRoute();
  const def = ROUTES[route] || {};
  container.innerHTML = `
    <div class="coming-soon">
      <span class="coming-soon-icon">🔧</span>
      <strong>${_esc(def.label || 'Module')}</strong>
      <span>Coming soon — this module is not yet implemented.</span>
    </div>
  `;
}

/* ────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────── */
function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  // If project is archived, always show home
  const p = getProject();
  if (p?._archived && hash !== 'home' && hash !== 'setup') return 'home';
  // No hash: show home if no project, log if project exists
  if (!hash) return (p?.title && !p._archived) ? 'log' : 'home';
  return hash;
}

function setActiveNav(route) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.route === route);
  });
  _updateSidebarActive(route);
}

/* ── Profile Dropdown ── */
function _toggleProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  if (isHidden) {
    _buildProfileDropdown(dd);
    dd.classList.remove('hidden');
  } else {
    dd.classList.add('hidden');
  }
}

function _buildProfileDropdown(dd) {
  const p = getProject();
  const activeId = _getActiveProjectId();
  const registry = _getRegistry().filter(r => !r._archived);
  const userName = p?.defaultSubmitter || 'User';
  const _tplLabel = (tpl) => tpl === 'feature' ? 'Feature/TV' : 'Commercial';

  let projectsHTML = '';
  for (const r of registry) {
    const isActive = r.id === activeId;
    const label = r.productionNumber ? `${r.productionNumber}_${r.title}` : r.title;
    projectsHTML += `
      <button class="pd-project-btn${isActive ? ' pd-project-btn--active' : ''}" data-switch-pid="${_esc(r.id)}">
        <span class="pd-project-name">${_esc(label)}</span>
        <span class="pd-project-meta">${_esc(_tplLabel(r.budgetTemplate))}</span>
        ${isActive ? '<span class="pd-active-dot"></span>' : ''}
      </button>`;
  }

  dd.innerHTML = `
    <div class="pd-user">${_esc(userName)}</div>
    <div class="pd-divider"></div>
    <div class="pd-label">Projects</div>
    <div class="pd-projects">${projectsHTML || '<div class="pd-empty">No projects</div>'}</div>
    <div class="pd-divider"></div>
    <button class="pd-action-btn" id="pd-new-project">+ New Project</button>
    ${p?.title ? '<button class="pd-action-btn" id="pd-settings">Project Settings</button>' : ''}
  `;

  // Wire dropdown actions
  dd.querySelectorAll('[data-switch-pid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.switchPid;
      if (targetId === activeId) {
        // Already active — just open
        dd.classList.add('hidden');
        window.location.hash = '#log';
        return;
      }
      _switchProject(targetId);
      hydrate();
      _refreshHeader();
      dd.classList.add('hidden');
      window.location.hash = '#log';
      router(currentRoute());
    });
  });

  dd.querySelector('#pd-new-project')?.addEventListener('click', () => {
    dd.classList.add('hidden');
    window.location.hash = '#home';
    // Auto-open the create form after a tick
    setTimeout(() => {
      const createCard = document.querySelector('#pm-create-card');
      const createForm = document.querySelector('#pm-create-form');
      if (createCard && createForm) {
        createForm.classList.remove('hidden');
        createCard.classList.add('hidden');
        document.querySelector('#pm-title')?.focus();
      }
    }, 100);
  });

  dd.querySelector('#pd-settings')?.addEventListener('click', () => {
    dd.classList.add('hidden');
    window.location.hash = '#settings';
  });
}

function _refreshHeader() {
  const titleEl   = document.getElementById('header-project-title');
  const profileBtn = document.getElementById('profile-btn');
  const p = getProject();
  const hasProject = !!p?.title && !p._archived;
  const folderName = _projectFolderName(p);

  if (titleEl) {
    titleEl.textContent = hasProject ? folderName : 'Set Up Project';
    titleEl.title       = hasProject ? folderName : 'Click to set up project';
    titleEl.dataset.target = hasProject ? '#settings' : '#setup';
    titleEl.classList.toggle('has-project', hasProject);
  }
  if (profileBtn) profileBtn.textContent = getUserInitials();
}

function _projectFolderName(project) {
  if (!project?.title) return '';
  const num = project.productionNumber || '';
  return num ? `${num}_${project.title}` : project.title;
}

/* ── Theme Toggle ── */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;

  const logoSrc = next === 'light' ? 'assets/logo-day.png' : 'assets/logo-night.png';
  const logo = document.getElementById('sidebar-logo');
  if (logo) logo.src = logoSrc;
  const welcomeLogo = document.querySelector('.pm-welcome-logo');
  if (welcomeLogo) welcomeLogo.src = logoSrc;

  /* Update settings-page toggle if visible */
  const settingsBtn = document.getElementById('ps-theme-toggle');
  if (settingsBtn) {
    settingsBtn.querySelector('.ps-theme-icon').textContent = next === 'dark' ? '\u263D' : '\u2609';
    settingsBtn.querySelector('.ps-theme-label').textContent = next === 'dark' ? 'Dark Mode' : 'Light Mode';
  }

  localStorage.setItem('movie-ledger-theme', next);
}

/* ── Project Helpers ── */
export function getProject() {
  try {
    const raw = localStorage.getItem('movie-ledger-project');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveProject(data) {
  localStorage.setItem('movie-ledger-project', JSON.stringify(data));
  // Keep registry in sync
  const activeId = _getActiveProjectId();
  if (activeId) _syncRegistryEntry(activeId);
}

function getUserInitials() {
  const project = getProject();
  const name = project?.defaultSubmitter || '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
