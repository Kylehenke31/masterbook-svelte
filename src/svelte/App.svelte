<script>
  import { onMount } from 'svelte';
  import { currentRoute } from './stores/router.js';
  import {
    projectStore, refreshProjectStore,
    getProject, migrateToMultiProject,
    getRegistry, getActiveProjectId,
    switchProject, projectFolderName,
    snapshotProject, restoreProject, setActiveProjectId,
    PROJECT_DATA_KEYS,
  } from './stores/project.js';
  import { hydrate } from '../../src/data.js';

  import Home           from './routes/Home.svelte';
  import ElementsReport from './routes/ElementsReport.svelte';
  import Insurance      from './routes/Insurance.svelte';
  import Files          from './routes/Files.svelte';
  import Vendors        from './routes/Vendors.svelte';
  import ProjectSetup   from './routes/ProjectSetup.svelte';
  import ProjectSettings from './routes/ProjectSettings.svelte';
  import Personnel      from './routes/Personnel.svelte';
  import ScriptOrder    from './routes/ScriptOrder.svelte';
  import ShootingSchedule from './routes/ShootingSchedule.svelte';
  import Calendar       from './routes/Calendar.svelte';
  import Schedules      from './routes/Schedules.svelte';
  import DooDs          from './routes/DooDs.svelte';
  import OneLiner       from './routes/OneLiner.svelte';
  import Breakdowns     from './routes/Breakdowns.svelte';
  import PurchaseLog    from './routes/PurchaseLog.svelte';
  import SubmissionForm from './routes/SubmissionForm.svelte';
  import CallSheet      from './routes/CallSheet.svelte';
  import Budget         from './routes/Budget.svelte';
  import Creative         from './routes/Creative.svelte';
  import CreativeCamera   from './routes/CreativeCamera.svelte';
  import CreativeLocations from './routes/CreativeLocations.svelte';
  import CreativeStub     from './routes/CreativeStub.svelte';
  import Chat             from './components/Chat.svelte';

  /* ── Profile dropdown ── */
  let showDropdown = false;
  let dropdownRegistry = [];
  let dropdownActiveId = null;

  /* ── Routing ── */
  let route;
  currentRoute.subscribe(r => {
    route = r;
    showDropdown = false; // close dropdown on every navigation
    refreshProjectStore();
  });

  /* ── Project state (reactive via store) ── */
  let _project = null;
  projectStore.subscribe(p => { _project = p; });

  function openDropdown() {
    dropdownRegistry = getRegistry().filter(r => !r._archived);
    dropdownActiveId = getActiveProjectId();
    showDropdown = true;
  }

  function closeDropdown() { showDropdown = false; }

  function handleSwitchProject(targetId) {
    closeDropdown();
    if (targetId !== getActiveProjectId()) {
      switchProject(targetId);
      hydrate();
    }
    window.location.hash = '#log';
  }

  function handleNewProject() {
    closeDropdown();
    sessionStorage.setItem('pm-intent', 'create');
    window.location.hash = '#home';
  }

  /* ── Derived header values ── */
  function _hasProject() {
    return !!_project?.title && !_project?._archived;
  }
  function _headerTitle() {
    return _hasProject() ? projectFolderName(_project) : 'Set Up Project';
  }
  function _headerTarget() {
    return _hasProject() ? '#settings' : '#setup';
  }
  function _initials() {
    const name  = _project?.defaultSubmitter || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
    return '?';
  }

  /**
   * Routes that require an active non-archived project.
   * Navigating to these without a project → redirect to #home.
   */
  const REQUIRES_PROJECT = new Set([
    'log', 'submit', 'crew', 'calendar', 'schedules', 'breakdowns',
    'one-liner', 'script-order', 'shooting-schedule', 'elements-report',
    'day-out-of-days', 'budget', 'budget-lines', 'hot-costs', 'call-sheet',
    'insurance', 'vendors', 'files', 'settings',
    'creative', 'creative-camera', 'creative-locations',
    'creative-prod-design', 'creative-costume', 'creative-property',
    'creative-hair-makeup', 'creative-stunts', 'creative-continuity',
  ]);

  /** Which top-level "group" (macro sidebar section) is the current route in? */
  function routeGroup(r) {
    if (!r) return '';
    if (['schedules','breakdowns','one-liner','script-order','shooting-schedule',
         'elements-report','day-out-of-days'].includes(r)) return 'schedules';
    if (['budget','budget-lines','hot-costs'].includes(r)) return 'budget';
    if (r.startsWith('creative')) return 'creative';
    if (r === 'call-sheet') return 'callsheet';
    if (r === 'vendors') return 'vendors';
    if (r === 'insurance') return 'insurance';
    if (r === 'files') return 'files';
    return r;
  }

  function resolveRoute() {
    const hash = window.location.hash.slice(1);
    const p    = getProject();
    const hasProject = !!p?.title && !p._archived;

    // Archived project: only allow home and setup
    if (p?._archived && hash !== 'home' && hash !== 'setup') {
      window.location.hash = '#home';
      return; // hashchange will fire again → resolveRoute will re-run
    }

    // No project: block protected routes
    if (!hasProject && REQUIRES_PROJECT.has(hash)) {
      window.location.hash = '#home';
      return;
    }

    // Smart default: empty hash → log (project exists) or home (no project)
    if (!hash) {
      currentRoute.set(hasProject ? 'log' : 'home');
      return;
    }

    currentRoute.set(hash);
  }

  onMount(() => {
    // Restore persisted theme before first paint
    const saved = localStorage.getItem('movie-ledger-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }

    // One-time migration: wrap legacy single project into multi-project registry
    migrateToMultiProject();
    refreshProjectStore();

    window.addEventListener('hashchange', resolveRoute);
    resolveRoute();
    return () => window.removeEventListener('hashchange', resolveRoute);
  });
</script>

<!-- Close profile dropdown on outside click -->
<svelte:window onclick={(e) => {
  if (showDropdown && !e.target.closest('.profile-wrap')) closeDropdown();
}} />

<!-- Macro sidebar (far-left icon rail) -->
<aside class="macro-sidebar">
  <div class="macro-sidebar-top">
    <img src="/logo-night.png" class="sidebar-logo sidebar-logo--dark" alt="Masterbook" />
    <img src="/logo-day.png"   class="sidebar-logo sidebar-logo--light" alt="Masterbook" />
  </div>
  <div class="macro-sidebar-items">

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'budget'}
      onclick={() => { window.location.hash = '#budget'; }} title="Budget">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <rect x="2" y="3" width="20" height="4" rx="1"/>
        <rect x="2" y="9" width="20" height="4" rx="1"/>
        <rect x="2" y="15" width="20" height="4" rx="1"/>
      </svg>
      <span class="macro-label">Budget</span>
    </button>

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'schedules'}
      onclick={() => { window.location.hash = '#schedules'; }} title="Schedules">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
      <span class="macro-label">Schedules</span>
    </button>

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'callsheet'}
      onclick={() => { window.location.hash = '#call-sheet'; }} title="Call Sheet">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span class="macro-label">Call Sheet</span>
    </button>

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'insurance'}
      onclick={() => { window.location.hash = '#insurance'; }} title="Insurance">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span class="macro-label">Insurance</span>
    </button>

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'creative'}
      onclick={() => { window.location.hash = '#creative'; }} title="Creative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.3 6L15 17H9l-.7-2C6.3 13.7 5 11.5 5 9a7 7 0 017-7z"/>
      </svg>
      <span class="macro-label">Creative</span>
    </button>

    <button class="macro-btn" class:macro-active={routeGroup(route) === 'files'}
      onclick={() => { window.location.hash = '#files'; }} title="Files">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <span class="macro-label">Files</span>
    </button>

  </div>
