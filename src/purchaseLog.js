/* ============================================================
   The Masterbook — purchaseLog.js
   Purchase log table + in-page Review Queue + Review Modal
   ============================================================ */

import { getPurchases, deletePurchase, voidPurchase, approvePurchase, sendBackPurchase, calcSummary, getPurchaseById, togglePaid } from './data.js?v=6';
import { renderEditForm } from './submissionForm.js?v=32';

/* ── Read project settings (avoids circular import with app.js) ── */
function _getProject() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || null; } catch { return null; }
}

/* ── Module State ── */
let sortKey = 'createdAt';
let sortDir = 'desc';
let filters = { search: '', status: '', method: '', dateFrom: '', dateTo: '' };
let _container = null;

/* ── Entry Point ── */
export function renderPurchaseLog(container) {
  _container = container;
  container.innerHTML = buildShell();
  attachListeners(container);
  refreshView();
}

/* ── HTML Shell ── */
function buildShell() {
  return `
    <section class="purchase-log">

      <!-- ══ Main Log View ══ -->
      <div id="log-main-view">
        <div class="log-header">
          <div class="log-title-row">
            <h2>Purchase Log</h2>
            <div class="log-title-actions">
              <button class="btn btn--primary btn--sm" id="log-new-submission">+ New Submission</button>
              <button class="btn btn--ghost btn--sm" id="log-review-queue">Review Queue</button>
            </div>
          </div>
          <div class="log-controls">
            <input
              type="search"
              id="log-search"
              placeholder="Search vendor, folder, description…"
              autocomplete="off"
            />
            <select id="log-filter-status">
              <option value="">Filter Status</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Quote">Quote</option>
              <option value="Refunded">Refunded</option>
              <option value="Void">Void</option>
            </select>
            <select id="log-filter-method">
              <option value="">All Methods</option>
              <option value="CC-ALL">Credit card (all)</option>
              <option value="CC">CC only</option>
              <option value="PO-CC">PO via CC only</option>
              <option value="PO">PO</option>
              <option value="Check">Check</option>
              <option value="Debit">Debit</option>
              <option value="ACH">ACH / Wire</option>
              <option value="Return">Return</option>
            </select>
            <input type="date" id="log-filter-date-from" title="From date" />
            <input type="date" id="log-filter-date-to"   title="To date"   />
            <button class="btn btn--ghost btn--sm" id="log-clear-filters">Clear</button>
          </div>
        </div>

        <div class="summary-strip" id="summary-strip"></div>

        <div class="table-wrapper">
          <table class="log-table" id="log-table">
            <thead>
              <tr>
                <th data-sort="folder">Folder</th>
                <th data-sort="date">Date</th>
                <th data-sort="vendor">Vendor</th>
                <th data-sort="method">Method</th>
                <th data-sort="description">Description</th>
                <th data-sort="lineItem">Line Item</th>
                <th data-sort="submittedBy">Submitted By</th>
                <th data-sort="status">Status</th>
                <th data-sort="amount" class="text-right">Amount</th>
                <th>Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="log-tbody"></tbody>
          </table>
        </div>
      </div><!-- /#log-main-view -->

      <!-- ══ Review Queue Panel ══ -->
      <div id="review-queue-panel" class="hidden">
        <div class="rq-header">
          <div class="rq-title-row">
            <h2>Review Queue</h2>
            <button class="btn btn--ghost btn--sm" id="rq-back">← Back to Log</button>
          </div>
          <p class="rq-subtitle">Showing submissions In Review and Pending Approval</p>
        </div>
        <div class="table-wrapper">
          <table class="log-table" id="rq-table">
            <thead>
              <tr>
                <th>Folder</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Method</th>
                <th>Description</th>
                <th>Line Item</th>
                <th>Submitted By</th>
                <th>Status</th>
                <th class="text-right">Amount</th>
                <th>Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="rq-tbody"></tbody>
          </table>
        </div>
      </div><!-- /#review-queue-panel -->

      <!-- ══ Review Modal Overlay ══ -->
      <div id="review-modal" class="review-modal hidden" role="dialog" aria-modal="true">
        <div class="review-modal-inner">
          <button class="review-modal-close" id="review-modal-close" title="Close">✕</button>
          <div id="review-form-host"></div>
        </div>
      </div>

      <!-- ══ Submission Detail Popup ══ -->
      <div id="detail-popup" class="detail-popup hidden" role="dialog" aria-modal="true">
        <div class="detail-popup-inner">
          <button class="review-modal-close" id="detail-popup-close" title="Close">✕</button>
          <div id="detail-popup-content"></div>
        </div>
      </div>

    </section>
  `;
}

