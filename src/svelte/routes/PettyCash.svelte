<script>
  import { getPurchases } from '../../data.js';

  const ENVELOPES_KEY = 'movie-ledger-petty-cash-envelopes';

  // ── State ──────────────────────────────────────────────────
  let envelopes = $state([]);
  let view      = $state('list');   // 'list' | 'form'
  let editId    = $state(null);     // null = new, id = editing
  let expandedId = $state(null);    // which envelope's charges are shown inline

  // Form fields
  let fCustodianName   = $state('');
  let fOpeningBalance  = $state('');
  let custodianError   = $state(false);
  let balanceError      = $state(false);

  // ── Load ───────────────────────────────────────────────────
  try { envelopes = JSON.parse(localStorage.getItem(ENVELOPES_KEY)) || []; } catch { envelopes = []; }

  function save() {
    localStorage.setItem(ENVELOPES_KEY, JSON.stringify(envelopes));
    window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'pettyCash' } }));
  }

  function fmt(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function chargesFor(envelopeId) {
    return getPurchases().filter(p =>
      p.method === 'Petty Cash' && p.status === 'Approved' && p.paid === true &&
      p.pettyCashEnvelopeId === envelopeId
    );
  }

  function balanceFor(env) {
    const spent = chargesFor(env.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return Number(env.openingBalance) - spent;
  }

  // ── Envelope CRUD ──────────────────────────────────────────
  function openForm(id) {
    editId = id;
    const env = id === null ? {} : envelopes.find(e => e.id === id) || {};
    fCustodianName  = env.custodianName || '';
    fOpeningBalance = env.openingBalance != null ? String(env.openingBalance) : '';
    custodianError = false;
    balanceError = false;
    view = 'form';
  }

  function closeForm() { view = 'list'; editId = null; }

  function saveForm() {
    let ok = true;
    if (!fCustodianName.trim()) { custodianError = true; ok = false; }
    const balanceNum = parseFloat(fOpeningBalance);
    if (isNaN(balanceNum) || balanceNum < 0) { balanceError = true; ok = false; }
    if (!ok) return;

    if (editId === null) {
      envelopes = [...envelopes, {
        id: crypto.randomUUID(),
        custodianName: fCustodianName.trim(),
        openedDate: new Date().toISOString().slice(0, 10),
        openingBalance: balanceNum,
        status: 'Active',
      }];
    } else {
      envelopes = envelopes.map(e => e.id === editId
        ? { ...e, custodianName: fCustodianName.trim(), openingBalance: balanceNum }
        : e);
    }
    save();
    closeForm();
  }

  function toggleStatus(id) {
    envelopes = envelopes.map(e => e.id === id
      ? { ...e, status: e.status === 'Active' ? 'Closed' : 'Active' }
      : e);
    save();
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

    {#if envelopes.length === 0}
      <div class="pc-empty">
        <p>No Petty Cash envelopes yet. Click <strong>+ Open New Envelope</strong> to get started.</p>
      </div>
    {:else}
      <div class="pc-table-wrap">
        <table class="pc-table">
          <thead>
            <tr>
              <th>Custodian</th><th>Opened</th><th class="text-right">Opening Balance</th>
              <th class="text-right">Balance</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each envelopes as env (env.id)}
              {@const balance = balanceFor(env)}
              {@const charges = chargesFor(env.id)}
              <tr class="pc-row" onclick={() => toggleExpand(env.id)}>
                <td class="pc-name-cell">{env.custodianName}</td>
                <td>{env.openedDate || '—'}</td>
                <td class="text-right">{fmt(env.openingBalance)}</td>
                <td class="text-right" class:pc-balance--low={balance < 0}>{fmt(balance)}</td>
                <td><span class="pc-status pc-status--{env.status === 'Active' ? 'active' : 'closed'}">{env.status}</span></td>
                <td class="pc-actions-cell" onclick={e => e.stopPropagation()}>
                  <button class="btn btn--ghost btn--xs" onclick={() => toggleStatus(env.id)} title={env.status === 'Active' ? 'Close envelope' : 'Reopen envelope'}>
                    {env.status === 'Active' ? '⏸' : '▶'}
                  </button>
                  <button class="btn btn--ghost btn--xs" onclick={() => openForm(env.id)} title="Edit">✎</button>
                  <button class="btn btn--ghost btn--xs btn--danger-text" onclick={() => deleteEnvelope(env.id)} title="Delete">✕</button>
                </td>
              </tr>
              {#if expandedId === env.id}
                <tr class="pc-expand-row">
                  <td colspan="6">
                    {#if charges.length === 0}
                      <p class="pc-expand-empty">No Approved + Paid charges against this envelope yet.</p>
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
        <label for="pc-custodian">Custodian Name</label>
        <input id="pc-custodian" class="pc-input" class:pc-input--error={custodianError} type="text"
          bind:value={fCustodianName} placeholder="Who's holding this envelope"
          oninput={() => custodianError = false} />
        {#if custodianError}<span class="pc-field-error">Custodian name is required</span>{/if}
      </div>
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
  .pc-status--active { color: var(--earth-green, #7aaa7a); }
  .pc-status--closed { color: var(--text-muted, #888); }

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

  .pc-form-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
  }
</style>
