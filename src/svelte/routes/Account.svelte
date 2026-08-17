<script>
  /**
   * Account.svelte — the things that belong to a person rather than a project.
   *
   * Reached from the project menu, and deliberately outside any project: your
   * name, your password, your Dropbox, and which productions you are on. The
   * project you happen to have open has nothing to do with any of it.
   */
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase.js';
  import { authUser, signOut } from '../stores/auth.js';
  import { loadMyProfile, updateMyDisplayName, leaveProject } from '../lib/db.js';
  import { getRegistry, saveRegistry, getActiveProjectId, setActiveProjectId } from '../stores/project.js';
  import { isDropboxConnected, startDropboxAuth, disconnectDropbox } from '../lib/dropbox.js';

  let profile   = $state(null);
  let name      = $state('');
  let nameMsg   = $state('');
  let nameBusy  = $state(false);

  let pw1       = $state('');
  let pw2       = $state('');
  let pwMsg     = $state('');
  let pwErr     = $state('');
  let pwBusy    = $state(false);

  let dropboxOk = $state(false);
  let dbxBusy   = $state(false);

  let projects  = $state([]);
  let leaveMsg  = $state('');
  let leaveErr  = $state('');

  let theme     = $state('dark');

  onMount(async () => {
    profile = await loadMyProfile();
    name = profile?.display_name || '';
    theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    projects = getRegistry().filter(r => !r._archived);
    try { dropboxOk = await isDropboxConnected(); } catch { dropboxOk = false; }
  });

  async function saveName() {
    nameBusy = true; nameMsg = '';
    try {
      await updateMyDisplayName(name);
      nameMsg = 'Saved.';
      setTimeout(() => { nameMsg = ''; }, 2500);
    } catch (e) {
      nameMsg = e.message || 'Could not save that.';
    } finally {
      nameBusy = false;
    }
  }

  /**
   * Supabase updates the password on the current session, so there is no
   * "current password" field to fill in — being signed in is the proof. The
   * confirmation field is here to catch a typo, not to authenticate.
   */
  async function changePassword() {
    pwErr = ''; pwMsg = '';
    if (pw1.length < 6)  { pwErr = 'Use at least 6 characters.'; return; }
    if (pw1 !== pw2)     { pwErr = 'Those two do not match.'; return; }
    pwBusy = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw new Error(error.message);
      pw1 = ''; pw2 = '';
      pwMsg = 'Password changed.';
    } catch (e) {
      pwErr = e.message || 'Could not change the password.';
    } finally {
      pwBusy = false;
    }
  }

  async function toggleDropbox() {
    dbxBusy = true;
    try {
      if (dropboxOk) {
        if (!confirm('Disconnect Dropbox?\n\nCommitted paperwork stops being filed there until you reconnect. Nothing already filed is removed.')) return;
        await disconnectDropbox();
        dropboxOk = false;
      } else {
        startDropboxAuth();   // navigates away
      }
    } finally {
      dbxBusy = false;
    }
  }

  /**
   * Leaving removes your membership, then forgets the project locally.
   *
   * Both halves matter: without the local half the project keeps appearing in
   * your own menu, and clicking it lands you in something you can no longer
   * read — which looks like the app being broken rather than like having left.
   */
  async function leave(p) {
    leaveMsg = ''; leaveErr = '';
    if (!confirm(`Leave ${p.productionNumber ? p.productionNumber + '_' + p.title : p.title}?\n\nYou lose access to it. It is not deleted, and an admin can add you back.`)) return;
    const r = await leaveProject(p.id);
    if (!r.ok) {
      leaveErr = r.reason === 'last_admin'
        ? 'You are its only admin. Make someone else an admin first, or the project would be left with nobody who can grant access.'
        : r.reason === 'not_a_member'
          ? 'You are not a member of that project.'
          : (r.error || 'Could not leave that project.');
      return;
    }
    saveRegistry(getRegistry().filter(x => x.id !== p.id));
    if (getActiveProjectId() === p.id) setActiveProjectId('');
    projects = getRegistry().filter(x => !x._archived);
    leaveMsg = 'Left the project.';
  }

  function setTheme(next) {
    theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem('movie-ledger-theme', next);
  }
</script>

