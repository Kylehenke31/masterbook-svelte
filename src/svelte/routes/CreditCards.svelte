<script>
  import { getPurchases, updatePurchase } from '../../data.js';
  import { generateAndDownloadCCLog } from '../lib/ccLogSummary.js';
  import { fileCCLogReceipts, isDropboxConnected } from '../lib/dropbox.js';
  import { onDestroy } from 'svelte';
  import { loadProjectMembers, listCCLogs, getOrOpenCCLog, packageCCLog, reopenCCLog } from '../lib/db.js';
  import { getActiveProjectId } from '../stores/project.js';
  import { authUser } from '../stores/auth.js';
  import { padReceiptNum } from '../lib/format.js';

  const CARDS_KEY  = 'movie-ledger-credit-cards';
  const CARD_TYPES = ['VISA', 'AMEX', 'Mastercard'];

  // ── State ──────────────────────────────────────────────────
  let cards    = $state([]);
  let view     = $state('list');   // 'list' | 'form' | 'log'
  let editIdx  = $state(null);     // null = new, number = editing

  // Card form fields
  let fCardholderName = $state('');
  let fUserId         = $state('');
  let fCardType       = $state('VISA');
  let fLast4          = $state('');
  let nameError        = $state(false);
  let assigneeError    = $state(false);
  let last4Error        = $state(false);

  // Project members, for assigning a card to a real person rather than typing
  // a name. Loading is best-effort: if it fails (offline, or the membership
  // row is missing) the form falls back to a free-text name so adding a card
  // never becomes impossible.
  //
  // This waits for the auth store rather than firing on mount. The Supabase
  // session is restored asynchronously, and a query issued before it lands is
  // unauthenticated — RLS then correctly returns zero rows, which is
  // indistinguishable from "this project has no members" and silently
  // downgrades the picker to a text box.
  let members       = $state([]);
  let membersLoaded = $state(false);
  const unsubAuth = authUser.subscribe(async (user) => {
    if (!user) return;
    members = await loadProjectMembers(getActiveProjectId());
    membersLoaded = true;
  });
  onDestroy(() => unsubAuth());

  // Log view state
  let selectedCard = $state(null);
  let logRows      = $state([]);
  let dateFrom      = $state('');
  let dateTo        = $state('');
  let generating     = $state(false);

  // ── Load ───────────────────────────────────────────────────
  try { cards = JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch { cards = []; }

  function save() {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
    window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'creditCards' } }));
  }

  function cardKey(card) { return `${card.cardType} ${card.last4}`; }

  function fmt(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Card CRUD ──────────────────────────────────────────────
  function openForm(idx) {
    editIdx = idx;
    const c = idx === null ? {} : cards[idx];
    fCardholderName = c.cardholderName || '';
    fUserId         = c.userId || '';
    fCardType       = c.cardType || 'VISA';
    fLast4          = c.last4 || '';
    nameError = false;
    assigneeError = false;
    last4Error = false;
    view = 'form';
  }

  function onAssigneeChange() { assigneeError = false; }

  /**
   * Last 4: digits only, four at most, enforced as it is typed.
   *
   * maxlength caps the length but accepts any character inside it, and
   * inputmode is a hint to the on-screen keyboard rather than a rule — a
   * pasted "visa" satisfied both. type="number" would reject letters but
   * brings a spinner, accepts "e" and a leading "-", and drops a leading zero
   * from a card ending 0412.
   *
   * The element's own value is written back rather than left to the binding.
   * A rejected keystroke leaves the state exactly as it was, so there is no
   * change for Svelte to react to and nothing to re-render — the character
   * would sit on screen looking accepted while the state behind it disagreed.
   */
  function onLast4Input(e) {
    const el    = e.currentTarget;
    const clean = el.value.replace(/\D/g, '').slice(0, 4);

    // Only touch the element when something was actually rejected. Assigning
    // .value unconditionally moves the caret to the end on every keystroke,
    // which breaks the ordinary repair: type 134, notice the missing 2, click
    // between the 1 and the 3, and the digit lands at the end instead. On the
    // rejecting path the caret is put back where the surviving text leaves it,
    // rather than at the end, so fixing a typo mid-field does not throw you to
    // the far side of it.
    if (el.value !== clean) {
      const caret = el.selectionStart - (el.value.length - clean.length);
      el.value = clean;
      el.setSelectionRange(Math.max(0, caret), Math.max(0, caret));
    }

    fLast4 = clean;
    last4Error = false;
  }

  /** True when we can offer a real person picker rather than a text field. */
  let canPickMember = $derived(membersLoaded && members.length > 0);

  function closeForm() { view = 'list'; editIdx = null; }

  function saveForm() {
    let ok = true;
    const picked = canPickMember ? members.find(m => m.userId === fUserId) : null;
    // The name comes from the picked person, never typed — a typed name can
    // drift from the person it refers to, which is what let this card end up
    // reading "Kyle" while the folder needed "Kyle Henke".
    //
    // It is still *stored* on the card rather than resolved on demand: the
    // name is what built this card's Dropbox folder, and receipts already
    // filed there would be orphaned if a later profile rename silently
    // repointed the card at a different folder. So it is a snapshot taken at
    // assignment time, refreshed only when the card is reassigned here.
    const name = picked ? picked.displayName : fCardholderName.trim();

    if (canPickMember && !fUserId) { assigneeError = true; ok = false; }
    if (!name) { nameError = true; ok = false; }
    // Kept even though the field now rejects anything else as you type. This
    // is what catches an empty or half-typed box, and it is the only check
    // standing if the field is ever restored from saved data or reworked.
    if (!/^\d{4}$/.test(fLast4.trim())) { last4Error = true; ok = false; }
    if (!ok) return;

    // cardholderName is stored alongside userId rather than derived from it.
    // It is what names the card's Dropbox folder (dropbox.js fileCCLogReceipts),
    // and that folder must keep its name even if the person later leaves the
    // project or changes their display name — otherwise filed receipts would
    // be orphaned from the folder they live in.
    const data = {
      cardholderName: name,
      userId: picked ? picked.userId : (fUserId || null),
      cardType: fCardType,
      last4: fLast4.trim(),
    };
    if (editIdx === null) cards = [...cards, data];
    else cards = cards.map((c, i) => i === editIdx ? data : c);
    save();
    closeForm();
  }

  function deleteCard(idx) {
    const c = cards[idx];
    if (!confirm(`Delete card "${c.cardholderName} — ${c.cardType} ${c.last4}"?`)) return;
    cards = cards.filter((_, i) => i !== idx);
    save();
    if (view === 'form') closeForm();
  }

  // ── Log view ───────────────────────────────────────────────
  //
  // A card has exactly one open log at a time. Qualifying charges accumulate
  // into it until it is packaged, which locks it — freezing its charges — and
  // opens the next, numbered sequentially. A charge belongs to one log, for
  // good; past logs are reprintable but never re-packaged.
  let logs        = $state([]);   // every log for this card, oldest first
  let openLogRow  = $state(null); // the one currently accepting charges
  let logsError   = $state('');

  async function openLog(card) {
    selectedCard = card;
    dateFrom = '';
    dateTo   = '';
    logsError = '';
    refreshLogRows();
    view = 'log';
    await loadLogs();
  }

  async function loadLogs() {
    if (!selectedCard) return;
    const projectId = getActiveProjectId();
    try {
      logs = await listCCLogs(projectId, cardKey(selectedCard));
      openLogRow = logs.find(l => l.status === 'open') ?? null;
      // Don't create a log just because someone looked at the page — an empty
      // log per card per visit would burn numbers that end up printed on
      // nothing. One is opened by the first approval on this card.
      refreshLogRows();   // membership depends on which log is open
    } catch (e) {
      logsError = e.message;
    }
  }

  function closeLog() { view = 'list'; selectedCard = null; logRows = []; logs = []; openLogRow = null; }

  /**
   * Charges sitting in this card's open log, waiting to be packaged.
   *
   * A charge joins the open log when it is approved (see lib/approval.js), so
   * this is normally "everything approved since the last packaging". Approved
   * charges carrying no log at all are included too — records approved before
   * logs became real, which packaging will adopt.
   *
   * "Paid" is not consulted. A credit card charge has already been made by the
   * time it is approved; Paid is a reconciliation flag ticked afterwards, and
   * gating log membership on it left approved receipts stranded.
   */
  function refreshLogRows() {
    if (!selectedCard) return;
    const openId = openLogRow?.id ?? null;
    logRows = getPurchases().filter(p =>
      p.method === 'CC' && p.status === 'Committed' &&
      p.ccCardType === selectedCard.cardType && p.ccLast4 === selectedCard.last4 &&
      (!p.ccLogId || p.ccLogId === openId)
    );
  }

  /** Charges already packaged into a given log. */
  function chargesInLog(logId) {
    return getPurchases().filter(p => p.ccLogId === logId);
  }

  let subtotal = $derived(logRows.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  function updateField(id, field, value) {
    updatePurchase(id, { [field]: value });
    refreshLogRows();
  }

  /**
   * Package the open log: stamp every pending charge with it, lock it, print
   * it, file its receipts, and leave the next log to be opened by the next
   * packaging run.
   *
   * Order matters. Charges are stamped *before* the log is locked, because
   * locking freezes them — stamp afterwards and the writes are refused by the
   * very rule packaging just switched on.
   */
  async function packageLog() {
    if (!selectedCard || generating) return;
    const included = logRows;
    if (!included.length) {
      alert('Nothing to package — no approved charges are waiting on this card.');
      return;
    }
    if (!confirm(
      `Package ${included.length} charge${included.length === 1 ? '' : 's'} into a log?\n\n` +
      `This locks them: once packaged they cannot be edited or voided without an admin reopening the log.`
    )) return;

    generating = true;
    logsError = '';
    try {
      const projectId = getActiveProjectId();
      const log = await getOrOpenCCLog(projectId, cardKey(selectedCard));

      for (const p of included) {
        updatePurchase(p.id, { ccLogId: log.id, ccLogNumber: log.log_number,
                               ccLogNumbers: [...(p.ccLogNumbers || []), log.log_number] });
      }
      await packageCCLog(log.id);

      refreshLogRows();
      await loadLogs();
      await generateAndDownloadCCLog(selectedCard, log.log_number, included);

      const withReceipts = included.filter(p => p.receiptUrl);
      if (withReceipts.length) {
        if (await isDropboxConnected()) {
          const result = await fileCCLogReceipts(selectedCard, log.log_number, withReceipts);
          if (result.failedCount) {
            alert(`Log ${log.log_number} packaged. ${result.filedCount}/${withReceipts.length} receipts filed to Dropbox — ${result.failedCount} failed (see console).`);
          }
        } else {
          alert(`Log ${log.log_number} packaged, but Dropbox isn't connected — receipts weren't filed. Connect it from Project Settings.`);
        }
      }
    } catch (e) {
      logsError = e.message;
    } finally {
      generating = false;
    }
  }

  /** Reprint a past log. Reprinting never re-packages or renumbers anything. */
  async function reprintLog(log) {
    const charges = chargesInLog(log.id);
    if (!charges.length) { alert(`Log ${log.log_number} has no charges on it.`); return; }
    await generateAndDownloadCCLog(selectedCard, log.log_number, charges);
  }

  /** Admin-only: unfreeze a packaged log's charges to correct a mistake. */
  async function reopenLog(log) {
    if (!confirm(
      `Reopen log ${log.log_number}?\n\n` +
      `Its charges become editable again. The log has already been printed and its ` +
      `receipts filed, so anything you change now will disagree with that copy until it is reprinted.`
    )) return;
    logsError = '';
    try {
      await reopenCCLog(log.id);
      await loadLogs();
      refreshLogRows();
    } catch (e) {
      logsError = e.message;
    }
  }
</script>

<!-- ══ LIST VIEW ══════════════════════════════════════════════ -->
{#if view === 'list'}
  <section class="cc-section">
    <div class="cc-header">
      <div>
        <h2 class="cc-title">Credit Cards</h2>
        <p class="cc-subtitle">{cards.length} card{cards.length !== 1 ? 's' : ''} on file</p>
      </div>
      <button class="btn btn--primary btn--sm" onclick={() => openForm(null)}>+ Add Card</button>
    </div>

    {#if cards.length === 0}
      <div class="cc-empty">
        <p>No credit cards yet. Click <strong>+ Add Card</strong> to get started.</p>
      </div>
    {:else}
      <div class="cc-table-wrap">
        <table class="cc-table">
          <thead>
            <tr>
              <th>Cardholder</th>
              <th>Card Type</th>
              <th>Last 4</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each cards as c, i (i)}
              <tr class="cc-row" onclick={() => openLog(c)}>
                <td class="cc-name-cell">{c.cardholderName}</td>
                <td>{c.cardType}</td>
                <td class="cc-last4-cell">···· {c.last4}</td>
                <td class="cc-actions-cell" onclick={e => e.stopPropagation()}>
                  <button class="btn btn--ghost btn--xs" onclick={() => openForm(i)} title="Edit">✎</button>
                  <button class="btn btn--ghost btn--xs btn--danger-text" onclick={() => deleteCard(i)} title="Delete">✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

<!-- ══ FORM VIEW ══════════════════════════════════════════════ -->
{:else if view === 'form'}
  <section class="cc-section">
    <div class="cc-header">
      <div>
        <h2 class="cc-title">{editIdx === null ? 'Add Card' : 'Edit Card'}</h2>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeForm}>← Back</button>
    </div>

    <div class="cc-form">
      {#if canPickMember}
        <div class="cc-field">
          <label for="cc-user">Cardholder</label>
          <select id="cc-user" class="cc-input" class:cc-input--error={assigneeError}
            bind:value={fUserId} onchange={onAssigneeChange}>
            <option value="">Select a person…</option>
            {#each members as m (m.userId)}
              <option value={m.userId}>{m.displayName} — {m.role}</option>
            {/each}
          </select>
          {#if assigneeError}<span class="cc-field-error">Choose who this card belongs to</span>{/if}
          <span class="cc-field-hint">
            Assigns card to existing user, and associates the Dropbox folder to their name.
          </span>
        </div>
      {:else}
        <div class="cc-field">
          <label for="cc-name">Cardholder Name</label>
          <input id="cc-name" class="cc-input" class:cc-input--error={nameError} type="text"
            bind:value={fCardholderName} placeholder="Name printed on card"
            oninput={() => nameError = false} />
          {#if nameError}<span class="cc-field-error">Cardholder name is required</span>{/if}
          {#if membersLoaded}
            <span class="cc-field-hint">
              No project members loaded, so this falls back to a typed name.
            </span>
          {/if}
        </div>
      {/if}
      <div class="cc-field">
        <label for="cc-type">Card Type</label>
        <select id="cc-type" class="cc-input" bind:value={fCardType}>
          {#each CARD_TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </div>
      <div class="cc-field">
        <label for="cc-last4">Last 4 Digits</label>
        <!-- value= rather than bind:value= on purpose — see onLast4Input. -->
        <input id="cc-last4" class="cc-input" class:cc-input--error={last4Error} type="text"
          inputmode="numeric" autocomplete="off" maxlength="4" value={fLast4} placeholder="xxxx"
          oninput={onLast4Input} />
        {#if last4Error}<span class="cc-field-error">Enter exactly 4 digits</span>{/if}
      </div>

      <div class="cc-form-actions">
        <button class="btn btn--primary" onclick={saveForm}>{editIdx === null ? 'Add Card' : 'Save Changes'}</button>
        <button class="btn btn--ghost" onclick={closeForm}>Cancel</button>
        {#if editIdx !== null}
          <button class="btn btn--ghost btn--danger-text" style="margin-left:auto"
            onclick={() => deleteCard(editIdx)}>Delete Card</button>
        {/if}
      </div>
    </div>
  </section>

<!-- ══ LOG VIEW ═══════════════════════════════════════════════ -->
{:else}
  <section class="cc-section cc-section--log">
    <div class="cc-header">
      <div>
        <h2 class="cc-title">Credit Card Log — {selectedCard.cardholderName} · {selectedCard.cardType} {selectedCard.last4}</h2>
        <p class="cc-subtitle">
          {#if openLogRow}
            Log {openLogRow.log_number} is open · {logRows.length} charge{logRows.length !== 1 ? 's' : ''} waiting
          {:else}
            {logRows.length} charge{logRows.length !== 1 ? 's' : ''} waiting to be packaged
          {/if}
        </p>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeLog}>← Back</button>
    </div>

    {#if logsError}
      <div class="cc-log-error">{logsError}</div>
    {/if}

    <div class="cc-log-toolbar">
      <button class="btn btn--primary btn--sm" disabled={generating || logRows.length === 0}
        onclick={packageLog}>
        {generating ? 'Packaging…' : `Package Log${openLogRow ? ' ' + openLogRow.log_number : ''}`}
      </button>
      <span class="cc-log-hint">
        Packages every charge below, locks them, and opens the next log.
      </span>
    </div>

    <!-- Packaged logs. A locked log is a closed accounting period: reprintable,
         but its charges cannot change without an admin reopening it. -->
    {#if logs.length}
      <div class="cc-log-history">
        <h3 class="cc-log-history-title">Logs</h3>
        {#each logs as l (l.id)}
          {@const count = chargesInLog(l.id).length}
          <div class="cc-log-row">
            <span class="cc-log-num">{l.log_number}</span>
            <span class="cc-log-status cc-log-status--{l.status}">
              {l.status === 'locked' ? '🔒 Packaged' : 'Open'}
            </span>
            <span class="cc-log-count">{count} charge{count === 1 ? '' : 's'}</span>
            {#if l.status === 'locked'}
              <button class="btn btn--ghost btn--xs" onclick={() => reprintLog(l)}>Reprint</button>
              <button class="btn btn--ghost btn--xs" onclick={() => reopenLog(l)}
                title="Admins only — unfreezes this log's charges">Reopen</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if logRows.length === 0}
      <div class="cc-empty">
        <p>Nothing waiting. Charges appear here as soon as they are approved.</p>
      </div>
    {:else}
      <div class="cc-table-wrap">
        <table class="cc-table cc-log-table">
          <thead>
            <tr>
              <th>Line</th><th>Vendor</th><th>Env #</th><th>Rec #</th><th>Date</th>
              <th>Pay Type</th><th>Terms</th><th class="text-right">Actual</th><th>Purpose</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each logRows as p (p.id)}
              <tr>
                <td>{p.lineItem || '—'}</td>
                <td>{p.vendor || '—'}</td>
                <td><input class="cc-cell-input" type="text" value={p.ccEnvelopeNum || ''}
                  onchange={e => updateField(p.id, 'ccEnvelopeNum', e.target.value.trim())} /></td>
                <td><input class="cc-cell-input" type="text" value={p.ccReceiptNum || ''}
                  placeholder="000" maxlength="3"
                  onchange={e => updateField(p.id, 'ccReceiptNum', padReceiptNum(e.target.value))} /></td>
                <td>{p.date || '—'}</td>
                <td>{p.ccCardType} {p.ccLast4}</td>
                <td>{p.paid ? 'paid' : '—'}</td>
                <td class="text-right">{fmt(p.amount)}</td>
                <td>{p.description || '—'}</td>
                <td><input class="cc-cell-input" type="text" value={p.notes || ''}
                  onchange={e => updateField(p.id, 'notes', e.target.value.trim())} /></td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" class="cc-subtotal-label">Subtotal</td>
              <td class="text-right cc-subtotal-value">{fmt(subtotal)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>
{/if}

<style>
  .cc-section { max-width: 1200px; }

  .cc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .cc-title    { font-size: 1.25rem; margin-bottom: 2px; }
  .cc-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); }

  .cc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: var(--text-muted, #888);
    text-align: center;
  }

  .cc-table-wrap { overflow-x: auto; }

  .cc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .cc-table thead th {
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

  .cc-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle, #222);
    vertical-align: middle;
  }

  .cc-row { cursor: pointer; transition: background 0.1s; }
  .cc-row:hover { background: var(--bg-elevated, #1e1e1e); }

  .cc-name-cell  { font-weight: 500; }
  .cc-last4-cell { font-variant-numeric: tabular-nums; color: var(--text-muted, #aaa); }

  .cc-actions-cell { white-space: nowrap; }
  .btn--danger-text { color: var(--earth-red, #b84f4f); }

  .text-right { text-align: right; }

  /* ── Form ── */
  .cc-form { max-width: 420px; display: flex; flex-direction: column; gap: 14px; }

  .cc-field { display: flex; flex-direction: column; gap: 4px; }

  .cc-field label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
  }

  .cc-input {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 7px 10px;
    font-family: inherit;
  }

  .cc-input:focus   { outline: none; border-color: var(--gold, #6a8a6a); }
  .cc-input--error  { border-color: var(--earth-red, #b84f4f); }
  .cc-field-error   { font-size: 0.75rem; color: var(--earth-red, #b84f4f); }

  .cc-log-error {
    padding: 8px 11px; margin-bottom: 12px; font-size: 0.8rem;
    color: var(--red); background: rgba(224,82,82,0.10); border: 1px solid var(--red);
  }
  .cc-log-hint { font-size: 0.75rem; color: var(--text-muted); }

  .cc-log-history { margin: 16px 0 22px; }
  .cc-log-history-title {
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-muted);
    padding-bottom: 6px; margin: 0 0 8px; border-bottom: 1px solid var(--border-subtle);
  }
  .cc-log-row {
    display: flex; align-items: center; gap: 12px;
    padding: 7px 2px; font-size: 0.82rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .cc-log-num { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 3ch; }
  .cc-log-status { font-size: 0.72rem; }
  .cc-log-status--locked { color: var(--text-muted); }
  .cc-log-status--open   { color: var(--gold); font-weight: 700; }
  .cc-log-count { color: var(--text-secondary); font-size: 0.76rem; margin-right: auto; }
  .cc-field-hint    { font-size: 0.75rem; color: var(--text-muted); }

  .cc-form-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
  }

  /* ── Log view ── */
  .cc-log-toolbar {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .cc-log-date {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--text-muted, #888);
  }
  .cc-log-date input {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    color: var(--text-primary, #eee);
    padding: 6px 8px;
    font-size: 0.8rem;
  }

  .cc-cell-input {
    width: 60px;
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border-subtle, #222);
    border-radius: 0;
    color: var(--text-primary, #eee);
    font-size: 0.8rem;
    padding: 4px 6px;
  }
  .cc-cell-input:focus { outline: none; border-color: var(--gold, #6a8a6a); }

  .cc-subtotal-label {
    text-align: right;
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--text-secondary, #aaa);
  }
  .cc-subtotal-value {
    font-weight: 700;
    color: var(--earth-green, #7aaa7a);
  }
</style>
