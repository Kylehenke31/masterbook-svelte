<script>
  /**
   * ProjectMembers.svelte — who has a login on this project, and what they reach.
   *
   * Deliberately separate from Project Settings' "Staff Members", which is a
   * contact list that auto-imports into the Crew List. Most crew never need an
   * account; the ones who do need a permission decision, and conflating the
   * two would force an email and a grant on every contact.
   *
   * Presets fill the checklist rather than being stored. What is saved is the
   * resolved set of grants, so a preset's meaning changing later cannot
   * silently change what someone already had.
   */
  import { onDestroy } from 'svelte';
  import { getActiveProjectId, getProject } from '../stores/project.js';
  import { composeInvite, inviteMailto } from '../lib/inviteMessage.js';
  import { authUser } from '../stores/auth.js';
  import {
    listMembersWithPermissions, listPendingInvites, inviteMember, cancelInvite,
    updateMemberAccess, removeMember, getMyProjectRole,
  } from '../lib/db.js';
  import { FEATURES, ACCOUNTING_PRESET, levelFor } from '../lib/features.js';

  let members = $state([]);
  let invites = $state([]);
  let myRole  = $state(null);
  let me      = $state(null);
  let loading = $state(true);
  let error   = $state('');
  let notice  = $state('');

  // The editor works on one target at a time: either a new invite, or an
  // existing member whose access is being revised.
  let editing = $state(null);   // { kind: 'invite' | 'member', email, userId, name }
  let draftRole = $state('crew');
  let draftPerms = $state({});

  const unsubAuth = authUser.subscribe(async (u) => {
    me = u;
    if (!u) return;
    await load();
  });
  onDestroy(() => unsubAuth());

  async function load() {
    loading = true;
    error = '';
    try {
      const pid = getActiveProjectId();
      myRole = await getMyProjectRole(pid);
      members = await listMembersWithPermissions(pid);
      invites = myRole === 'admin' ? await listPendingInvites(pid) : [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  let isAdmin = $derived(myRole === 'admin');

  const groups = [...new Set(FEATURES.map(f => f.group))];
  const featuresIn = g => FEATURES.filter(f => f.group === g);

  /** [stored value, column header, colour tone] — the order the columns appear in.
      The stored value stays 'read'; only the label people see is "View". */
  const LEVELS = [['', 'None', 'none'], ['read', 'View', 'read'], ['edit', 'Edit', 'edit']];

  function startInvite() {
    editing = { kind: 'invite', email: '', userId: null, name: '' };
    draftRole = 'crew';
    draftPerms = {};
    notice = '';
  }

  function startEdit(m) {
    // Show what they actually hold, including anything a preset role implies,
    // so the checklist reflects reality rather than an empty map.
    const resolved = {};
    for (const f of FEATURES) {
      const lvl = levelFor(m, f.key);
      if (lvl) resolved[f.key] = lvl;
    }
    editing = { kind: 'member', email: m.email, userId: m.userId, name: m.displayName };
    draftRole = m.role;
    draftPerms = resolved;
    notice = '';
  }

  function cancelEdit() { editing = null; notice = ''; }

  function applyPreset(which) {
    if (which === 'admin') { draftRole = 'admin'; draftPerms = {}; return; }
    draftRole = 'crew';
    draftPerms = which === 'accounting' ? { ...ACCOUNTING_PRESET } : {};
  }

  function setLevel(key, level) {
    // Choosing a feature-level grant means this is no longer a blanket admin.
    if (draftRole === 'admin') draftRole = 'crew';
    const next = { ...draftPerms };
    if (level) next[key] = level; else delete next[key];
    draftPerms = next;
  }

  let grantCount = $derived(Object.keys(draftPerms).length);

  /* ── Sharing an invite ──────────────────────────────────────────
     Masterbook composes; a person sends. Same shape as the call sheet's
     email template, and it keeps the invite free of a sending domain, an
     API key, and a delivery step that can fail after the row is written. */
  let share     = $state(null);   // { email, text, mailto }
  let shareCopied = $state(false);

  function openShare({ email, role, permissions }) {
    // `me` is the auth user, which carries an email but no display name — the
    // member row is where the name someone chose actually lives. Signing the
    // invite "khenke31@gmail.com has invited you" when the app knows to say
    // "Kyle Henke" makes it read like a machine, which is the last thing an
    // invite should do.
    const myName = members.find(m => m.userId === me?.id)?.displayName;
    const args = {
      email,
      projectName: getProject()?.title || '',
      invitedBy: myName || me?.email || '',
      role, permissions,
    };
    share = { email, text: composeInvite(args), mailto: inviteMailto(args) };
    shareCopied = false;
  }

  function copyShare() {
    navigator.clipboard.writeText(share.text).then(() => {
      shareCopied = true;
      setTimeout(() => { shareCopied = false; }, 2500);
    }).catch(() => { error = 'Could not copy — select the text and copy it manually.'; });
  }

  async function save() {
    error = '';
    try {
      const pid = getActiveProjectId();
      if (editing.kind === 'invite') {
        await inviteMember(pid, editing.email, draftRole, draftPerms);
        // The invite row is the thing that grants access; the message is just
        // how the person finds out. Compose it straight away so the admin is
        // not left wondering what to do next.
        openShare({ email: editing.email, role: draftRole, permissions: draftPerms });
        notice = '';
      } else {
        await updateMemberAccess(pid, editing.userId, draftRole, draftPerms);
        notice = `Updated ${editing.name}'s access.`;
      }
      editing = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function drop(m) {
    if (!confirm(
      `Remove ${m.displayName} from this project?\n\n` +
      `They lose all access immediately. Expenses they submitted stay on the books.`)) return;
    error = '';
    try {
      await removeMember(getActiveProjectId(), m.userId);
      notice = `${m.displayName} was removed.`;
      await load();
    } catch (e) { error = e.message; }
  }

  async function dropInvite(inv) {
    if (!confirm(`Cancel the invite for ${inv.email}?`)) return;
    try { await cancelInvite(inv.id); await load(); }
    catch (e) { error = e.message; }
  }

  /** A one-line summary of what someone reaches, for the list. */
  function summarise(m) {
    if (m.role === 'admin') return 'Everything (Project Admin)';
    const granted = FEATURES.filter(f => levelFor(m, f.key));
    if (!granted.length) return 'No sections yet — can still file their own expenses';
    const edits = granted.filter(f => levelFor(m, f.key) === 'edit').length;
    return `${granted.length} section${granted.length === 1 ? '' : 's'} · ${edits} editable`;
  }
</script>

<section class="pm-page">
  <header class="pm-header">
    <div>
      <h2 class="pm-title">Project Access</h2>
      <p class="pm-subtitle">
        Who has a login on this production. Separate from the Crew List — most crew
        never need an account.
      </p>
    </div>
    {#if isAdmin}
      <button class="btn btn--primary btn--sm" onclick={startInvite}>+ Invite Someone</button>
    {/if}
  </header>

  {#if error}<div class="pm-error">{error}</div>{/if}
  {#if notice}<div class="pm-notice">{notice}</div>{/if}

  <!-- ══ Share an invite ══
       The invite already exists by the time this appears — nothing here grants
       access, and closing it loses nothing but the composed text, which Copy
       Invite rebuilds from the pending list. -->
  {#if share}
    <div class="pm-share">
      <div class="pm-share-head">
        <strong>Invite ready for {share.email}</strong>
        <button class="btn btn--ghost btn--xs" onclick={() => share = null}>Close</button>
      </div>
      <p class="pm-hint">
        They already have access the moment they sign up with this address — this
        message is how they find out. Send it any way you like.
      </p>
      <textarea class="pm-share-text" readonly rows="10">{share.text}</textarea>
      <div class="pm-share-actions">
        <button class="btn btn--primary btn--sm" onclick={copyShare}>
          {shareCopied ? '✓ Copied' : 'Copy message'}
        </button>
        <a class="btn btn--ghost btn--sm" href={share.mailto}>Open in mail app</a>
      </div>
    </div>
  {/if}

  {#if loading}
    <p class="pm-empty">Loading…</p>
  {:else if !isAdmin}
    <p class="pm-empty">Only a Project Admin can manage access.</p>
  {:else}

    <!-- ══ Editor ══ -->
    {#if editing}
      <div class="pm-editor">
        <h3 class="pm-editor-title">
          {editing.kind === 'invite' ? 'Invite someone' : `Access for ${editing.name}`}
        </h3>

        {#if editing.kind === 'invite'}
          <div class="pm-field">
            <label for="pm-email">Email address</label>
            <input id="pm-email" class="pm-input" type="email" bind:value={editing.email}
              placeholder="them@example.com" />
            <span class="pm-hint">
              They get access when they sign up with this address. No email is sent yet —
              tell them to create an account.
            </span>
          </div>
        {:else}
          <p class="pm-hint" style="margin-bottom:14px">{editing.email}</p>
        {/if}

        <div class="pm-presets">
          <span class="pm-presets-label">Start from</span>
          <button class="btn btn--ghost btn--xs" onclick={() => applyPreset('admin')}
            class:pm-preset--on={draftRole === 'admin'}>Project Admin</button>
          <button class="btn btn--ghost btn--xs" onclick={() => applyPreset('accounting')}>Accounting</button>
          <button class="btn btn--ghost btn--xs" onclick={() => applyPreset('none')}>Nothing</button>
        </div>

        {#if draftRole === 'admin'}
          <p class="pm-admin-note">
            Project Admins reach everything, including sections added later, and can
            manage access. Choosing any individual permission below switches this off.
          </p>
        {/if}

        <div class="pm-grants" class:pm-grants--dimmed={draftRole === 'admin'}>
          {#each groups as g (g)}
            <div class="pm-group">
              <h4 class="pm-group-title">{g}</h4>
              <!-- The level names are said once per column rather than on every
                   chip. Twenty rows repeating "None View Edit" is sixty
                   labels saying nothing the header could not. -->
              <div class="pm-grant-row pm-legend" aria-hidden="true">
                <span></span>
                {#each LEVELS as [, lbl] (lbl)}<span class="pm-legend-cell">{lbl}</span>{/each}
              </div>
              {#each featuresIn(g) as f (f.key)}
                <div class="pm-grant-row" role="radiogroup" aria-label={f.label}>
                  <span class="pm-grant-label">{f.label}</span>
                  {#each LEVELS as [val, lbl, tone] (val)}
                    {@const on = (draftPerms[f.key] ?? '') === val}
                    <button
                      class="pm-bubble pm-bubble--{tone}"
                      class:pm-bubble--on={on}
                      role="radio"
                      aria-checked={on}
                      aria-label="{f.label}: {lbl}"
                      title="{f.label}: {lbl}"
                      onclick={() => setLevel(f.key, val)}></button>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <div class="pm-editor-actions">
          <button class="btn btn--primary btn--sm" onclick={save}
            disabled={editing.kind === 'invite' && !editing.email.trim()}>
            {editing.kind === 'invite' ? 'Create Invite' : 'Save Access'}
          </button>
          <button class="btn btn--ghost btn--sm" onclick={cancelEdit}>Cancel</button>
          <span class="pm-hint" style="margin-left:auto">
            {draftRole === 'admin' ? 'Everything' : `${grantCount} section${grantCount === 1 ? '' : 's'} granted`}
          </span>
        </div>
      </div>
    {/if}

    <!-- ══ Members ══ -->
    <div class="pm-section">
      <h3 class="pm-section-title">Members <span class="pm-count">{members.length}</span></h3>
      <table class="pm-table">
        <thead><tr><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead>
        <tbody>
          {#each members as m (m.userId)}
            <tr>
              <td>{m.displayName}{#if m.userId === me?.id}<span class="pm-you">you</span>{/if}</td>
              <td class="pm-dim">{m.email}</td>
              <td class="pm-dim">{summarise(m)}</td>
              <td class="pm-row-actions">
                <button class="btn btn--ghost btn--xs" onclick={() => startEdit(m)}>Edit</button>
                {#if m.userId !== me?.id}
                  <button class="btn btn--ghost btn--xs btn--danger-text" onclick={() => drop(m)}>Remove</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if members.some(m => m.userId === me?.id && m.role === 'admin')}
        <p class="pm-hint">
          You cannot remove yourself — a project with no admin could never grant access again.
        </p>
      {/if}
    </div>

    <!-- ══ Pending invites ══ -->
    {#if invites.length}
      <div class="pm-section">
        <h3 class="pm-section-title">Invited <span class="pm-count">{invites.length}</span></h3>
        <p class="pm-hint">
          Waiting for these people to sign up with the address below. The app does not
          send mail — use Copy Invite and send it however you normally reach them.
        </p>
        <table class="pm-table">
          <thead><tr><th>Email</th><th>Access</th><th></th></tr></thead>
          <tbody>
            {#each invites as inv (inv.id)}
              <tr>
                <td>{inv.email}</td>
                <td class="pm-dim">
                  {inv.role === 'admin' ? 'Everything (Project Admin)'
                    : `${Object.keys(inv.permissions || {}).length} sections`}
                </td>
                <td class="pm-row-actions">
                  <button class="btn btn--ghost btn--xs"
                    onclick={() => openShare({ email: inv.email, role: inv.role, permissions: inv.permissions })}
                  >Copy Invite</button>
                  <button class="btn btn--ghost btn--xs btn--danger-text"
                    onclick={() => dropInvite(inv)}>Cancel</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>

<style>
  .pm-page { padding: 4px 0 40px; }
  .pm-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .pm-title { font-size: 1.35rem; font-weight: 700; color: var(--text-primary); margin: 0; }
  .pm-subtitle { font-size: 0.8rem; color: var(--text-secondary); margin: 4px 0 0; max-width: 62ch; }

  .pm-error, .pm-notice {
    padding: 9px 12px; margin-bottom: 14px; font-size: 0.8rem; border: 1px solid;
  }
  .pm-error  { color: var(--red); background: rgba(224,82,82,0.10); border-color: var(--red); }
  .pm-notice { color: var(--green); background: rgba(34,197,94,0.10); border-color: var(--green); }

  .pm-share {
    margin-bottom: 18px;
    padding: 14px 16px;
    border: 1px solid var(--border, #333);
    background: var(--bg-elevated, #1e1e1e);
  }
  .pm-share-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }
  .pm-share-text {
    width: 100%;
    margin-top: 10px;
    padding: 10px;
    background: var(--bg, #141414);
    border: 1px solid var(--border, #333);
    color: var(--text-secondary, #ccc);
    font-family: inherit;
    font-size: 0.78rem;
    line-height: 1.5;
    resize: vertical;
  }
  .pm-share-text:focus { outline: none; border-color: var(--gold, #8cabcf); }
  .pm-share-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }

  .pm-empty, .pm-hint { font-size: 0.78rem; color: var(--text-secondary); }
  .pm-hint { display: block; margin-top: 5px; }
  .pm-dim { color: var(--text-secondary); }

  .pm-editor { border: 1px solid var(--gold); padding: 16px; margin-bottom: 26px; background: var(--bg-elevated); }
  .pm-editor-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }

  .pm-field { margin-bottom: 14px; max-width: 420px; }
  .pm-field label { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px; }
  .pm-input { width: 100%; padding: 7px 9px; font: inherit; font-size: 0.85rem;
    color: var(--text-primary); background: var(--input-bg); border: 1px solid var(--input-border); }
  .pm-input:focus { outline: none; border-color: var(--gold); }

  .pm-presets { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; flex-wrap: wrap; }
  .pm-presets-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .pm-preset--on { border-color: var(--gold); color: var(--gold); }

  .pm-admin-note { font-size: 0.78rem; color: var(--gold); margin: 0 0 12px; }

  .pm-grants {
    display: grid;
    /* Columns sized to the content rather than the container, so three groups
       sit next to each other without each one sprawling. */
    grid-template-columns: repeat(auto-fit, minmax(220px, 260px));
    justify-content: start;
    /* Generous column gap: the groups are independent lists, and set close
       together a row's bubbles sit next to the neighbouring group's labels,
       which invites reading across the boundary. */
    gap: 20px 56px;
  }
  .pm-grants--dimmed { opacity: 0.4; }
  .pm-group { max-width: 260px; }
  .pm-group-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-muted); margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border-subtle); }
  /* One grid shared by the legend and every row, so the bubbles line up under
     their column headers.
     The group is width-capped rather than letting the label column stretch:
     in a wide viewport a 1fr label pushes the bubbles far from the name they
     belong to, and the eye loses which row it is on somewhere in the gap. */
  .pm-grant-row {
    display: grid;
    /* 36px is set by the widest header word, not the bubble — narrower and
       "NONE VIEW EDIT" run into each other. */
    grid-template-columns: minmax(0, 1fr) repeat(3, 36px);
    align-items: center;
    gap: 1px;
    padding: 3px 0;
  }
  .pm-grant-label { font-size: 0.8rem; color: var(--text-primary); }

  .pm-legend { padding-bottom: 5px; margin-bottom: 3px; border-bottom: 1px solid var(--border-subtle); }
  .pm-legend-cell {
    font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--text-muted); text-align: center;
  }
  /* Access levels read as a traffic light — no access, look but don't touch,
     full control. Muted earth tones rather than signal colours: this grid is
     twenty rows of three chips, and saturated red/amber/green at that density
     reads as an alarm going off rather than a set of choices. Unselected chips
     carry only a hint of their colour so the row scans at a glance; the
     selected one fills in. */
  /* A bubble per level, filled when chosen. The colour carries the meaning —
     no access, look but don't touch, full control — so the words only need
     saying once, in the column header. */
  .pm-bubble {
    --tone: var(--text-muted);
    justify-self: center;
    width: 15px; height: 15px; padding: 0; cursor: pointer;
    background: transparent;
    border: 1.5px solid var(--border);
    border-radius: 50%;
    transition: background var(--transition), border-color var(--transition), box-shadow var(--transition);
  }

  .pm-bubble--none { --tone: #9c6058; }  /* muted brick */
  .pm-bubble--read { --tone: #a8894f; }  /* muted ochre */
  .pm-bubble--edit { --tone: #6f8a5c; }  /* muted sage  */

  .pm-bubble:hover { border-color: var(--tone); }

  .pm-bubble--on {
    background: var(--tone);
    border-color: var(--tone);
    /* A ring rather than a bigger dot, so the row's height never shifts. */
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tone) 28%, transparent);
  }

  .pm-bubble:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }

  .pm-editor-actions { display: flex; align-items: center; gap: 8px; margin-top: 16px;
    padding-top: 12px; border-top: 1px solid var(--border-subtle); }

  .pm-section { margin-bottom: 26px; }
  .pm-section-title { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted);
    padding-bottom: 7px; margin: 0 0 10px; border-bottom: 1px solid var(--border-subtle); }
  .pm-count { font-size: 0.68rem; padding: 1px 6px; color: var(--bg-base); background: var(--gold); letter-spacing: 0; }

  .pm-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .pm-table th { text-align: left; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-muted); padding: 6px 9px; border-bottom: 1px solid var(--border); }
  .pm-table td { padding: 8px 9px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
  .pm-row-actions { text-align: right; white-space: nowrap; }
  .pm-you { margin-left: 6px; font-size: 0.65rem; padding: 1px 5px; color: var(--bg-base); background: var(--text-muted); }
</style>
