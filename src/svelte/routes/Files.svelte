<script>
  import { onMount } from 'svelte';
  // The folder tree is still the shape of the project's paperwork — Dropbox
  // and the local folder are both provisioned from it. What is gone is the
  // browsable copy of it that used to live here, which stored uploads in
  // localStorage and stood in for filing until filing was real.
  import { FOLDER_TREE } from '../lib/folderTree.js';
  import { getProject, saveProject, getActiveProjectId } from '../stores/project.js';
  import { authUser } from '../stores/auth.js';
  import { loadMyMembership } from '../lib/db.js';
  import { COMMIT_ROLES } from '../lib/permissions.js';
  import { storedPlan, effectivePlan, describePlan, withPlan } from '../lib/filingPlan.js';
  import { startDropboxAuth, disconnectDropbox, isDropboxConnected,
           provisionProjectFolders } from '../lib/dropbox.js';
  import { localFilingSupported, localFolderStatus, chooseProjectFolder,
           regrantProjectFolder, forgetProjectFolder, provisionLocalFolders } from '../lib/localFiling.js';

  /* ── Filing plan ──
     Setting up where paperwork goes is the first thing this window is for, so
     it sits above the cabinet rather than in Project Settings. Only the roles
     that can commit may change it: the plan decides where an action of theirs
     writes a file, and it would be strange for someone who cannot cause a
     file to be written to decide where files go. */
  let plan       = $state(storedPlan(getProject()));
  let dropboxOk  = $state(false);
  let localState = $state({ state: 'none', name: null });
  let myMember   = $state(null);
  let planBusy   = $state('');
  let planMsg    = $state('');
  let planErr    = $state('');

  let mayConfigure = $derived(COMMIT_ROLES.includes(myMember?.role));
  let live = $derived(effectivePlan({ filingPlan: plan }, {
    dropboxConnected: dropboxOk,
    localFolderReady: localState.state === 'ready',
  }));

  /* Which option to show selected.
     A project that has never chosen has destination null, and showing three
     empty radios under a header that says DROPBOX reads as broken. Fall back
     to whatever is actually in effect, so the panel shows what is happening
     rather than what was typed. Clicking any option still writes an explicit
     choice, which is what stops it moving when Dropbox drops out. */
  let selectedDest = $derived(plan.destination ?? live.destination);

  async function refreshCapabilities() {
    try { dropboxOk = await isDropboxConnected(); } catch { dropboxOk = false; }
    try { localState = await localFolderStatus(); } catch { localState = { state: 'none', name: null }; }
  }

  onMount(async () => {
    const u = $authUser;
    myMember = u ? await loadMyMembership(getActiveProjectId(), u.id) : null;
    await refreshCapabilities();
  });

  function persistPlan(changes) {
    const project = getProject();
    if (!project) { planErr = 'Open a project before setting up filing.'; return; }
    const next = withPlan(project, changes);
    saveProject(next);
    plan = storedPlan(next);
    planErr = '';
  }

  async function runPlanAction(label, fn) {
    planBusy = label; planMsg = ''; planErr = '';
    try {
      const msg = await fn();
      if (msg) planMsg = msg;
    } catch (e) {
      // A cancelled folder picker throws the same way a real failure does;
      // saying "Could not…" for a deliberate cancel would be a lie.
      planErr = e?.name === 'AbortError' ? '' : (e?.message || 'That did not work.');
    } finally {
      planBusy = '';
      await refreshCapabilities();
    }
  }

  const connectDropbox = () => startDropboxAuth();

  const disconnect = () => runPlanAction('dropbox', async () => {
    if (!confirm('Disconnect Dropbox?\n\nCommitted paperwork will stop being filed there until you reconnect. Nothing already filed is removed.')) return '';
    await disconnectDropbox();
    return 'Dropbox disconnected.';
  });

  const buildDropboxFolders = () => runPlanAction('dropbox-folders', async () => {
    const r = await provisionProjectFolders(getProject());
    return r.failedCount
      ? `${r.totalCount - r.failedCount} of ${r.totalCount} folders created — see the console for the rest.`
      : `All ${r.totalCount} folders created in Dropbox.`;
  });

  const pickLocalFolder = () => runPlanAction('local', async () => {
    const name = await chooseProjectFolder();
    persistPlan({ localFolderName: name });
    return `Using “${name}” on this computer.`;
  });

  const regrant = () => runPlanAction('local', async () => {
    const name = await regrantProjectFolder();
    return `Reconnected “${name}”.`;
  });

  const buildLocalFolders = () => runPlanAction('local-folders', async () => {
    const r = await provisionLocalFolders(FOLDER_TREE);
    return r.failedCount
      ? `${r.created} folders created in “${r.folderName}”, ${r.failedCount} failed.`
      : `All ${r.created} folders created in “${r.folderName}”.`;
  });

  const forgetLocal = () => runPlanAction('local', async () => {
    await forgetProjectFolder();
    persistPlan({ localFolderName: null });
    return 'Forgot that folder. Nothing on disk was changed.';
  });

