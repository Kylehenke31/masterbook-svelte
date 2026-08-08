<script>
  import { getPurchases } from '../../data.js';

  function fmt(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function statusBadgeClass(st) {
    const map = { 'Submitted': 'submitted', 'In Review': 'in-review', 'Approved': 'approved',
      'Pending Approval': 'pending-approval', 'Refunded': 'returned', 'Void': 'void', 'Quote': 'quote' };
    return `badge badge--${map[st] ?? 'submitted'}`;
  }

  let pos = $derived(
    getPurchases()
      .filter(p => p.method === 'PO')
      .sort((a, b) => (b.poNumber || '').localeCompare(a.poNumber || ''))
  );

  /* ── Outstanding payments ──
     An approved PO is already an actual in the budget: the cost is committed
     and the paperwork is filed. Whether the money has physically gone out is a
     separate question, and this is where it gets answered — the list of what
     has been approved but not yet paid, which is what an accountant works
     through. Quotes are excluded: nothing is owed on a PO nobody approved. */
  let approved   = $derived(pos.filter(p => p.status === 'Approved'));
  let outstanding = $derived(approved.filter(p => !p.paid));
  let settled     = $derived(approved.filter(p => p.paid));
  const sum = list => list.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  let owedTotal = $derived(sum(outstanding));
  let paidTotal = $derived(sum(settled));

  function newPO() {
    sessionStorage.setItem('masterbook-pending-submit-type', 'Purchase Order');
    window.location.hash = '#submit';
  }
</script>

<section class="pol-section">
  <div class="pol-header">
    <div>
      <h2 class="pol-title">Purchase Orders</h2>
      <p class="pol-subtitle">{pos.length} PO{pos.length !== 1 ? 's' : ''} on file</p>
    </div>

    {#if approved.length}
      <div class="pol-tally">
        <div class="pol-tally-item pol-tally-item--owed">
          <span class="pol-tally-label">Outstanding</span>
          <span class="pol-tally-value">{fmt(owedTotal)}</span>
          <span class="pol-tally-meta">{outstanding.length} unpaid</span>
        </div>
        <div class="pol-tally-item">
          <span class="pol-tally-label">Paid Out</span>
          <span class="pol-tally-value">{fmt(paidTotal)}</span>
          <span class="pol-tally-meta">{settled.length} settled</span>
        </div>
      </div>
    {/if}
    <button class="btn btn--primary btn--sm" onclick={newPO}>+ New PO</button>
  </div>

  {#if pos.length === 0}
    <div class="pol-empty">
      <p>No Purchase Orders yet. Click <strong>+ New PO</strong> to get started.</p>
    </div>
  {:else}
    <div class="pol-table-wrap">
      <table class="pol-table">
        <thead>
          <tr>
            <th>PO #</th><th>Folder</th><th>Date</th><th>Vendor</th>
            <th>Salesperson</th><th>Status</th><th class="text-right">Amount</th><th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {#each pos as p (p.id)}
            <tr>
              <td class="pol-po-num">{p.poNumber || '—'}</td>
              <td>{p.folder || '—'}</td>
              <td>{p.date || '—'}</td>
              <td>{p.vendor || '—'}</td>
              <td>{p.salesperson || '—'}</td>
              <td><span class={statusBadgeClass(p.status)}>{p.status || '—'}</span></td>
              <td class="text-right">{fmt(p.amount)}</td>
              <!-- A quote is not a payable, so it is neither paid nor unpaid —
                   the same reason it is kept out of Outstanding above. -->
              <td>{p.status === 'Void' || p.status === 'Quote' ? '—' : (p.paid ? 'Paid' : 'Unpaid')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .pol-section { max-width: 1100px; }

  .pol-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  /* What is still owed reads first — it is the number an accountant is here
     for. Paid-out sits beside it as the balancing figure, deliberately
     quieter. */
  .pol-tally { display: flex; gap: 22px; margin-left: auto; }
  .pol-tally-item { display: flex; flex-direction: column; gap: 1px; }
  .pol-tally-label {
    font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-muted);
  }
  .pol-tally-value {
    font-size: 1.05rem; font-weight: 700; color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .pol-tally-meta { font-size: 0.65rem; color: var(--text-muted); }
  .pol-tally-item--owed .pol-tally-value { color: var(--amber); }

  .pol-title    { font-size: 1.25rem; margin-bottom: 2px; }
  .pol-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); }

  .pol-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: var(--text-muted, #888);
    text-align: center;
  }

  .pol-table-wrap { overflow-x: auto; }

  .pol-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .pol-table thead th {
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

  .pol-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle, #222);
    vertical-align: middle;
  }

  .pol-po-num { font-weight: 600; font-variant-numeric: tabular-nums; }
  .text-right { text-align: right; }
</style>
