/* ============================================================
   The Masterbook — submissionForm.js
   Two-panel layout: live PDF/image preview (left) + form (right)
   Vision-based autofill via Anthropic API (image + text context)
   ============================================================ */

import { addPurchase, assignFolder, updatePurchase } from './data.js?v=6';
import { getBudgetLineMap } from './budget.js?v=24';

/* ── PDF.js worker ── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ── Anthropic API Config ── */
const ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;  // 25 MB
const MAX_SUPPORT_BYTES = 10 * 1024 * 1024;  // 10 MB

/* ── Entry Point ── */
export function renderSubmissionForm(container, onDone) {
  container.innerHTML = buildHTML();
  attachListeners(container, onDone);
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
                  Receipt / Invoice <span class="req">*</span>
                </label>
                <div class="receipt-input-row">
                  <input
                    type="file"
                    id="f-receipt"
                    name="receipt"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,image/*"
                  />
                  <button type="button" class="btn btn--ghost btn--sm" id="btn-scan-doc" title="Scan document with camera">📷 Scan</button>
                </div>
                <span class="field-error" id="err-receipt"></span>
                <div id="ocr-status" class="ocr-status">Ready</div>
                <!-- Camera scan modal -->
                <div class="scan-overlay hidden" id="scan-overlay">
                  <div class="scan-modal">
                    <div class="scan-header"><span>Scan Document</span><button class="btn btn--ghost btn--sm" id="scan-close">✕</button></div>
                    <video id="scan-video" autoplay playsinline class="scan-video"></video>
                    <canvas id="scan-canvas" class="hidden"></canvas>
                    <div class="scan-actions">
                      <button type="button" class="btn btn--primary" id="scan-capture">Capture</button>
                      <button type="button" class="btn btn--ghost" id="scan-retake" class="hidden">Retake</button>
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
                <label for="f-vendor">Vendor <span class="req">*</span></label>
                <input
                  type="text"
                  id="f-vendor"
                  name="vendor"
                  placeholder="Upload receipt to autofill"
                  required
                />
                <span class="field-error" id="err-vendor"></span>
              </div>

              <!-- Amount (no spinner) -->
              <div class="field">
                <label for="f-amount">Amount ($) <span class="req">*</span></label>
                <input
                  type="number"
                  id="f-amount"
                  name="amount"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  required
                />
                <span class="field-error" id="err-amount"></span>
              </div>

              <!-- Status -->
              <div class="field">
                <label for="f-status">Status <span class="req">*</span></label>
                <select id="f-status" name="status" required>
                  <option value="">Select…</option>
                  <option value="In Review">Submit for Approval</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Quote">Quote</option>
                  <option value="Refunded">Refunded</option>
                </select>
                <span class="field-error" id="err-status"></span>
              </div>

              <!-- Method -->
              <div class="field">
                <label for="f-method">Payment Method</label>
                <select id="f-method" name="method">
                  <option value="CC">Credit Card (CC)</option>
                  <option value="PO-CC">PO via Credit Card (PO-CC)</option>
                  <option value="PO">Purchase Order (PO)</option>
                  <option value="Check">Check</option>
                  <option value="Debit">Debit</option>
                  <option value="ACH">ACH / Wire Transfer</option>
                  <option value="Return">Return</option>
                </select>
              </div>

              <!-- CC Last 4 (conditional) -->
              <div class="field field--conditional" id="field-cc-last4">
                <label for="f-cc-last4">CC Last 4 Digits</label>
                <input
                  type="text"
                  id="f-cc-last4"
                  name="ccLast4"
                  maxlength="4"
                  pattern="[0-9]{4}"
                  placeholder="1234"
                  inputmode="numeric"
                />
                <span class="field-error" id="err-cc-last4"></span>
              </div>

              <!-- Linked Folder (conditional, Return only) -->
              <div class="field field--conditional" id="field-linked-folder">
                <label for="f-linked-folder">Linked Folder # (original)</label>
                <input
                  type="text"
                  id="f-linked-folder"
                  name="linkedFolder"
                  placeholder="e.g. 0002"
                />
                <span class="field-error" id="err-linked-folder"></span>
              </div>

              <!-- Description -->
              <div class="field field--full">
                <label for="f-description">Description</label>
                <input
                  type="text"
                  id="f-description"
                  name="description"
                  placeholder="Brief description (autofilled from receipt)"
                  maxlength="120"
                />
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
                <input
                  type="text"
                  id="f-line-item"
                  name="lineItem"
                  placeholder="e.g. 5200 – Camera Equipment"
                />
              </div>

              <!-- Notes (autofilled with line-item summary) -->
              <div class="field field--full">
                <label for="f-notes">Notes</label>
                <textarea
                  id="f-notes"
                  name="notes"
                  rows="3"
                  placeholder="Autofilled with line-item summary from receipt…"
                ></textarea>
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

/* ── Listeners ── */
function attachListeners(container, onDone) {
  const form      = container.querySelector('#sub-form');
  const fileInput = container.querySelector('#f-receipt');
  const methodSel = container.querySelector('#f-method');

  // Receipt upload → OCR + preview
  fileInput.addEventListener('change', () => handleFile(fileInput, container));

  // Scan document with camera
  _attachScanListeners(container, fileInput);

  // Method / Status change → conditional fields
  methodSel.addEventListener('change', () => updateConditionalFields(container));
  const statusSel = container.querySelector('#f-status');
  if (statusSel) statusSel.addEventListener('change', () => updateConditionalFields(container));
  updateConditionalFields(container);

  // Supporting doc uploads
  container.querySelector('#f-w9').addEventListener('change', e =>
    handleSupportingDoc(e.target, 'w9', container)
  );
  container.querySelector('#f-pay-doc').addEventListener('change', e =>
    handleSupportingDoc(e.target, 'pay', container)
  );

  // Vendor → refresh doc filenames
  container.querySelector('#f-vendor').addEventListener('input', () =>
    refreshDocFilenames(container)
  );

  // Preview pagination
  container.querySelector('#btn-prev-page').addEventListener('click', () => {
    const pg = (container._previewCurrentPage ?? 1) - 1;
    if (pg >= 1) renderPreviewPage(container, pg);
  });
  container.querySelector('#btn-next-page').addEventListener('click', () => {
    const total = container._previewPdf?.numPages ?? 1;
    const pg    = (container._previewCurrentPage ?? 1) + 1;
    if (pg <= total) renderPreviewPage(container, pg);
  });

  // Submit for review
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm(form, container)) return;
    submitRecord(form, container, 'In Review', onDone);
  });

  // Save to profile (draft — no file required)
  container.querySelector('#btn-save-profile').addEventListener('click', () => {
    if (!validateMinimal(form, container)) return;
    submitRecord(form, container, 'Submitted', onDone, true);
  });

  // Review later — discard without saving
  container.querySelector('#btn-review-later').addEventListener('click', () => {
    onDone?.('cancel');
  });
}

