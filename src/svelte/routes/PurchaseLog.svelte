<script>
  import { onMount, onDestroy } from 'svelte';
  import { getPurchases, deletePurchase, voidPurchase, approvePurchase, sendBackPurchase,
           calcSummary, getPurchaseById, togglePaid, updatePurchase } from '../../data.js';
  import { getBudgetLineMap } from '../../budget.js';
  import { PDFDocument } from 'pdf-lib';

  let container;
  let sortKey  = 'createdAt';
  let sortDir  = 'desc';
  let filters  = { search:'', status:'', method:'', dateFrom:'', dateTo:'' };
  let _keydownHandler;

  /* ── Helpers ── */
  function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(n) { const v=Number(n),abs=Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return v<0?'-$'+abs:'$'+abs; }
  function padLineItem(val) { if(!val||val==='—')return'—';const s=String(val).trim();if(/^\d+$/.test(s))return s.padStart(3,'0');return esc(val); }
  function getProject() { try{return JSON.parse(localStorage.getItem('movie-ledger-project'))||null;}catch{return null;} }

  function statusBadge(st) {
    const map={'Submitted':'submitted','In Review':'in-review','Approved':'approved','Pending Approval':'pending-approval','Refunded':'returned','Void':'void','Quote':'quote'};
    return `<span class="badge badge--${map[st]??'submitted'}">${esc(st??'—')}</span>`;
  }
  function methodBadgeText(p) {
    switch(p.method){case'CC':return`CC ···${p.ccLast4??'????'}`;case'PO-CC':return`PO via CC···${p.ccLast4??'????'}`;case'PO':return'PO';case'Check':return'Check';case'Debit':return'Debit';case'ACH':return'ACH';case'Return':return'Return';default:return esc(p.method??'—');}
  }
  function methodBadge(p) {
    const t=methodBadgeText(p);
    let c='';
    if(p.method==='CC'||p.method==='PO-CC')c='method-badge--cc';else if(p.method==='PO')c='method-badge--po';else if(p.method==='Check'||p.method==='Debit')c='method-badge--check';else if(p.method==='Return')c='method-badge--return';
    return `<span class="method-badge ${c}">${esc(t)}</span>`;
  }
  function vendorTooltip(p) {
    return `<div class="vendor-tooltip"><div class="vendor-tooltip__row"><span>Amount</span><strong>${p.amount!=null?fmt(Number(p.amount)):'—'}</strong></div><div class="vendor-tooltip__row"><span>Method</span><strong>${methodBadgeText(p)}</strong></div><div class="vendor-tooltip__row"><span>W9 / Tax form</span><strong>${p.w9Attached?'✔ Attached':'✘ Not attached'}</strong></div><div class="vendor-tooltip__row"><span>Pay method doc</span><strong>${p.payMethodDocAttached?'✔ Attached':'✘ Not attached'}</strong></div></div>`;
  }
  function paidToggle(p) {
    if(p.status==='Void')return'<span class="paid-label paid-label--void">—</span>';
    if(p.status==='Quote')return'<span class="paid-label paid-label--na">—</span>';
    if(p.status!=='Approved'&&p.status!=='Refunded')return'<span class="paid-label paid-label--na">—</span>';
    const isPaid=!!p.paid,cls=isPaid?'paid-toggle--paid':'paid-toggle--unpaid',label=isPaid?'Paid':'Unpaid';
    return `<button class="paid-toggle ${cls}" data-action="toggle-paid" data-id="${p.id}" title="${label}">${label}</button>`;
  }
  function actionButtons(p) {
    const isVoid=p.status==='Void',btns=[];
    if(!isVoid&&['In Review','Submitted','Pending Approval'].includes(p.status)) btns.push(`<button class="btn btn--warning btn--sm" data-action="return" data-id="${p.id}" title="Return">↩</button>`);
    if(!isVoid) btns.push(`<button class="btn btn--ghost btn--sm" data-action="void" data-id="${p.id}" title="Void">⊘</button>`);
    if(!isVoid) btns.push(`<button class="btn btn--danger btn--sm" data-action="delete" data-id="${p.id}" title="Delete">✕</button>`);
    return btns.join('');
  }
  function rowHTML(p) {
    const map={'Approved':'row--approved','In Review':'row--review','Submitted':'row--review','Pending Approval':'row--pending','Refunded':'row--returned','Void':'row--void','Quote':'row--quote'};
    const isVoid=p.status==='Void',isRefund=p.status==='Refunded',isQuote=p.isQuote||p.status==='Quote';
    let ac='';if(isVoid)ac='amount--void';else if(isRefund)ac='amount--return';else if(isQuote)ac='amount--quote';else if(p.status==='Approved')ac='amount--approved';else if(p.status==='Pending Approval')ac='amount--pending';
    const amt=Number(p.amount)||0,ad=p.amount!=null?fmt(amt):'—';
    return `<tr data-id="${p.id}" class="${map[p.status]??''}"><td><span class="folder-num folder-link" data-action="detail" data-id="${p.id}" title="View details">${esc(p.folder??'—')}</span></td><td>${esc(p.date??'—')}</td><td class="vendor-cell"><span class="vendor-name">${esc(p.vendor??'—')}</span>${vendorTooltip(p)}</td><td>${methodBadge(p)}</td><td>${esc(p.description??'—')}</td><td>${padLineItem(p.lineItem??'—')}</td><td>${esc(p.submittedBy??'—')}</td><td>${statusBadge(p.status)}</td><td class="amount-cell"><span class="${ac}">${ad}</span></td><td class="paid-cell">${paidToggle(p)}</td><td class="actions-cell">${actionButtons(p)}</td></tr>`;
  }
  function queueRowHTML(p) {
    const map={'In Review':'row--review','Submitted':'row--review','Pending Approval':'row--pending'};
    let ac='';if(p.status==='Pending Approval')ac='amount--pending';
    const ad=p.amount!=null?fmt(Number(p.amount)||0):'—';
    return `<tr data-id="${p.id}" class="${map[p.status]??''}"><td><span class="folder-num">${esc(p.folder??'—')}</span></td><td>${esc(p.date??'—')}</td><td class="vendor-cell"><span class="vendor-name">${esc(p.vendor??'—')}</span>${vendorTooltip(p)}</td><td>${methodBadge(p)}</td><td>${esc(p.description??'—')}</td><td>${padLineItem(p.lineItem??'—')}</td><td>${esc(p.submittedBy??'—')}</td><td>${statusBadge(p.status)}</td><td class="amount-cell"><span class="${ac}">${ad}</span></td><td class="paid-cell">${paidToggle(p)}</td><td class="actions-cell"><button class="btn btn--primary btn--sm" data-action="review" data-id="${p.id}">Review</button><button class="btn btn--success btn--sm" data-action="approve" data-id="${p.id}">✔</button><button class="btn btn--warning btn--sm" data-action="return" data-id="${p.id}">↩</button><button class="btn btn--danger btn--sm" data-action="delete" data-id="${p.id}">✕</button></td></tr>`;
  }

  /* ── Filter + Sort ── */
  function applyFiltersAndSort(data) {
    let out=[...data];
    if(filters.search){const q=filters.search.toLowerCase();out=out.filter(p=>[p.vendor,p.folder,p.description,p.lineItem,p.submittedBy].some(v=>v?.toLowerCase().includes(q)));}
    if(filters.status){out=filters.status==='Submitted'?out.filter(p=>p.status==='Submitted'||p.status==='In Review'):out.filter(p=>p.status===filters.status);}
    if(filters.method){out=filters.method==='CC-ALL'?out.filter(p=>p.method==='CC'||p.method==='PO-CC'):out.filter(p=>p.method===filters.method);}
    if(filters.dateFrom)out=out.filter(p=>p.date&&p.date>=filters.dateFrom);
    if(filters.dateTo)out=out.filter(p=>p.date&&p.date<=filters.dateTo);
    out.sort((a,b)=>{let av=a[sortKey]??'',bv=b[sortKey]??'';if(sortKey==='amount'){av=Number(av)||0;bv=Number(bv)||0;}if(av<bv)return sortDir==='asc'?-1:1;if(av>bv)return sortDir==='asc'?1:-1;return 0;});
    return out;
  }

  /* ── Refresh ── */
  function refreshView() {
    if(!container)return;
    const all=getPurchases(),visible=applyFiltersAndSort(all);
    renderSummary(all);renderRows(visible);updateSortIndicators();
  }
  function renderSummary(all) {
    const strip=container.querySelector('#summary-strip');if(!strip)return;
    const s=calcSummary(all);
    strip.innerHTML=`<div class="summary-item summary-item--net"><span class="summary-item__label">Net Total</span><span class="summary-item__value">${fmt(s.net)}</span></div><div class="summary-item summary-item--approved"><span class="summary-item__label">Approved</span><span class="summary-item__value">${fmt(s.approved)}</span></div><div class="summary-item summary-item--inreview"><span class="summary-item__label">In Review</span><span class="summary-item__value">${fmt(s.inReview)}</span></div><div class="summary-item summary-item--quotes"><span class="summary-item__label">Quotes</span><span class="summary-item__value">${fmt(s.quotes)}</span></div><div class="summary-item summary-item--returns"><span class="summary-item__label">Refunded</span><span class="summary-item__value">${fmt(s.refunded)}</span></div>`;
  }
  function renderRows(records) {
    const tbody=container.querySelector('#log-tbody');if(!tbody)return;
    tbody.innerHTML=records.length===0?`<tr><td colspan="11" class="table-empty">No records match the current filters.</td></tr>`:records.map(rowHTML).join('');
  }
  function renderQueueRows() {
    const tbody=container.querySelector('#rq-tbody');if(!tbody)return;
    const records=getPurchases().filter(p=>new Set(['In Review','Pending Approval','Submitted']).has(p.status));
    tbody.innerHTML=records.length===0?`<tr><td colspan="11" class="table-empty">No submissions currently awaiting review.</td></tr>`:records.map(queueRowHTML).join('');
  }
  function updateSortIndicators() {
    container?.querySelectorAll('#log-table th[data-sort]').forEach(th=>{th.classList.remove('sort-asc','sort-desc');if(th.dataset.sort===sortKey)th.classList.add(sortDir==='asc'?'sort-asc':'sort-desc');});
  }

  /* ── Queue ── */
  function showReviewQueue() {
    container.querySelector('#log-main-view').classList.add('hidden');
    container.querySelector('#review-queue-panel').classList.remove('hidden');
    renderQueueRows();
  }
  function hideReviewQueue() {
    container.querySelector('#review-queue-panel').classList.add('hidden');
    container.querySelector('#log-main-view').classList.remove('hidden');
  }

  /* ── Detail popup ── */
  function openDetailPopup(id) {
    const p=getPurchaseById(id);if(!p)return;
    const popup=container.querySelector('#detail-popup'),content=container.querySelector('#detail-popup-content');
    const amt=Number(p.amount)||0,ad=p.amount!=null?fmt(amt):'—';
    const project=getProject(),basePath=project?.dropboxPath;
    const folderPath=(basePath&&p.folder)?basePath.replace(/\/+$/,'')+'/'+p.folder:null;
    const paidLabel=p.status==='Void'?'—':(p.paid?'Paid':'Unpaid');
    const paidCls=p.paid?'detail-paid--yes':'detail-paid--no';
    const liHtml=(p.lineItems&&p.lineItems.length)?p.lineItems.map(li=>`<div class="detail-line-item"><span>${esc(li.label||li.lineItem||'—')}</span><span>${li.amount!=null?fmt(Number(li.amount)):'—'}</span></div>`).join(''):'<span class="detail-muted">None</span>';
    content.innerHTML=`
      <div class="detail-header"><h2 class="detail-title">Submission ${esc(p.folder??'—')}</h2><div class="detail-status">${statusBadge(p.status)}</div></div>
      <div class="detail-grid">
        <div class="detail-field"><label>Folder</label><span>${esc(p.folder??'—')}</span></div>
        <div class="detail-field detail-field--full"><label>Folder Path</label><span class="${folderPath?'detail-path':'detail-muted'}">${folderPath?esc(folderPath):'Not linked'}</span></div>
        <div class="detail-field"><label>Date</label><span>${esc(p.date??'—')}</span></div>
        <div class="detail-field"><label>Vendor</label><span>${esc(p.vendor??'—')}</span></div>
        <div class="detail-field"><label>Method</label><span>${methodBadgeText(p)}</span></div>
        <div class="detail-field"><label>Description</label>${p.status==='Approved'?`<input type="text" class="detail-edit-input" id="detail-edit-desc" value="${esc(p.description??'')}" data-original="${esc(p.description??'')}">`:` <span>${esc(p.description??'—')}</span>`}</div>
        <div class="detail-field"><label>Line Item</label>${p.status==='Approved'?`<input type="text" class="detail-edit-input" id="detail-edit-line" value="${padLineItem(p.lineItem??'')}" data-original="${esc(p.lineItem??'')}">`:` <span>${padLineItem(p.lineItem??'—')}</span>`}</div>
        <div class="detail-field"><label>Charge Type</label><span>${esc(p.chargeType??'—')}</span></div>
        <div class="detail-field"><label>Submitted By</label><span>${esc(p.submittedBy??'—')}</span></div>
        <div class="detail-field"><label>Amount</label><span class="detail-amount">${ad}</span></div>
        <div class="detail-field"><label>Payment Status</label><span class="${paidCls}">${paidLabel}</span></div>
        <div class="detail-field"><label>W9 / Tax Form</label><span>${p.w9Attached?'✔ Attached':'✘ Not attached'}</span></div>
        <div class="detail-field"><label>Pay Method Doc</label><span>${p.payMethodDocAttached?'✔ Attached':'✘ Not attached'}</span></div>
        ${p.linkedFolder?`<div class="detail-field"><label>Linked Folder</label><span>${esc(p.linkedFolder)}</span></div>`:''}
        ${p.isFringe?`<div class="detail-field"><label>Fringe</label><span>Yes</span></div>`:''}
      </div>
      ${(p.lineItems&&p.lineItems.length)?`<div class="detail-section"><h3>Line Items Breakdown</h3><div class="detail-line-items">${liHtml}</div></div>`:''}
      <div class="detail-section"><h3>Notes</h3><p class="detail-notes">${esc(p.notes||'No notes.')}</p></div>
      <div class="detail-section"><h3>Timeline</h3><p class="detail-muted">Submitted: ${p.createdAt?new Date(p.createdAt).toLocaleString():'—'}</p></div>
      ${p.status==='Approved'?`<div class="detail-section detail-save-section"><button class="btn btn--primary btn--sm" id="detail-save-btn" data-id="${p.id}" data-folder="${esc(p.folder??'')}">Save Changes</button></div>`:''}
    `;
    popup.classList.remove('hidden');
    document.body.style.overflow='hidden';
    if(p.status==='Approved') {
      content.querySelector('#detail-save-btn')?.addEventListener('click',()=>{
        const di=content.querySelector('#detail-edit-desc'),li=content.querySelector('#detail-edit-line');
        const nd=di.value.trim(),nl=li.value.trim();
        if(nd===di.dataset.original&&nl===li.dataset.original)return;
        if(!confirm(`Changes made to Folder ${p.folder||'????'}. Confirm?`))return;
        updatePurchase(p.id,{description:nd,lineItem:nl});
        closeDetailPopup();refreshView();
      });
    }
  }
  function closeDetailPopup() {
    container.querySelector('#detail-popup').classList.add('hidden');
    document.body.style.overflow='';
    const c=container.querySelector('#detail-popup-content');if(c)c.innerHTML='';
  }

  /* ── Action handler ── */
  function handleAction(action, id, fromQueue=false) {
    if(action==='delete'){if(confirm('Delete this record permanently?')){deletePurchase(id);refreshView();if(fromQueue)renderQueueRows();}}
    else if(action==='void'){const p=getPurchaseById(id),msg=p&&p.status==='Approved'?`VOID submission "${p.folder} — ${p.vendor}"?\n\nThis will remove all data from the budget and logs. The folder will be renamed with VOID. This action CANNOT be undone.`:p?`VOID submission "${p.folder??''} — ${p.vendor??''}"?\n\nThe folder will be renamed with VOID. This action CANNOT be undone.`:'VOID?';if(confirm(msg)){voidPurchase(id);refreshView();if(fromQueue)renderQueueRows();window.dispatchEvent(new Event('ledger-data-changed'));}}
    else if(action==='approve'){if(confirm('Approve this record?')){approvePurchase(id);refreshView();if(fromQueue)renderQueueRows();}}
    else if(action==='return'){if(confirm('Send this record back for correction?')){sendBackPurchase(id);refreshView();if(fromQueue)renderQueueRows();}}
    else if(action==='toggle-paid'){togglePaid(id);refreshView();if(fromQueue)renderQueueRows();}
    else if(action==='detail'){openDetailPopup(id);}
  }

  /* ── Review modal (embeds edit form) ── */
  function openReviewModal(id) {
    const record=getPurchaseById(id);if(!record)return;
    const modal=container.querySelector('#review-modal'),host=container.querySelector('#review-form-host');
    modal.classList.remove('hidden');
    document.body.style.overflow='hidden';
    renderEditForm(host, record, ()=>{closeReviewModal();refreshView();renderQueueRows();});
  }
  function closeReviewModal() {
    container.querySelector('#review-modal').classList.add('hidden');
    document.body.style.overflow='';
    const host=container.querySelector('#review-form-host');if(host)host.innerHTML='';
  }

  /* ══════════════════════════════════
     REVIEW / EDIT FORM (inlined)
     ══════════════════════════════════ */
  const MAX_RECEIPT_BYTES=25*1024*1024, MAX_SUPPORT_BYTES=10*1024*1024;
  const ANTHROPIC_MODEL='claude-sonnet-4-20250514', ANTHROPIC_API_URL='https://api.anthropic.com/v1/messages';

  function renderEditForm(host, record, onClose) {
    host.innerHTML = `
      <section class="submission-section">
        <div class="submission-layout" id="submission-layout">
          <aside class="preview-panel" id="preview-panel">
            <div class="preview-toolbar">
              <span class="preview-filename" id="preview-filename">No file selected</span>
              <div class="preview-pagination hidden" id="preview-pagination">
                <button type="button" class="btn btn--ghost btn--sm" id="btn-prev-page">‹ Prev</button>
                <span id="preview-page-info" class="preview-page-info">1 / 1</span>
                <button type="button" class="btn btn--ghost btn--sm" id="btn-next-page">Next ›</button>
              </div>
            </div>
            <div class="preview-canvas-wrap" id="preview-canvas-wrap">
              <div class="preview-placeholder" id="preview-placeholder"><span class="preview-placeholder-icon">📄</span><span>Upload a replacement receipt</span></div>
              <canvas id="preview-canvas" class="hidden"></canvas>
              <img id="preview-img" class="hidden" alt="Receipt preview" />
            </div>
          </aside>
          <div class="form-panel">
            <h2>Review Submission</h2>
            <form id="sub-form" novalidate autocomplete="off">
              <div class="form-grid">
                <div class="field field--full"><label for="f-receipt">Receipt / Invoice</label><input type="file" id="f-receipt" name="receipt" accept=".pdf,.jpg,.jpeg,.png,.heic,image/*" /><span class="field-error" id="err-receipt"></span><div id="ocr-status" class="ocr-status">Upload a new file to replace the receipt</div></div>
                <div class="field"><label for="f-date">Date <span class="req">*</span></label><input type="date" id="f-date" name="date" required /><span class="field-error" id="err-date"></span></div>
                <div class="field"><label for="f-vendor">Vendor <span class="req">*</span></label><input type="text" id="f-vendor" name="vendor" required /><span class="field-error" id="err-vendor"></span></div>
                <div class="field"><label for="f-amount">Total Amount ($) <span class="req">*</span></label><input type="number" id="f-amount" name="amount" min="0" step="0.01" placeholder="0.00" required /><span class="field-error" id="err-amount"></span></div>
                <div class="field"><label for="f-method">Payment Method</label><select id="f-method" name="method"><option value="CC">Credit Card (CC)</option><option value="PO-CC">PO via Credit Card (PO-CC)</option><option value="PO">Purchase Order (PO)</option><option value="Check">Check</option><option value="Debit">Debit</option><option value="ACH">ACH / Wire Transfer</option><option value="Return">Return</option></select></div>
                <div class="field"><label for="f-status">Status <span class="req">*</span></label><select id="f-status" name="status" required><option value="">Select…</option><option value="In Review">In Review</option><option value="Pending Approval">Pending Approval</option><option value="Quote">Quote</option><option value="Refunded">Refunded</option></select><span class="field-error" id="err-status"></span></div>
                <div class="field"><label for="f-charge-type">Charge Type</label><select id="f-charge-type" name="chargeType"><option value="">Select…</option><option>Camera Equipment</option><option>Grip &amp; Electric</option><option>Lab Processing</option><option>Catering</option><option>Props</option><option>Wardrobe &amp; Costumes</option><option>Art Department</option><option>Set Construction</option><option>Transportation</option><option>Fuel</option><option>Post Production</option><option>Sound</option><option>Locations</option><option>Office &amp; Admin</option><option>Other</option></select></div>
                <div class="field field--conditional" id="field-cc-last4"><label for="f-cc-last4">CC Last 4 Digits</label><input type="text" id="f-cc-last4" name="ccLast4" maxlength="4" pattern="[0-9]{4}" placeholder="1234" inputmode="numeric" /><span class="field-error" id="err-cc-last4"></span></div>
                <div class="field field--conditional" id="field-linked-folder"><label for="f-linked-folder">Linked Folder # (original)</label><input type="text" id="f-linked-folder" name="linkedFolder" placeholder="e.g. 0002" /><span class="field-error" id="err-linked-folder"></span></div>
                <div class="field field--full" id="field-line-items">
                  <div class="li-header"><span class="form-section-label">Line Items</span><span class="li-total-display" id="li-total-display"></span></div>
                  <div class="li-table-wrap"><table class="li-table"><colgroup><col class="li-col-desc"/><col class="li-col-budget"/><col class="li-col-amt"/><col class="li-col-rm"/></colgroup><thead><tr><th>Description</th><th>Budget Line</th><th class="li-th-amt">Amount ($)</th><th></th></tr></thead><tbody id="li-tbody"></tbody></table></div>
                  <button type="button" id="li-add" class="btn btn--ghost btn--sm li-add-btn">+ Add Item</button>
                  <span class="field-error" id="err-line-items"></span>
                </div>
                <div class="field field--full"><label for="f-notes">Notes</label><textarea id="f-notes" name="notes" rows="3"></textarea></div>
                <div class="field field--full"><span class="form-section-label">Supporting Documents</span></div>
                <div class="field field--full"><div class="doc-upload-group"><div class="doc-upload-item" id="doc-item-w9"><label for="f-w9">W9 / Tax Form<span class="req doc-req-marker" id="w9-req-marker" style="display:none"> *</span><span class="doc-note" id="w9-doc-note">PDF, max 10 MB</span></label><input type="file" id="f-w9" name="w9File" accept=".pdf" /><span class="field-error" id="err-w9"></span><span class="doc-filename" id="w9-filename"></span></div><div class="doc-upload-item" id="doc-item-pay"><label for="f-pay-doc">ACH / Wire Info<span class="req doc-req-marker" id="pay-doc-req-marker" style="display:none"> *</span><span class="doc-note" id="pay-doc-note">PDF, max 10 MB</span></label><input type="file" id="f-pay-doc" name="payDocFile" accept=".pdf" /><span class="field-error" id="err-pay-doc"></span><span class="doc-filename" id="pay-doc-filename"></span></div></div></div>
                <div class="field field--full"><div id="folder-alert" class="folder-alert"></div></div>
              </div>
              <div class="form-actions">
                <button type="button" id="btn-edit-approve" class="btn btn--success">✔ Approve</button>
                <button type="button" id="btn-edit-return"  class="btn btn--warning">↩ Return</button>
                <button type="button" id="btn-edit-cancel"  class="btn btn--ghost">Cancel</button>
                <button type="submit" id="btn-submit"       class="btn btn--primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    `;

    _prefillEditForm(host, record);
    _initLineItems(host, record);

    let isDirty = false;
    const form = host.querySelector('#sub-form');
    form.addEventListener('input',  ()=>{isDirty=true;});
    form.addEventListener('change', ()=>{isDirty=true;});
    host.querySelector('#f-amount').addEventListener('input',()=>_updateLiTotals(host));

    host._requestClose = ()=>{ if(isDirty){const sv=confirm('Save changes before closing?');if(sv)_commitEdits(form,host,record.id);} onClose?.(); };

    // File upload
    const fileInput=host.querySelector('#f-receipt');
    fileInput.addEventListener('change',()=>_handleFile(fileInput,host));
    // Pagination
    host.querySelector('#btn-prev-page').addEventListener('click',()=>{const pg=(host._previewCurrentPage??1)-1;if(pg>=1)_renderPreviewPage(host,pg);});
    host.querySelector('#btn-next-page').addEventListener('click',()=>{const tot=host._previewPdf?.numPages??1,pg=(host._previewCurrentPage??1)+1;if(pg<=tot)_renderPreviewPage(host,pg);});
    // Method/Status
    host.querySelector('#f-method').addEventListener('change',()=>_updateConditional(host));
    host.querySelector('#f-status')?.addEventListener('change',()=>_updateConditional(host));
    _updateConditional(host);
    // Doc uploads
    host.querySelector('#f-w9').addEventListener('change',e=>_handleSupportDoc(e.target,'w9',host));
    host.querySelector('#f-pay-doc').addEventListener('change',e=>_handleSupportDoc(e.target,'pay',host));
    host.querySelector('#f-vendor').addEventListener('input',()=>_refreshDocNames(host));
    // Approve
    host.querySelector('#btn-edit-approve').addEventListener('click',()=>{
      if(!_validateLI(form,host))return;
      _commitEdits(form,host,record.id);updatePurchase(record.id,{status:'Approved'});isDirty=false;onClose?.('approved');
    });
    // Return
    host.querySelector('#btn-edit-return').addEventListener('click',()=>{
      if(confirm('Send back for correction?')){_commitEdits(form,host,record.id);updatePurchase(record.id,{status:'In Review'});isDirty=false;onClose?.('returned');}
    });
    // Cancel
    host.querySelector('#btn-edit-cancel').addEventListener('click',()=>host._requestClose());
    // Save
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const sel=form.querySelector('#f-status');if(sel&&!sel.value){const err=host.querySelector('#err-status');if(err)err.textContent='Status is required.';sel.scrollIntoView({behavior:'smooth',block:'center'});return;}
      const err=host.querySelector('#err-status');if(err)err.textContent='';
      if(!_validateLI(form,host))return;
      _commitEdits(form,host,record.id);isDirty=false;onClose?.('saved');
    });
  }

  function _prefillEditForm(host, record) {
    const set=(id,val)=>{const el=host.querySelector('#'+id);if(!el||val==null)return;el.value=(id==='f-amount')?Number(val).toFixed(2):String(val);};
    set('f-date',record.date);set('f-vendor',record.vendor);set('f-amount',record.amount);set('f-status',record.status);
    set('f-method',record.method);set('f-cc-last4',record.ccLast4??'');set('f-linked-folder',record.linkedFolder??'');
    set('f-charge-type',record.chargeType??'');set('f-notes',record.notes??'');
  }

  function _initLineItems(host, record) {
    const existing=Array.isArray(record.lineItems)&&record.lineItems.length>0?record.lineItems:[{description:record.description??'',lineItem:record.lineItem??'',amount:''}];
    existing.forEach(li=>_addLiRow(host,li));_updateLiTotals(host);
    host.querySelector('#li-add').addEventListener('click',()=>{_addLiRow(host,{});_updateLiTotals(host);});
  }

  function _addLiRow(host, data={}) {
    const tbody=host.querySelector('#li-tbody'),tr=document.createElement('tr');tr.className='li-row';
    const dv=_esca(data.description??''),lv=_esca(data.lineItem??''),av=data.amount!=null&&data.amount!==''?Number(data.amount):'';
    tr.innerHTML=`<td><input type="text" class="li-desc" placeholder="Description…" value="${dv}" /></td><td class="li-td-line"><input type="text" class="li-line" placeholder="#" value="${lv}" /><small class="li-lookup-hint"></small></td><td><input type="number" class="li-amount" placeholder="0.00" min="0" step="0.01" value="${av}" /></td><td><button type="button" class="li-remove btn btn--danger btn--sm" title="Remove row">✕</button></td>`;
    const lineInput=tr.querySelector('.li-line'),hintEl=tr.querySelector('.li-lookup-hint'),descInput=tr.querySelector('.li-desc');
    lineInput.addEventListener('blur',()=>{
      const raw=lineInput.value.trim();if(!raw){_clearHint(lineInput,hintEl);return;}
      const lineMap=getBudgetLineMap();
      const gm=raw.match(/^(?:group\s*)?([A-Za-z]{1,2})$/i);
      if(gm){const letter=gm[1].toUpperCase(),gk=`Group ${letter}`,match=lineMap.get(gk);if(match){lineInput.value=gk;if(!descInput.value.trim())descInput.value=match.description;lineInput.classList.remove('li-line--notfound');lineInput.classList.add('li-line--found');hintEl.textContent=`${match.description} — ${match.sectionName}`;hintEl.className='li-lookup-hint li-lookup-hint--found';return;}}
      const digits=raw.replace(/\D/g,'');if(!digits){_clearHint(lineInput,hintEl);return;}
      const padded=digits.padStart(4,'0');lineInput.value=padded;
      const match=lineMap.get(padded);
      if(match){if(!descInput.value.trim())descInput.value=match.description;lineInput.classList.remove('li-line--notfound');lineInput.classList.add('li-line--found');hintEl.textContent=`${match.description} — ${match.sectionName}`;hintEl.className='li-lookup-hint li-lookup-hint--found';}
      else{lineInput.classList.remove('li-line--found');lineInput.classList.add('li-line--notfound');hintEl.textContent='Not found in budget';hintEl.className='li-lookup-hint li-lookup-hint--miss';}
    });
    lineInput.addEventListener('focus',()=>{lineInput.classList.remove('li-line--found','li-line--notfound');hintEl.textContent='';hintEl.className='li-lookup-hint';});
    tr.querySelector('.li-remove').addEventListener('click',()=>{const rows=tbody.querySelectorAll('.li-row');if(rows.length<=1){descInput.value='';lineInput.value='';tr.querySelector('.li-amount').value='';_clearHint(lineInput,hintEl);}else{tr.remove();}_updateLiTotals(host);});
    tr.querySelector('.li-amount').addEventListener('input',()=>_updateLiTotals(host));
    tbody.appendChild(tr);
    if(lv&&/^\d+$/.test(lv.replace(/\D/g,'')))lineInput.dispatchEvent(new Event('blur'));
  }

  function _clearHint(inp,hint){inp.classList.remove('li-line--found','li-line--notfound');inp.title='';hint.textContent='';hint.className='li-lookup-hint';}
  function _updateLiTotals(host) {
    const gt=parseFloat(host.querySelector('#f-amount')?.value)||0,rows=[...host.querySelectorAll('#li-tbody .li-row')];
    const alloc=rows.reduce((s,r)=>s+(parseFloat(r.querySelector('.li-amount').value)||0),0);
    const disp=host.querySelector('#li-total-display');if(!disp)return;
    const diff=Math.abs(alloc-gt),match=gt>0&&diff<0.005,none=gt===0&&alloc===0;
    disp.className='li-total-display'+(none?'':match?' li-total--ok':' li-total--warn');
    disp.textContent=none?'':`Allocated ${_fmtLi(alloc)} of ${_fmtLi(gt)}${match?' ✔':` — ${_fmtLi(Math.abs(gt-alloc))} ${alloc>gt?'over':'remaining'}`}`;
    if(match){const err=host.querySelector('#err-line-items');if(err)err.textContent='';}
  }
  function _getLI(host){return[...host.querySelectorAll('#li-tbody .li-row')].map(r=>({description:r.querySelector('.li-desc').value.trim(),lineItem:r.querySelector('.li-line').value.trim(),amount:parseFloat(r.querySelector('.li-amount').value)||0})).filter(li=>li.description||li.amount>0);}
  function _validateLI(form,host){
    const gt=parseFloat(form.querySelector('#f-amount')?.value)||0,li=_getLI(host);if(!li.length)return true;
    const alloc=li.reduce((s,l)=>s+l.amount,0),diff=Math.abs(alloc-gt);
    if(diff>=0.005){const err=host.querySelector('#err-line-items');if(err)err.textContent=`Line item total ${_fmtLi(alloc)} ${alloc>gt?'exceeds':'is less than'} receipt total ${_fmtLi(gt)}. Adjust to match.`;host.querySelector('#field-line-items')?.scrollIntoView({behavior:'smooth',block:'center'});return false;}
    const err=host.querySelector('#err-line-items');if(err)err.textContent='';return true;
  }
  function _commitEdits(form,host,id){
    const fd=new FormData(form),data={};
    for(const[k,v]of fd.entries()){if(['receipt','w9File','payDocFile'].includes(k))continue;data[k]=v;}
    data.amount=parseFloat(data.amount)||0;data.isReturn=data.method==='Return';
    if(data.isReturn){data.amount=-Math.abs(data.amount);data.status='Refunded';}
    const li=_getLI(host);if(li.length>0){data.lineItems=li;data.description=li.length===1?li[0].description:li.map(l=>l.description).filter(Boolean).join('; ');data.lineItem=li[0].lineItem||data.lineItem||'';}
    if((form.querySelector('#f-w9')?.files?.length??0)>0)data.w9Attached=true;
    if((form.querySelector('#f-pay-doc')?.files?.length??0)>0)data.payMethodDocAttached=true;
    updatePurchase(id,data);
  }
  function _fmtLi(n){return'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function _esca(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  /* ── Preview helpers (shared for edit form) ── */
  async function _handleFile(input,host) {
    const file=input.files?.[0];if(!file){_clearPreview(host);return;}
    if(file.size>MAX_RECEIPT_BYTES){const e=host.querySelector('#err-receipt');if(e)e.textContent='File exceeds 25 MB limit.';input.value='';return;}
    host.querySelector('#err-receipt').textContent='';
    const ocr=host.querySelector('#ocr-status');_setOcrStatus(ocr,'Loading file…','');
    _renderPreview(file,host).catch(()=>{});
    try{
      const isPdf=file.type==='application/pdf';
      let imageData=null,extractedText='';
      if(isPdf){_setOcrStatus(ocr,'Rendering PDF…','');const r=await _processPdf(file);imageData=r.imageData;extractedText=r.text;}
      else{_setOcrStatus(ocr,'Reading image…','');imageData=await _imgToB64(file);}
      const apiKey=localStorage.getItem('anthropic-api-key');
      let parsed;
      if(apiKey){_setOcrStatus(ocr,'Analyzing with AI vision…','');try{parsed=await _ocrAnthropic(imageData,extractedText,apiKey);}catch{parsed=_ocrRegex(extractedText);}}
      else parsed=_ocrRegex(extractedText);
      _applyOcr(parsed,host);_setOcrStatus(ocr,'Autofilled from receipt — please verify.','success');
    }catch{_setOcrStatus(ocr,'Autofill failed — please fill in manually.','');}
  }
  async function _processPdf(file){
    const ab=await file.arrayBuffer();const pdfjs=window.pdfjsLib;if(!pdfjs)throw new Error('pdfjsLib not loaded');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjs.getDocument({data:ab}).promise;
    let text='';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();text+=c.items.map(it=>it.str).join(' ')+'\n';}
    const pg=await pdf.getPage(1);const vp=pg.getViewport({scale:2});const cvs=document.createElement('canvas');cvs.width=vp.width;cvs.height=vp.height;await pg.render({canvasContext:cvs.getContext('2d'),viewport:vp}).promise;
    return{text:text.trim(),imageData:{base64:cvs.toDataURL('image/jpeg',0.9).split(',')[1],mediaType:'image/jpeg'}};
  }
  async function _imgToB64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res({base64:r.result.split(',')[1],mediaType:file.type==='image/png'?'image/png':'image/jpeg'});r.onerror=rej;r.readAsDataURL(file);});}
  async function _renderPreview(file,host){
    const layout=host.querySelector('#submission-layout'),canvas=host.querySelector('#preview-canvas'),img=host.querySelector('#preview-img'),ph=host.querySelector('#preview-placeholder'),pg=host.querySelector('#preview-pagination'),fn=host.querySelector('#preview-filename');
    host._previewPdf=null;host._previewCurrentPage=1;canvas.classList.add('hidden');img.classList.add('hidden');ph.classList.remove('hidden');pg.classList.add('hidden');fn.textContent=file.name;layout?.classList.add('has-preview');
    if(file.type==='application/pdf'){const ab=await file.arrayBuffer();const pdfjs=window.pdfjsLib;if(!pdfjs)return;pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const pdf=await pdfjs.getDocument({data:ab}).promise;host._previewPdf=pdf;if(pdf.numPages>1)pg.classList.remove('hidden');ph.classList.add('hidden');canvas.classList.remove('hidden');await _renderPreviewPage(host,1);}
    else{const url=URL.createObjectURL(file);img.src=url;img.onload=()=>URL.revokeObjectURL(url);ph.classList.add('hidden');img.classList.remove('hidden');}
  }
  async function _renderPreviewPage(host,pageNum){
    const pdf=host._previewPdf;if(!pdf)return;
    const canvas=host.querySelector('#preview-canvas'),wrap=host.querySelector('#preview-canvas-wrap'),pi=host.querySelector('#preview-page-info');
    const page=await pdf.getPage(pageNum);const ww=wrap.clientWidth||460;const nv=page.getViewport({scale:1});const dpr=window.devicePixelRatio||1;const scale=((ww-24)/nv.width)*dpr;const vp=page.getViewport({scale});
    canvas.width=vp.width;canvas.height=vp.height;canvas.style.width=(vp.width/dpr)+'px';canvas.style.height=(vp.height/dpr)+'px';
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    host._previewCurrentPage=pageNum;if(pi)pi.textContent=`${pageNum} / ${pdf.numPages}`;
  }
  function _clearPreview(host){
    host.querySelector('#submission-layout')?.classList.remove('has-preview');host._previewPdf=null;host._previewCurrentPage=1;
    host.querySelector('#preview-canvas')?.classList.add('hidden');host.querySelector('#preview-img')?.classList.add('hidden');
    host.querySelector('#preview-placeholder')?.classList.remove('hidden');host.querySelector('#preview-pagination')?.classList.add('hidden');
    const fn=host.querySelector('#preview-filename');if(fn)fn.textContent='No file selected';
  }
  async function _ocrAnthropic(imageData,extractedText,apiKey){
    const textHint=extractedText?`\n\nExtracted text:\n${extractedText.slice(0,4000)}`:'';
    const prompt=`Analyze this receipt/invoice. Return JSON with keys: vendor, date (YYYY-MM-DD), amount (number), method ("CC"|"PO-CC"|"PO"|"Check"|"Debit"|"ACH"|"Return"|null), ccLast4, chargeType, description (6-10 words), lineItemSummary (2-4 sentences). vendor must never be null. Return ONLY valid JSON.${textHint}`;
    const resp=await fetch(ANTHROPIC_API_URL,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:ANTHROPIC_MODEL,max_tokens:768,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:imageData.mediaType,data:imageData.base64}},{type:'text',text:prompt}]}]})});
    if(!resp.ok)throw new Error(`API ${resp.status}`);
    const r=await resp.json(),raw=r.content?.[0]?.text??'';
    return JSON.parse(raw.replace(/```json?\n?/g,'').replace(/```/g,'').trim());
  }
  function _ocrRegex(text){
    const p={vendor:null,date:null,amount:null,method:null,ccLast4:null,chargeType:null,description:null,lineItemSummary:null};
    if(!text)return p;
    const amts=[...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)].map(m=>parseFloat(m[1].replace(/,/g,''))).filter(n=>!isNaN(n));
    if(amts.length)p.amount=Math.max(...amts);
    const dm=text.match(/\b(\d{4}-\d{2}-\d{2})\b/)||text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if(dm){if(dm[0].includes('-'))p.date=dm[1];else p.date=`${dm[3]}-${dm[1].padStart(2,'0')}-${dm[2].padStart(2,'0')}`;}
    const cc=text.match(/(?:x{3,}|\*{3,}|ending\s*(?:in)?\s*)(\d{4})/i);if(cc)p.ccLast4=cc[1];
    if(/purchase\s+order|PO\s*#/i.test(text))p.method='PO';else if(/ACH|wire\s+transfer/i.test(text))p.method='ACH';else if(/check\s*#/i.test(text))p.method='Check';else if(/debit/i.test(text))p.method='Debit';else if(p.ccLast4||/credit\s+card|visa|mastercard|amex/i.test(text))p.method='CC';
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
    p.vendor=lines.slice(0,15).find(l=>l.length>2&&l.length<80&&!/^\d/.test(l)&&!/\$/.test(l)&&!/invoice|receipt|bill to/i.test(l))||null;
    return p;
  }
  function _applyOcr(parsed,host){
    if(!parsed)return;
    const fill=(id,val)=>{if(val===null||val===undefined||val==='')return;const el=host.querySelector('#'+id);if(!el)return;el.value=(id==='f-amount')?Number(val).toFixed(2):String(val);el.classList.add('ocr-filled');};
    fill('f-vendor',parsed.vendor);fill('f-date',parsed.date);fill('f-amount',parsed.amount);fill('f-cc-last4',parsed.ccLast4);fill('f-charge-type',parsed.chargeType);fill('f-description',parsed.description);fill('f-notes',parsed.lineItemSummary);
    const me=host.querySelector('#f-method');if(me&&parsed.method){me.value=parsed.method;me.classList.add('ocr-filled');}_updateConditional(host);
  }
  function _setOcrStatus(el,msg,type){if(!el)return;el.textContent=msg;el.classList.add('visible');el.classList.remove('ocr--success','ocr--error');if(type==='success')el.classList.add('ocr--success');}
  function _updateConditional(host){
    const m=host.querySelector('#f-method')?.value,st=host.querySelector('#f-status')?.value;
    host.querySelector('#field-cc-last4')?.classList.toggle('visible',m==='CC'||m==='PO-CC');
    host.querySelector('#field-linked-folder')?.classList.toggle('visible',m==='Return');
    const req=m==='PO'&&st!=='Quote';
    ['w9','pay'].forEach(k=>{
      const ri=host.querySelector('#'+(k==='w9'?'w9-req-marker':'pay-doc-req-marker')),ii=host.querySelector('#'+(k==='w9'?'doc-item-w9':'doc-item-pay')),ni=host.querySelector('#'+(k==='w9'?'w9-doc-note':'pay-doc-note'));
      if(ri)ri.style.display=req?'inline':'none';if(ii)ii.classList.toggle('doc-required',req);if(ni){ni.textContent=req?'Required for PO · PDF, max 10 MB':'PDF, max 10 MB';ni.className=req?'doc-note doc-note--required':'doc-note';}
    });
  }
  function _handleSupportDoc(input,key,host){
    const errId=key==='w9'?'err-w9':'err-pay-doc',fnId=key==='w9'?'w9-filename':'pay-doc-filename';
    const errEl=host.querySelector('#'+errId),nameEl=host.querySelector('#'+fnId);
    const file=input.files?.[0];if(!file){if(nameEl)nameEl.textContent='';return;}
    if(file.type!=='application/pdf'){if(errEl)errEl.textContent='Only PDF files are accepted.';input.value='';if(nameEl)nameEl.textContent='';return;}
    if(file.size>MAX_SUPPORT_BYTES){if(errEl)errEl.textContent='File exceeds 10 MB limit.';input.value='';if(nameEl)nameEl.textContent='';return;}
    if(errEl)errEl.textContent='';_showDocName(key,host);
  }
  function _showDocName(key,host){
    const v=(host.querySelector('#f-vendor')?.value.trim()||'Unknown').replace(/[^a-zA-Z0-9_-]/g,'_').replace(/_+/g,'_'),t=new Date().toISOString().slice(0,10);
    const fn=key==='w9'?`W9_${v}_${t}.pdf`:`Payment_Method_${v}_${t}.pdf`;
    const ne=host.querySelector(key==='w9'?'#w9-filename':'#pay-doc-filename');if(ne)ne.textContent=`Will be saved as: ${fn}`;
  }
  function _refreshDocNames(host){if(host.querySelector('#f-w9')?.files?.length)_showDocName('w9',host);if(host.querySelector('#f-pay-doc')?.files?.length)_showDocName('pay',host);}

  /* ── Mount ── */
  onMount(() => {
    container.innerHTML = `
      <section class="purchase-log">
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
              <input type="search" id="log-search" placeholder="Search vendor, folder, description…" autocomplete="off" />
              <select id="log-filter-status"><option value="">Filter Status</option><option value="Submitted">Submitted</option><option value="Approved">Approved</option><option value="Quote">Quote</option><option value="Refunded">Refunded</option><option value="Void">Void</option></select>
              <select id="log-filter-method"><option value="">All Methods</option><option value="CC-ALL">Credit card (all)</option><option value="CC">CC only</option><option value="PO-CC">PO via CC only</option><option value="PO">PO</option><option value="Check">Check</option><option value="Debit">Debit</option><option value="ACH">ACH / Wire</option><option value="Return">Return</option></select>
              <input type="date" id="log-filter-date-from" title="From date" />
              <input type="date" id="log-filter-date-to"   title="To date"   />
              <button class="btn btn--ghost btn--sm" id="log-clear-filters">Clear</button>
            </div>
          </div>
          <div class="summary-strip" id="summary-strip"></div>
          <div class="table-wrapper">
            <table class="log-table" id="log-table">
              <thead><tr>
                <th data-sort="folder">Folder</th><th data-sort="date">Date</th><th data-sort="vendor">Vendor</th>
                <th data-sort="method">Method</th><th data-sort="description">Description</th>
                <th data-sort="lineItem">Line Item</th><th data-sort="submittedBy">Submitted By</th>
                <th data-sort="status">Status</th><th data-sort="amount" class="text-right">Amount</th>
                <th>Paid</th><th>Actions</th>
              </tr></thead>
              <tbody id="log-tbody"></tbody>
            </table>
          </div>
        </div>
        <div id="review-queue-panel" class="hidden">
          <div class="rq-header"><div class="rq-title-row"><h2>Review Queue</h2><button class="btn btn--ghost btn--sm" id="rq-back">← Back to Log</button></div><p class="rq-subtitle">Showing submissions In Review and Pending Approval</p></div>
          <div class="table-wrapper"><table class="log-table" id="rq-table"><thead><tr><th>Folder</th><th>Date</th><th>Vendor</th><th>Method</th><th>Description</th><th>Line Item</th><th>Submitted By</th><th>Status</th><th class="text-right">Amount</th><th>Paid</th><th>Actions</th></tr></thead><tbody id="rq-tbody"></tbody></table></div>
        </div>
        <div id="review-modal" class="review-modal hidden" role="dialog" aria-modal="true">
          <div class="review-modal-inner">
            <button class="review-modal-close" id="review-modal-close" title="Close">✕</button>
            <div id="review-form-host"></div>
          </div>
        </div>
        <div id="detail-popup" class="detail-popup hidden" role="dialog" aria-modal="true">
          <div class="detail-popup-inner">
            <button class="review-modal-close" id="detail-popup-close" title="Close">✕</button>
            <div id="detail-popup-content"></div>
          </div>
        </div>
      </section>
    `;

    // Navigation
    container.querySelector('#log-new-submission').addEventListener('click', () => { window.location.hash='#submit'; });
    container.querySelector('#log-review-queue').addEventListener('click', () => showReviewQueue());
    container.querySelector('#rq-back').addEventListener('click', () => hideReviewQueue());
    // Filters
    container.querySelector('#log-search').addEventListener('input', e => { filters.search=e.target.value.trim(); refreshView(); });
    container.querySelector('#log-filter-status').addEventListener('change', e => { filters.status=e.target.value; refreshView(); });
    container.querySelector('#log-filter-method').addEventListener('change', e => { filters.method=e.target.value; refreshView(); });
    container.querySelector('#log-filter-date-from').addEventListener('change', e => { filters.dateFrom=e.target.value; refreshView(); });
    container.querySelector('#log-filter-date-to').addEventListener('change', e => { filters.dateTo=e.target.value; refreshView(); });
    container.querySelector('#log-clear-filters').addEventListener('click', () => {
      filters={search:'',status:'',method:'',dateFrom:'',dateTo:''};
      ['#log-search','#log-filter-status','#log-filter-method','#log-filter-date-from','#log-filter-date-to'].forEach(s=>{const el=container.querySelector(s);if(el)el.value='';});
      refreshView();
    });
    // Sort
    container.querySelector('#log-table').addEventListener('click', e => {
      const th=e.target.closest('th[data-sort]');if(!th)return;
      sortDir=(sortKey===th.dataset.sort)?(sortDir==='asc'?'desc':'asc'):'asc';
      sortKey=th.dataset.sort;refreshView();
    });
    // Action delegation
    container.querySelector('#log-tbody').addEventListener('click', e => { const btn=e.target.closest('[data-action]');if(!btn)return;handleAction(btn.dataset.action,btn.dataset.id); });
    container.querySelector('#rq-tbody').addEventListener('click', e => {
      const btn=e.target.closest('[data-action]');if(!btn)return;
      const{action,id}=btn.dataset;
      if(action==='review')openReviewModal(id);else handleAction(action,id,true);
    });
    // Modal close
    container.querySelector('#review-modal-close').addEventListener('click', () => { const host=container.querySelector('#review-form-host');if(host?._requestClose)host._requestClose();else closeReviewModal(); });
    container.querySelector('#review-modal').addEventListener('click', e => { if(e.target!==e.currentTarget)return;const host=container.querySelector('#review-form-host');if(host?._requestClose)host._requestClose();else closeReviewModal(); });
    // Detail popup close
    container.querySelector('#detail-popup-close').addEventListener('click', () => closeDetailPopup());
    container.querySelector('#detail-popup').addEventListener('click', e => { if(e.target===e.currentTarget)closeDetailPopup(); });
    // Escape key
    _keydownHandler = e => {
      if(e.key!=='Escape')return;
      const dp=container.querySelector('#detail-popup');if(dp&&!dp.classList.contains('hidden')){closeDetailPopup();return;}
      const rm=container.querySelector('#review-modal');if(rm&&!rm.classList.contains('hidden')){const host=container.querySelector('#review-form-host');if(host?._requestClose)host._requestClose();else closeReviewModal();}
    };
    document.addEventListener('keydown', _keydownHandler);
    refreshView();
  });

  onDestroy(() => {
    if(_keydownHandler)document.removeEventListener('keydown',_keydownHandler);
    document.body.style.overflow='';
  });
</script>

<div bind:this={container}></div>
