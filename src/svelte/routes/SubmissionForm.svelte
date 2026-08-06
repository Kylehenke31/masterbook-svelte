<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { PDFDocument } from 'pdf-lib';
  import { addPurchase, assignFolder, assignPONumber, DB } from '../../data.js';
  import { getActiveProjectId } from '../stores/project.js';
  import { uploadDraftReceipt } from '../lib/db.js';
  import { authUser, getDisplayName } from '../stores/auth.js';

  let { onDone = null } = $props();

  let container;

  /* ── Constants ── */
  const ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514';
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;
  const MAX_SUPPORT_BYTES = 10 * 1024 * 1024;
  const VENDORS_KEY       = 'movie-ledger-vendors';
  const CARDS_KEY         = 'movie-ledger-credit-cards';
  const ENVELOPES_KEY     = 'movie-ledger-petty-cash-envelopes';

  /* Submission Type → underlying `method` value. Petty Cash and Production
     Credit Card have no dedicated data model yet (Phase 1) — they're a
     friendlier front-end over the same purchase schema. PO-CC is retired:
     a charge is either a Purchase Order or a Credit Card charge. */
  const TYPE_METHOD_MAP = {
    'Purchase Order':          'PO',
    'Petty Cash':               'Petty Cash',
    'Production Credit Card':  'CC',
    'Return':                   'Return',
  };
  const METHOD_TYPE_MAP = {
    PO: 'Purchase Order',
    CC: 'Production Credit Card',
    Return: 'Return',
  };

  /* Submission Type accessors. The type is a radio group rather than a single
     element, so every read/write goes through these instead of `.value`. */
  function getType(c) {
    return c.querySelector('input[name="type"]:checked')?.value || '';
  }
  /** Select `value` ('' clears), resync dependent fields, and optionally mark
      the group as OCR-filled (the highlight lives on the list, not an input). */
  function setType(c, value, { ocrFilled = false } = {}) {
    c.querySelectorAll('input[name="type"]').forEach(r => { r.checked = r.value === value; });
    c.querySelector('#f-type-list')?.classList.toggle('ocr-filled', ocrFilled && !!value);
    updateConditionalFields(c);
  }
  /** Quote only means anything on a Purchase Order — the checkbox is hidden
      otherwise, and a stale tick must not waive docs for another type. */
  function isQuote(c) {
    return getType(c) === 'Purchase Order' && !!c.querySelector('#f-is-quote')?.checked;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* ── HTML ── */
  function buildHTML() {
    return `
      <section class="submission-section">
        <div class="submission-layout" id="submission-layout">

          <!-- ── Left: Preview Panel ── -->
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
              <div class="preview-placeholder" id="preview-placeholder">
                <span class="preview-placeholder-icon">📄</span>
                <span>Upload a receipt or invoice<br>to preview it here</span>
              </div>
              <canvas id="preview-canvas" class="hidden"></canvas>
              <img id="preview-img" class="hidden" alt="Receipt preview" />
            </div>
          </aside>

          <!-- ── Right: Form Panel ── -->
          <div class="form-panel">
            <h2>New Submission</h2>

            <form id="sub-form" novalidate autocomplete="off">
              <div class="form-grid">

                <!-- Receipt / Invoice (REQUIRED) -->
                <div class="field field--full">
                  <label for="f-receipt">
                    Receipt / Invoice <span class="optional-label">(optional)</span>
                  </label>
                  <div class="receipt-input-row">
                    <input type="file" id="f-receipt" name="receipt"
                           accept=".pdf,.jpg,.jpeg,.png,.heic,image/*" />
                    <button type="button" class="btn btn--ghost btn--sm" id="btn-scan-doc"
                            title="Scan document with camera">📷 Scan</button>
                  </div>
                  <span class="field-error" id="err-receipt"></span>
                  <div id="ocr-status" class="ocr-status">Ready</div>

                  <!-- Camera scan modal -->
                  <div class="scan-overlay hidden" id="scan-overlay">
                    <div class="scan-modal">
                      <div class="scan-header">
                        <span>Scan Document</span>
                        <button type="button" class="btn btn--ghost btn--sm" id="scan-close">✕</button>
                      </div>
                      <video id="scan-video" autoplay playsinline class="scan-video"></video>
                      <canvas id="scan-canvas" class="hidden"></canvas>
                      <div class="scan-actions">
                        <button type="button" class="btn btn--primary" id="scan-capture">Capture</button>
                        <button type="button" class="btn btn--ghost hidden" id="scan-retake">Retake</button>
                      </div>
                      <img id="scan-preview" class="scan-preview hidden" alt="Captured" />
                      <div class="scan-actions hidden" id="scan-confirm-row">
                        <button type="button" class="btn btn--primary" id="scan-use">Use This Photo</button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Date -->
                <div class="field">
                  <label for="f-date">Date <span class="req">*</span></label>
                  <input type="date" id="f-date" name="date" required />
                  <span class="field-error" id="err-date"></span>
                </div>

                <!-- Vendor -->
                <div class="field">
                  <label for="f-vendor-select">Vendor <span class="req">*</span></label>
                  <select id="f-vendor-select" required>
                    <option value="">Select vendor…</option>
                    <option value="__new__">+ Add New Vendor</option>
                  </select>
                  <span class="field-error" id="err-vendor"></span>
                </div>

                <!-- Add New Vendor (conditional) -->
                <div class="field field--full field--conditional" id="field-new-vendor">
                  <span class="form-section-label">New Vendor</span>
                  <div class="form-grid new-vendor-grid">
                    <div class="field">
                      <label for="f-nv-name">Vendor Name <span class="req">*</span></label>
                      <input type="text" id="f-nv-name" placeholder="Vendor name" />
                      <span class="field-error" id="err-nv-name"></span>
                    </div>
                    <div class="field">
                      <label for="f-nv-type">Vendor Type</label>
                      <input type="text" id="f-nv-type" placeholder="e.g. Equipment Rental" />
                    </div>
                    <div class="field">
                      <label for="f-nv-contact">Contact Person</label>
                      <input type="text" id="f-nv-contact" />
                    </div>
                    <div class="field">
                      <label for="f-nv-phone">Phone</label>
                      <input type="text" id="f-nv-phone" />
                    </div>
                    <div class="field">
                      <label for="f-nv-email">Email</label>
                      <input type="email" id="f-nv-email" />
                    </div>
                    <div class="field">
                      <label for="f-nv-street">Street Address</label>
                      <input type="text" id="f-nv-street" />
                    </div>
                    <div class="field field--full">
                      <label for="f-nv-citystate">City, State ZIP</label>
                      <input type="text" id="f-nv-citystate" />
                    </div>
                  </div>
                </div>

                <!-- Amount -->
                <div class="field">
                  <label for="f-amount">Amount ($) <span class="req">*</span></label>
                  <input type="number" id="f-amount" name="amount"
                         min="0" step="0.01" placeholder="0.00" required />
                  <span class="field-error" id="err-amount"></span>
                </div>

                <!-- Submission Type — single-select checklist. Radio inputs
                     (not checkboxes) so only one can ever be picked, and so
                     FormData still sees a "type" entry the same as the old
                     dropdown did. Styled as a checklist per the spec. -->
                <div class="field field--full">
                  <label id="f-type-label">Submission Type <span class="req">*</span></label>
                  <div class="type-checklist" id="f-type-list" role="radiogroup" aria-labelledby="f-type-label">
                    <label class="type-option">
                      <input type="radio" name="type" value="Purchase Order" />
                      <span class="type-option__box" aria-hidden="true"></span>
                      <span class="type-option__label">Purchase Order</span>
                    </label>
                    <label class="type-option">
                      <input type="radio" name="type" value="Petty Cash" />
                      <span class="type-option__box" aria-hidden="true"></span>
                      <span class="type-option__label">Petty Cash</span>
                    </label>
                    <label class="type-option">
                      <input type="radio" name="type" value="Production Credit Card" />
                      <span class="type-option__box" aria-hidden="true"></span>
                      <span class="type-option__label">Production Credit Card</span>
                    </label>
                    <label class="type-option">
                      <input type="radio" name="type" value="Return" />
                      <span class="type-option__box" aria-hidden="true"></span>
                      <span class="type-option__label">Return</span>
                    </label>
                  </div>
                  <span class="field-error" id="err-type"></span>
                </div>

                <!-- Quote modifier (Purchase Order only). Waives the W9 /
                     payment-doc requirement — a quote is an estimate taken
                     before vendor paperwork is collected. -->
                <div class="field field--full field--conditional" id="field-quote-flag">
                  <label class="quote-flag">
                    <input type="checkbox" id="f-is-quote" />
                    <span>This is a quote <small>— no vendor docs required yet</small></span>
                  </label>
                </div>
                <input type="hidden" id="f-method" name="method" value="" />

                <!-- Credit Card (conditional) -->
                <div class="field field--conditional" id="field-cc-select">
                  <label for="f-cc-select">Credit Card <span class="req">*</span></label>
                  <select id="f-cc-select">
                    <option value="">Select card…</option>
                  </select>
                  <span class="field-error" id="err-cc-select"></span>
                  <small class="field-hint" id="cc-select-hint"></small>
                </div>

                <!-- Linked Folder (Return only) -->
                <div class="field field--conditional" id="field-linked-folder">
                  <label for="f-linked-folder">Linked Folder # (original)</label>
                  <input type="text" id="f-linked-folder" name="linkedFolder" placeholder="e.g. 0002" />
                  <span class="field-error" id="err-linked-folder"></span>
                </div>

                <!-- Petty Cash Envelope (conditional) -->
                <div class="field field--conditional" id="field-petty-cash-envelope">
                  <label for="f-pc-envelope">Petty Cash Envelope <span class="req">*</span></label>
                  <select id="f-pc-envelope">
                    <option value="">Select envelope…</option>
                  </select>
                  <span class="field-error" id="err-pc-envelope"></span>
                  <small class="field-hint" id="pc-envelope-hint"></small>
                </div>

                <!-- Purchase Order section (PO only) -->
                <div class="field field--full field--conditional" id="field-po-section">
                  <span class="form-section-label">Purchase Order Details</span>
                  <div class="form-grid">
                    <div class="field">
                      <label for="f-po-number-display">PO Number</label>
                      <input type="text" id="f-po-number-display" disabled placeholder="Assigned on submit" />
                    </div>
                    <div class="field">
                      <label for="f-po-salesperson">Salesperson</label>
                      <input type="text" id="f-po-salesperson" name="salesperson" placeholder="Optional" />
                    </div>
                  </div>

                  <div class="po-line-items">
                    <table class="po-line-table">
                      <thead>
                        <tr>
                          <th class="po-line-th-num">Line #</th>
                          <th class="po-line-th-qty">Qty</th>
                          <th>Item</th>
                          <th>Description</th>
                          <th class="po-line-th-num">Unit Price</th>
                          <th class="po-line-th-num">Line Total</th>
                          <th class="po-line-th-del"></th>
                        </tr>
                      </thead>
                      <tbody id="po-line-tbody"></tbody>
                    </table>
                    <button type="button" class="btn btn--ghost btn--sm" id="btn-add-po-line">+ Add Row</button>
                    <span class="field-error" id="err-po-lines"></span>
                  </div>
                </div>

                <!-- Description -->
                <div class="field field--full">
                  <label for="f-description">Description</label>
                  <input type="text" id="f-description" name="description"
                         placeholder="Brief description (autofilled from receipt)" maxlength="120" />
                </div>

                <!-- Charge Type -->
                <div class="field">
                  <label for="f-charge-type">Charge Type</label>
                  <select id="f-charge-type" name="chargeType">
                    <option value="">Select…</option>
                    <option>Camera Equipment</option>
                    <option>Grip &amp; Electric</option>
                    <option>Lab Processing</option>
                    <option>Catering</option>
                    <option>Props</option>
                    <option>Wardrobe &amp; Costumes</option>
                    <option>Art Department</option>
                    <option>Set Construction</option>
                    <option>Transportation</option>
                    <option>Fuel</option>
                    <option>Post Production</option>
                    <option>Sound</option>
                    <option>Locations</option>
                    <option>Office &amp; Admin</option>
                    <option>Other</option>
                  </select>
                </div>

                <!-- Line Item -->
                <div class="field">
                  <label for="f-line-item">Line Item</label>
                  <input type="text" id="f-line-item" name="lineItem"
                         placeholder="e.g. 5200 – Camera Equipment" />
                </div>

                <!-- Notes -->
                <div class="field field--full">
                  <label for="f-notes">Notes</label>
                  <textarea id="f-notes" name="notes" rows="3"
                            placeholder="Autofilled with line-item summary from receipt…"></textarea>
                </div>

                <!-- Supporting Documents -->
                <div class="field field--full">
                  <span class="form-section-label">Supporting Documents</span>
                </div>

                <div class="field field--full">
                  <div class="doc-upload-group">
                    <div class="doc-upload-item" id="doc-item-w9">
                      <label for="f-w9">
                        W9 / Tax Form
                        <span class="req doc-req-marker" id="w9-req-marker" style="display:none"> *</span>
                        <span class="doc-note" id="w9-doc-note">PDF, max 10 MB</span>
                      </label>
                      <input type="file" id="f-w9" name="w9File" accept=".pdf" />
                      <span class="field-error" id="err-w9"></span>
                      <span class="doc-filename" id="w9-filename"></span>
                    </div>
                    <div class="doc-upload-item" id="doc-item-pay">
                      <label for="f-pay-doc">
                        ACH / Wire Info
                        <span class="req doc-req-marker" id="pay-doc-req-marker" style="display:none"> *</span>
                        <span class="doc-note" id="pay-doc-note">PDF, max 10 MB</span>
                      </label>
                      <input type="file" id="f-pay-doc" name="payDocFile" accept=".pdf" />
                      <span class="field-error" id="err-pay-doc"></span>
                      <span class="doc-filename" id="pay-doc-filename"></span>
                    </div>
                  </div>
                </div>

                <!-- Folder ceiling alert -->
                <div class="field field--full">
                  <div id="folder-alert" class="folder-alert"></div>
                </div>

              </div><!-- /.form-grid -->

              <div class="form-actions">
                <button type="button" id="btn-save-profile" class="btn btn--ghost">Save to profile</button>
                <button type="button" id="btn-review-later" class="btn btn--ghost">Review later</button>
                <button type="submit" id="btn-submit" class="btn btn--primary">Submit for review</button>
              </div>
            </form>
          </div><!-- /.form-panel -->

        </div><!-- /.submission-layout -->
      </section>
    `;
  }

  /* ── OCR Status ── */
  function setOcrStatus(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    el.classList.remove('ocr--success', 'ocr--error');
    if (type === 'success') el.classList.add('ocr--success');
    if (type === 'error')   el.classList.add('ocr--error');
  }

  /* ── Conditional Fields ── */
  function updateConditionalFields(c) {
    const type      = getType(c);
    const method    = TYPE_METHOD_MAP[type] || '';
    const methodEl  = c.querySelector('#f-method');
    if (methodEl) methodEl.value = method;

    c.querySelector('#field-cc-select').classList.toggle('visible',
      type === 'Production Credit Card');

    c.querySelector('#field-linked-folder').classList.toggle('visible',
      type === 'Return');

    c.querySelector('#field-petty-cash-envelope').classList.toggle('visible',
      type === 'Petty Cash');

    const isPO = type === 'Purchase Order';
    c.querySelector('#field-quote-flag').classList.toggle('visible', isPO);
    c.querySelector('#field-po-section').classList.toggle('visible', isPO);
    if (isPO) {
      const poDisplay = c.querySelector('#f-po-number-display');
      if (poDisplay) poDisplay.placeholder = `Next: ${String(DB.poCounter.next).padStart(4, '0')}`;
      // Start with one blank row the first time the PO section is shown.
      const tbody = c.querySelector('#po-line-tbody');
      if (tbody && tbody.children.length === 0) addPOLineRow(c);
    }

    const docsRequired = isPO && !isQuote(c);
    [['w9', 'w9-req-marker', 'doc-item-w9', 'w9-doc-note'],
     ['pay', 'pay-doc-req-marker', 'doc-item-pay', 'pay-doc-note']].forEach(([, reqId, itemId, noteId]) => {
      const reqEl  = c.querySelector('#' + reqId);
      const itemEl = c.querySelector('#' + itemId);
      const noteEl = c.querySelector('#' + noteId);
      if (reqEl)  reqEl.style.display = docsRequired ? 'inline' : 'none';
      if (itemEl) itemEl.classList.toggle('doc-required', docsRequired);
      if (noteEl) {
        noteEl.textContent = docsRequired ? 'Required for Purchase Orders · PDF, max 10 MB' : 'PDF, max 10 MB';
        noteEl.className   = docsRequired ? 'doc-note doc-note--required' : 'doc-note';
      }
    });

    refreshDocFilenames(c);
  }

  /* ── Vendor picker ── */
  function loadVendors(c) {
    try { c._vendors = JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; }
    catch { c._vendors = []; }
  }

  function refreshVendorSelect(c) {
    const sel = c.querySelector('#f-vendor-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Select vendor…</option>' +
      c._vendors.map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join('') +
      '<option value="__new__">+ Add New Vendor</option>';
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  }

  function updateVendorVisibility(c) {
    const sel = c.querySelector('#f-vendor-select');
    c.querySelector('#field-new-vendor').classList.toggle('visible', sel?.value === '__new__');
  }

  /** Resolve the currently-selected vendor into a plain contact object, or null. */
  function resolveVendor(c) {
    const sel = c.querySelector('#f-vendor-select');
    if (!sel || !sel.value) return null;
    if (sel.value === '__new__') {
      const name = c.querySelector('#f-nv-name')?.value.trim();
      if (!name) return null;
      return {
        isNew: true,
        type:          c.querySelector('#f-nv-type')?.value.trim() || '',
        name,
        contact:       c.querySelector('#f-nv-contact')?.value.trim() || '',
        phone:         c.querySelector('#f-nv-phone')?.value.trim() || '',
        email:         c.querySelector('#f-nv-email')?.value.trim() || '',
        streetAddress: c.querySelector('#f-nv-street')?.value.trim() || '',
        cityStateZip:  c.querySelector('#f-nv-citystate')?.value.trim() || '',
        quotes: '', notes: '',
      };
    }
    const idx = parseInt(sel.value, 10);
    if (isNaN(idx) || !c._vendors?.[idx]) return null;
    return { isNew: false, ...c._vendors[idx] };
  }

  /** Try to match an OCR-guessed vendor name to an existing vendor; else drop into "Add New Vendor". */
  function applyVendorFromOcr(vendorName, c) {
    if (!vendorName) return;
    loadVendors(c);
    refreshVendorSelect(c);
    const idx = c._vendors.findIndex(v => (v.name || '').toLowerCase() === String(vendorName).toLowerCase());
    const sel = c.querySelector('#f-vendor-select');
    if (!sel) return;
    if (idx >= 0) {
      sel.value = String(idx);
    } else {
      sel.value = '__new__';
      const nameEl = c.querySelector('#f-nv-name');
      if (nameEl) { nameEl.value = vendorName; nameEl.classList.add('ocr-filled'); }
    }
    sel.classList.add('ocr-filled');
    updateVendorVisibility(c);
  }

  /* ── Credit Card picker ── */
  function loadCards(c) {
    try { c._cards = JSON.parse(localStorage.getItem(CARDS_KEY)) || []; }
    catch { c._cards = []; }
  }

  function refreshCardSelect(c) {
    const sel = c.querySelector('#f-cc-select');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Select card…</option>' +
      c._cards.map((card, i) => `<option value="${i}">${esc(card.cardholderName)} — ${esc(card.cardType)} ${esc(card.last4)}</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
    const hint = c.querySelector('#cc-select-hint');
    if (hint) hint.textContent = c._cards.length ? '' : 'No cards on file — add one from the Credit Cards page first.';
  }

  /** Resolve the currently-selected Credit Card into a plain object, or null. */
  function resolveCard(c) {
    const sel = c.querySelector('#f-cc-select');
    if (!sel || !sel.value) return null;
    const idx = parseInt(sel.value, 10);
    if (isNaN(idx) || !c._cards?.[idx]) return null;
    return c._cards[idx];
  }

  /* ── Petty Cash envelope picker ── */
  function loadEnvelopes(c) {
    try { c._envelopes = (JSON.parse(localStorage.getItem(ENVELOPES_KEY)) || []).filter(e => e.status === 'Active'); }
    catch { c._envelopes = []; }
  }

  function refreshEnvelopeSelect(c) {
    const sel = c.querySelector('#f-pc-envelope');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Select envelope…</option>' +
      c._envelopes.map(env => `<option value="${env.id}">${esc(env.custodianName)}</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
    const hint = c.querySelector('#pc-envelope-hint');
    if (hint) hint.textContent = c._envelopes.length ? '' : 'No active envelopes — open one from the Petty Cash page first.';
  }

  /** Resolve the currently-selected Petty Cash envelope id, or null. */
  function resolveEnvelope(c) {
    const sel = c.querySelector('#f-pc-envelope');
    return sel?.value || null;
  }

  /* ── PO Line Items ── */
  function poLineRowHTML() {
    return `<tr class="po-line-row">
      <td class="po-line-linenum"></td>
      <td><input type="number" class="po-line-qty" min="0" step="1" value="1"></td>
      <td><input type="text" class="po-line-item" placeholder="Item"></td>
      <td><input type="text" class="po-line-desc" placeholder="Description"></td>
      <td><input type="number" class="po-line-price" min="0" step="0.01" value="0"></td>
      <td class="po-line-total">$0.00</td>
      <td><button type="button" class="btn btn--ghost btn--sm po-line-remove" title="Remove row">✕</button></td>
    </tr>`;
  }

  function renumberPOLines(c) {
    c.querySelectorAll('.po-line-row').forEach((row, i) => {
      row.querySelector('.po-line-linenum').textContent = i + 1;
    });
  }

  function wirePOLineRow(c, row) {
    const qty   = row.querySelector('.po-line-qty');
    const price = row.querySelector('.po-line-price');
    const total = row.querySelector('.po-line-total');
    function recalc() {
      const q = parseFloat(qty.value) || 0;
      const p = parseFloat(price.value) || 0;
      total.textContent = '$' + (q * p).toFixed(2);
    }
    qty.addEventListener('input', recalc);
    price.addEventListener('input', recalc);
    row.querySelector('.po-line-remove').addEventListener('click', () => {
      row.remove();
      renumberPOLines(c);
    });
    recalc();
  }

  function addPOLineRow(c) {
    const tbody = c.querySelector('#po-line-tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', poLineRowHTML());
    wirePOLineRow(c, tbody.lastElementChild);
    renumberPOLines(c);
  }

  function collectPOLineItems(c) {
    const items = [];
    c.querySelectorAll('.po-line-row').forEach((row, i) => {
      const qty         = parseFloat(row.querySelector('.po-line-qty').value) || 0;
      const item        = row.querySelector('.po-line-item').value.trim();
      const description = row.querySelector('.po-line-desc').value.trim();
      const unitPrice    = parseFloat(row.querySelector('.po-line-price').value) || 0;
      if (item || description || unitPrice) {
        items.push({ lineNo: i + 1, qty, item, description, unitPrice });
      }
    });
    return items;
  }

  /* ── Preview ── */
  async function renderPreview(file, c) {
    const layout      = c.querySelector('#submission-layout');
    const canvas      = c.querySelector('#preview-canvas');
    const img         = c.querySelector('#preview-img');
    const placeholder = c.querySelector('#preview-placeholder');
    const pagination  = c.querySelector('#preview-pagination');
    const filenameEl  = c.querySelector('#preview-filename');

    c._previewPdf         = null;
    c._previewCurrentPage = 1;
    canvas.classList.add('hidden');
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
    pagination.classList.add('hidden');
    filenameEl.textContent = file.name;
    layout.classList.add('has-preview');

    if (file.type === 'application/pdf') {
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      c._previewPdf = pdf;
      if (pdf.numPages > 1) pagination.classList.remove('hidden');
      placeholder.classList.add('hidden');
      canvas.classList.remove('hidden');
      await renderPreviewPage(c, 1);
    } else {
      const url = URL.createObjectURL(file);
      img.src   = url;
      img.onload = () => URL.revokeObjectURL(url);
      placeholder.classList.add('hidden');
      img.classList.remove('hidden');
    }
  }

  async function renderPreviewPage(c, pageNum) {
    const pdf = c._previewPdf;
    if (!pdf) return;
    const canvas     = c.querySelector('#preview-canvas');
    const wrap       = c.querySelector('#preview-canvas-wrap');
    const pageInfoEl = c.querySelector('#preview-page-info');
    const page       = await pdf.getPage(pageNum);
    const wrapWidth  = wrap.clientWidth || 460;
    const nv         = page.getViewport({ scale: 1 });
    const dpr        = window.devicePixelRatio || 1;
    const scale      = ((wrapWidth - 24) / nv.width) * dpr;
    const viewport   = page.getViewport({ scale });
    canvas.width       = viewport.width;
    canvas.height      = viewport.height;
    canvas.style.width  = (viewport.width  / dpr) + 'px';
    canvas.style.height = (viewport.height / dpr) + 'px';
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    c._previewCurrentPage = pageNum;
    if (pageInfoEl) pageInfoEl.textContent = `${pageNum} / ${pdf.numPages}`;
  }

  function clearPreview(c) {
    const layout = c.querySelector('#submission-layout');
    if (layout) layout.classList.remove('has-preview');
    c._previewPdf         = null;
    c._previewCurrentPage = 1;
    c._receiptPdfBytesPromise = null;
    const canvas = c.querySelector('#preview-canvas');
    const img    = c.querySelector('#preview-img');
    if (canvas) canvas.classList.add('hidden');
    if (img)    img.classList.add('hidden');
    c.querySelector('#preview-placeholder')?.classList.remove('hidden');
    c.querySelector('#preview-pagination')?.classList.add('hidden');
    const fnEl = c.querySelector('#preview-filename');
    if (fnEl) fnEl.textContent = 'No file selected';
  }

  /* ── PDF Processing for OCR ── */
  async function processPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    const page     = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return {
      text: text.trim(),
      imageData: {
        base64:    canvas.toDataURL('image/jpeg', 0.9).split(',')[1],
        mediaType: 'image/jpeg',
      },
    };
  }

  async function imageFileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve({
        base64:    reader.result.split(',')[1],
        mediaType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Normalize an uploaded receipt (PDF/JPEG/PNG) to a single-page PDF's raw
   * bytes — a PDF passes through untouched; an image gets embedded onto a
   * Letter page, scaled down (never up) to fit within margins. This is the
   * canonical form stored for a receipt, independent of the OCR pipeline
   * above (which works from its own base64 copy).
   */
  async function normalizeReceiptToPDF(file) {
    if (file.type === 'application/pdf') {
      return new Uint8Array(await file.arrayBuffer());
    }
    const imgBytes = new Uint8Array(await file.arrayBuffer());
    const pdfDoc = await PDFDocument.create();
    const img = file.type === 'image/png'
      ? await pdfDoc.embedPng(imgBytes)
      : await pdfDoc.embedJpg(imgBytes);
    const pageW = 612, pageH = 792, margin = 36; // US Letter, points
    const availW = pageW - margin * 2, availH = pageH - margin * 2;
    const scale = Math.min(availW / img.width, availH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    const page = pdfDoc.addPage([pageW, pageH]);
    page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
    return await pdfDoc.save();
  }

  /* ── OCR via Anthropic ── */
  async function ocrViaAnthropic(imageData, extractedText, apiKey) {
    const textHint = extractedText
      ? `\n\nExtracted text (supplemental context):\n${extractedText.slice(0, 4000)}`
      : '';
    const prompt = `You are analyzing a receipt, invoice, or purchase order from a film production. Examine the image carefully.

Extract the following fields and return as a JSON object with EXACTLY these keys:
- vendor: The SELLER's business name. ALWAYS return something — never null.
- date: Invoice/receipt date in YYYY-MM-DD format, or null
- amount: The final GRAND TOTAL as a number (no $ sign, no commas), or null
- method: One of "CC","PO-CC","PO","Check","Debit","ACH","Return", or null
- ccLast4: Last 4 digits of the credit card as a string, or null
- chargeType: Category (e.g. "Lab Processing","Camera Equipment"), or null
- description: A clear 6–10 word summary of the core purchase, or null
- lineItemSummary: A detailed 2–4 sentence summary of ALL line items/services.

Rules:
- Return ONLY valid JSON. No markdown. No explanation.
- vendor must ALWAYS have a value.${textHint}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 apiKey,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 768,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
    const result   = await response.json();
    const raw      = result.content?.[0]?.text ?? '';
    const jsonText = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonText);
  }

  /* ── OCR via Regex Fallback ── */
  function ocrViaRegex(text) {
    const parsed = { vendor: null, date: null, amount: null, method: null, ccLast4: null, chargeType: null, description: null, lineItemSummary: null };
    if (!text) return parsed;

    const amtMatches = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)]
      .map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => !isNaN(n));
    if (amtMatches.length) parsed.amount = Math.max(...amtMatches);

    const datePatterns = [
      /\b(\d{4}-\d{2}-\d{2})\b/,
      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    ];
    for (const pat of datePatterns) {
      const m = text.match(pat);
      if (m) {
        if (pat === datePatterns[0]) { parsed.date = m[1]; }
        else if (pat === datePatterns[1]) { parsed.date = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
        else {
          const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          const mo = String(months.findIndex(n => m[1].toLowerCase().startsWith(n)) + 1).padStart(2,'0');
          parsed.date = `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
        }
        break;
      }
    }

    const ccMatch = text.match(/(?:x{3,}|\*{3,}|ending\s*(?:in)?\s*)(\d{4})/i);
    if (ccMatch) parsed.ccLast4 = ccMatch[1];

    if (/purchase\s+order|PO\s*#|PO\s*No/i.test(text))  parsed.method = 'PO';
    else if (/ACH|wire\s+transfer|bank\s+transfer/i.test(text)) parsed.method = 'ACH';
    else if (/check\s*#|cheque/i.test(text))              parsed.method = 'Check';
    else if (/debit/i.test(text))                         parsed.method = 'Debit';
    else if (parsed.ccLast4 || /credit\s+card|visa|mastercard|amex|american\s+express|discover/i.test(text))
      parsed.method = 'CC';

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const skip  = [/^\d/,/\$/,/\d{1,2}\/\d{1,2}\/\d{4}/,/invoice|receipt|purchase order|bill to|ship to|remit to/i,/^(www\.|http|@|tel:|fax:|ph:)/i];
    const vc = lines.slice(0, 15).find(line => line.length > 2 && line.length < 80 && !skip.some(p => p.test(line)));
    if (vc) parsed.vendor = vc;

    return parsed;
  }

  /* ── Filename Parser ── */
  function parseFilename(filename) {
    const result = { vendor: null, date: null, amount: null, method: null, ccLast4: null };
    const base = filename.replace(/\.pdf$/i, '').replace(/pdf$/i, '');
    const parts = base.split('_');
    if (parts.length < 2) return result;

    const dateRe   = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
    const amountRe = /^\$?[\d,]+(\.\d+)?$/;
    const methodRe = /^(AMEX|VISA|MC|DISC|MASTERCARD|CC|PO|ACH|CHECK|DEBIT|RETURN)/i;

    let idx = /^\d+$/.test(parts[0]) ? 1 : 0;
    const vendorParts = [];
    while (idx < parts.length) {
      const p = parts[idx];
      if (dateRe.test(p) || amountRe.test(p) || (methodRe.test(p) && vendorParts.length > 0)) break;
      vendorParts.push(p);
      idx++;
    }
    if (vendorParts.length > 0) result.vendor = vendorParts.join(' ').trim();

    for (let i = idx; i < parts.length; i++) {
      const p = parts[i];
      if (dateRe.test(p)) {
        const [mo, dy, yr] = p.split('.');
        const year = yr.length === 2 ? '20' + yr : yr;
        result.date = `${year}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}`;
        continue;
      }
      const amtMatch = p.match(/^\$?([\d,]+(?:\.\d+)?)/);
      if (amtMatch) { const n = parseFloat(amtMatch[1].replace(/,/g,'')); if (!isNaN(n)) { result.amount = n; continue; } }
      const ccMatch = p.match(/^(AMEX|VISA|MC|DISC(?:OVER)?|MASTERCARD)(\d{4})/i);
      if (ccMatch) { result.method = 'CC'; result.ccLast4 = ccMatch[2]; continue; }
      const upper = p.toUpperCase();
      if (upper === 'ACH')    { result.method = 'ACH';    continue; }
      if (upper === 'PO')     { result.method = 'PO';     continue; }
      if (upper === 'CHECK')  { result.method = 'Check';  continue; }
      if (upper === 'DEBIT')  { result.method = 'Debit';  continue; }
      if (upper === 'RETURN') { result.method = 'Return'; continue; }
      if (upper === 'CC')     { result.method = 'CC';     continue; }
    }
    return result;
  }

  function mergeOcrWithFilename(ocrParsed, filenameParsed) {
    const merged = { ...ocrParsed };
    for (const key of Object.keys(filenameParsed)) {
      const ocVal = merged[key];
      if ((ocVal === null || ocVal === undefined || ocVal === '') && filenameParsed[key] != null) {
        merged[key] = filenameParsed[key];
      }
    }
    return merged;
  }

  function clearOcrFields(c) {
    ['f-date','f-amount','f-description','f-charge-type','f-notes'].forEach(id => {
      const el = c.querySelector('#' + id);
      if (!el) return;
      el.value = '';
      el.classList.remove('ocr-filled','invalid');
    });
    // Reset vendor picker
    const vendorSel = c.querySelector('#f-vendor-select');
    if (vendorSel) { vendorSel.value = ''; vendorSel.classList.remove('ocr-filled'); }
    const nvName = c.querySelector('#f-nv-name');
    if (nvName) { nvName.value = ''; nvName.classList.remove('ocr-filled'); }
    updateVendorVisibility(c);
    // Reset Credit Card picker
    const cardSel = c.querySelector('#f-cc-select');
    if (cardSel) { cardSel.value = ''; cardSel.classList.remove('ocr-filled'); }
    // Reset type (and, via updateConditionalFields, the hidden method field)
    const quoteEl = c.querySelector('#f-is-quote');
    if (quoteEl) quoteEl.checked = false;
    setType(c, '');
    c.querySelector('#f-type-list')?.classList.remove('invalid');
    ['err-vendor','err-date','err-amount','err-type'].forEach(id => { const el = c.querySelector('#'+id); if(el) el.textContent=''; });
  }

  function applyOcrResults(parsed, c) {
    if (!parsed) return;
    function fill(id, value) {
      if (value === null || value === undefined || value === '') return;
      const el = c.querySelector('#' + id);
      if (!el) return;
      el.value = (id === 'f-amount') ? Number(value).toFixed(2) : String(value);
      el.classList.add('ocr-filled');
    }
    applyVendorFromOcr(parsed.vendor, c);
    fill('f-date',        parsed.date);
    fill('f-amount',      parsed.amount);
    fill('f-charge-type', parsed.chargeType);
    fill('f-description', parsed.description);
    fill('f-notes',       parsed.lineItemSummary);
    const guessedType = parsed.method && METHOD_TYPE_MAP[parsed.method];
    if (guessedType) setType(c, guessedType, { ocrFilled: true });
    // Otherwise leave whatever Type the user already had selected — the
    // hidden `method` still needs to be resynced either way.
    else updateConditionalFields(c);
    // Try to match an OCR-guessed last-4 to an existing Credit Card profile.
    if (parsed.ccLast4) {
      loadCards(c);
      refreshCardSelect(c);
      const idx = c._cards.findIndex(card => card.last4 === String(parsed.ccLast4));
      const cardSel = c.querySelector('#f-cc-select');
      if (cardSel && idx >= 0) { cardSel.value = String(idx); cardSel.classList.add('ocr-filled'); }
      refreshDocFilenames(c);
    }
  }

  /* ── File Handler ── */
  async function handleFile(input, c) {
    const file = input.files?.[0];
    if (!file) { clearPreview(c); return; }

    if (file.size > MAX_RECEIPT_BYTES) {
      const errEl = c.querySelector('#err-receipt');
      if (errEl) errEl.textContent = 'File exceeds 25 MB limit.';
      input.value = '';
      return;
    }

    c.querySelector('#err-receipt').textContent = '';
    clearOcrFields(c);
    const ocr = c.querySelector('#ocr-status');
    setOcrStatus(ocr, 'Loading file…', '');

    const filenameParsed = parseFilename(file.name);
    renderPreview(file, c).catch(err => console.warn('[Preview]', err));

    // Kick off independently of OCR — resolved later at submit time.
    c._receiptPdfBytesPromise = normalizeReceiptToPDF(file)
      .catch(err => { console.warn('[Receipt] normalize failed:', err); return null; });

    try {
      const isPdf = file.type === 'application/pdf';
      let imageData = null, extractedText = '';
      if (isPdf) {
        setOcrStatus(ocr, 'Rendering PDF…', '');
        const result = await processPdf(file);
        imageData     = result.imageData;
        extractedText = result.text;
      } else {
        setOcrStatus(ocr, 'Reading image…', '');
        imageData = await imageFileToBase64(file);
      }

      const apiKey = localStorage.getItem('anthropic-api-key') ?? null;
      let ocrParsed;
      if (apiKey) {
        setOcrStatus(ocr, 'Analyzing with AI vision…', '');
        try { ocrParsed = await ocrViaAnthropic(imageData, extractedText, apiKey); }
        catch (apiErr) { console.warn('[OCR] API failed, falling back:', apiErr.message); ocrParsed = ocrViaRegex(extractedText); }
      } else {
        ocrParsed = ocrViaRegex(extractedText);
      }

      const parsed = mergeOcrWithFilename(ocrParsed, filenameParsed);
      applyOcrResults(parsed, c);
      setOcrStatus(ocr, 'Autofilled from receipt — please verify before submitting.', 'success');
    } catch (err) {
      console.error('[OCR]', err);
      applyOcrResults(filenameParsed, c);
      setOcrStatus(ocr, 'Autofilled from filename — AI read failed. Please verify.', 'success');
    }
  }

  /* ── Supporting Docs ── */
  function handleSupportingDoc(input, key, c) {
    const errId      = key === 'w9' ? 'err-w9'      : 'err-pay-doc';
    const filenameId = key === 'w9' ? 'w9-filename' : 'pay-doc-filename';
    const errEl      = c.querySelector('#' + errId);
    const nameEl     = c.querySelector('#' + filenameId);
    const file       = input.files?.[0];
    if (!file) { if (nameEl) nameEl.textContent = ''; return; }
    if (file.type !== 'application/pdf') { if (errEl) errEl.textContent = 'Only PDF files are accepted.'; input.value = ''; if (nameEl) nameEl.textContent = ''; return; }
    if (file.size > MAX_SUPPORT_BYTES) { if (errEl) errEl.textContent = 'File exceeds 10 MB limit.'; input.value = ''; if (nameEl) nameEl.textContent = ''; return; }
    if (errEl) errEl.textContent = '';
    showGeneratedFilename(key, c);
  }

  function showGeneratedFilename(key, c) {
    const vendor     = resolveVendor(c)?.name || 'Unknown';
    const today      = new Date().toISOString().slice(0, 10);
    const safeVendor = vendor.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const filename   = key === 'w9' ? `W9_${safeVendor}_${today}.pdf` : `Payment_Method_${safeVendor}_${today}.pdf`;
    const nameEl     = c.querySelector(key === 'w9' ? '#w9-filename' : '#pay-doc-filename');
    if (nameEl) nameEl.textContent = `Will be saved as: ${filename}`;
  }

  function refreshDocFilenames(c) {
    if (c.querySelector('#f-w9')?.files?.length)      showGeneratedFilename('w9',  c);
    if (c.querySelector('#f-pay-doc')?.files?.length) showGeneratedFilename('pay', c);
  }

  /* ── Camera Scan ── */
  function attachScanListeners(c, fileInput) {
    const overlay      = c.querySelector('#scan-overlay');
    const video        = c.querySelector('#scan-video');
    const scanCanvas   = c.querySelector('#scan-canvas');
    const captureBtn   = c.querySelector('#scan-capture');
    const retakeBtn    = c.querySelector('#scan-retake');
    const useBtn       = c.querySelector('#scan-use');
    const confirmRow   = c.querySelector('#scan-confirm-row');
    const previewImg   = c.querySelector('#scan-preview');
    let stream = null;

    async function openScan() {
      overlay.classList.remove('hidden');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
      } catch (err) { alert('Camera access denied: ' + err.message); closeScan(); }
    }

    function closeScan() {
      overlay.classList.add('hidden');
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      video.srcObject = null;
      previewImg.classList.add('hidden');
      previewImg.src = '';
      confirmRow.classList.add('hidden');
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
    }

    function capture() {
      scanCanvas.width  = video.videoWidth  || 1280;
      scanCanvas.height = video.videoHeight || 720;
      scanCanvas.getContext('2d').drawImage(video, 0, 0);
      previewImg.src = scanCanvas.toDataURL('image/jpeg', 0.92);
      previewImg.classList.remove('hidden');
      confirmRow.classList.remove('hidden');
      captureBtn.classList.add('hidden');
      retakeBtn.classList.remove('hidden');
    }

    async function usePhoto() {
      // Convert JPEG data URL to a File object, trigger handleFile
      const dataUrl = scanCanvas.toDataURL('image/jpeg', 0.92);
      const res  = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'scan_' + Date.now() + '.jpg', { type: 'image/jpeg' });
      const dt   = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      closeScan();
      handleFile(fileInput, c);
    }

    c.querySelector('#btn-scan-doc').addEventListener('click', openScan);
    c.querySelector('#scan-close').addEventListener('click', closeScan);
    captureBtn.addEventListener('click', capture);
    retakeBtn.addEventListener('click', () => {
      previewImg.classList.add('hidden');
      previewImg.src = '';
      confirmRow.classList.add('hidden');
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
    });
    useBtn.addEventListener('click', usePhoto);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeScan(); });
  }

  /* ── Validation ── */
  function validateForm(form, c) {
    let ok = true;
    function requireFile(input, errEl, message) {
      if (!input?.files || input.files.length === 0) { if (errEl) errEl.textContent = message; input?.classList.add('invalid'); return false; }
      if (errEl) errEl.textContent = ''; input.classList.remove('invalid'); return true;
    }
    function requireField(inputId, errId) {
      const el = form.querySelector('#' + inputId), err = c.querySelector('#' + errId);
      if (!el) return true;
      if (!el.value.trim()) { if (err) err.textContent = 'This field is required.'; el.classList.add('invalid'); return false; }
      if (err) err.textContent = ''; el.classList.remove('invalid'); return true;
    }
    ok = requireVendor(form, c)  && ok;
    ok = requireField('f-date',   'err-date')   && ok;
    ok = requireField('f-amount', 'err-amount') && ok;
    ok = requireType(c) && ok;
    const type = getType(c);
    if (type === 'Purchase Order' && !isQuote(c)) {
      ok = requireFile(form.querySelector('#f-w9'),      c.querySelector('#err-w9'),      'W9 required for Purchase Orders.') && ok;
      ok = requireFile(form.querySelector('#f-pay-doc'), c.querySelector('#err-pay-doc'), 'ACH / Wire info required for Purchase Orders.') && ok;
    }
    if (type === 'Purchase Order') {
      const items    = collectPOLineItems(c);
      const linesErr = c.querySelector('#err-po-lines');
      const valid    = items.length > 0 && items.every(it => it.item && it.unitPrice > 0);
      if (!valid) { if (linesErr) linesErr.textContent = 'Add at least one line item with an item name and unit price.'; ok = false; }
      else if (linesErr) { linesErr.textContent = ''; }
    }
    if (type === 'Production Credit Card') ok = requireCard(form, c) && ok;
    if (type === 'Petty Cash')              ok = requireEnvelope(form, c) && ok;
    return ok;
  }

  /** Same contract as requireField, but for the Submission Type radio group —
      there's no single element to read `.value` off, and the invalid styling
      belongs on the list rather than any one radio. */
  function requireType(c) {
    const list = c.querySelector('#f-type-list');
    const err  = c.querySelector('#err-type');
    if (!getType(c)) {
      if (err) err.textContent = 'Please choose a submission type.';
      list?.classList.add('invalid');
      return false;
    }
    if (err) err.textContent = '';
    list?.classList.remove('invalid');
    return true;
  }

  /** Shared pattern with requireVendor — a plain required-select check. */
  function requireCard(form, c) {
    const sel = form.querySelector('#f-cc-select');
    const err = c.querySelector('#err-cc-select');
    if (!sel?.value) { if (err) err.textContent = 'Please select a card.'; sel?.classList.add('invalid'); return false; }
    sel.classList.remove('invalid');
    if (err) err.textContent = '';
    return true;
  }

  function requireEnvelope(form, c) {
    const sel = form.querySelector('#f-pc-envelope');
    const err = c.querySelector('#err-pc-envelope');
    if (!sel?.value) { if (err) err.textContent = 'Please select an envelope.'; sel?.classList.add('invalid'); return false; }
    sel.classList.remove('invalid');
    if (err) err.textContent = '';
    return true;
  }

  /** Shared by validateForm and validateMinimal — the vendor picker isn't a plain required text field. */
  function requireVendor(form, c) {
    const sel = form.querySelector('#f-vendor-select');
    const err = c.querySelector('#err-vendor');
    if (!sel) return true;
    if (!sel.value) {
      if (err) err.textContent = 'Please select a vendor.';
      sel.classList.add('invalid');
      return false;
    }
    sel.classList.remove('invalid');
    if (sel.value === '__new__') {
      const nameEl = form.querySelector('#f-nv-name');
      const nvErr  = c.querySelector('#err-nv-name');
      if (!nameEl.value.trim()) {
        if (nvErr) nvErr.textContent = 'Vendor name is required.';
        nameEl.classList.add('invalid');
        if (err) err.textContent = '';
        return false;
      }
      if (nvErr) nvErr.textContent = '';
      nameEl.classList.remove('invalid');
    }
    if (err) err.textContent = '';
    return true;
  }

  function validateMinimal(form, c) {
    let ok = true;
    function requireField(inputId, errId) {
      const el = form.querySelector('#' + inputId), err = c.querySelector('#' + errId);
      if (!el) return true;
      if (!el.value.trim()) { if (err) err.textContent = 'This field is required.'; el.classList.add('invalid'); return false; }
      if (err) err.textContent = ''; el.classList.remove('invalid'); return true;
    }
    ok = requireVendor(form, c) && ok;
    ok = requireField('f-date',   'err-date')   && ok;
    ok = requireField('f-amount', 'err-amount') && ok;
    return ok;
  }

  /* ── Submit ── */
  async function submitRecord(form, c, status, isDraft = false) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (['receipt','w9File','payDocFile'].includes(k)) continue;
      data[k] = v;
    }

    // Resolve vendor (existing pick or newly-added) — the vendor picker
    // isn't a named form field, so FormData never sees it directly.
    const vendorInfo = resolveVendor(c);
    if (vendorInfo?.isNew) {
      let vendors = [];
      try { vendors = JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; } catch {}
      vendors.push({
        type: vendorInfo.type, name: vendorInfo.name, contact: vendorInfo.contact,
        phone: vendorInfo.phone, email: vendorInfo.email,
        streetAddress: vendorInfo.streetAddress, cityStateZip: vendorInfo.cityStateZip,
        quotes: '', notes: '',
      });
      localStorage.setItem(VENDORS_KEY, JSON.stringify(vendors));
      window.dispatchEvent(new CustomEvent('masterbook-section-changed', { detail: { section: 'vendors' } }));
    }
    data.vendor              = vendorInfo?.name || '';
    data.vendorPhone         = vendorInfo?.phone || '';
    data.vendorStreetAddress = vendorInfo?.streetAddress || '';
    data.vendorCityStateZip  = vendorInfo?.cityStateZip || '';

    // Resolve Credit Card / Petty Cash envelope pickers — neither is a
    // named form field, so FormData never sees them directly.
    const cardInfo = resolveCard(c);
    data.ccCardholderName = cardInfo?.cardholderName || '';
    data.ccCardType       = cardInfo?.cardType || '';
    data.ccLast4          = cardInfo?.last4 || '';

    data.pettyCashEnvelopeId = resolveEnvelope(c);

    data.w9Attached           = (form.querySelector('#f-w9')?.files?.length ?? 0) > 0;
    data.payMethodDocAttached = (form.querySelector('#f-pay-doc')?.files?.length ?? 0) > 0;

    const vendorSlug = (data.vendor || 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const today  = new Date().toISOString().slice(0, 10);
    if (data.w9Attached)           data.w9Filename    = `W9_${vendorSlug}_${today}.pdf`;
    if (data.payMethodDocAttached) data.payDocFilename = `Payment_Method_${vendorSlug}_${today}.pdf`;

    // Stamp who submitted this. The user id is the durable identity — it is
    // what "My Book" filters on and what an approver is accountable to. The
    // name is a display snapshot taken now, for the same reason a card stores
    // its cardholder name: a submission's paperwork should keep reading the
    // way it read when it was filed, even if that person is later renamed or
    // leaves the project. Existing records predate this and have neither.
    const me = get(authUser);
    if (me) {
      data.submittedByUserId = me.id;
      data.submittedBy = getDisplayName(me);
    }

    data.isReturn = data.method === 'Return';
    data.isQuote  = isQuote(c);
    data.amount   = parseFloat(data.amount) || 0;
    // Status is no longer picked by hand — it's derived. A Return is always a
    // refund, a quote sits outside the approval queue, and everything else
    // takes the status of whichever button was pressed.
    if (data.isReturn) {
      data.status = 'Refunded';
      data.amount = -Math.abs(data.amount);
    } else if (data.isQuote) {
      data.status = 'Quote';
    } else {
      data.status = status;
    }

    if (data.type === 'Purchase Order') {
      data.poNumber    = assignPONumber();
      data.poLineItems = collectPOLineItems(c);
    }

    const { folder, alert } = assignFolder(data.method, data.linkedFolder || null);
    data.folder = folder;

    const alertEl = c.querySelector('#folder-alert');
    if (alert) { alertEl.textContent = alert; alertEl.classList.add('visible'); }
    else        { alertEl.classList.remove('visible'); }

    // Receipt: normalized to PDF back in handleFile(). A draft save stages
    // it in Supabase Storage (needs the purchase's id up front, so it's
    // generated here rather than left to addPurchase's default); a direct
    // submission just holds it as a data: URL on the record itself until
    // it's later filed into Dropbox when its CC Log gets generated.
    const receiptBytes = await c._receiptPdfBytesPromise;
    if (receiptBytes) {
      if (isDraft) {
        data.id = data.id || crypto.randomUUID();
        const projectId = getActiveProjectId();
        data.receiptUrl = projectId
          ? await uploadDraftReceipt(projectId, data.id, receiptBytes)
          : null;
      } else {
        let binary = '';
        for (const byte of receiptBytes) binary += String.fromCharCode(byte);
        data.receiptUrl = `data:application/pdf;base64,${btoa(binary)}`;
      }
    }

    addPurchase(data);
    form.reset();
    c.querySelectorAll('.ocr-filled').forEach(el => el.classList.remove('ocr-filled'));
    clearPreview(c);
    c.querySelectorAll('.doc-filename').forEach(el => el.textContent = '');
    const poTbody = c.querySelector('#po-line-tbody');
    if (poTbody) poTbody.innerHTML = '';
    loadVendors(c);
    refreshVendorSelect(c);
    updateVendorVisibility(c);
    updateConditionalFields(c);

    if (!isDraft) {
      onDone?.('submitted');
    } else {
      setOcrStatus(c.querySelector('#ocr-status'), 'Draft saved to profile.', 'success');
    }
  }

  /* ── Mount ── */
  onMount(() => {
    if (!container) return;

    // Set pdfjsLib worker
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    container.innerHTML = buildHTML();
    const c        = container;
    const form     = c.querySelector('#sub-form');
    const fileInput = c.querySelector('#f-receipt');
    const vendorSel = c.querySelector('#f-vendor-select');

    fileInput.addEventListener('change', () => handleFile(fileInput, c));
    c.querySelectorAll('input[name="type"]').forEach(r =>
      r.addEventListener('change', () => {
        // A hand-picked type supersedes the OCR guess highlight.
        c.querySelector('#f-type-list')?.classList.remove('ocr-filled');
        updateConditionalFields(c);
      }));
    c.querySelector('#f-is-quote').addEventListener('change', () => updateConditionalFields(c));

    loadVendors(c);
    refreshVendorSelect(c);
    vendorSel.addEventListener('change', () => { updateVendorVisibility(c); refreshDocFilenames(c); });
    updateVendorVisibility(c);

    loadCards(c);
    refreshCardSelect(c);

    loadEnvelopes(c);
    refreshEnvelopeSelect(c);

    c.querySelector('#btn-add-po-line').addEventListener('click', () => addPOLineRow(c));

    // Deep-link from Purchase Orders view's "+ New PO" shortcut
    const pendingType = sessionStorage.getItem('masterbook-pending-submit-type');
    if (pendingType) {
      sessionStorage.removeItem('masterbook-pending-submit-type');
      setType(c, pendingType);
    }

    updateConditionalFields(c);

    c.querySelector('#f-w9').addEventListener('change',      e => handleSupportingDoc(e.target, 'w9',  c));
    c.querySelector('#f-pay-doc').addEventListener('change', e => handleSupportingDoc(e.target, 'pay', c));

    c.querySelector('#btn-prev-page').addEventListener('click', () => {
      const pg = (c._previewCurrentPage ?? 1) - 1;
      if (pg >= 1) renderPreviewPage(c, pg);
    });
    c.querySelector('#btn-next-page').addEventListener('click', () => {
      const total = c._previewPdf?.numPages ?? 1;
      const pg    = (c._previewCurrentPage ?? 1) + 1;
      if (pg <= total) renderPreviewPage(c, pg);
    });

    // Normalizing/uploading a receipt can take a moment (real network time
    // for the Supabase Storage call) — without this, the button visibly
    // does nothing until it resolves, which reads as broken.
    async function withButtonLoading(activeBtn, loadingLabel, fn) {
      const submitBtn = c.querySelector('#btn-submit');
      const saveBtn   = c.querySelector('#btn-save-profile');
      const originalLabel = activeBtn.textContent;
      [submitBtn, saveBtn].forEach(b => { if (b) b.disabled = true; });
      activeBtn.textContent = loadingLabel;
      try {
        await fn();
      } finally {
        [submitBtn, saveBtn].forEach(b => { if (b) b.disabled = false; });
        activeBtn.textContent = originalLabel;
      }
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!validateForm(form, c)) return;
      await withButtonLoading(c.querySelector('#btn-submit'), 'Submitting…',
        () => submitRecord(form, c, 'In Review'));
    });

    c.querySelector('#btn-save-profile').addEventListener('click', async () => {
      if (!validateMinimal(form, c)) return;
      await withButtonLoading(c.querySelector('#btn-save-profile'), 'Saving…',
        () => submitRecord(form, c, 'Submitted', true));
    });

    c.querySelector('#btn-review-later').addEventListener('click', () => {
      onDone?.('cancel');
    });

    attachScanListeners(c, fileInput);
  });
</script>

<div bind:this={container}></div>

<style>
  div {
    height: 100%;
  }
</style>
