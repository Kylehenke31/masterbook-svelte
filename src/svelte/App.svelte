<script>
  import { onMount } from 'svelte';
  import { version as APP_VERSION } from '../../package.json';
  import { currentRoute } from './stores/router.js';
  import {
    projectStore, refreshProjectStore,
    getProject, migrateToMultiProject,
    getRegistry, getActiveProjectId,
    switchProject, projectFolderName,
    snapshotProject, restoreProject, setActiveProjectId,
    PROJECT_DATA_KEYS,
  } from './stores/project.js';
  import { hydrate, hydrateFromCloud } from '../../src/data.js';
  import { syncAllSectionsFromCloud, pushAllSectionsToCloud, saveSectionToCloud, bumpSectionVersion, setSyncMember } from './lib/sections.js';
  import { handleDropboxRedirect } from './lib/dropbox.js';
  import { setCreativeMember } from './lib/creative.js';
  import { loadMyProfile, updateMyDisplayName, acceptPendingInvites, loadMyMembership } from './lib/db.js';
  import { canAccessRoute } from './lib/features.js';

  import Home           from './routes/Home.svelte';
  import MyBook         from './routes/MyBook.svelte';
  import ProjectMembers from './routes/ProjectMembers.svelte';
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
  import PurchaseOrdersLog from './routes/PurchaseOrdersLog.svelte';
  import CreditCards    from './routes/CreditCards.svelte';
  import PettyCash      from './routes/PettyCash.svelte';
  import SubmissionForm from './routes/SubmissionForm.svelte';
  import CallSheet      from './routes/CallSheet.svelte';
  import Budget         from './routes/Budget.svelte';
  import BudgetDrafts   from './routes/BudgetDrafts.svelte';
  import Creative         from './routes/Creative.svelte';
  import CreativeCamera   from './routes/CreativeCamera.svelte';
  import CreativeLocations from './routes/CreativeLocations.svelte';
  import CreativeStub     from './routes/CreativeStub.svelte';
  import Chat             from './components/Chat.svelte';
  import Login            from './routes/Login.svelte';
  import { authUser, authLoading, signOut } from './stores/auth.js';
  import { loadProjectsFromCloud, ensureProjectInCloud } from './stores/project.js';

  let authState      = $state(null);   // mirrors authUser store
  let authIsLoading  = $state(true);   // mirrors authLoading store

  authUser.subscribe(u    => { authState     = u; });
  authLoading.subscribe(l => { authIsLoading = l; });

  /* ── Cloud sync state ── */
  let cloudSyncing = $state(false);
  let lastSyncedUserId = null;

  // When the user signs in, pull their projects + purchases + all sections from
  // Supabase, then force a route remount so every component reads the fresh data.
  authUser.subscribe(async (user) => {
    if (!user || user.id === lastSyncedUserId) return;
    lastSyncedUserId = user.id;
    cloudSyncing = true;
    try {
      // Claim any invite addressed to this email before loading projects —
      // otherwise a newly invited user signs in to an empty app and has to
      // reload before the project they were invited to appears.
      await acceptPendingInvites().catch(() => 0);
      await loadProjectsFromCloud();
      // Repair a project that only ever reached localStorage before asking
      // what this user may do in it — the membership that question reads is
      // created by a trigger on the project row, so with no row the answer is
      // always "nothing", and every later failure points somewhere else.
      const repair = await ensureProjectInCloud();
      const activeId = getActiveProjectId();
      myMembership = activeId ? await loadMyMembership(activeId, user.id) : null;

      // Being signed in, with a project open, and not a member of it is a
      // broken state rather than a quiet one: every write is refused by RLS,
      // and the refusal surfaces wherever the write happened to be — most
      // often as an unreadable storage error while submitting a purchase.
      // Say so here, where the cause is, and print what a policy would be
      // comparing so the mismatch is visible rather than inferred.
      if (activeId && !myMembership) {
        // Put the reason on screen, not only in the console. This state stops
        // every write, and "why" is a single word the database already told
        // us — making somebody open devtools to read it has cost hours.
        const why = {
          no_such_project:   'this project was never saved to the cloud',
          no_owner_recorded: 'the project has no owner recorded, so nobody can claim it',
          not_owner:         'the project belongs to a different account',
          not_signed_in:     'the session was not recognised',
          rpc_error:         'the database refused the request',
        }[repair?.reason] || repair?.reason || 'unknown';

        console.warn(
          '[project] NOT A MEMBER of the active project — writes will be refused by RLS.\n' +
          `  reason:     ${repair?.reason ?? 'n/a'}\n` +
          `  user id:    ${user.id}\n` +
          `  project id: ${activeId}\n` +
          `  owns:       ${(repair?.owned || []).map(p => `${p.title} (${p.id}) member=${p.is_member}`).join('; ') || 'nothing'}`
        );
        window.dispatchEvent(new CustomEvent('masterbook-sync-error', {
          detail: {
            table: 'project_members', operation: 'loadMyMembership',
            message: `you are not a member of the open project, so nothing can be saved — ${why}`,
            at: new Date().toISOString(),
          },
        }));
      }
      setSyncMember(myMembership);
      setCreativeMember(myMembership);
      if (activeId) {
        // Pull purchases and all section blobs in parallel
        await Promise.all([
          hydrateFromCloud(activeId),
          syncAllSectionsFromCloud(activeId),
        ]);
      }
      // Force all route components to remount with fresh data.
      // Use the live URL hash — not `route` (which may be stale if the user
      // navigated during the async sync).
      currentRoute.set(null);
      setTimeout(() => resolveRoute(), 50);
    } catch (e) {
      console.warn('[App] cloud sync failed:', e);
    } finally {
      cloudSyncing = false;
    }
  });

  /* ── Debounced section auto-save ──────────────────────────────── */
  // Any component can dispatch window event 'masterbook-section-changed'
  // with detail: { section: 'budget' | 'personnel' | ... }
  // to trigger a cloud save of that section.
  // Falls back to pushing ALL sections if no section name is given.
  let _sectionSaveTimers = {};
  function handleSectionChanged(e) {
    const sectionName = e?.detail?.section;
    const projectId   = getActiveProjectId();
    if (sectionName) bumpSectionVersion(sectionName);
    if (!projectId) return;

    if (sectionName) {
      clearTimeout(_sectionSaveTimers[sectionName]);
      _sectionSaveTimers[sectionName] = setTimeout(() => {
        saveSectionToCloud(sectionName, projectId).catch(() => {});
      }, 1500);
    } else {
      // No specific section — debounce a full push
      clearTimeout(_sectionSaveTimers.__all);
      _sectionSaveTimers.__all = setTimeout(() => {
        pushAllSectionsToCloud(projectId).catch(() => {});
      }, 1500);
    }
  }

  /* ── Profile dropdown ── */
  let showDropdown      = $state(false);
  let dropdownRegistry  = $state([]);
  let dropdownActiveId  = $state(null);

  /* ── Ledgers dropdown ── */
  let showLedgersDropdown = $state(false);
  const LEDGERS_ROUTES = [
    { id: 'my-book',       label: 'My Book' },
    { id: 'log',           label: 'All Expenses' },
    { id: 'po-log',        label: 'Purchase Orders' },
    { id: 'credit-cards',  label: 'Credit Cards' },
    { id: 'petty-cash',    label: 'Petty Cash' },
  ];

  /* ── Chat trigger (button lives in sidebar; panel owned by Chat.svelte) ── */
  let chatOpen   = $state(false);
  let chatUnread = $state(0);

  /* ── Sidebar collapse ── */
  const SIDEBAR_COLLAPSED_KEY = 'movie-ledger-sidebar-collapsed';
  let sidebarCollapsed = $state(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
  }

  /* ── Routing ── */
  let route = $state(null);
  // Where to send the user back to when they finish (or abandon) a submission.
  let submitReturnRoute = 'log';
  currentRoute.subscribe(r => {
    route = r;
    showDropdown = false; // close dropdown on every navigation
    showLedgersDropdown = false;
    refreshProjectStore();
  });

  /* ── My access on this project ──
     Drives which routes and nav items are reachable. Null until it loads;
     the guard treats "not yet known" as "allow", because blocking on an
     unloaded grant would flash an access error at a legitimate admin. */
  let myMembership = $state(null);

  /** May the signed-in member open this route? Unknown membership allows. */
  function mayAccess(r) {
    if (!myMembership) return true;
    return canAccessRoute(myMembership, r);
  }

  /* ── Project state (reactive via store) ── */
  let _project = $state(null);
  projectStore.subscribe(p => { _project = p; });

  /* ── Sync problems ── */
  // Deduplicated by table+kind: a section failing on every retry should read
  // as one ongoing problem, not a growing pile of identical warnings.
  let syncProblems = $state([]);
  let syncProblemDetail = $derived(
    syncProblems.map(p => `${p.table}: ${p.message}`).join('\n') || '');

  // Dropbox filing problems ride this same channel, but they mean the opposite
  // of a failed save: the record reached the cloud, its paperwork did not reach
  // Dropbox. Labelling one of those "not saved to cloud" sends someone hunting
  // for data that was never lost, so the banner says which kind it is holding.
  let syncProblemsOpen = $state(false);

  let syncProblemsAllDropbox = $derived(
    syncProblems.length > 0 && syncProblems.every(p => p.table === 'dropbox'));

  function noteSyncProblem(detail) {
    const id = `${detail.table}:${detail.kind}`;
    if (syncProblems.some(p => p.id === id)) return;
    syncProblems = [...syncProblems, { id, ...detail }];
  }

  /* ── Profile name ── */
  let profileName       = $state('');
  let profileNameSaving = $state(false);
  let profileNameMsg    = $state('');

  function openDropdown() {
    dropdownRegistry = getRegistry().filter(r => !r._archived);
    dropdownActiveId = getActiveProjectId();
    profileNameMsg = '';
    // Read the stored profile each time the menu opens rather than caching —
    // it may have been changed from another device.
    loadMyProfile().then(p => { profileName = p?.display_name || ''; });
    showDropdown = true;
  }

  async function saveProfileName() {
    const name = profileName.trim();
    if (!name || profileNameSaving) return;
    profileNameSaving = true;
    profileNameMsg = '';
    try {
      await updateMyDisplayName(name);
      profileNameMsg = 'Saved.';
    } catch (e) {
      profileNameMsg = `Could not save: ${e.message}`;
    } finally {
      profileNameSaving = false;
    }
  }

  function closeDropdown() { showDropdown = false; }

  async function handleSwitchProject(targetId) {
    closeDropdown();
    const currentId = getActiveProjectId();
    if (targetId === currentId) {
      window.location.hash = '#log';
      return;
    }

    // Push current project's sections to cloud before switching
    if (currentId) {
      pushAllSectionsToCloud(currentId).catch(() => {});
    }

    // Switch localStorage (synchronous)
    switchProject(targetId);
    hydrate();

    // Pull the new project's sections from cloud, then remount
    cloudSyncing = true;
    try {
      // Same check sign-in does. Switching into a project is the other way to
      // arrive somewhere you may have no membership in, and the symptom is
      // identical — everything refused, far from the cause.
      await ensureProjectInCloud();
      // No user id passed — loadMyMembership resolves it itself, and getUser
      // is not imported here.
      myMembership = await loadMyMembership(targetId);
      setSyncMember(myMembership);
      setCreativeMember(myMembership);
      await Promise.all([
        hydrateFromCloud(targetId),
        syncAllSectionsFromCloud(targetId),
      ]);
    } catch (e) {
      console.warn('[App] project switch sync failed:', e);
    } finally {
      cloudSyncing = false;
    }

    // Force remount so all components re-read fresh localStorage data
    currentRoute.set(null);
    setTimeout(() => resolveRoute(), 50);
    window.location.hash = '#log';
  }

  function handleNewProject() {
    closeDropdown();
    sessionStorage.setItem('pm-intent', 'create');
    window.location.hash = '#home';
  }

  async function handleSignOut() {
    closeDropdown();
    lastSyncedUserId = null;  // allow re-sync if user signs back in
    await signOut();
    // authUser store will update → authState becomes null → Login screen shows
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
    'day-out-of-days', 'budget', 'budget-lines', 'hot-costs', 'budget-drafts', 'call-sheet',
    'insurance', 'vendors', 'files', 'settings',
    'creative', 'creative-camera', 'creative-locations',
    'creative-prod-design', 'creative-costume', 'creative-property',
    'creative-hair-makeup', 'creative-stunts', 'creative-continuity',
    'po-log', 'credit-cards', 'petty-cash', 'my-book', 'members',
  ]);

  /** Which top-level "group" (macro sidebar section) is the current route in? */
  function routeGroup(r) {
    if (!r) return '';
    if (['schedules','breakdowns','one-liner','script-order','shooting-schedule',
         'elements-report','day-out-of-days'].includes(r)) return 'schedules';
    if (['budget','budget-lines','hot-costs','budget-drafts'].includes(r)) return 'budget';
    if (['log','po-log','credit-cards','petty-cash'].includes(r)) return 'ledgers';
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

    // A member without the grant for this section is sent to their own book
    // rather than shown an empty screen they cannot act on.
    if (!mayAccess(hash)) {
      window.location.hash = '#my-book';
      return;
    }

    // Remember where the user opened the submission form from, so finishing it
    // returns them there rather than dumping everyone on the expense log. The
    // form is reachable from My Book, the Purchase Log and the PO log, and
    // being returned somewhere you did not come from reads as "did that work?"
    if (hash === 'submit' && route && route !== 'submit') submitReturnRoute = route;

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

    // Complete a Dropbox connect flow if we just landed back from it
    handleDropboxRedirect()
      .then(connected => { if (connected) window.location.hash = '#settings'; })
      .catch(err => console.error('[Dropbox] connect failed:', err));

    const onSyncError = e => noteSyncProblem({
      table: e.detail.table, kind: 'error',
      message: `${e.detail.operation} failed — ${e.detail.message}`,
    });
    const onReadOnlyBlocked = e => noteSyncProblem({
      table: e.detail.section, kind: 'readonly',
      message: `You have view-only access to ${e.detail.feature || e.detail.section} — that change was not saved.`,
    });
    const onSyncConflict = e => noteSyncProblem({
      table: e.detail.table, kind: 'conflict',
      message: `${e.detail.keys.join(', ')} changed here and elsewhere; your copy was kept`,
    });

    window.addEventListener('hashchange', resolveRoute);
    window.addEventListener('masterbook-section-changed', handleSectionChanged);
    window.addEventListener('masterbook-sync-error', onSyncError);
    window.addEventListener('masterbook-sync-conflict', onSyncConflict);
    window.addEventListener('masterbook-readonly-blocked', onReadOnlyBlocked);
    resolveRoute();
    return () => {
      window.removeEventListener('hashchange', resolveRoute);
      window.removeEventListener('masterbook-section-changed', handleSectionChanged);
      window.removeEventListener('masterbook-sync-error', onSyncError);
      window.removeEventListener('masterbook-sync-conflict', onSyncConflict);
      window.removeEventListener('masterbook-readonly-blocked', onReadOnlyBlocked);
    };
  });