/* ── Conditional Field Visibility ── */
function updateConditionalFields(container) {
  const method = container.querySelector('#f-method').value;

  container.querySelector('#field-cc-last4').classList.toggle('visible',
    method === 'CC' || method === 'PO-CC'
  );

  container.querySelector('#field-linked-folder').classList.toggle('visible',
    method === 'Return'
  );

  // Supporting docs: required only for PO (not PO-CC), and not for Quotes
  const statusVal = container.querySelector('#f-status')?.value;
  const docsRequired = method === 'PO' && statusVal !== 'Quote';
  ['w9', 'pay'].forEach(key => {
    const reqId  = key === 'w9' ? 'w9-req-marker'   : 'pay-doc-req-marker';
    const itemId = key === 'w9' ? 'doc-item-w9'     : 'doc-item-pay';
    const noteId = key === 'w9' ? 'w9-doc-note'     : 'pay-doc-note';
    const reqEl  = container.querySelector('#' + reqId);
    const itemEl = container.querySelector('#' + itemId);
    const noteEl = container.querySelector('#' + noteId);
    if (reqEl)  reqEl.style.display = docsRequired ? 'inline' : 'none';
    if (itemEl) itemEl.classList.toggle('doc-required', docsRequired);
    if (noteEl) {
      noteEl.textContent = docsRequired ? 'Required for PO · PDF, max 10 MB' : 'PDF, max 10 MB';
      noteEl.className   = docsRequired ? 'doc-note doc-note--required' : 'doc-note';
    }
  });

  refreshDocFilenames(container);
}

/* ── File Handler (Receipt) ── */
async function handleFile(input, container) {
  const file = input.files?.[0];

  // File cleared
  if (!file) {
    clearPreview(container);
    return;
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    const errEl = container.querySelector('#err-receipt');
    if (errEl) errEl.textContent = 'File exceeds 25 MB limit.';
    input.value = '';
    return;
  }

  container.querySelector('#err-receipt').textContent = '';

  // Clear all previously autofilled values before processing new file
  clearOcrFields(container);

  const ocr = container.querySelector('#ocr-status');
  setOcrStatus(ocr, 'Loading file…', '');

  // Parse filename immediately as a reliable baseline
  const filenameParsed = parseFilename(file.name);

  // Start preview render concurrently (don't await — let OCR run in parallel)
  renderPreview(file, container).catch(err => console.warn('[Preview]', err));

  try {
    const isPdf = file.type === 'application/pdf';
    let imageData     = null;
    let extractedText = '';

    if (isPdf) {
      setOcrStatus(ocr, 'Rendering PDF…', '');
      const result  = await processPdf(file);
      imageData     = result.imageData;
      extractedText = result.text;
    } else {
      setOcrStatus(ocr, 'Reading image…', '');
      imageData = await imageFileToBase64(file);
    }

    const apiKey = getStoredApiKey();
    let ocrParsed;

    if (apiKey) {
      setOcrStatus(ocr, 'Analyzing with AI vision…', '');
      try {
        ocrParsed = await ocrViaAnthropic(imageData, extractedText, apiKey);
      } catch (apiErr) {
        console.warn('[OCR] Anthropic API failed, falling back to regex:', apiErr.message);
        ocrParsed = ocrViaRegex(extractedText);
      }
    } else {
      ocrParsed = ocrViaRegex(extractedText);
    }

    // Merge: OCR takes priority; filename fills any gaps
    const parsed = mergeOcrWithFilename(ocrParsed, filenameParsed);

    applyOcrResults(parsed, container);
    setOcrStatus(ocr, 'Autofilled from receipt — please verify before submitting.', 'success');

  } catch (err) {
    console.error('[OCR]', err);
    // Even on full failure, apply whatever the filename gave us
    applyOcrResults(filenameParsed, container);
    setOcrStatus(ocr, 'Autofilled from filename — AI read failed. Please verify.', 'success');
  }
}

/* ── Clear OCR Fields (called before re-processing a new file) ── */
function clearOcrFields(container) {
  ['f-vendor', 'f-date', 'f-amount', 'f-cc-last4', 'f-description', 'f-charge-type', 'f-notes'].forEach(id => {
    const el = container.querySelector('#' + id);
    if (!el) return;
    el.value = '';
    el.classList.remove('ocr-filled', 'invalid');
  });
  // Reset method to CC default
  const methodEl = container.querySelector('#f-method');
  if (methodEl) {
    methodEl.value = 'CC';
    methodEl.classList.remove('ocr-filled');
    updateConditionalFields(container);
  }
  // Clear any status errors on required fields
  ['err-vendor', 'err-date', 'err-amount'].forEach(id => {
    const el = container.querySelector('#' + id);
    if (el) el.textContent = '';
  });
}

/* ── PDF Processing: page 1 → image + full text ── */
async function processPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Extract text from all pages for supplemental context
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }

  // Render page 1 as JPEG for vision API
  const page     = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 }); // higher = better logo resolution
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

/* ── Image File → base64 ── */
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

/* ── Preview Panel ── */
async function renderPreview(file, container) {
  const layout    = container.querySelector('#submission-layout');
  const canvas    = container.querySelector('#preview-canvas');
  const img       = container.querySelector('#preview-img');
  const placeholder = container.querySelector('#preview-placeholder');
  const pagination  = container.querySelector('#preview-pagination');
  const filenameEl  = container.querySelector('#preview-filename');

  // Reset state
  container._previewPdf         = null;
  container._previewCurrentPage = 1;
  canvas.classList.add('hidden');
  img.classList.add('hidden');
  placeholder.classList.remove('hidden');
  pagination.classList.add('hidden');

  filenameEl.textContent = file.name;
  layout.classList.add('has-preview');

  if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    container._previewPdf = pdf;

    if (pdf.numPages > 1) pagination.classList.remove('hidden');

    placeholder.classList.add('hidden');
    canvas.classList.remove('hidden');
    await renderPreviewPage(container, 1);

  } else {
    // Image (JPG, PNG, HEIC)
    const url = URL.createObjectURL(file);
    img.src   = url;
    img.onload = () => URL.revokeObjectURL(url);
    placeholder.classList.add('hidden');
    img.classList.remove('hidden');
  }
}