</aside>

<div class="app-shell">
  <header class="app-header">
    <nav class="app-nav">
      <a href="#log"      class:active={route === 'log'}>Purchase Log</a>
      <a href="#calendar" class:active={route === 'calendar'}>Calendar</a>
      <a href="#crew"     class:active={route === 'crew'}>Personnel</a>
      <a href="#vendors"  class:active={route === 'vendors'}>Vendors</a>
    </nav>

    <!-- Project title → settings or initial setup -->
    <button
      class="header-project-title"
      class:has-project={_hasProject()}
      title={_headerTitle()}
      onclick={() => { window.location.hash = _headerTarget(); }}
    >{_headerTitle()}</button>

    <!-- Profile button + dropdown -->
    <div class="profile-wrap">
      <button
        class="btn btn--icon btn--profile"
        aria-label="User profile"
        title="User profile"
        onclick={showDropdown ? closeDropdown : openDropdown}
      >{_initials()}</button>

      {#if showDropdown}
        <div class="profile-dropdown" role="menu">
          <div class="pd-user">{_project?.defaultSubmitter || 'User'}</div>
          <div class="pd-divider"></div>
          <div class="pd-label">Projects</div>
          <div class="pd-projects">
            {#each dropdownRegistry as r (r.id)}
              <button
                class="pd-project-btn"
                class:pd-project-btn--active={r.id === dropdownActiveId}
                role="menuitem"
                onclick={() => handleSwitchProject(r.id)}
              >
                <span class="pd-project-name">{r.productionNumber ? `${r.productionNumber}_${r.title}` : r.title}</span>
                <span class="pd-project-meta">{r.budgetTemplate === 'feature' ? 'Feature/TV' : 'Commercial'}</span>
                {#if r.id === dropdownActiveId}<span class="pd-active-dot"></span>{/if}
              </button>
            {:else}
              <div class="pd-empty">No projects</div>
            {/each}
          </div>
          <div class="pd-divider"></div>
          <button class="pd-action-btn" role="menuitem" onclick={handleNewProject}>+ New Project</button>
          {#if _hasProject()}
            <button class="pd-action-btn" role="menuitem"
              onclick={() => { closeDropdown(); window.location.hash = '#settings'; }}>
              Project Settings
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <main class="app-main" class:app-main--full={route === 'crew' || route === 'budget-lines'}>
    {#if route === 'log'}
      <PurchaseLog />
    {:else if route === 'submit'}
      <SubmissionForm onDone={() => { window.location.hash = '#log'; }} />
    {:else if route === 'call-sheet'}
      <CallSheet />
    {:else if route === 'home' || !route}
      <Home />
    {:else if route === 'crew'}
      <Personnel />
    {:else if route === 'script-order'}
      <ScriptOrder />
    {:else if route === 'shooting-schedule'}
      <ShootingSchedule />
    {:else if route === 'calendar'}
      <Calendar />
    {:else if route === 'schedules'}
      <Schedules />
    {:else if route === 'day-out-of-days'}
      <DooDs />
    {:else if route === 'one-liner'}
      <OneLiner />
    {:else if route === 'breakdowns'}
      <Breakdowns />
    {:else if route === 'elements-report'}
      <ElementsReport />
    {:else if route === 'insurance'}
      <Insurance />
    {:else if route === 'files'}
      <Files />
    {:else if route === 'vendors'}
      <Vendors />
    {:else if route === 'budget'}
      <Budget view="overview" />
    {:else if route === 'budget-lines'}
      <Budget view="lines" />
    {:else if route === 'hot-costs'}
      <Budget view="hot-costs" />
    {:else if route === 'creative'}
      <Creative />
    {:else if route === 'creative-camera'}
      <CreativeCamera />
    {:else if route === 'creative-locations'}
      <CreativeLocations />
    {:else if route === 'creative-prod-design'}
      <CreativeStub deptId="prod-design" />
    {:else if route === 'creative-costume'}
      <CreativeStub deptId="costume" />
    {:else if route === 'creative-property'}
      <CreativeStub deptId="property" />
    {:else if route === 'creative-hair-makeup'}
      <CreativeStub deptId="hair-makeup" />
    {:else if route === 'creative-stunts'}
      <CreativeStub deptId="stunts" />
    {:else if route === 'creative-continuity'}
      <CreativeStub deptId="continuity" />
    {:else if route === 'setup'}
      <ProjectSetup />
    {:else if route === 'settings'}
      <ProjectSettings />
    {:else}
      <div class="coming-soon">
        <h2>#{route}</h2>
        <p>Migration in progress…</p>
      </div>
    {/if}
  </main>

  <footer class="app-footer">
    The Masterbook &copy; {new Date().getFullYear()}
  </footer>
</div>

<!-- Global chat bubble — fixed-position, renders on top of everything -->
<Chat projectId={_project?.id ?? 'global'} />

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    height: 52px;
    background: var(--bg-surface, #1a1a1a);
    border-bottom: 1px solid var(--border, #333);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .app-nav {
    display: flex;
    gap: 4px;
  }

  .app-nav a {
    padding: 6px 12px;
    border-radius: 6px;
    color: var(--text-muted, #888);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.15s, background 0.15s;
  }

  .app-nav a:hover,
  .app-nav a.active {
    color: var(--text-primary, #eee);
    background: var(--bg-elevated, #2a2a2a);
  }

  /* Project title button */
  .header-project-title {
    margin-left: auto;
    font-size: 0.875rem;
    color: var(--text-muted, #888);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
    transition: color 0.15s, background 0.15s;
  }

  .header-project-title:hover {
    background: var(--bg-elevated, #2a2a2a);
  }

  .header-project-title.has-project {
    color: var(--text-primary, #eee);
  }

  /* Profile wrap + button */
  .profile-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .btn--profile {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    color: var(--text-primary, #eee);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .btn--profile:hover {
    background: var(--bg-hover, #3a3a3a);
    border-color: var(--gold, #c9a84c);
  }

  /* Profile dropdown */
  .profile-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 220px;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 200;
    overflow: hidden;
  }

  .pd-user {
    padding: 10px 14px 6px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pd-divider {
    height: 1px;
    background: var(--border, #333);
    margin: 4px 0;
  }

  .pd-label {
    padding: 4px 14px 2px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #888);
  }

  .pd-projects {
    max-height: 200px;
    overflow-y: auto;
    padding: 2px 0;
  }

  .pd-project-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted, #888);
    font-size: 0.8rem;
    transition: background 0.1s, color 0.1s;
    position: relative;
  }

  .pd-project-btn:hover {
    background: var(--bg-elevated, #2a2a2a);
    color: var(--text-primary, #eee);
  }

  .pd-project-btn--active {
    color: var(--text-primary, #eee);
  }

  .pd-project-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pd-project-meta {
    font-size: 0.7rem;
    color: var(--text-muted, #888);
    flex-shrink: 0;
  }

  .pd-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gold, #c9a84c);
    flex-shrink: 0;
  }

  .pd-empty {
    padding: 8px 14px;
    font-size: 0.8rem;
    color: var(--text-muted, #888);
  }

  .pd-action-btn {
    display: block;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted, #888);
    font-size: 0.8rem;
    transition: background 0.1s, color 0.1s;
  }

  .pd-action-btn:hover {
    background: var(--bg-elevated, #2a2a2a);
    color: var(--text-primary, #eee);
  }

  /* Main content */
  .app-main {
    flex: 1;
    padding: 24px;
  }

  .app-main--full {
    padding: 0;
    max-width: 100%;
  }

  .app-footer {
    padding: 12px 24px;
    font-size: 0.75rem;
    color: var(--text-muted, #555);
    border-top: 1px solid var(--border, #333);
    text-align: center;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    gap: 8px;
    color: var(--text-muted, #888);
  }

  .coming-soon h2 {
    font-size: 1.5rem;
    color: var(--text-primary, #eee);
  }
</style>