</script>

<!-- Close profile / Ledgers dropdowns on outside click -->
<svelte:window onclick={(e) => {
  if (showDropdown && !e.target.closest('.profile-wrap')) closeDropdown();
  if (showLedgersDropdown && !e.target.closest('.ledgers-wrap')) showLedgersDropdown = false;
}} />

<!-- ── Auth gate ── -->
{#if authIsLoading}
  <!-- Checking session — brief splash so there's no flicker -->
  <div class="auth-splash">
    <img src="/logo-night.png" class="auth-splash-logo auth-splash-logo--dark" alt="The Masterbook" />
    <img src="/logo-day.png"   class="auth-splash-logo auth-splash-logo--light" alt="The Masterbook" />
  </div>

{:else if !authState}
  <!-- Not logged in — show full-page login -->
  <Login />

{:else}

<!-- Macro sidebar (far-left icon rail) -->
<aside class="macro-sidebar" class:macro-sidebar--collapsed={sidebarCollapsed}>
  <div class="macro-sidebar-top">
    {#if !sidebarCollapsed}
      <img src="/logo-night.png" class="sidebar-logo sidebar-logo--dark" alt="Masterbook" />
      <img src="/logo-day.png"   class="sidebar-logo sidebar-logo--light" alt="Masterbook" />
    {/if}
    <button class="sidebar-collapse-btn" onclick={toggleSidebar}
      title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        {#if sidebarCollapsed}
          <polyline points="9 18 15 12 9 6"/>
        {:else}
          <polyline points="15 18 9 12 15 6"/>
        {/if}
      </svg>
    </button>
  </div>
  {#if !sidebarCollapsed}
  <div class="macro-sidebar-items">

    {#if mayAccess('budget')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'budget'}
      onclick={() => { window.location.hash = '#budget'; }} title="Budget">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <rect x="2" y="3" width="20" height="4" rx="1"/>
        <rect x="2" y="9" width="20" height="4" rx="1"/>
        <rect x="2" y="15" width="20" height="4" rx="1"/>
      </svg>
      <span class="macro-label">Budget</span>
    </button>
    {/if}

    {#if mayAccess('schedules')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'schedules'}
      onclick={() => { window.location.hash = '#schedules'; }} title="Schedules">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
      <span class="macro-label">Schedules</span>
    </button>
    {/if}

    {#if mayAccess('call-sheet')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'callsheet'}
      onclick={() => { window.location.hash = '#call-sheet'; }} title="Call Sheet">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span class="macro-label">Call Sheet</span>
    </button>
    {/if}

    {#if mayAccess('insurance')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'insurance'}
      onclick={() => { window.location.hash = '#insurance'; }} title="Insurance">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span class="macro-label">Insurance</span>
    </button>
    {/if}

    {#if mayAccess('creative')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'creative'}
      onclick={() => { window.location.hash = '#creative'; }} title="Creative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.3 6L15 17H9l-.7-2C6.3 13.7 5 11.5 5 9a7 7 0 017-7z"/>
      </svg>
      <span class="macro-label">Creative</span>
    </button>
    {/if}

    {#if mayAccess('files')}
    <button class="macro-btn" class:macro-active={routeGroup(route) === 'files'}
      onclick={() => { window.location.hash = '#files'; }} title="Files">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <span class="macro-label">Files</span>
    </button>
    {/if}

    <div class="macro-sidebar-divider"></div>

    <!-- Second section: plain-text "folder" list, no icons -->
    <div class="ledgers-wrap">
      {#if showLedgersDropdown}
        <div class="ledgers-dropdown" role="menu">
          {#each LEDGERS_ROUTES.filter(r => mayAccess(r.id)) as r (r.id)}
            <button class="pd-action-btn" class:pd-action-btn--active={route === r.id}
              role="menuitem" onclick={() => { window.location.hash = '#' + r.id; }}>
              {r.label}
            </button>
          {/each}
        </div>
      {/if}
      <button class="macro-btn macro-btn--text" class:macro-active={routeGroup(route) === 'ledgers'}
        onclick={() => { showLedgersDropdown = !showLedgersDropdown; }}>
        <span class="macro-label">Ledgers</span>
        <svg class="ledgers-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    </div>

    <button class="macro-btn macro-btn--text" class:macro-active={route === 'calendar'}
      onclick={() => { window.location.hash = '#calendar'; }}>
      <span class="macro-label">Calendar</span>
    </button>

    <button class="macro-btn macro-btn--text" class:macro-active={route === 'crew'}
      onclick={() => { window.location.hash = '#crew'; }}>
      <span class="macro-label">Personnel</span>
    </button>

    <button class="macro-btn macro-btn--text" class:macro-active={route === 'vendors'}
      onclick={() => { window.location.hash = '#vendors'; }}>
      <span class="macro-label">Vendors</span>
    </button>

  </div>

  <!-- Bottom of sidebar: profile + chat trigger, then project settings -->
  <div class="macro-sidebar-bottom">
    {#if cloudSyncing}
      <span class="cloud-sync-indicator" title="Syncing with cloud…">
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Syncing…
      </span>
    {/if}

    <!-- A section that failed to reach the cloud, or one whose local and cloud
         copies disagree, must say so. Failing quietly is what let the credit
         card and petty cash tables stay missing for months while the app went
         on presenting localStorage as if it were saved. -->
    <!-- Click opens it; a separate × dismisses. It used to do the opposite:
         the detail was tooltip-only and clicking threw it away, so the natural
         move for anyone trying to read why their work was not saving destroyed
         the only explanation of it. -->
    {#if syncProblems.length}
      <div class="sync-problem-wrap">
        <button class="sync-problem" onclick={() => syncProblemsOpen = !syncProblemsOpen}>
          ⚠ {syncProblems.length}
          {#if syncProblemsAllDropbox}
            filing {syncProblems.length === 1 ? 'issue' : 'issues'} — not filed to Dropbox
          {:else}
            sync {syncProblems.length === 1 ? 'issue' : 'issues'} — not saved to cloud
          {/if}
          <span class="sync-problem-caret">{syncProblemsOpen ? '▾' : '▸'}</span>
        </button>
        {#if syncProblemsOpen}
          <div class="sync-problem-detail">
            {#each syncProblems as p (p.id)}
              <p class="sync-problem-line"><strong>{p.table}</strong> — {p.message}</p>
            {/each}
            <button class="sync-problem-dismiss"
              onclick={() => { syncProblems = []; syncProblemsOpen = false; }}>Dismiss</button>
          </div>
        {/if}
      </div>
    {/if}

    <div class="sidebar-bottom-row">
      <!-- Profile button + dropdown -->
      <div class="profile-wrap">
        {#if showDropdown}
          <div class="profile-dropdown" role="menu">
            <div class="pd-user">{_project?.defaultSubmitter || authState?.email || 'User'}</div>
            <div class="pd-email">{authState?.email || ''}</div>
            <div class="pd-divider"></div>
            <!-- Your name as other people on a project see it. It also names
                 any credit card assigned to you, so it wants to be a full
                 name rather than a first name. -->
            <div class="pd-label">Your Name</div>
            <div class="pd-name-row">
              <input class="pd-name-input" type="text" placeholder="Full name"
                bind:value={profileName}
                onkeydown={e => { if (e.key === 'Enter') saveProfileName(); }} />
              <button class="btn btn--primary btn--xs" onclick={saveProfileName}
                disabled={profileNameSaving}>{profileNameSaving ? '…' : 'Save'}</button>
            </div>
            {#if profileNameMsg}<div class="pd-name-msg">{profileNameMsg}</div>{/if}
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
            <div class="pd-divider"></div>
            <button class="pd-action-btn pd-action-btn--signout" role="menuitem" onclick={handleSignOut}>
              Sign Out
            </button>
          </div>
        {/if}

        <button
          class="btn btn--icon btn--profile"
          aria-label="User profile"
          title="User profile"
          onclick={showDropdown ? closeDropdown : openDropdown}
        >{_initials()}</button>
      </div>

      <!-- Chat trigger (panel rendered by <Chat> below, outside the aside) -->
      {#if _hasProject()}
        <button class="chat-trigger-btn" aria-label="Project chat" title="Project Chat"
          onclick={() => { chatOpen = !chatOpen; }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          {#if chatUnread > 0}
            <span class="chat-badge-mini">{chatUnread > 99 ? '99+' : chatUnread}</span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Project title → settings or initial setup -->
    <button
      class="header-project-title"
      class:has-project={_hasProject()}
      title={_headerTitle()}
      onclick={() => { window.location.hash = _headerTarget(); }}
    >{_headerTitle()}</button>
  </div>
  {/if}
</aside>

<div class="app-shell" class:app-shell--sidebar-collapsed={sidebarCollapsed}>

  <main class="app-main"
        class:app-main--full={route === 'crew' || route === 'budget-lines'}
        class:app-main--home={route === 'home' || !route}>
    {#if route === 'log'}
      <PurchaseLog />
    {:else if route === 'po-log'}
      <PurchaseOrdersLog />
    {:else if route === 'my-book'}
      <MyBook />
    {:else if route === 'members'}
      <ProjectMembers />
    {:else if route === 'credit-cards'}
      <CreditCards />
    {:else if route === 'petty-cash'}
      <PettyCash />
    {:else if route === 'submit'}
      <SubmissionForm onDone={() => { window.location.hash = '#' + (submitReturnRoute || 'log'); }} />
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
    {:else if route === 'budget-drafts'}
      <BudgetDrafts />
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
</div>

<!-- Global chat bubble — only render when a real project is active -->
{#if _hasProject()}
  <Chat projectId={getActiveProjectId()} bind:open={chatOpen} bind:unread={chatUnread} />
{/if}

<!-- Build marker. Deliberately tiny and unclickable: it exists so a screenshot
     carries its own version, not as something to read while working. Sourced
     from package.json so it cannot drift from what was actually built. -->
<span class="app-version" aria-hidden="true">v{APP_VERSION}</span>

{/if} <!-- end auth gate -->

<style>
  /* Bottom-right build marker. Fixed to the viewport rather than the shell so
     it stays put on every route, and pointer-events:none so it can never sit
     between a click and a control underneath it. */
  .app-version {
    position: fixed;
    right: 8px;
    bottom: 6px;
    z-index: 40;
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
    opacity: 0.5;
    pointer-events: none;
    user-select: none;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    margin-left: 200px;
    transition: margin-left 0.16s ease;
  }

  .app-shell--sidebar-collapsed {
    margin-left: 44px;
  }

  /* Collapse/expand toggle, top of sidebar */
  .sidebar-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    background: none;
    border: none;
    border-radius: 0;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .sidebar-collapse-btn:hover {
    background: var(--bg-elevated, #2a2a2a);
    color: var(--text-primary, #eee);
  }

  /* Bottom of macro sidebar: profile bubble + chat trigger + project settings */
  .macro-sidebar-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding-top: 8px;
    border-top: 1px solid var(--border, #333);
  }

  .sidebar-bottom-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  /* Chat trigger button — square, sits next to the profile button */
  .chat-trigger-btn {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 0;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    color: var(--text-primary, #eee);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .chat-trigger-btn:hover {
    background: var(--bg-hover, #3a3a3a);
    border-color: var(--gold, #c9a84c);
  }

  .chat-badge-mini {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    background: #e44;
    color: #fff;
    border-radius: 0;
    font-size: 0.6rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* Project title / settings button */
  .header-project-title {
    width: calc(100% - 16px);
    margin: 0 8px;
    font-size: 0.72rem;
    color: var(--text-muted, #888);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 4px;
    border-radius: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
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
    border-radius: 0;
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

  /* Profile dropdown — opens upward from the bottom of the sidebar.
     top/right explicitly reset to auto to override the legacy global
     .profile-dropdown rule in styles.css (top: 36px; right: 0), which
     otherwise combines with bottom/left here and collapses the height. */
  .profile-dropdown {
    position: absolute;
    top: auto;
    bottom: calc(100% + 8px);
    left: 0;
    right: auto;
    min-width: 240px;
    padding: 0;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 200;
    overflow: hidden;
  }

  .pd-user {
    padding: 10px 14px 2px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pd-email {
    padding: 0 14px 8px;
    font-size: 0.72rem;
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pd-email:empty { display: none; }

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

  .pd-name-row {
    display: flex;
    gap: 6px;
    padding: 2px 14px 6px;
    align-items: center;
  }

  .pd-name-input {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 0;
  }

  .pd-name-input:focus { outline: none; border-color: var(--gold); }

  .pd-name-msg {
    padding: 0 14px 6px;
    font-size: 0.7rem;
    color: var(--text-muted);
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
    border-radius: 0;
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

  .pd-action-btn--signout { color: #e66; }
  .pd-action-btn--signout:hover { background: rgba(220,60,60,0.08); color: #e88; }
  .pd-action-btn--active { color: var(--gold, #c9a84c); font-weight: 600; }

  /* Ledgers dropdown — same shape as the profile dropdown, opens downward
     from the sidebar trigger instead of upward from the bottom bar. */
  .ledgers-wrap { position: relative; }
  .ledgers-wrap .macro-btn { justify-content: space-between; }
  .ledgers-caret { flex-shrink: 0; opacity: 0.6; }
  .ledgers-dropdown {
    position: absolute;
    top: 100%;
    left: 8px;
    right: 8px;
    min-width: 180px;
    padding: 4px 0;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 200;
    overflow: hidden;
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

  /* The project menu's photograph, bled across the whole main area.
     Applied here rather than inside the route so it fills the pane without
     fighting the layout — a negative-margin bleed from within resolved its
     width against the padded column and stopped short of the right edge.

     The scrim is structural, not decorative: the picture is mostly pale sky
     and this screen is light text, which over the sky is unreadable. It is
     heaviest at the top where the type sits and lifts toward the bottom, so
     the ridgeline and the moon still read as a photograph. */
  .app-main--home {
    background-image:
      linear-gradient(to bottom,
        rgba(10, 12, 16, 0.88) 0%,
        rgba(10, 12, 16, 0.74) 40%,
        rgba(10, 12, 16, 0.55) 100%),
      url('/project-menu-bg.jpg');
    background-size: cover;
    background-position: center 30%;
    background-repeat: no-repeat;
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

  /* Auth splash (session check on startup) */
  .auth-splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-base, #111);
    z-index: 9999;
  }
  .auth-splash-logo {
    width: 80px;
    height: auto;
    opacity: 0.6;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .auth-splash-logo--light { display: none; }
  :global([data-theme="light"]) .auth-splash-logo--dark  { display: none; }
  :global([data-theme="light"]) .auth-splash-logo--light { display: block; }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.97); }
    50%       { opacity: 0.8; transform: scale(1.03); }
  }

  /* Cloud sync indicator */
  .cloud-sync-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.65rem;
    color: var(--gold, #c9a84c);
    white-space: nowrap;
  }

  .sync-problem-wrap { margin-bottom: 6px; }

  .sync-problem-caret { float: right; opacity: 0.7; }

  .sync-problem-detail {
    padding: 8px;
    border: 1px solid currentColor;
    border-top: none;
    font-size: 0.65rem;
    line-height: 1.5;
    color: var(--text-secondary, #ccc);
    max-height: 180px;
    overflow-y: auto;
  }
  .sync-problem-line { margin: 0 0 6px; }
  .sync-problem-line strong { color: var(--text-primary, #eee); }

  .sync-problem-dismiss {
    font: inherit;
    font-size: 0.62rem;
    background: none;
    border: 1px solid var(--border, #333);
    color: var(--text-muted, #888);
    padding: 2px 8px;
    cursor: pointer;
  }
  .sync-problem-dismiss:hover { color: var(--text-primary, #eee); }

  .sync-problem {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    font-size: 0.65rem;
    font-family: inherit;
    line-height: 1.35;
    color: var(--red, #e05252);
    background: rgba(224, 82, 82, 0.10);
    border: 1px solid var(--red, #e05252);
    border-radius: 0;
    cursor: pointer;
  }

  .sync-problem:hover { background: rgba(224, 82, 82, 0.18); }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin {
    animation: spin 0.9s linear infinite;
  }
</style>