/* ── Listeners ── */
function attachListeners(container) {
  /* ── Main log buttons ── */
  container.querySelector('#log-new-submission').addEventListener('click', () => {
    window.location.hash = '#submit';
  });

  container.querySelector('#log-review-queue').addEventListener('click', () => {
    showReviewQueue();
  });

  /* ── Filters ── */
  container.querySelector('#log-search').addEventListener('input', e => {
    filters.search = e.target.value.trim();
    refreshView();
  });
  container.querySelector('#log-filter-status').addEventListener('change', e => {
    filters.status = e.target.value;
    refreshView();
  });
  container.querySelector('#log-filter-method').addEventListener('change', e => {
    filters.method = e.target.value;
    refreshView();
  });
  container.querySelector('#log-filter-date-from').addEventListener('change', e => {
    filters.dateFrom = e.target.value;
    refreshView();
  });
  container.querySelector('#log-filter-date-to').addEventListener('change', e => {
    filters.dateTo = e.target.value;
    refreshView();
  });
  container.querySelector('#log-clear-filters').addEventListener('click', () => {
    filters = { search: '', status: '', method: '', dateFrom: '', dateTo: '' };
    container.querySelector('#log-search').value = '';
    container.querySelector('#log-filter-status').value = '';
    container.querySelector('#log-filter-method').value = '';
    container.querySelector('#log-filter-date-from').value = '';
    container.querySelector('#log-filter-date-to').value = '';
    refreshView();
  });

  /* ── Sortable headers ── */
  container.querySelector('#log-table').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    sortDir = (sortKey === key) ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    sortKey = key;
    refreshView();
  });

  /* ── Action buttons (main log, event delegation) ── */
  container.querySelector('#log-tbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleAction(btn.dataset.action, btn.dataset.id);
  });

  /* ── Review Queue: back button ── */
  container.querySelector('#rq-back').addEventListener('click', () => {
    hideReviewQueue();
  });

  /* ── Review Queue: action buttons (delegation) ── */
  container.querySelector('#rq-tbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'review') {
      openReviewModal(id);
    } else {
      handleAction(action, id, /* fromQueue */ true);
    }
  });

  /* ── Modal close (X button) ── */
  container.querySelector('#review-modal-close').addEventListener('click', () => {
    const host = container.querySelector('#review-form-host');
    if (host?._requestClose) {
      host._requestClose();
    } else {
      closeReviewModal();
    }
  });

  /* ── Close modal on overlay backdrop click ── */
  container.querySelector('#review-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      const host = container.querySelector('#review-form-host');
      if (host?._requestClose) {
        host._requestClose();
      } else {
        closeReviewModal();
      }
    }
  });

  /* ── Detail popup close ── */
  container.querySelector('#detail-popup-close').addEventListener('click', () => {
    closeDetailPopup();
  });
  container.querySelector('#detail-popup').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDetailPopup();
  });

  /* ── Escape key closes detail popup (and review modal) ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const detailPopup = _container?.querySelector('#detail-popup');
      if (detailPopup && !detailPopup.classList.contains('hidden')) {
        closeDetailPopup();
        return;
      }
      const reviewModal = _container?.querySelector('#review-modal');
      if (reviewModal && !reviewModal.classList.contains('hidden')) {
        const host = _container.querySelector('#review-form-host');
        if (host?._requestClose) {
          host._requestClose();
        } else {
          closeReviewModal();
        }
      }
    }
  });
}

/* ── Action Handler (shared between main log + review queue) ── */
function handleAction(action, id, fromQueue = false) {
  if (action === 'delete') {
    if (confirm('Delete this record permanently?')) {
      deletePurchase(id);
      refreshView();
      if (fromQueue) renderQueueRows();
    }
  } else if (action === 'void') {
    const p = getPurchaseById(id);
    const msg = p && p.status === 'Approved'
      ? `VOID submission "${p.folder} — ${p.vendor}"?\n\nThis will remove all data from the budget and logs. The folder will be renamed with VOID. This action CANNOT be undone.`
      : `VOID submission "${p?.folder ?? ''} — ${p?.vendor ?? ''}"?\n\nThe folder will be renamed with VOID. This action CANNOT be undone.`;
    if (confirm(msg)) {
      voidPurchase(id);
      refreshView();
      if (fromQueue) renderQueueRows();
      // Notify budget module to recalculate if it exists
      if (window.dispatchEvent) window.dispatchEvent(new Event('ledger-data-changed'));
    }
  } else if (action === 'approve') {
    if (confirm('Approve this record?')) {
      approvePurchase(id);
      refreshView();
      if (fromQueue) renderQueueRows();
    }
  } else if (action === 'return') {
    if (confirm('Send this record back for correction?')) {
      sendBackPurchase(id);
      refreshView();
      if (fromQueue) renderQueueRows();
    }
  } else if (action === 'toggle-paid') {
    togglePaid(id);
    refreshView();
    if (fromQueue) renderQueueRows();
  } else if (action === 'detail') {
    openDetailPopup(id);
  }
}

