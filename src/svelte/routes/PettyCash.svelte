<script>
  import { onMount } from 'svelte';
  import { getPurchases } from '../../data.js';
  import { reconcile, buildPettyCashPDF, pettyCashFilename,
           generateAndDownloadPettyCash } from '../lib/pettyCashSummary.js';
  import { isDropboxConnected, filePettyCashEnvelope } from '../lib/dropbox.js';
  import { loadMyMembership, loadProjectMembers } from '../lib/db.js';
  import { todayLocal } from '../lib/format.js';
  import { getActiveProjectId } from '../stores/project.js';
  import { authUser } from '../stores/auth.js';
  import { isReviewer } from '../lib/permissions.js';

  const ENVELOPES_KEY = 'movie-ledger-petty-cash-envelopes';

  /* Envelope lifecycle:
       Active         — open, taking charges
       Pending Review — custodian counted the cash and handed it in
       Reconciled     — an accountant approved it and it is filed

     There is deliberately no way to add cash to an open envelope. An envelope
     is one issuance: if the custodian needs more, they are handed another one.
     Closing is the only way to settle the one they have. */
  const ACTIVE = 'Active', PENDING = 'Pending Review', RECONCILED = 'Reconciled';

  // ── State ──────────────────────────────────────────────────
  let envelopes = $state([]);
  let view      = $state('list');   // 'list' | 'form' | 'close'
  let editId    = $state(null);     // null = new, id = editing
  let expandedId = $state(null);    // which envelope's charges are shown inline

  /* Form fields.

     A custodian is usually someone on the project, but not always — cash gets
     handed to a PA for a day, or to a driver who will never have a login. So
     the picker offers the project's members and always keeps a way to type a
     name that has no account behind it. The typed name is a plain string and
     stays one; it is not a stub profile and nothing downstream expects it to
     resolve to a user. */
  const CUSTODIAN_OTHER = '__other__';
  let fCustodianPick   = $state('');   // a member's userId, or CUSTODIAN_OTHER
  let fCustodianName   = $state('');   // free-typed name, used when "other"
  let fOpeningBalance  = $state('');
  let custodianError   = $state(false);
  let balanceError      = $state(false);
  let members          = $state([]);

  // Close / reconcile fields
  let closeId       = $state(null);
  let fCountedCash  = $state('');
  let countedError  = $state(false);
  let closeNote     = $state('');

  // Review
  let myMember  = $state(null);
  let busyId    = $state(null);
  let actionMsg = $state('');
  let actionErr = $state('');

  let canReview = $derived(isReviewer(myMember));

  onMount(async () => {
    const pid = getActiveProjectId();
    const u = $authUser;
    myMember = u ? await loadMyMembership(pid, u.id) : null;
    // Best-effort: an empty list only costs the convenience of the dropdown,
    // so a failure here must not stop someone opening an envelope.
    try { members = await loadProjectMembers(pid); } catch { members = []; }
  });

  // ── Load ───────────────────────────────────────────────────
  try { envelopes = JSON.parse(localStorage.getItem(ENVELOPES_KEY)) || []; } catch { envelopes = []; }

  function save() {
    localStorage.setItem(ENVELOPES_KEY, JSON.stringify(envelopes));
    window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'pettyCash' } }));
  }

  // Sign goes outside the dollar sign, matching the Purchase Log — "$-60.00"
  // reads as a typo where "-$60.00" reads as money.
  function fmt(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? '-$' + abs : '$' + abs;
  }

  /**
   * Charges against an envelope.
   *
   * Approval alone, not approval plus Paid. Petty cash leaves the envelope at
   * the moment of purchase — there is no later payment step for the cash to be
   * waiting on — and the budget already actualizes petty cash on approval, so
   * requiring Paid here made an approved charge spent in the budget while the
   * envelope still showed the money sitting in it.
   *
   * A closed envelope reads its frozen list instead. The reconciliation records
   * what was counted against a particular set of charges; if that set were
   * re-derived live, editing a charge months later would silently rewrite a
   * variance somebody already signed off.
   */
  function chargesFor(envelopeId) {
    const env = envelopes.find(e => e.id === envelopeId);
    const all = getPurchases().filter(p =>
      p.method === 'Petty Cash' && p.status === 'Committed' &&
      p.pettyCashEnvelopeId === envelopeId
    );
    if (env?.chargeIds) {
      const frozen = new Set(env.chargeIds);
      return all.filter(p => frozen.has(p.id));
    }
    return all;
  }

  /** Live figures for an open envelope, or the snapshot taken when it closed. */
  function figuresFor(env) {
    return env.status === ACTIVE
      ? reconcile(env, chargesFor(env.id))
      : { ...reconcile(env, chargesFor(env.id)), ...(env.reconciliation || {}) };
  }

  function balanceFor(env) {
    return figuresFor(env).balance;
  }

  /** The name to store, and the member id behind it when there is one. */
  function resolveCustodian() {
    if (fCustodianPick && fCustodianPick !== CUSTODIAN_OTHER) {
      const m = members.find(x => x.userId === fCustodianPick);
      if (m) return { custodianName: m.displayName, custodianUserId: m.userId };
    }
    return { custodianName: fCustodianName.trim(), custodianUserId: null };
  }

  // ── Envelope CRUD ──────────────────────────────────────────
  function openForm(id) {
    editId = id;
    const env = id === null ? {} : envelopes.find(e => e.id === id) || {};
    // Reopen on the member if this envelope was tied to one and they are still
    // on the project. Otherwise fall to the typed name — which is also what
    // happens to an envelope whose custodian has since left, and is right:
    // the envelope still belongs to whoever held the cash.
    const linked = env.custodianUserId && members.some(m => m.userId === env.custodianUserId);
    fCustodianPick  = linked ? env.custodianUserId : (env.custodianName ? CUSTODIAN_OTHER : '');
    fCustodianName  = linked ? '' : (env.custodianName || '');
    fOpeningBalance = env.openingBalance != null ? String(env.openingBalance) : '';
    custodianError = false;
    balanceError = false;
    view = 'form';
  }

  function closeForm() { view = 'list'; editId = null; }

  function saveForm() {
    let ok = true;
    const custodian = resolveCustodian();
    if (!custodian.custodianName) { custodianError = true; ok = false; }
    const balanceNum = parseFloat(fOpeningBalance);
    if (isNaN(balanceNum) || balanceNum < 0) { balanceError = true; ok = false; }
    if (!ok) return;

    if (editId === null) {
      envelopes = [...envelopes, {
        id: crypto.randomUUID(),
        ...custodian,
        openedDate: todayLocal(),
        openingBalance: balanceNum,
        status: 'Active',
      }];
    } else {
      envelopes = envelopes.map(e => e.id === editId
        ? { ...e, ...custodian, openingBalance: balanceNum }
        : e);
    }
    save();
    closeForm();
  }

  // ── Closing: the custodian counts what is left ─────────────
  function openCloseForm(id) {
    closeId = id;
    fCountedCash = '';
    countedError = false;
    closeNote = '';
    actionErr = '';
    view = 'close';
  }

  function closeCloseForm() { view = 'list'; closeId = null; }

  /**
   * Close an envelope against a counted cash figure.
   *
   * Overspending never blocks this. A custodian who spent past the cash they
   * were handed covered the difference themselves, which is an ordinary thing
   * to have happened and something the production needs told about — refusing
   * to close would leave the only record of the debt sitting in an open
   * envelope nobody reconciles.
   */
  function submitClose() {
    const env = envelopes.find(e => e.id === closeId);
    if (!env) return;
    const counted = parseFloat(fCountedCash);
    if (isNaN(counted) || counted < 0) { countedError = true; return; }

    const charges = chargesFor(env.id);
    const withCount = { ...env, countedCash: counted };
    const r = reconcile(withCount, charges);

    envelopes = envelopes.map(e => e.id !== closeId ? e : {
      ...e,
      status: PENDING,
      countedCash: counted,
      closedDate: todayLocal(),
      closedBy: $authUser?.email || '',
      closeNote: closeNote.trim(),
      // Freeze what this reconciliation was measured against, so the numbers
      // an accountant approves stay the numbers that were approved.
      chargeIds: charges.map(p => p.id),
      reconciliation: {
        opening: r.opening, spent: r.spent, balance: r.balance,
        expectedRemaining: r.expectedRemaining, owedToCustodian: r.owedToCustodian,
        counted: r.counted, variance: r.variance,
      },
    });
    save();
    closeCloseForm();
  }

  /** Custodian closed it by mistake, or the count was wrong — put it back. */
  function sendBack(id) {
    const env = envelopes.find(e => e.id === id);
    if (!confirm(`Reopen ${env?.custodianName || 'this envelope'} for correction?\n\nIts count and frozen charge list are cleared, and it goes back to taking charges.`)) return;
    envelopes = envelopes.map(e => e.id !== id ? e : {
      ...e, status: ACTIVE,
      countedCash: undefined, closedDate: undefined, closedBy: undefined,
      closeNote: undefined, chargeIds: undefined, reconciliation: undefined,
    });
    save();
  }

  /**
   * Approve a reconciliation and file it.
   *
   * This is the point the envelope becomes the production's record rather than
   * one person's word about what was in their pocket, which is why filing waits
   * for it rather than happening at close.
   */
  async function approveAndFile(id) {
    const env = envelopes.find(e => e.id === id);
    if (!env) return;
    const charges = chargesFor(id);
    const r = figuresFor(env);
    if (!confirm(
      `Approve ${env.custodianName}'s envelope?\n\n` +
      `Counted ${fmt(r.counted)} against an expected ${fmt(r.expectedRemaining)}` +
      `${r.variance ? ` — ${r.variance > 0 ? 'over' : 'short'} by ${fmt(Math.abs(r.variance))}` : ' — balanced'}.` +
      `${r.owedToCustodian > 0 ? `\n${env.custodianName} is owed ${fmt(r.owedToCustodian)} out of pocket.` : ''}` +
      `\n\nIt will be filed to Dropbox under Petty Cash.`
    )) return;

    busyId = id; actionErr = ''; actionMsg = '';
    try {
      const approved = {
        ...env, status: RECONCILED,
        reviewedBy: $authUser?.email || '',
        reviewedDate: todayLocal(),
      };
      const bytes = await buildPettyCashPDF(approved, charges);

      let filedPath = null;
      if (await isDropboxConnected()) {
        const res = await filePettyCashEnvelope(approved, charges, bytes, pettyCashFilename(approved));
        filedPath = res.folderPath;
        actionMsg = res.failedCount
          ? `Approved and filed, but ${res.failedCount} of ${res.filedCount + res.failedCount} receipts failed to upload.`
          : `Approved and filed to Dropbox${res.filedCount ? ` with ${res.filedCount} receipt${res.filedCount === 1 ? '' : 's'}` : ''}.`;
      } else {
        actionMsg = 'Approved, but Dropbox is not connected so nothing was filed. Connect it from Project Settings, then re-file from here.';
      }

      envelopes = envelopes.map(e => e.id !== id ? e : { ...approved, filedPath });
      save();
    } catch (e) {
      actionErr = e.message || 'Could not approve this envelope.';
    } finally {
      busyId = null;
    }
  }

  /** Re-run the filing for an envelope approved while Dropbox was offline. */
  async function refile(id) {
    const env = envelopes.find(e => e.id === id);
    if (!env) return;
    busyId = id; actionErr = ''; actionMsg = '';
    try {
      if (!(await isDropboxConnected())) throw new Error('Dropbox is still not connected.');
      const charges = chargesFor(id);
      const bytes = await buildPettyCashPDF(env, charges);
      const res = await filePettyCashEnvelope(env, charges, bytes, pettyCashFilename(env));
      envelopes = envelopes.map(e => e.id !== id ? e : { ...e, filedPath: res.folderPath });
      save();
      actionMsg = `Filed to Dropbox${res.filedCount ? ` with ${res.filedCount} receipt${res.filedCount === 1 ? '' : 's'}` : ''}.`;
    } catch (e) {
      actionErr = e.message || 'Could not file this envelope.';
    } finally {
      busyId = null;
    }
  }

  function downloadSummary(env) {
    generateAndDownloadPettyCash(env, chargesFor(env.id));
  }

  function deleteEnvelope(id) {
    const env = envelopes.find(e => e.id === id);
    if (!confirm(`Delete envelope for "${env?.custodianName || 'Untitled'}"?`)) return;
    envelopes = envelopes.filter(e => e.id !== id);
    save();
    if (view === 'form') closeForm();
  }

  function toggleExpand(id) {
    expandedId = expandedId === id ? null : id;
  }
