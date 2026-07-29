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
              <td>{p.status === 'Void' ? '—' : (p.paid ? 'Paid' : 'Unpaid')}</td>
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
    margin-bottom: 20px;
  }

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