/* ══════════════════════════════════════════════════════
   REVIEW QUEUE
   ══════════════════════════════════════════════════════ */

const QUEUE_STATUSES = new Set(['In Review', 'Pending Approval', 'Submitted']);

function showReviewQueue() {
  _container.querySelector('#log-main-view').classList.add('hidden');
  const panel = _container.querySelector('#review-queue-panel');
  panel.classList.remove('hidden');
  renderQueueRows();
}

function hideReviewQueue() {
  _container.querySelector('#review-queue-panel').classList.add('hidden');
  _container.querySelector('#log-main-view').classList.remove('hidden');
}

function renderQueueRows() {
  const tbody = _container.querySelector('#rq-tbody');
  if (!tbody) return;

  const records = getPurchases().filter(p => QUEUE_STATUSES.has(p.status));

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty">No submissions currently awaiting review.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(p => queueRowHTML(p)).join('');
}

function queueRowHTML(p) {
  const statusRowMap = {
    'In Review':        'row--review',
    'Submitted':        'row--review',
    'Pending Approval': 'row--pending',
  };
  const rowClass = statusRowMap[p.status] ?? '';

  let amtClass = '';
  if (p.status === 'Pending Approval') amtClass = 'amount--pending';

  const amt = Number(p.amount) || 0;
  const amtDisplay = p.amount != null ? fmt(amt) : '—';

  return `
    <tr data-id="${p.id}" class="${rowClass}">
      <td><span class="folder-num">${esc(p.folder ?? '—')}</span></td>
      <td>${esc(p.date ?? '—')}</td>
      <td class="vendor-cell">
        <span class="vendor-name">${esc(p.vendor ?? '—')}</span>
        ${vendorTooltip(p)}
      </td>
      <td>${methodBadge(p)}</td>
      <td>${esc(p.description ?? '—')}</td>
      <td>${padLineItem(p.lineItem ?? '—')}</td>
      <td>${esc(p.submittedBy ?? '—')}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="amount-cell"><span class="${amtClass}">${amtDisplay}</span></td>
      <td class="paid-cell">${paidToggle(p)}</td>
      <td class="actions-cell">
        <button class="btn btn--primary btn--sm" data-action="review" data-id="${p.id}" title="Open for review">Review</button>
        <button class="btn btn--success btn--sm" data-action="approve" data-id="${p.id}" title="Approve">✔</button>
        <button class="btn btn--warning btn--sm" data-action="return"  data-id="${p.id}" title="Return">↩</button>
        <button class="btn btn--danger btn--sm"  data-action="delete"  data-id="${p.id}" title="Delete">✕</button>
      </td>
    </tr>
  `;
}