async function renderPreviewPage(container, pageNum) {
  const pdf = container._previewPdf;
  if (!pdf) return;

  const canvas     = container.querySelector('#preview-canvas');
  const wrap       = container.querySelector('#preview-canvas-wrap');
  const pageInfoEl = container.querySelector('#preview-page-info');

  const page      = await pdf.getPage(pageNum);
  const wrapWidth = wrap.clientWidth || 460;
  const nv        = page.getViewport({ scale: 1 });
  const dpr       = window.devicePixelRatio || 1;
  const scale     = ((wrapWidth - 24) / nv.width) * dpr;   // HiDPI-aware
  const viewport  = page.getViewport({ scale });

  // Physical canvas size = CSS size × dpr (crisp on Retina displays)
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width  = (viewport.width  / dpr) + 'px';
  canvas.style.height = (viewport.height / dpr) + 'px';

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  container._previewCurrentPage = pageNum;
  if (pageInfoEl) pageInfoEl.textContent = `${pageNum} / ${pdf.numPages}`;
}

function clearPreview(container) {
  const layout = container.querySelector('#submission-layout');
  if (layout) layout.classList.remove('has-preview');
  container._previewPdf         = null;
  container._previewCurrentPage = 1;
  const canvas = container.querySelector('#preview-canvas');
  const img    = container.querySelector('#preview-img');
  if (canvas) canvas.classList.add('hidden');
  if (img)    img.classList.add('hidden');
  container.querySelector('#preview-placeholder')?.classList.remove('hidden');
  container.querySelector('#preview-pagination')?.classList.add('hidden');
  container.querySelector('#preview-filename').textContent = 'No file selected';
}