</script>

{#if view === 'list'}
  <section class="pc-section">
    <div class="pc-header">
      <div>
        <h2 class="pc-title">Petty Cash</h2>
        <p class="pc-subtitle">{envelopes.length} envelope{envelopes.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn--primary btn--sm" onclick={() => openForm(null)}>+ Open New Envelope</button>
    </div>

    {#if actionMsg}<div class="pc-banner pc-banner--ok">{actionMsg}</div>{/if}
    {#if actionErr}<div class="pc-banner pc-banner--err">{actionErr}</div>{/if}

    {#if envelopes.length === 0}
      <div class="pc-empty">
        <p>No Petty Cash envelopes yet. Click <strong>+ Open New Envelope</strong> to get started.</p>
      </div>
    {:else}
      <div class="pc-table-wrap">
        <table class="pc-table">
          <thead>
            <tr>
              <th>Custodian</th><th>Opened</th><th class="text-right">Issued</th>
              <th class="text-right">Balance</th><th class="text-right">Over / (Short)</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each envelopes as env (env.id)}
              {@const r = figuresFor(env)}
              {@const charges = chargesFor(env.id)}
              {@const statusMod = env.status === ACTIVE ? 'active' : env.status === PENDING ? 'pending' : 'reconciled'}
              <tr class="pc-row" onclick={() => toggleExpand(env.id)}>
                <td class="pc-name-cell">{env.custodianName}</td>
                <td>{env.openedDate || '—'}</td>
                <td class="text-right">{fmt(r.opening)}</td>
                <td class="text-right" class:pc-balance--low={r.balance < 0}>
                  {fmt(r.balance)}
                  {#if r.owedToCustodian > 0}<span class="pc-owed">owed</span>{/if}
                </td>
                <td class="text-right">
                  {#if r.variance == null}
                    <span class="pc-muted">—</span>
                  {:else if r.variance === 0}
                    <span class="pc-var pc-var--ok">balanced</span>
                  {:else}
                    <span class="pc-var" class:pc-var--over={r.variance > 0} class:pc-var--short={r.variance < 0}>
                      {r.variance < 0 ? `(${fmt(Math.abs(r.variance))})` : fmt(r.variance)}
                    </span>
                  {/if}
                </td>
                <td><span class="pc-status pc-status--{statusMod}">{env.status}</span></td>
                <td class="pc-actions-cell" onclick={e => e.stopPropagation()}>
                  {#if env.status === ACTIVE}
                    <button class="btn btn--ghost btn--xs" onclick={() => openCloseForm(env.id)} title="Close and count">Close</button>
                    <button class="btn btn--ghost btn--xs" onclick={() => openForm(env.id)} title="Edit">✎</button>
                    <button class="btn btn--ghost btn--xs btn--danger-text" onclick={() => deleteEnvelope(env.id)} title="Delete">✕</button>
                  {:else if env.status === PENDING}
                    {#if canReview}
                      <button class="btn btn--primary btn--xs" disabled={busyId === env.id}
                        onclick={() => approveAndFile(env.id)} title="Approve and file to Dropbox">
                        {busyId === env.id ? '…' : 'Approve'}
                      </button>
                      <button class="btn btn--ghost btn--xs" onclick={() => sendBack(env.id)} title="Send back for correction">↩</button>
                    {:else}
                      <span class="pc-muted pc-await">Awaiting review</span>
                    {/if}
                    <button class="btn btn--ghost btn--xs" onclick={() => downloadSummary(env)} title="Download reconciliation">📄</button>
                  {:else}
                    <button class="btn btn--ghost btn--xs" onclick={() => downloadSummary(env)} title="Download reconciliation">📄</button>
                    {#if canReview && !env.filedPath}
                      <button class="btn btn--ghost btn--xs" disabled={busyId === env.id}
                        onclick={() => refile(env.id)} title="Not filed to Dropbox — try again">
                        {busyId === env.id ? '…' : 'File'}
                      </button>
                    {/if}
                  {/if}
                </td>
              </tr>
              {#if expandedId === env.id}
                <tr class="pc-expand-row">
                  <td colspan="7">
                    {#if env.status !== ACTIVE}
                      <div class="pc-recon">
                        <span><strong>Expected</strong> {fmt(r.expectedRemaining)}</span>
                        <span><strong>Counted</strong> {r.counted == null ? '—' : fmt(r.counted)}</span>
                        {#if r.owedToCustodian > 0}
                          <span class="pc-recon--owed"><strong>Owed to {env.custodianName}</strong> {fmt(r.owedToCustodian)}</span>
                        {/if}
                        {#if env.closedBy}<span class="pc-muted">Closed by {env.closedBy} on {env.closedDate}</span>{/if}
                        {#if env.reviewedBy}<span class="pc-muted">Approved by {env.reviewedBy} on {env.reviewedDate}</span>{/if}
                        {#if env.filedPath}<span class="pc-muted">Filed to {env.filedPath}</span>{/if}
                        {#if env.closeNote}<span class="pc-note">“{env.closeNote}”</span>{/if}
                      </div>
                    {/if}
                    {#if charges.length === 0}
                      <p class="pc-expand-empty">No approved charges against this envelope yet.</p>
                    {:else}
                      <table class="pc-charges-table">
                        <thead>
                          <tr><th>Date</th><th>Vendor</th><th>Description</th><th class="text-right">Amount</th></tr>
                        </thead>
                        <tbody>
                          {#each charges as p (p.id)}
                            <tr>
                              <td>{p.date || '—'}</td>
                              <td>{p.vendor || '—'}</td>
                              <td>{p.description || '—'}</td>
                              <td class="text-right">{fmt(p.amount)}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{:else if view === 'close'}
  {@const env = envelopes.find(e => e.id === closeId) || {}}
  {@const charges = chargesFor(closeId)}
  {@const r = reconcile(env, charges)}
  <section class="pc-section">
    <div class="pc-header">
      <div>
        <h2 class="pc-title">Close {env.custodianName}'s Envelope</h2>
        <p class="pc-subtitle">Count what is physically left and hand it in for review.</p>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeCloseForm}>← Back</button>
    </div>

    <div class="pc-close-grid">
      <div class="pc-close-figures">
        <div class="pc-fig"><span>Issued</span><strong>{fmt(r.opening)}</strong></div>
        <div class="pc-fig"><span>Charges ({charges.length})</span><strong>({fmt(r.spent)})</strong></div>
        <div class="pc-fig pc-fig--rule"><span>Expected cash on hand</span><strong>{fmt(r.expectedRemaining)}</strong></div>
        {#if r.owedToCustodian > 0}
          <p class="pc-overspent">
            This envelope is overspent by <strong>{fmt(r.owedToCustodian)}</strong>.
            {env.custodianName} covered the difference out of pocket and the production owes it back —
            that is recorded here, and does not stop the envelope closing.
          </p>
        {/if}
      </div>

      <div class="pc-form">
        <div class="pc-field">
          <label for="pc-counted">Counted Cash on Hand ($)</label>
          <input id="pc-counted" class="pc-input" class:pc-input--error={countedError} type="number"
            min="0" step="0.01" bind:value={fCountedCash} placeholder="0.00"
            oninput={() => countedError = false} />
          {#if countedError}<span class="pc-field-error">Enter the cash actually counted (0 if none is left)</span>{/if}
        </div>
        <div class="pc-field">
          <label for="pc-note">Note <span class="pc-optional">(optional)</span></label>
          <input id="pc-note" class="pc-input" type="text" bind:value={closeNote}
            placeholder="Anything the accountant should know about the count" />
        </div>

        {#if fCountedCash !== '' && !isNaN(parseFloat(fCountedCash))}
          {@const v = parseFloat(fCountedCash) - r.expectedRemaining}
          <div class="pc-preview" class:pc-preview--off={v !== 0}>
            {#if v === 0}
              Balanced — the count matches what is expected.
            {:else if v > 0}
              <strong>{fmt(v)} over</strong> — more cash on hand than the charges account for.
            {:else}
              <strong>{fmt(Math.abs(v))} short</strong> — less cash on hand than the charges account for.
            {/if}
          </div>
        {/if}

        <div class="pc-form-actions">
          <button class="btn btn--primary" onclick={submitClose}>Close &amp; Submit for Review</button>
          <button class="btn btn--ghost" onclick={closeCloseForm}>Cancel</button>
        </div>
      </div>
    </div>
  </section>
{:else}
  <section class="pc-section">
    <div class="pc-header">
      <div>
        <h2 class="pc-title">{editId === null ? 'Open New Envelope' : 'Edit Envelope'}</h2>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeForm}>← Back</button>
    </div>

    <div class="pc-form">
      <div class="pc-field">
        <label for="pc-custodian">Custodian</label>
        <select id="pc-custodian" class="pc-input"
          class:pc-input--error={custodianError && fCustodianPick !== CUSTODIAN_OTHER}
          bind:value={fCustodianPick} onchange={() => custodianError = false}>
          <option value="">Select custodian…</option>
          {#each members as m (m.userId)}
            <option value={m.userId}>{m.displayName}</option>
          {/each}
          <option value={CUSTODIAN_OTHER}>+ Someone not on the project</option>
        </select>
        {#if members.length === 0}
          <span class="pc-hint">No project members loaded — enter a name below.</span>
        {/if}
      </div>

      {#if fCustodianPick === CUSTODIAN_OTHER || members.length === 0}
        <div class="pc-field">
          <label for="pc-custodian-name">Custodian Name</label>
          <input id="pc-custodian-name" class="pc-input" class:pc-input--error={custodianError} type="text"
            bind:value={fCustodianName} placeholder="Who's holding this envelope"
            oninput={() => custodianError = false} />
          <span class="pc-hint">No account needed — this is just the name on the envelope.</span>
        </div>
      {/if}
      {#if custodianError}<span class="pc-field-error">Pick a custodian, or enter a name</span>{/if}
      <div class="pc-field">
        <label for="pc-balance">Opening Balance ($)</label>
        <input id="pc-balance" class="pc-input" class:pc-input--error={balanceError} type="number"
          min="0" step="0.01" bind:value={fOpeningBalance} placeholder="0.00"
          oninput={() => balanceError = false} />
        {#if balanceError}<span class="pc-field-error">Enter a valid opening balance</span>{/if}
      </div>

      <div class="pc-form-actions">
        <button class="btn btn--primary" onclick={saveForm}>{editId === null ? 'Open Envelope' : 'Save Changes'}</button>
        <button class="btn btn--ghost" onclick={closeForm}>Cancel</button>
        {#if editId !== null}
          <button class="btn btn--ghost btn--danger-text" style="margin-left:auto"
            onclick={() => deleteEnvelope(editId)}>Delete Envelope</button>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .pc-section { max-width: 1000px; }

  .pc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .pc-title    { font-size: 1.25rem; margin-bottom: 2px; }
  .pc-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); }

  .pc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: var(--text-muted, #888);
    text-align: center;
  }

  .pc-table-wrap { overflow-x: auto; }

  .pc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .pc-table thead th {
    text-align: left;
    padding: 7px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
    border-bottom: 1px solid var(--border, #333);
    white-space: nowrap;
  }

  .pc-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle, #222);
    vertical-align: middle;
  }

  .pc-row { cursor: pointer; transition: background 0.1s; }
  .pc-row:hover { background: var(--bg-elevated, #1e1e1e); }

  .pc-name-cell { font-weight: 500; }
  .text-right   { text-align: right; }
  .pc-balance--low { color: var(--earth-red, #b84f4f); font-weight: 700; }

  .pc-status {
    display: inline-block;
    padding: 2px 8px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid currentColor;
  }
  .pc-status--active     { color: var(--earth-green, #7aaa7a); }
  .pc-status--pending    { color: var(--gold, #c8a44d); }
  .pc-status--reconciled { color: var(--text-muted, #888); }

  .pc-muted { color: var(--text-muted, #888); }
  .pc-await { font-size: 0.72rem; font-style: italic; }
  .pc-owed  {
    display: inline-block; margin-left: 6px; font-size: 0.65rem;
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--earth-red, #b84f4f);
  }

  .pc-var          { font-weight: 600; }
  .pc-var--ok      { color: var(--text-muted, #888); font-weight: 400; font-style: italic; }
  .pc-var--over    { color: var(--earth-green, #7aaa7a); }
  .pc-var--short   { color: var(--earth-red, #b84f4f); }

  .pc-banner {
    padding: 8px 12px;
    margin-bottom: 14px;
    font-size: 0.8rem;
    border: 1px solid currentColor;
  }
  .pc-banner--ok  { color: var(--earth-green, #7aaa7a); }
  .pc-banner--err { color: var(--earth-red, #b84f4f); }

  .pc-recon {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    padding: 8px 0 10px;
    font-size: 0.78rem;
    color: var(--text-secondary, #ccc);
  }
  .pc-recon strong { font-weight: 600; margin-right: 4px; }
  .pc-recon--owed  { color: var(--earth-red, #b84f4f); }
  .pc-note { font-style: italic; color: var(--text-muted, #888); }

  /* ── Close / count ── */
  .pc-close-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: flex-start;
  }
  .pc-close-figures { min-width: 280px; max-width: 420px; }

  .pc-fig {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 6px 0;
    font-size: 0.85rem;
    color: var(--text-secondary, #ccc);
  }
  .pc-fig--rule {
    border-top: 1px solid var(--border, #333);
    margin-top: 4px;
    padding-top: 8px;
    font-weight: 600;
    color: var(--text-primary, #eee);
  }

  .pc-overspent {
    margin-top: 12px;
    padding: 10px 12px;
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--earth-red, #b84f4f);
    border: 1px solid currentColor;
  }

  .pc-optional { font-weight: 400; text-transform: none; letter-spacing: 0; opacity: 0.7; }

  .pc-preview {
    padding: 8px 10px;
    font-size: 0.8rem;
    border: 1px dashed var(--border, #333);
    color: var(--text-muted, #888);
  }
  .pc-preview--off { color: var(--text-primary, #eee); }

  .pc-actions-cell { white-space: nowrap; }
  .btn--danger-text { color: var(--earth-red, #b84f4f); }

  .pc-expand-row td { padding: 0 10px 12px; border-bottom: 1px solid var(--border-subtle, #222); }
  .pc-expand-empty { font-size: 0.8rem; color: var(--text-muted, #888); padding: 8px 0; }

  .pc-charges-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .pc-charges-table thead th {
    text-align: left; padding: 5px 8px; font-size: 0.7rem; font-weight: 600;
    text-transform: uppercase; color: var(--text-muted, #888);
    border-bottom: 1px solid var(--border-subtle, #222);
  }
  .pc-charges-table tbody td { padding: 5px 8px; color: var(--text-secondary, #ccc); }

  /* ── Form ── */
  .pc-form { max-width: 420px; display: flex; flex-direction: column; gap: 14px; }

  .pc-field { display: flex; flex-direction: column; gap: 4px; }

  .pc-field label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
  }

  .pc-input {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 7px 10px;
    font-family: inherit;
  }

  .pc-input:focus  { outline: none; border-color: var(--gold, #6a8a6a); }
  .pc-input--error { border-color: var(--earth-red, #b84f4f); }
  .pc-field-error  { font-size: 0.75rem; color: var(--earth-red, #b84f4f); }
  .pc-hint         { font-size: 0.72rem; color: var(--text-muted, #888); }

  .pc-form-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
  }
</style>