/* ══════════════════════════════════════════════════════
   REVIEW MODAL
   ══════════════════════════════════════════════════════ */

function openReviewModal(id) {
  const record = getPurchaseById(id);
  if (!record) return;

  const modal = _container.querySelector('#review-modal');
  const host  = _container.querySelector('#review-form-host');

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // prevent background scroll

  renderEditForm(host, record, (result) => {
    closeReviewModal();
    refreshView();
    renderQueueRows();
  });
}

function closeReviewModal() {
  const modal = _container.querySelector('#review-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  // Clear the form host
  const host = _container.querySelector('#review-form-host');
  if (host) host.innerHTML = '';
}

/* ══════════════════════════════════════════════════════
   SUBMISSION DETAIL POPUP
   ══════════════════════════════════════════════════════ */

function openDetailPopup(id) {
  const p = getPurchaseById(id);
  if (!p) return;

  const popup   = _container.querySelector('#detail-popup');
  const content = _container.querySelector('#detail-popup-content');

  const amt = Number(p.amount) || 0;
  const amtDisplay = p.amount != null ? fmt(amt) : '—';

  const paidLabel = p.status === 'Void' ? '—' : (p.paid ? 'Paid' : 'Unpaid');
  const paidClass = p.paid ? 'detail-paid--yes' : 'detail-paid--no';

  // Build folder disk path from project's dropboxPath
  const project = _getProject();
  const basePath = project?.dropboxPath;
  const folderPath = (basePath && p.folder)
    ? basePath.replace(/\/+$/, '') + '/' + p.folder
    : null;

  const lineItemsHtml = (p.lineItems && p.lineItems.length)
    ? p.lineItems.map(li => `
        <div class="detail-line-item">
          <span>${esc(li.label || li.lineItem || '—')}</span>
          <span>${li.amount != null ? fmt(Number(li.amount)) : '—'}</span>
        </div>
      `).join('')
    : '<span class="detail-muted">None</span>';

  content.innerHTML = `
    <div class="detail-header">
      <h2 class="detail-title">Submission ${esc(p.folder ?? '—')}</h2>
      <div class="detail-status">${statusBadge(p.status)}</div>
    </div>

    <div class="detail-grid">
      <div class="detail-field">
        <label>Folder</label>
        <span>${esc(p.folder ?? '—')}</span>
      </div>
      <div class="detail-field detail-field--full">
        <label>Folder Path</label>
        <span class="${folderPath ? 'detail-path' : 'detail-muted'}">${folderPath ? esc(folderPath) : 'Not linked'}</span>
      </div>
      <div class="detail-field">
        <label>Date</label>
        <span>${esc(p.date ?? '—')}</span>
      </div>
      <div class="detail-field">
        <label>Vendor</label>
        <span>${esc(p.vendor ?? '—')}</span>
      </div>
      <div class="detail-field">
        <label>Method</label>
        <span>${methodBadgeText(p)}</span>
      </div>
      <div class="detail-field">
        <label>Description</label>
        ${p.status === 'Approved' ? `<input type="text" class="detail-edit-input" id="detail-edit-desc" value="${esc(p.description ?? '')}" data-original="${esc(p.description ?? '')}">` : `<span>${esc(p.description ?? '—')}</span>`}
      </div>
      <div class="detail-field">
        <label>Line Item</label>
        ${p.status === 'Approved' ? `<input type="text" class="detail-edit-input" id="detail-edit-line" value="${padLineItem(p.lineItem ?? '')}" data-original="${esc(p.lineItem ?? '')}">` : `<span>${padLineItem(p.lineItem ?? '—')}</span>`}
      </div>
      <div class="detail-field">
        <label>Charge Type</label>
        <span>${esc(p.chargeType ?? '—')}</span>
      </div>
      <div class="detail-field">
        <label>Submitted By</label>
        <span>${esc(p.submittedBy ?? '—')}</span>
      </div>
      <div class="detail-field">
        <label>Amount</label>
        <span class="detail-amount">${amtDisplay}</span>
      </div>
      <div class="detail-field">
        <label>Payment Status</label>
        <span class="${paidClass}">${paidLabel}</span>
      </div>
      <div class="detail-field">
        <label>W9 / Tax Form</label>
        <span>${p.w9Attached ? '✔ Attached' : '✘ Not attached'}</span>
      </div>
      <div class="detail-field">
        <label>Pay Method Doc</label>
        <span>${p.payMethodDocAttached ? '✔ Attached' : '✘ Not attached'}</span>
      </div>
      ${p.linkedFolder ? `
      <div class="detail-field">
        <label>Linked Folder</label>
        <span>${esc(p.linkedFolder)}</span>
      </div>` : ''}
      ${p.isFringe ? `
      <div class="detail-field">
        <label>Fringe</label>
        <span>Yes</span>
      </div>` : ''}
    </div>

    ${(p.lineItems && p.lineItems.length) ? `
    <div class="detail-section">
      <h3>Line Items Breakdown</h3>
      <div class="detail-line-items">${lineItemsHtml}</div>
    </div>` : ''}

    <div class="detail-section">
      <h3>Notes</h3>
      <p class="detail-notes">${esc(p.notes || 'No notes.')}</p>
    </div>

    <div class="detail-section">
      <h3>Timeline</h3>
      <p class="detail-muted">Submitted: ${p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</p>
    </div>

    ${p.status === 'Approved' ? `
    <div class="detail-section detail-save-section">
      <button class="btn btn--primary btn--sm" id="detail-save-btn" data-id="${p.id}" data-folder="${esc(p.folder ?? '')}">Save Changes</button>
    </div>` : ''}
  `;

  popup.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  /* ── Wire Save Changes for approved purchases ── */
  if (p.status === 'Approved') {
    const saveBtn = content.querySelector('#detail-save-btn');
    saveBtn.addEventListener('click', () => {
      const descInput = content.querySelector('#detail-edit-desc');
      const lineInput = content.querySelector('#detail-edit-line');
      const newDesc = descInput.value.trim();
      const newLine = lineInput.value.trim();
      const origDesc = descInput.dataset.original;
      const origLine = lineInput.dataset.original;

      if (newDesc === origDesc && newLine === origLine) return;   // nothing changed

      const folder = saveBtn.dataset.folder || '????';
      if (!confirm(`Changes made to Folder ${folder}. Confirm?`)) return;

      updatePurchase(p.id, { description: newDesc, lineItem: newLine });
      closeDetailPopup();
      refreshView();
    });
  }
}

function closeDetailPopup() {
  const popup = _container.querySelector('#detail-popup');
  popup.classList.add('hidden');
  document.body.style.overflow = '';
  const content = _container.querySelector('#detail-popup-content');
  if (content) content.innerHTML = '';
}

/* ── Main Log Refresh ── */
function refreshView() {
  if (!_container) return;
  const all     = getPurchases();
  const visible = applyFiltersAndSort(all);
  renderSummary(all);
  renderRows(visible);
  updateSortIndicators();
}

/* ── Summary Strip ── */
function renderSummary(allRecords) {
  const strip = _container.querySelector('#summary-strip');
  if (!strip) return;

  const s = calcSummary(allRecords);

  strip.innerHTML = `
    <div class="summary-item summary-item--net">
      <span class="summary-item__label">Net Total</span>
      <span class="summary-item__value">${fmt(s.net)}</span>
    </div>
    <div class="summary-item summary-item--approved">
      <span class="summary-item__label">Approved</span>
      <span class="summary-item__value">${fmt(s.approved)}</span>
    </div>
    <div class="summary-item summary-item--inreview">
      <span class="summary-item__label">In Review</span>
      <span class="summary-item__value">${fmt(s.inReview)}</span>
    </div>
    <div class="summary-item summary-item--quotes">
      <span class="summary-item__label">Quotes</span>
      <span class="summary-item__value">${fmt(s.quotes)}</span>
    </div>
    <div class="summary-item summary-item--returns">
      <span class="summary-item__label">Refunded</span>
      <span class="summary-item__value">${fmt(s.refunded)}</span>
    </div>
  `;
}

/* ── Row Rendering (main log) ── */
function renderRows(records) {
  const tbody = _container.querySelector('#log-tbody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty">No records match the current filters.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(rowHTML).join('');
}

function rowHTML(p) {
  const isVoid   = p.status === 'Void';
  const isRefund = p.status === 'Refunded';
  const isQuote  = p.isQuote || p.status === 'Quote';

  const statusRowMap = {
    'Approved':         'row--approved',
    'In Review':        'row--review',
    'Submitted':        'row--review',
    'Pending Approval': 'row--pending',
    'Refunded':         'row--returned',
    'Void':             'row--void',
    'Quote':            'row--quote',
  };
  const rowClass = statusRowMap[p.status] ?? '';

  let amtClass = '';
  if (isVoid)                              amtClass = 'amount--void';
  else if (isRefund)                       amtClass = 'amount--return';
  else if (isQuote)                        amtClass = 'amount--quote';
  else if (p.status === 'Approved')        amtClass = 'amount--approved';
  else if (p.status === 'Pending Approval') amtClass = 'amount--pending';

  const amt = Number(p.amount) || 0;
  const amtDisplay = p.amount != null ? fmt(amt) : '—';

  return `
    <tr data-id="${p.id}" class="${rowClass}">
      <td><span class="folder-num folder-link" data-action="detail" data-id="${p.id}" title="View submission details">${esc(p.folder ?? '—')}</span></td>
      <td>${esc(p.date ?? '—')}</td>
      <td class="vendor-cell">
        <span class="vendor-name">${esc(p.vendor ?? '—')}</span>
        ${vendorTooltip(p)}
      </td>
      <td>${methodBadge(p)}</td>
      <td>${esc(p.description ?? '—')}</td>
      <td>${padLineItem(p.lineItem ?? '—')}</td>
      <td>${esc(p.submittedBy ?? '—')}</td>
      <td>${statusBadge(p.status)}</td>
      <td class="amount-cell"><span class="${amtClass}">${amtDisplay}</span></td>
      <td class="paid-cell">${paidToggle(p)}</td>
      <td class="actions-cell">${actionButtons(p)}</td>
    </tr>
  `;
}

/* ── Vendor Tooltip ── */
function vendorTooltip(p) {
  const w9     = p.w9Attached ? '✔ Attached' : '✘ Not attached';
  const payDoc = p.payMethodDocAttached ? '✔ Attached' : '✘ Not attached';
  const method = methodBadgeText(p);

  return `
    <div class="vendor-tooltip">
      <div class="vendor-tooltip__row">
        <span>Amount</span>
        <strong>${p.amount != null ? fmt(Number(p.amount)) : '—'}</strong>
      </div>
      <div class="vendor-tooltip__row">
        <span>Method</span>
        <strong>${method}</strong>
      </div>
      <div class="vendor-tooltip__row">
        <span>W9 / Tax form</span>
        <strong>${w9}</strong>
      </div>
      <div class="vendor-tooltip__row">
        <span>Pay method doc</span>
        <strong>${payDoc}</strong>
      </div>
    </div>
  `;
}

/* ── Method Badge ── */
function methodBadgeText(p) {
  switch (p.method) {
    case 'CC':     return `CC ···${p.ccLast4 ?? '????'}`;
    case 'PO-CC':  return `PO via CC···${p.ccLast4 ?? '????'}`;
    case 'PO':     return 'PO';
    case 'Check':  return 'Check';
    case 'Debit':  return 'Debit';
    case 'ACH':    return 'ACH';
    case 'Return': return 'Return';
    default:       return esc(p.method ?? '—');
  }
}

function methodBadge(p) {
  const text = methodBadgeText(p);
  let modClass = '';
  if (p.method === 'CC' || p.method === 'PO-CC') modClass = 'method-badge--cc';
  else if (p.method === 'PO')                     modClass = 'method-badge--po';
  else if (p.method === 'Check' || p.method === 'Debit') modClass = 'method-badge--check';
  else if (p.method === 'Return')                 modClass = 'method-badge--return';
  return `<span class="method-badge ${modClass}">${esc(text)}</span>`;
}

/* ── Status Badge ── */
function statusBadge(status) {
  const map = {
    'Submitted':        'submitted',
    'In Review':        'in-review',
    'Approved':         'approved',
    'Pending Approval': 'pending-approval',
    'Refunded':         'returned',
    'Void':             'void',
    'Quote':            'quote',
  };
  const cls = map[status] ?? 'submitted';
  return `<span class="badge badge--${cls}">${esc(status ?? '—')}</span>`;
}

/* ── Action Buttons (main log) ── */
function actionButtons(p) {
  const isVoid = p.status === 'Void';
  const btns   = [];

  if (!isVoid && ['In Review', 'Submitted', 'Pending Approval'].includes(p.status)) {
    btns.push(`<button class="btn btn--warning btn--sm" data-action="return" data-id="${p.id}" title="Return for correction">↩</button>`);
  }
  if (!isVoid) {
    btns.push(`<button class="btn btn--ghost btn--sm" data-action="void" data-id="${p.id}" title="Void">⊘</button>`);
  }
  if (!isVoid) {
    btns.push(`<button class="btn btn--danger btn--sm" data-action="delete" data-id="${p.id}" title="Delete">✕</button>`);
  }

  return btns.join('');
}

/* ── Paid Toggle ── */
function paidToggle(p) {
  if (p.status === 'Void') return '<span class="paid-label paid-label--void">—</span>';
  if (p.status === 'Quote') return '<span class="paid-label paid-label--na">—</span>';
  if (p.status !== 'Approved' && p.status !== 'Refunded') return '<span class="paid-label paid-label--na">—</span>';
  const isPaid = !!p.paid;
  const cls = isPaid ? 'paid-toggle--paid' : 'paid-toggle--unpaid';
  const label = isPaid ? 'Paid' : 'Unpaid';
  return `<button class="paid-toggle ${cls}" data-action="toggle-paid" data-id="${p.id}" title="${label}">${label}</button>`;
}

/* ── Sort Indicators ── */
function updateSortIndicators() {
  const table = _container?.querySelector('#log-table');
  if (!table) return;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortKey) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

/* ── Filter + Sort ── */
function applyFiltersAndSort(data) {
  let out = [...data];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    out = out.filter(p =>
      [p.vendor, p.folder, p.description, p.lineItem, p.submittedBy]
        .some(v => v?.toLowerCase().includes(q))
    );
  }

  if (filters.status) {
    if (filters.status === 'Submitted') {
      out = out.filter(p => p.status === 'Submitted' || p.status === 'In Review');
    } else {
      out = out.filter(p => p.status === filters.status);
    }
  }

  if (filters.method) {
    if (filters.method === 'CC-ALL') {
      out = out.filter(p => p.method === 'CC' || p.method === 'PO-CC');
    } else {
      out = out.filter(p => p.method === filters.method);
    }
  }

  if (filters.dateFrom) out = out.filter(p => p.date && p.date >= filters.dateFrom);
  if (filters.dateTo)   out = out.filter(p => p.date && p.date <= filters.dateTo);

  out.sort((a, b) => {
    let av = a[sortKey] ?? '';
    let bv = b[sortKey] ?? '';
    if (sortKey === 'amount') { av = Number(av) || 0; bv = Number(bv) || 0; }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return out;
}

/* ── Helpers ── */
function fmt(n) {
  const v = Number(n);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? '-$' + abs : '$' + abs;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function padLineItem(val) {
  if (!val || val === '—') return '—';
  const s = String(val).trim();
  if (/^\d+$/.test(s)) return s.padStart(3, '0');
  return esc(val);
}
