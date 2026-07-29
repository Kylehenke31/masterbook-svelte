<script>
  import { getPurchases, updatePurchase, assignCCLogNumber } from '../../data.js';
  import { generateAndDownloadCCLog } from '../lib/ccLogSummary.js';

  const CARDS_KEY  = 'movie-ledger-credit-cards';
  const CARD_TYPES = ['VISA', 'AMEX', 'Mastercard'];

  // ── State ──────────────────────────────────────────────────
  let cards    = $state([]);
  let view     = $state('list');   // 'list' | 'form' | 'log'
  let editIdx  = $state(null);     // null = new, number = editing

  // Card form fields
  let fCardholderName = $state('');
  let fCardType       = $state('VISA');
  let fLast4          = $state('');
  let nameError        = $state(false);
  let last4Error        = $state(false);

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
    fCardType       = c.cardType || 'VISA';
    fLast4          = c.last4 || '';
    nameError = false;
    last4Error = false;
    view = 'form';
  }

  function closeForm() { view = 'list'; editIdx = null; }

  function saveForm() {
    let ok = true;
    if (!fCardholderName.trim()) { nameError = true; ok = false; }
    if (!/^\d{4}$/.test(fLast4.trim())) { last4Error = true; ok = false; }
    if (!ok) return;
    const data = { cardholderName: fCardholderName.trim(), cardType: fCardType, last4: fLast4.trim() };
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
  function openLog(card) {
    selectedCard = card;
    dateFrom = '';
    dateTo   = '';
    refreshLogRows();
    view = 'log';
  }

  function closeLog() { view = 'list'; selectedCard = null; logRows = []; }

  function refreshLogRows() {
    if (!selectedCard) return;
    logRows = getPurchases().filter(p =>
      p.method === 'CC' && p.status === 'Approved' && p.paid === true &&
      p.ccCardType === selectedCard.cardType && p.ccLast4 === selectedCard.last4
    );
  }

  let subtotal = $derived(logRows.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  function updateField(id, field, value) {
    updatePurchase(id, { [field]: value });
    refreshLogRows();
  }

  async function generateLog(mode) {
    if (!selectedCard || generating) return;
    let included = logRows;
    if (mode === 'period') {
      if (!dateFrom || !dateTo) { alert('Pick a date range first.'); return; }
      included = logRows.filter(p => p.date >= dateFrom && p.date <= dateTo);
      if (!included.length) { alert('No charges in that date range.'); return; }
    } else if (!included.length) {
      alert('No Approved + Paid charges on this card yet.');
      return;
    }
    generating = true;
    try {
      const logNumber = assignCCLogNumber(cardKey(selectedCard));
      included.forEach(p => {
        updatePurchase(p.id, { ccLogNumbers: [...(p.ccLogNumbers || []), logNumber] });
      });
      refreshLogRows();
      await generateAndDownloadCCLog(selectedCard, logNumber, included);
    } finally {
      generating = false;
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
      <div class="cc-field">
        <label for="cc-name">Cardholder Name</label>
        <input id="cc-name" class="cc-input" class:cc-input--error={nameError} type="text"
          bind:value={fCardholderName} placeholder="Name printed on card"
          oninput={() => nameError = false} />
        {#if nameError}<span class="cc-field-error">Cardholder name is required</span>{/if}
      </div>
      <div class="cc-field">
        <label for="cc-type">Card Type</label>
        <select id="cc-type" class="cc-input" bind:value={fCardType}>
          {#each CARD_TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </div>
      <div class="cc-field">
        <label for="cc-last4">Last 4 Digits</label>
        <input id="cc-last4" class="cc-input" class:cc-input--error={last4Error} type="text"
          inputmode="numeric" maxlength="4" bind:value={fLast4} placeholder="9773"
          oninput={() => last4Error = false} />
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
        <p class="cc-subtitle">{logRows.length} Approved + Paid charge{logRows.length !== 1 ? 's' : ''} on this card</p>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeLog}>← Back</button>
    </div>

    <div class="cc-log-toolbar">
      <label class="cc-log-date">From <input type="date" bind:value={dateFrom} /></label>
      <label class="cc-log-date">To <input type="date" bind:value={dateTo} /></label>
      <button class="btn btn--primary btn--sm" disabled={generating} onclick={() => generateLog('period')}>Generate Period Log</button>
      <button class="btn btn--ghost btn--sm" disabled={generating} onclick={() => generateLog('full')}>Generate Full Log</button>
    </div>

    {#if logRows.length === 0}
      <div class="cc-empty">
        <p>No Approved + Paid charges on this card yet.</p>
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
                  onchange={e => updateField(p.id, 'ccReceiptNum', e.target.value.trim())} /></td>
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