</script>

<div class="files-section">
  <h2 class="files-heading">Files</h2>
  <p class="files-subtitle">Where this production keeps its paperwork.</p>

  <!-- ══ Filing plan ══ -->
  <section class="fp">
    <div class="fp-head">
      <h3 class="fp-title">Filing Plan</h3>
      <span class="fp-current" class:fp-current--degraded={live.degradedFrom}>
        {live.destination === 'dropbox' ? 'Dropbox'
          : live.destination === 'local' ? 'This computer' : 'Manual'}
      </span>
    </div>
    <p class="fp-desc">{describePlan(live)}</p>
    {#if live.reason}
      <p class="fp-warn">{live.reason}</p>
    {/if}

    {#if !mayConfigure}
      <p class="fp-locked">
        Only an admin or accountant can change where this project files its paperwork.
      </p>
    {:else}
      {#if planMsg}<p class="fp-msg">{planMsg}</p>{/if}
      {#if planErr}<p class="fp-err">{planErr}</p>{/if}

      <div class="fp-options">
        <!-- Dropbox -->
        <label class="fp-option" class:fp-option--active={selectedDest === 'dropbox'}>
          <input type="radio" name="fp-dest" value="dropbox"
            checked={selectedDest === 'dropbox'}
            onchange={() => persistPlan({ destination: 'dropbox' })} />
          <span class="fp-option-body">
            <span class="fp-option-title">
              Project Dropbox
              <span class="fp-chip" class:fp-chip--ok={dropboxOk}>{dropboxOk ? 'Connected' : 'Not connected'}</span>
            </span>
            <span class="fp-option-note">
              Everyone on the project sees the same filed paperwork, from any computer.
            </span>
            <span class="fp-actions">
              {#if !dropboxOk}
                <button class="btn btn--primary btn--xs" onclick={connectDropbox}>Link a Dropbox account</button>
              {:else}
                <button class="btn btn--ghost btn--xs" disabled={planBusy === 'dropbox-folders'}
                  onclick={buildDropboxFolders}>
                  {planBusy === 'dropbox-folders' ? 'Creating…' : 'Create project folders'}
                </button>
                <button class="btn btn--ghost btn--xs" onclick={disconnect}>Disconnect</button>
              {/if}
            </span>
          </span>
        </label>

        <!-- Local folder -->
        <label class="fp-option" class:fp-option--active={selectedDest === 'local'}
               class:fp-option--disabled={!localFilingSupported()}>
          <input type="radio" name="fp-dest" value="local"
            disabled={!localFilingSupported()}
            checked={selectedDest === 'local'}
            onchange={() => persistPlan({ destination: 'local' })} />
          <span class="fp-option-body">
            <span class="fp-option-title">
              A folder on this computer
              {#if localState.state === 'ready'}
                <span class="fp-chip fp-chip--ok">{localState.name}</span>
              {:else if localState.state === 'needs-permission'}
                <span class="fp-chip fp-chip--warn">Needs permission</span>
              {:else if localState.state === 'unsupported'}
                <span class="fp-chip">Not available in this browser</span>
              {:else}
                <span class="fp-chip">No folder chosen</span>
              {/if}
            </span>
            <span class="fp-option-note">
              The job folder lives on this machine only — other people on the project
              will not see what is filed here.
            </span>
            <span class="fp-actions">
              {#if localState.state === 'unsupported'}
                <span class="fp-dim">Use Chrome or the desktop app for this option.</span>
              {:else if localState.state === 'needs-permission'}
                <button class="btn btn--primary btn--xs" onclick={regrant}>Reconnect folder</button>
                <button class="btn btn--ghost btn--xs" onclick={forgetLocal}>Forget</button>
              {:else if localState.state === 'ready'}
                <button class="btn btn--ghost btn--xs" disabled={planBusy === 'local-folders'}
                  onclick={buildLocalFolders}>
                  {planBusy === 'local-folders' ? 'Creating…' : 'Create project folders'}
                </button>
                <button class="btn btn--ghost btn--xs" onclick={pickLocalFolder}>Change folder</button>
                <button class="btn btn--ghost btn--xs" onclick={forgetLocal}>Forget</button>
              {:else}
                <button class="btn btn--primary btn--xs" onclick={pickLocalFolder}>Choose a folder…</button>
              {/if}
            </span>
          </span>
        </label>

        <!-- Manual -->
        <label class="fp-option" class:fp-option--active={selectedDest === 'manual'}>
          <input type="radio" name="fp-dest" value="manual"
            checked={selectedDest === 'manual'}
            onchange={() => persistPlan({ destination: 'manual' })} />
          <span class="fp-option-body">
            <span class="fp-option-title">Keep files myself</span>
            <span class="fp-option-note">
              Committing downloads the document and stops there. Nothing is stored for you.
            </span>
          </span>
        </label>
      </div>

      <!-- When to file. Meaningless if nothing is filed automatically. -->
      {#if selectedDest !== 'manual'}
        <div class="fp-mode">
          <span class="fp-mode-label">When something is committed</span>
          <label class="fp-radio">
            <input type="radio" name="fp-mode" checked={plan.mode === 'automatic'}
              onchange={() => persistPlan({ mode: 'automatic' })} />
            File it automatically
          </label>
          <label class="fp-radio">
            <input type="radio" name="fp-mode" checked={plan.mode === 'prompt'}
              onchange={() => persistPlan({ mode: 'prompt' })} />
            Ask me first
          </label>
        </div>
      {/if}
    {/if}
  </section>

</div>

<style>
  .files-section  { max-width: 860px; }
  .files-heading  { font-size: 1.25rem; margin-bottom: 2px; }
  .files-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); margin-bottom: 16px; }


  /* ── Filing plan ── */
  .fp {
    margin: 18px 0 26px;
    padding: 16px 18px;
    border: 1px solid var(--border, #333);
    background: var(--bg-elevated, #1e1e1e);
  }
  .fp-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .fp-title { font-size: 0.95rem; margin: 0; }
  .fp-current {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--earth-green, #7aaa7a);
  }
  .fp-current--degraded { color: var(--earth-amber, #c8a44d); }

  .fp-desc { font-size: 0.8rem; color: var(--text-secondary, #ccc); margin: 6px 0 0; }
  .fp-warn { font-size: 0.78rem; color: var(--earth-amber, #c8a44d); margin: 6px 0 0; }
  .fp-msg  { font-size: 0.78rem; color: var(--earth-green, #7aaa7a); margin: 10px 0 0; }
  .fp-err  { font-size: 0.78rem; color: var(--earth-red, #b84f4f); margin: 10px 0 0; }
  .fp-locked { font-size: 0.78rem; color: var(--text-muted, #888); margin: 10px 0 0; font-style: italic; }
  .fp-dim  { font-size: 0.72rem; color: var(--text-muted, #888); }

  .fp-options { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }

  .fp-option {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle, #222);
    cursor: pointer;
    align-items: flex-start;
  }
  .fp-option:hover { border-color: var(--border, #333); }
  .fp-option--active { border-color: var(--gold, #c8a44d); background: rgba(200,164,77,0.05); }
  .fp-option--disabled { opacity: 0.55; cursor: not-allowed; }
  .fp-option input { margin-top: 3px; }

  .fp-option-body  { display: flex; flex-direction: column; gap: 3px; flex: 1; }
  .fp-option-title { font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .fp-option-note  { font-size: 0.75rem; color: var(--text-muted, #888); line-height: 1.45; }

  .fp-chip {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border: 1px solid currentColor;
    color: var(--text-muted, #888);
  }
  .fp-chip--ok   { color: var(--earth-green, #7aaa7a); }
  .fp-chip--warn { color: var(--earth-amber, #c8a44d); }

  .fp-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; }

  .fp-mode {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle, #222);
  }
  .fp-mode-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
  }
  .fp-radio { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; cursor: pointer; }
</style>