/* ── Filename Parser ──
   Handles conventions like:
     214_Fotokem_02.17.26_AMEX1017_$1311.80pdf.pdf
     011_Geneva Films_02.18.26_ACH_$750.pdf
     005_Keslow Camera_01.10.26_PO_$8200.00.pdf
─────────────────────────────────────────────── */
function parseFilename(filename) {
  const result = { vendor: null, date: null, amount: null, method: null, ccLast4: null };

  // Strip extension — handles messy names like "$1311.80pdf.pdf"
  const base = filename
    .replace(/\.pdf$/i, '')   // remove trailing .pdf
    .replace(/pdf$/i, '');    // remove any residual trailing "pdf" word

  const parts = base.split('_');
  if (parts.length < 2) return result;

  // Skip leading numeric segment (folder/invoice number)
  let idx = /^\d+$/.test(parts[0]) ? 1 : 0;

  // Collect vendor words until we hit a date, amount, or known method token
  const dateRe   = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
  const amountRe = /^\$?[\d,]+(\.\d+)?$/;
  const methodRe = /^(AMEX|VISA|MC|DISC|MASTERCARD|CC|PO|ACH|CHECK|DEBIT|RETURN)/i;

  const vendorParts = [];
  while (idx < parts.length) {
    const p = parts[idx];
    if (dateRe.test(p) || amountRe.test(p) || (methodRe.test(p) && vendorParts.length > 0)) break;
    vendorParts.push(p);
    idx++;
  }
  if (vendorParts.length > 0) result.vendor = vendorParts.join(' ').trim();

  // Parse the remaining tokens for date, method, amount
  for (let i = idx; i < parts.length; i++) {
    const p = parts[i];

    // Date MM.DD.YY or MM.DD.YYYY
    if (dateRe.test(p)) {
      const [mo, dy, yr] = p.split('.');
      const year = yr.length === 2 ? '20' + yr : yr;
      result.date = `${year}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
      continue;
    }

    // Amount $750 / $1311.80 / 750
    const amtMatch = p.match(/^\$?([\d,]+(?:\.\d+)?)/);
    if (amtMatch) {
      const n = parseFloat(amtMatch[1].replace(/,/g, ''));
      if (!isNaN(n)) { result.amount = n; continue; }
    }

    // CC network + last 4: AMEX1017, VISA4892
    const ccMatch = p.match(/^(AMEX|VISA|MC|DISC(?:OVER)?|MASTERCARD)(\d{4})/i);
    if (ccMatch) {
      result.method  = 'CC';
      result.ccLast4 = ccMatch[2];
      continue;
    }

    // Bare method tokens
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

/* ── Merge OCR + Filename — OCR wins, filename fills gaps ── */
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

/* ── OCR via Anthropic Vision API ── */
async function ocrViaAnthropic(imageData, extractedText, apiKey) {
  const textHint = extractedText
    ? `\n\nExtracted text (supplemental context — may be incomplete if vendor is a logo):\n${extractedText.slice(0, 4000)}`
    : '';

  const prompt = `You are analyzing a receipt, invoice, or purchase order from a film production. Examine the image carefully.

Extract the following fields and return as a JSON object with EXACTLY these keys:

- vendor: The SELLER's business name. This is your HIGHEST PRIORITY field — always return something. Strategy: (1) Read the very top of the document visually — look for a logo, wordmark, letterhead, or the largest/boldest text at the top. Read logos visually even if stylized. (2) Look for "From:", "Vendor:", "Bill From:", "Issued by:" labels. (3) The vendor is the company that sent this invoice, NOT the client/production company. (4) If the document says "Invoice to: [Production Co]" or "Bill to: [name]", those are NOT the vendor. (5) Look for a business name above or near an address block — that is typically the vendor. (6) If you see text like "Geneva Films LLC", "Fotokem", "Keslow Camera" near the top, that is the vendor. NEVER return null for vendor — make your best guess even if uncertain.
- date: Invoice/receipt date in YYYY-MM-DD format, or null
- amount: The final GRAND TOTAL as a number (no $ sign, no commas). Use the bottom-line total. If multiple totals exist, use the largest final amount.
- method: Payment method — one of "CC", "PO-CC", "PO", "Check", "Debit", "ACH", "Return", or null. Infer from: card network names (Visa/Mastercard/AMEX/Discover), card digits, "PO #" / "Purchase Order", "Check #", "Debit", "ACH" / "Wire Transfer" / "Bank Transfer", etc.
- ccLast4: Last 4 digits of the credit card as a string (e.g. "1017"), or null if not shown
- chargeType: The category of purchase (e.g. "Lab Processing", "Equipment Rental", "Catering", "Fuel", "Camera Equipment", "Grip & Electric", "Props", "Transportation"), or null
- description: A clear 6–10 word summary of the core purchase (e.g. "Film processing and scanning, 16mm negative", "Generator rental weekly", "Camera package ARRI Alexa Mini LF")
- lineItemSummary: A detailed 2–4 sentence summary of ALL line items/services on this document, including quantities, rates, dates of service, and what each charge covers. This becomes the submission notes.

Rules:
- Return ONLY valid JSON. No markdown fencing. No explanation outside the JSON.
- vendor must ALWAYS have a value — never null.
- For all other fields: if cannot be determined with confidence, use null.${textHint}`;

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
          {
            type: 'image',
            source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  }

  const result   = await response.json();
  const raw      = result.content?.[0]?.text ?? '';
  const jsonText = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(jsonText);
}

/* ── OCR via Regex Fallback (PDF text only, no vision) ── */
function ocrViaRegex(text) {
  const parsed = {
    vendor: null, date: null, amount: null,
    method: null, ccLast4: null, chargeType: null,
    description: null, lineItemSummary: null,
  };

  if (!text) return parsed;

  // Amount — largest dollar figure
  const amtMatches = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(n => !isNaN(n));
  if (amtMatches.length) parsed.amount = Math.max(...amtMatches);

  // Date
  const datePatterns = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      if (pat === datePatterns[0]) {
        parsed.date = m[1];
      } else if (pat === datePatterns[1]) {
        parsed.date = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
      } else {
        const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const mo = String(months.findIndex(n => m[1].toLowerCase().startsWith(n)) + 1).padStart(2,'0');
        parsed.date = `${m[3]}-${mo}-${m[2].padStart(2,'0')}`;
      }
      break;
    }
  }

  // CC last 4
  const ccMatch = text.match(/(?:x{3,}|\*{3,}|ending\s*(?:in)?\s*)(\d{4})/i);
  if (ccMatch) parsed.ccLast4 = ccMatch[1];

  // Payment method
  if (/purchase\s+order|PO\s*#|PO\s*No/i.test(text))  parsed.method = 'PO';
  else if (/ACH|wire\s+transfer|bank\s+transfer|direct\s+deposit/i.test(text)) parsed.method = 'ACH';
  else if (/check\s*#|cheque/i.test(text))              parsed.method = 'Check';
  else if (/debit/i.test(text))                         parsed.method = 'Debit';
  else if (parsed.ccLast4 || /credit\s+card|visa|mastercard|amex|american\s+express|discover/i.test(text))
    parsed.method = 'CC';

  // Vendor — scan first 15 lines for the most likely business name
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const skipPatterns = [
    /^\d/,               // starts with digit
    /\$/,                // dollar sign
    /\d{1,2}\/\d{1,2}\/\d{4}/, // date
    /invoice|receipt|purchase order|bill to|ship to|remit to|statement|page \d/i,
    /^(www\.|http|@|tel:|fax:|ph:)/i,
    /^\s*$/,
  ];
  const vendorCandidate = lines.slice(0, 15).find(line =>
    line.length > 2 && line.length < 80 &&
    !skipPatterns.some(pat => pat.test(line))
  );
  if (vendorCandidate) parsed.vendor = vendorCandidate;

  return parsed;
}

/* ── Apply OCR Results to Form ── */
function applyOcrResults(parsed, container) {
  if (!parsed) return;

  function fill(id, value) {
    if (value === null || value === undefined || value === '') return;
    const el = container.querySelector('#' + id);
    if (!el) return;
    // Always show two decimal places for amount inputs
    el.value = (id === 'f-amount') ? Number(value).toFixed(2) : String(value);
    el.classList.add('ocr-filled');
  }

  fill('f-vendor',      parsed.vendor);
  fill('f-date',        parsed.date);
  fill('f-amount',      parsed.amount);
  fill('f-cc-last4',    parsed.ccLast4);
  fill('f-charge-type', parsed.chargeType);
  fill('f-description', parsed.description);
  fill('f-notes',       parsed.lineItemSummary);

  // Set method — default to PO when nothing detected
  const methodEl = container.querySelector('#f-method');
  if (methodEl) {
    if (parsed.method) {
      methodEl.value = parsed.method;
      methodEl.classList.add('ocr-filled');
    } else {
      methodEl.value = 'PO';
    }
    updateConditionalFields(container);
  }

  // If CC last 4 was filled and method is CC, make sure conditional field shows
  if (parsed.ccLast4) refreshDocFilenames(container);
}

/* ── Supporting Doc Handler ── */
function handleSupportingDoc(input, key, container) {
  const errId      = key === 'w9' ? 'err-w9'       : 'err-pay-doc';
  const filenameId = key === 'w9' ? 'w9-filename'  : 'pay-doc-filename';
  const errEl      = container.querySelector('#' + errId);
  const nameEl     = container.querySelector('#' + filenameId);

  const file = input.files?.[0];
  if (!file) { if (nameEl) nameEl.textContent = ''; return; }

  if (file.type !== 'application/pdf') {
    if (errEl) errEl.textContent = 'Only PDF files are accepted.';
    input.value = '';
    if (nameEl) nameEl.textContent = '';
    return;
  }
  if (file.size > MAX_SUPPORT_BYTES) {
    if (errEl) errEl.textContent = 'File exceeds 10 MB limit.';
    input.value = '';
    if (nameEl) nameEl.textContent = '';
    return;
  }

  if (errEl) errEl.textContent = '';
  showGeneratedFilename(key, container);
}

function showGeneratedFilename(key, container) {
  const vendor     = container.querySelector('#f-vendor')?.value.trim() || 'Unknown';
  const today      = new Date().toISOString().slice(0, 10);
  const safeVendor = vendor.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  const filename   = key === 'w9'
    ? `W9_${safeVendor}_${today}.pdf`
    : `Payment_Method_${safeVendor}_${today}.pdf`;
  const nameEl = container.querySelector(key === 'w9' ? '#w9-filename' : '#pay-doc-filename');
  if (nameEl) nameEl.textContent = `Will be saved as: ${filename}`;
}

function refreshDocFilenames(container) {
  if (container.querySelector('#f-w9')?.files?.length)      showGeneratedFilename('w9',  container);
  if (container.querySelector('#f-pay-doc')?.files?.length) showGeneratedFilename('pay', container);
}

/* ── Form Submission ── */
function submitRecord(form, container, status, onDone, isDraft = false) {
  const fd   = new FormData(form);
  const data = {};
  for (const [k, v] of fd.entries()) {
    if (['receipt', 'w9File', 'payDocFile'].includes(k)) continue;
    data[k] = v;
  }

  data.w9Attached           = (form.querySelector('#f-w9')?.files?.length ?? 0) > 0;
  data.payMethodDocAttached = (form.querySelector('#f-pay-doc')?.files?.length ?? 0) > 0;

  const vendor = (data.vendor || 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  const today  = new Date().toISOString().slice(0, 10);
  if (data.w9Attached)           data.w9Filename    = `W9_${vendor}_${today}.pdf`;
  if (data.payMethodDocAttached) data.payDocFilename = `Payment_Method_${vendor}_${today}.pdf`;

  data.isReturn = data.method === 'Return';
  data.isQuote  = data.status === 'Quote';
  data.amount   = parseFloat(data.amount) || 0;
  // Refund entries always get Refunded status and negative amount
  if (data.isReturn) {
    data.status = 'Refunded';
    data.amount = -Math.abs(data.amount);
  } else {
    data.status = data.status || status;
  }

  const { folder, alert } = assignFolder(data.method, data.linkedFolder || null);
  data.folder = folder;

  const alertEl = container.querySelector('#folder-alert');
  if (alert) { alertEl.textContent = alert; alertEl.classList.add('visible'); }
  else        { alertEl.classList.remove('visible'); }

  addPurchase(data);
  form.reset();
  clearOcrHighlights(container);
  clearPreview(container);
  container.querySelectorAll('.doc-filename').forEach(el => el.textContent = '');
  updateConditionalFields(container);

  if (!isDraft) {
    onDone?.('submitted');
  } else {
    setOcrStatus(container.querySelector('#ocr-status'), 'Draft saved to profile.', 'success');
  }
}

/* ── Validation ── */
function validateForm(form, container) {
  let ok = true;
  ok = requireFile(form.querySelector('#f-receipt'), container.querySelector('#err-receipt'),
    'A receipt file is required.') && ok;
  ok = requireField('f-vendor', 'err-vendor', form, container) && ok;
  ok = requireField('f-date',   'err-date',   form, container) && ok;
  ok = requireField('f-amount', 'err-amount', form, container) && ok;
  ok = requireField('f-status', 'err-status', form, container) && ok;

  const selectedStatus = form.querySelector('#f-status')?.value;
  if (form.querySelector('#f-method').value === 'PO' && selectedStatus !== 'Quote') {
    ok = requireFile(form.querySelector('#f-w9'), container.querySelector('#err-w9'),
      'W9 required for Purchase Orders.') && ok;
    ok = requireFile(form.querySelector('#f-pay-doc'), container.querySelector('#err-pay-doc'),
      'ACH / Wire info required for Purchase Orders.') && ok;
  }
  return ok;
}

function validateMinimal(form, container) {
  let ok = true;
  ok = requireField('f-vendor', 'err-vendor', form, container) && ok;
  ok = requireField('f-date',   'err-date',   form, container) && ok;
  ok = requireField('f-amount', 'err-amount', form, container) && ok;
  return ok;
}

function requireFile(input, errEl, message) {
  if (!input?.files || input.files.length === 0) {
    if (errEl) errEl.textContent = message;
    input?.classList.add('invalid');
    return false;
  }
  if (errEl) errEl.textContent = '';
  input.classList.remove('invalid');
  return true;
}

function requireField(inputId, errId, form, container) {
  const el  = form.querySelector('#' + inputId);
  const err = container.querySelector('#' + errId);
  if (!el) return true;
  if (!el.value.trim()) {
    if (err) err.textContent = 'This field is required.';
    el.classList.add('invalid');
    return false;
  }
  if (err) err.textContent = '';
  el.classList.remove('invalid');
  return true;
}

/* ── Helpers ── */
function clearOcrHighlights(container) {
  container.querySelectorAll('.ocr-filled').forEach(el => el.classList.remove('ocr-filled'));
}

function setOcrStatus(el, message, type) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  el.classList.remove('ocr--success', 'ocr--error');
  if (type === 'success') el.classList.add('ocr--success');
  if (type === 'error')   el.classList.add('ocr--error');
}

/* ── Vendor Detection (preserved, not auto-applied) ── */
function detectVendorFromText(text) { // eslint-disable-line no-unused-vars
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.slice(0, 5).find(line =>
    line.length > 3 && line.length < 60 &&
    !/^\d/.test(line) && !/\$/.test(line) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(line)
  ) ?? null;
}

/* ── API Key (dev helper) ── */
// Production: proxy API calls through a server endpoint.
// Dev/prototype: localStorage.setItem('anthropic-api-key', 'sk-ant-...')
function getStoredApiKey() {
  return localStorage.getItem('anthropic-api-key') ?? null;
}

/* ══════════════════════════════════════════════════════════════
   REVIEW / EDIT FORM
   Uses its own HTML layout (Charge Type next to Method, multi-
   line-item coding table replacing Description).
   ══════════════════════════════════════════════════════════════ */

function buildReviewHTML() {
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
              <span>Upload a replacement receipt<br>to preview it here</span>
            </div>
            <canvas id="preview-canvas" class="hidden"></canvas>
            <img id="preview-img" class="hidden" alt="Receipt preview" />
          </div>
        </aside>

        <!-- ── Right: Form Panel ── -->
        <div class="form-panel">
          <h2>Review Submission</h2>

          <form id="sub-form" novalidate autocomplete="off">
            <div class="form-grid">

              <!-- Receipt / Invoice (optional replacement) -->
              <div class="field field--full">
                <label for="f-receipt">Receipt / Invoice</label>
                <input type="file" id="f-receipt" name="receipt"
                       accept=".pdf,.jpg,.jpeg,.png,.heic,image/*" />
                <span class="field-error" id="err-receipt"></span>
                <div id="ocr-status" class="ocr-status">Upload a new file to replace the receipt</div>
              </div>

              <!-- Date | Vendor -->
              <div class="field">
                <label for="f-date">Date <span class="req">*</span></label>
                <input type="date" id="f-date" name="date" required />
                <span class="field-error" id="err-date"></span>
              </div>

              <div class="field">
                <label for="f-vendor">Vendor <span class="req">*</span></label>
                <input type="text" id="f-vendor" name="vendor" required />
                <span class="field-error" id="err-vendor"></span>
              </div>

              <!-- Amount | Method -->
              <div class="field">
                <label for="f-amount">Total Amount ($) <span class="req">*</span></label>
                <input type="number" id="f-amount" name="amount"
                       min="0" step="0.01" placeholder="0.00" required />
                <span class="field-error" id="err-amount"></span>
              </div>

              <div class="field">
                <label for="f-method">Payment Method</label>
                <select id="f-method" name="method">
                  <option value="CC">Credit Card (CC)</option>
                  <option value="PO-CC">PO via Credit Card (PO-CC)</option>
                  <option value="PO">Purchase Order (PO)</option>
                  <option value="Check">Check</option>
                  <option value="Debit">Debit</option>
                  <option value="ACH">ACH / Wire Transfer</option>
                  <option value="Return">Return</option>
                </select>
              </div>

              <!-- Status -->
              <div class="field">
                <label for="f-status">Status <span class="req">*</span></label>
                <select id="f-status" name="status" required>
                  <option value="">Select…</option>
                  <option value="In Review">In Review</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Quote">Quote</option>
                  <option value="Refunded">Refunded</option>
                </select>
                <span class="field-error" id="err-status"></span>
              </div>

              <!-- Charge Type | CC Last 4 (conditional) -->
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

              <div class="field field--conditional" id="field-cc-last4">
                <label for="f-cc-last4">CC Last 4 Digits</label>
                <input type="text" id="f-cc-last4" name="ccLast4"
                       maxlength="4" pattern="[0-9]{4}" placeholder="1234" inputmode="numeric" />
                <span class="field-error" id="err-cc-last4"></span>
              </div>

              <!-- Linked Folder (Return only) -->
              <div class="field field--conditional" id="field-linked-folder">
                <label for="f-linked-folder">Linked Folder # (original)</label>
                <input type="text" id="f-linked-folder" name="linkedFolder" placeholder="e.g. 0002" />
                <span class="field-error" id="err-linked-folder"></span>
              </div>

              <!-- ── Line Items Table ── -->
              <div class="field field--full" id="field-line-items">
                <div class="li-header">
                  <span class="form-section-label">Line Items</span>
                  <span class="li-total-display" id="li-total-display"></span>
                </div>
                <div class="li-table-wrap">
                  <table class="li-table">
                    <colgroup>
                      <col class="li-col-desc" />
                      <col class="li-col-budget" />
                      <col class="li-col-amt" />
                      <col class="li-col-rm" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Budget Line</th>
                        <th class="li-th-amt">Amount ($)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="li-tbody"></tbody>
                  </table>
                </div>
                <button type="button" id="li-add" class="btn btn--ghost btn--sm li-add-btn">+ Add Item</button>
                <span class="field-error" id="err-line-items"></span>
              </div>

              <!-- Notes -->
              <div class="field field--full">
                <label for="f-notes">Notes</label>
                <textarea id="f-notes" name="notes" rows="3"
                          placeholder="Internal notes…"></textarea>
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

              <div class="field field--full">
                <div id="folder-alert" class="folder-alert"></div>
              </div>

            </div><!-- /.form-grid -->

            <div class="form-actions">
              <button type="button" id="btn-edit-approve" class="btn btn--success">✔ Approve</button>
              <button type="button" id="btn-edit-return"  class="btn btn--warning">↩ Return</button>
              <button type="button" id="btn-edit-cancel"  class="btn btn--ghost">Cancel</button>
              <button type="submit" id="btn-submit"        class="btn btn--primary">Save Changes</button>
            </div>
          </form>
        </div><!-- /.form-panel -->

      </div><!-- /.submission-layout -->
    </section>
  `;
}

export function renderEditForm(container, record, onClose) {
  container.innerHTML = buildReviewHTML();

  // Pre-fill scalar fields
  _prefillEditForm(container, record);

  // Initialize line-items table from record.lineItems (or seed one empty row)
  _initLineItems(container, record);

  // Dirty tracking
  let isDirty = false;
  const form = container.querySelector('#sub-form');
  form.addEventListener('input',  () => { isDirty = true; });
  form.addEventListener('change', () => { isDirty = true; });

  // Total amount change → refresh allocation display
  container.querySelector('#f-amount').addEventListener('input', () =>
    _updateLiTotals(container)
  );

  // Expose close-with-prompt so the modal X can call it
  container._requestClose = () => {
    if (isDirty) {
      const save = confirm('Save changes before closing?');
      if (save) _commitEdits(form, container, record.id);
    }
    onClose?.();
  };

  // File upload → preview
  const fileInput = container.querySelector('#f-receipt');
  fileInput.addEventListener('change', () => handleFile(fileInput, container));

  // Method / Status → conditional fields
  const methodSel = container.querySelector('#f-method');
  methodSel.addEventListener('change', () => updateConditionalFields(container));
  const statusSel = container.querySelector('#f-status');
  if (statusSel) statusSel.addEventListener('change', () => updateConditionalFields(container));
  updateConditionalFields(container);

  // Supporting docs
  container.querySelector('#f-w9').addEventListener('change', e =>
    handleSupportingDoc(e.target, 'w9', container)
  );
  container.querySelector('#f-pay-doc').addEventListener('change', e =>
    handleSupportingDoc(e.target, 'pay', container)
  );

  // Vendor → refresh doc filenames
  container.querySelector('#f-vendor').addEventListener('input', () =>
    refreshDocFilenames(container)
  );

  // Preview pagination
  container.querySelector('#btn-prev-page').addEventListener('click', () => {
    const pg = (container._previewCurrentPage ?? 1) - 1;
    if (pg >= 1) renderPreviewPage(container, pg);
  });
  container.querySelector('#btn-next-page').addEventListener('click', () => {
    const total = container._previewPdf?.numPages ?? 1;
    const pg    = (container._previewCurrentPage ?? 1) + 1;
    if (pg <= total) renderPreviewPage(container, pg);
  });

  // Approve
  container.querySelector('#btn-edit-approve').addEventListener('click', () => {
    if (!_validateLineItems(form, container)) return;
    _commitEdits(form, container, record.id);
    updatePurchase(record.id, { status: 'Approved' });
    isDirty = false;
    onClose?.('approved');
  });

  // Send back for correction (puts it back to In Review)
  container.querySelector('#btn-edit-return').addEventListener('click', () => {
    if (confirm('Send this submission back for correction?')) {
      _commitEdits(form, container, record.id);
      updatePurchase(record.id, { status: 'In Review' });
      isDirty = false;
      onClose?.('returned');
    }
  });

  // Cancel
  container.querySelector('#btn-edit-cancel').addEventListener('click', () => {
    container._requestClose();
  });

  // Save Changes
  form.addEventListener('submit', e => {
    e.preventDefault();
    const statusSel = form.querySelector('#f-status');
    const statusErr = container.querySelector('#err-status');
    if (statusSel && !statusSel.value) {
      if (statusErr) statusErr.textContent = 'Status is required.';
      statusSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (statusErr) statusErr.textContent = '';
    if (!_validateLineItems(form, container)) return;
    _commitEdits(form, container, record.id);
    isDirty = false;
    onClose?.('saved');
  });
}

/* ── Pre-fill scalar fields ── */
function _prefillEditForm(container, record) {
  const set = (id, val) => {
    const el = container.querySelector('#' + id);
    if (!el || val == null) return;
    el.value = (id === 'f-amount') ? Number(val).toFixed(2) : String(val);
  };
  set('f-date',          record.date);
  set('f-vendor',        record.vendor);
  set('f-amount',        record.amount);
  set('f-status',        record.status);
  set('f-method',        record.method);
  set('f-cc-last4',      record.ccLast4 ?? '');
  set('f-linked-folder', record.linkedFolder ?? '');
  set('f-charge-type',   record.chargeType ?? '');
  set('f-notes',         record.notes ?? '');
}

/* ── Line Items ── */
function _initLineItems(container, record) {
  const existing = Array.isArray(record.lineItems) && record.lineItems.length > 0
    ? record.lineItems
    : [{ description: record.description ?? '', lineItem: record.lineItem ?? '', amount: '' }];

  existing.forEach(li => _addLiRow(container, li));
  _updateLiTotals(container);

  container.querySelector('#li-add').addEventListener('click', () => {
    _addLiRow(container, {});
    _updateLiTotals(container);
  });
}

function _addLiRow(container, data = {}) {
  const tbody = container.querySelector('#li-tbody');
  const tr    = document.createElement('tr');
  tr.className = 'li-row';

  const descVal = _escAttr(data.description ?? '');
  const lineVal = _escAttr(data.lineItem    ?? '');
  const amtVal  = data.amount != null && data.amount !== '' ? Number(data.amount) : '';

  tr.innerHTML = `
    <td>
      <input type="text" class="li-desc" placeholder="Description…" value="${descVal}" />
    </td>
    <td class="li-td-line">
      <input type="text" class="li-line" placeholder="#" value="${lineVal}" />
      <small class="li-lookup-hint"></small>
    </td>
    <td>
      <input type="number" class="li-amount" placeholder="0.00" min="0" step="0.01" value="${amtVal}" />
    </td>
    <td>
      <button type="button" class="li-remove btn btn--danger btn--sm" title="Remove row">✕</button>
    </td>
  `;

  // ── Budget line lookup on blur ──
  const lineInput = tr.querySelector('.li-line');
  const hintEl    = tr.querySelector('.li-lookup-hint');
  const descInput = tr.querySelector('.li-desc');

  lineInput.addEventListener('blur', () => {
    const raw    = lineInput.value.trim();
    if (!raw) { _clearLiHint(lineInput, hintEl); return; }

    const lineMap = getBudgetLineMap();

    // Check for "Group X" fringe line codes (e.g. "Group A", "group b", "A")
    const groupMatch = raw.match(/^(?:group\s*)?([A-Za-z]{1,2})$/i);
    if (groupMatch) {
      const letter  = groupMatch[1].toUpperCase();
      const groupKey = `Group ${letter}`;
      const match   = lineMap.get(groupKey);
      if (match) {
        lineInput.value = groupKey; // reformat
        if (!descInput.value.trim()) descInput.value = match.description;
        lineInput.classList.remove('li-line--notfound');
        lineInput.classList.add('li-line--found');
        lineInput.title    = `${groupKey} · ${match.description} (${match.sectionName})`;
        hintEl.textContent = `${match.description} — ${match.sectionName}`;
        hintEl.className   = 'li-lookup-hint li-lookup-hint--found';
        return;
      }
    }

    // Accept bare numbers ("1") or already-formatted ("0001")
    const digits = raw.replace(/\D/g, '');
    if (!digits) { _clearLiHint(lineInput, hintEl); return; }

    const padded = digits.padStart(4, '0');
    lineInput.value = padded; // reformat in-place

    const match   = lineMap.get(padded);

    if (match) {
      // Auto-fill description if the cell is empty
      if (!descInput.value.trim()) {
        descInput.value = match.description;
      }
      lineInput.classList.remove('li-line--notfound');
      lineInput.classList.add('li-line--found');
      lineInput.title = `${padded} · ${match.description} (${match.sectionName})`;
      hintEl.textContent = `${match.description} — ${match.sectionName}`;
      hintEl.className   = 'li-lookup-hint li-lookup-hint--found';
    } else {
      lineInput.classList.remove('li-line--found');
      lineInput.classList.add('li-line--notfound');
      lineInput.title    = `${padded} not found in budget`;
      hintEl.textContent = 'Not found in budget';
      hintEl.className   = 'li-lookup-hint li-lookup-hint--miss';
    }
  });

  // Clear styling when user starts editing again
  lineInput.addEventListener('focus', () => {
    lineInput.classList.remove('li-line--found', 'li-line--notfound');
    hintEl.textContent = '';
    hintEl.className   = 'li-lookup-hint';
  });

  // Remove row (keep at least one)
  tr.querySelector('.li-remove').addEventListener('click', () => {
    const rows = tbody.querySelectorAll('.li-row');
    if (rows.length <= 1) {
      descInput.value              = '';
      lineInput.value              = '';
      tr.querySelector('.li-amount').value = '';
      _clearLiHint(lineInput, hintEl);
    } else {
      tr.remove();
    }
    _updateLiTotals(container);
  });

  // Update totals live as amounts change
  tr.querySelector('.li-amount').addEventListener('input', () => _updateLiTotals(container));

  tbody.appendChild(tr);

  // If pre-loaded with a line number, run the lookup immediately
  if (lineVal && /^\d+$/.test(lineVal.replace(/\D/g, ''))) {
    lineInput.dispatchEvent(new Event('blur'));
  }
}

function _clearLiHint(lineInput, hintEl) {
  lineInput.classList.remove('li-line--found', 'li-line--notfound');
  lineInput.title    = '';
  hintEl.textContent = '';
  hintEl.className   = 'li-lookup-hint';
}

function _updateLiTotals(container) {
  const grandTotal = parseFloat(container.querySelector('#f-amount')?.value) || 0;
  const rows       = [...container.querySelectorAll('#li-tbody .li-row')];
  const allocated  = rows.reduce((sum, r) => sum + (parseFloat(r.querySelector('.li-amount').value) || 0), 0);

  const display = container.querySelector('#li-total-display');
  if (!display) return;

  const diff  = Math.abs(allocated - grandTotal);
  const match = grandTotal > 0 && diff < 0.005;
  const none  = grandTotal === 0 && allocated === 0;

  display.className = 'li-total-display' + (none ? '' : match ? ' li-total--ok' : ' li-total--warn');
  display.textContent = none
    ? ''
    : `Allocated ${_fmt(allocated)} of ${_fmt(grandTotal)}${match ? ' ✔' : ` — ${_fmt(Math.abs(grandTotal - allocated))} ${allocated > grandTotal ? 'over' : 'remaining'}`}`;

  // Clear error once balanced
  if (match) {
    const err = container.querySelector('#err-line-items');
    if (err) err.textContent = '';
  }
}

function _getLineItems(container) {
  return [...container.querySelectorAll('#li-tbody .li-row')]
    .map(r => ({
      description: r.querySelector('.li-desc').value.trim(),
      lineItem:    r.querySelector('.li-line').value.trim(),
      amount:      parseFloat(r.querySelector('.li-amount').value) || 0,
    }))
    .filter(li => li.description || li.amount > 0);
}

function _validateLineItems(form, container) {
  const grandTotal = parseFloat(form.querySelector('#f-amount')?.value) || 0;
  const lineItems  = _getLineItems(container);
  const errEl      = container.querySelector('#err-line-items');

  if (lineItems.length === 0) return true; // no line items = no validation needed

  const allocated = lineItems.reduce((s, li) => s + li.amount, 0);
  const diff      = Math.abs(allocated - grandTotal);

  if (diff >= 0.005) {
    const over = allocated > grandTotal;
    if (errEl) errEl.textContent =
      `Line item total ${_fmt(allocated)} ${over ? 'exceeds' : 'is less than'} the receipt total ${_fmt(grandTotal)}. ` +
      `Please adjust amounts — they must add up exactly.`;
    container.querySelector('#field-line-items')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  if (errEl) errEl.textContent = '';
  return true;
}

/* ── Save / Commit ── */
function _commitEdits(form, container, id) {
  const fd   = new FormData(form);
  const data = {};
  for (const [k, v] of fd.entries()) {
    if (['receipt', 'w9File', 'payDocFile'].includes(k)) continue;
    data[k] = v;
  }
  data.amount   = parseFloat(data.amount) || 0;
  data.isReturn = data.method === 'Return';
  if (data.isReturn) {
    data.amount = -Math.abs(data.amount);
    data.status = 'Refunded';
  }

  // Persist line items; derive top-level description + lineItem from first row
  const lineItems = _getLineItems(container);
  if (lineItems.length > 0) {
    data.lineItems   = lineItems;
    data.description = lineItems.length === 1
      ? lineItems[0].description
      : lineItems.map(li => li.description).filter(Boolean).join('; ');
    data.lineItem    = lineItems[0].lineItem || data.lineItem || '';
  }

  // Upgrade doc flags if new files were attached during review
  if ((form.querySelector('#f-w9')?.files?.length    ?? 0) > 0) data.w9Attached           = true;
  if ((form.querySelector('#f-pay-doc')?.files?.length ?? 0) > 0) data.payMethodDocAttached = true;

  updatePurchase(id, data);
}

/* ── Local helpers ── */
function _fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════════════════════════
   DOCUMENT SCANNER — Camera capture → PDF
   ══════════════════════════════════════════════════════════════ */
function _attachScanListeners(container, fileInput) {
  const scanBtn = container.querySelector('#btn-scan-doc');
  const overlay = container.querySelector('#scan-overlay');
  if (!scanBtn || !overlay) return;

  const video      = overlay.querySelector('#scan-video');
  const canvas     = overlay.querySelector('#scan-canvas');
  const preview    = overlay.querySelector('#scan-preview');
  const captureBtn = overlay.querySelector('#scan-capture');
  const retakeBtn  = overlay.querySelector('#scan-retake');
  const useBtn     = overlay.querySelector('#scan-use');
  const confirmRow = overlay.querySelector('#scan-confirm-row');
  const closeBtn   = overlay.querySelector('#scan-close');

  let stream = null;
  let capturedBlob = null;

  scanBtn.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = stream;
      video.classList.remove('hidden');
      preview.classList.add('hidden');
      confirmRow.classList.add('hidden');
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
      overlay.classList.remove('hidden');
    } catch (err) {
      alert('Could not access camera: ' + err.message);
    }
  });

  captureBtn.addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      capturedBlob = blob;
      preview.src = URL.createObjectURL(blob);
      preview.classList.remove('hidden');
      video.classList.add('hidden');
      captureBtn.classList.add('hidden');
      retakeBtn.classList.remove('hidden');
      confirmRow.classList.remove('hidden');
    }, 'image/jpeg', 0.92);
  });

  retakeBtn.addEventListener('click', () => {
    preview.classList.add('hidden');
    confirmRow.classList.add('hidden');
    video.classList.remove('hidden');
    captureBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
  });

  useBtn.addEventListener('click', async () => {
    if (!capturedBlob) return;
    // Convert image to PDF using pdf-lib
    try {
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const imgBytes = await capturedBlob.arrayBuffer();
      const img = await pdfDoc.embedJpg(new Uint8Array(imgBytes));
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'scanned_document.pdf', { type: 'application/pdf' });

      // Inject into file input via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(pdfFile);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
      console.error('PDF conversion error:', err);
      // Fallback: use the JPEG directly
      const jpgFile = new File([capturedBlob], 'scanned_document.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(jpgFile);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _stopStream();
    overlay.classList.add('hidden');
  });

  closeBtn.addEventListener('click', () => {
    _stopStream();
    overlay.classList.add('hidden');
  });

  function _stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }
}