<section class="acct">
  <button class="acct-back" onclick={() => { window.location.hash = '#home'; }} aria-label="Back to project menu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>

  <h2 class="acct-title">Account</h2>
  <p class="acct-email">{profile?.email || $authUser?.email || ''}</p>

  <!-- Name -->
  <div class="acct-block">
    <h3 class="acct-h">Your name</h3>
    <p class="acct-note">How you appear to everyone else, and what names a credit card assigned to you.</p>
    <div class="acct-row">
      <input class="acct-input" type="text" bind:value={name} placeholder="Full name"
        onkeydown={e => { if (e.key === 'Enter') saveName(); }} />
      <button class="btn btn--primary btn--sm" onclick={saveName} disabled={nameBusy}>
        {nameBusy ? '…' : 'Save'}
      </button>
    </div>
    {#if nameMsg}<p class="acct-msg">{nameMsg}</p>{/if}
  </div>

  <!-- Password -->
  <div class="acct-block">
    <h3 class="acct-h">Password</h3>
    <p class="acct-note">Being signed in is the proof, so there is no current password to re-enter.</p>
    <div class="acct-row">
      <input class="acct-input" type="password" bind:value={pw1} placeholder="New password" autocomplete="new-password" />
      <input class="acct-input" type="password" bind:value={pw2} placeholder="Repeat it" autocomplete="new-password" />
      <button class="btn btn--primary btn--sm" onclick={changePassword} disabled={pwBusy}>
        {pwBusy ? '…' : 'Change'}
      </button>
    </div>
    {#if pwErr}<p class="acct-err">{pwErr}</p>{/if}
    {#if pwMsg}<p class="acct-msg">{pwMsg}</p>{/if}
  </div>

  <!-- Dropbox -->
  <div class="acct-block">
    <h3 class="acct-h">Dropbox</h3>
    <p class="acct-note">
      Connected per person, not per project — this is the account paperwork is filed to
      when a project's filing plan says Dropbox.
    </p>
    <div class="acct-row">
      <span class="acct-chip" class:acct-chip--ok={dropboxOk}>{dropboxOk ? 'Connected' : 'Not connected'}</span>
      <button class="btn btn--ghost btn--sm" onclick={toggleDropbox} disabled={dbxBusy}>
        {dropboxOk ? 'Disconnect' : 'Link Dropbox'}
      </button>
    </div>
  </div>

  <!-- Projects -->
  <div class="acct-block">
    <h3 class="acct-h">Your projects</h3>
    <p class="acct-note">Leaving removes your access. It does not delete the project.</p>
    {#if projects.length === 0}
      <p class="acct-note">You are not on any projects.</p>
    {:else}
      <div class="acct-projects">
        {#each projects as p (p.id)}
          <div class="acct-project">
            <span class="acct-project-name">{p.productionNumber ? `${p.productionNumber}_${p.title}` : p.title}</span>
            <button class="acct-leave" onclick={() => leave(p)}>Leave</button>
          </div>
        {/each}
      </div>
    {/if}
    {#if leaveErr}<p class="acct-err">{leaveErr}</p>{/if}
    {#if leaveMsg}<p class="acct-msg">{leaveMsg}</p>{/if}
  </div>

  <!-- Subscription — a placeholder, deliberately inert.
       The section exists so the shape of the account screen does not have to
       change when billing arrives, and so nobody goes looking for it in
       Project Settings. The control is disabled rather than absent: an empty
       heading reads as broken, a disabled button reads as not yet. -->
  <div class="acct-block">
    <h3 class="acct-h">Subscription</h3>
    <p class="acct-note">
      Billing is not switched on. Everything is open while the app is being
      tested, and nothing here will start charging without asking first.
    </p>
    <div class="acct-row">
      <span class="acct-chip">Not billed</span>
      <button class="btn btn--ghost btn--sm" disabled
        title="Subscriptions are not available yet">Manage subscription</button>
    </div>
  </div>

  <!-- Appearance -->
  <div class="acct-block">
    <h3 class="acct-h">Appearance</h3>
    <div class="acct-row">
      <button class="btn btn--sm" class:btn--primary={theme === 'dark'} class:btn--ghost={theme !== 'dark'}
        onclick={() => setTheme('dark')}>Night</button>
      <button class="btn btn--sm" class:btn--primary={theme === 'light'} class:btn--ghost={theme !== 'light'}
        onclick={() => setTheme('light')}>Day</button>
    </div>
  </div>

  <div class="acct-block">
    <button class="btn btn--ghost btn--sm acct-signout" onclick={signOut}>Sign Out</button>
  </div>
</section>

<style>
  .acct {
    max-width: 520px;
    margin: 0 auto;
    padding: 28px 16px 60px;
  }

  .acct-back {
    background: none;
    border: none;
    padding: 0;
    margin-bottom: 12px;
    color: var(--text-muted, #888);
    cursor: pointer;
    opacity: 0.7;
  }
  .acct-back:hover { opacity: 1; }

  .acct-title { font-size: 1.25rem; margin: 0 0 2px; }
  .acct-email { font-size: 0.8rem; color: var(--text-muted, #888); margin: 0 0 26px; }

  .acct-block {
    padding: 16px 0;
    border-top: 1px solid var(--border-subtle, #222);
  }

  .acct-h { font-size: 0.85rem; margin: 0 0 3px; }
  .acct-note { font-size: 0.75rem; color: var(--text-muted, #888); margin: 0 0 10px; line-height: 1.5; }

  .acct-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  .acct-input {
    flex: 1 1 160px;
    min-width: 0;
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    color: var(--text-primary, #eee);
    font: inherit;
    font-size: 0.85rem;
    padding: 7px 10px;
  }
  .acct-input:focus { outline: none; border-color: var(--gold, #8cabcf); }

  .acct-msg { font-size: 0.75rem; color: var(--earth-green, #7aaa7a); margin: 8px 0 0; }
  .acct-err { font-size: 0.75rem; color: var(--earth-red, #b84f4f); margin: 8px 0 0; line-height: 1.5; }

  .acct-chip {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 3px 7px;
    border: 1px solid currentColor;
    color: var(--text-muted, #888);
  }
  .acct-chip--ok { color: var(--earth-green, #7aaa7a); }

  .acct-projects { display: flex; flex-direction: column; gap: 6px; }
  .acct-project {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
  }
  .acct-project-name { color: var(--text-secondary, #ccc); }

  .acct-leave {
    background: none;
    border: none;
    padding: 2px 4px;
    font: inherit;
    font-size: 0.75rem;
    color: var(--earth-red, #b84f4f);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .acct-signout { color: var(--earth-red, #b84f4f); }
</style>
