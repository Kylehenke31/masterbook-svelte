<script>
  import { onMount, onDestroy } from 'svelte';
  import { addPurchase, assignFolder } from '../../data.js';

  let { onDone = null } = $props();

  let container;

  /* ── Constants ── */
  const ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514';
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;
  const MAX_SUPPORT_BYTES = 10 * 1024 * 1024;

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
                  <label for="f-vendor">Vendor <span class="req">*</span></label>
                  <input type="text" id="f-vendor" name="vendor"
                         placeholder="Upload receipt to autofill" required />
                  <span class="field-error" id="err-vendor"></span>
                </div>

                <!-- Amount -->
                <div class="field">
                  <label for="f-amount">Amount ($) <span class="req">*</span></label>
                  <input type="number" id="f-amount" name="amount"
                         min="0" step="0.01" placeholder="0.00" required />
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
    const method    = c.querySelector('#f-method').value;
    const statusVal = c.querySelector('#f-status')?.value;

    c.querySelector('#field-cc-last4').classList.toggle('visible',
      method === 'CC' || method === 'PO-CC');

    c.querySelector('#field-linked-folder').classList.toggle('visible',
      method === 'Return');

    const docsRequired = method === 'PO' && statusVal !== 'Quote';
    [['w9', 'w9-req-marker', 'doc-item-w9', 'w9-doc-note'],
     ['pay', 'pay-doc-req-marker', 'doc-item-pay', 'pay-doc-note']].forEach(([, reqId, itemId, noteId]) => {
      const reqEl  = c.querySelector('#' + reqId);
      const itemEl = c.querySelector('#' + itemId);
      const noteEl = c.querySelector('#' + noteId);
      if (reqEl)  reqEl.style.display = docsRequired ? 'inline' : 'none';
      if (itemEl) itemEl.classList.toggle('doc-required', docsRequired);
      if (noteEl) {
        noteEl.textContent = docsRequired ? 'Required for PO · PDF, max 10 MB' : 'PDF, max 10 MB';
        noteEl.className   = docsRequired ? 'doc-note doc-note--required' : 'doc-note';
      }
    });

    refreshDocFilenames(c);
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
    ['f-vendor','f-date','f-amount','f-cc-last4','f-description','f-charge-type','f-notes'].forEach(id => {
      const el = c.querySelector('#' + id);
      if (!el) return;
      el.value = '';
      el.classList.remove('ocr-filled','invalid');
    });
    const methodEl = c.querySelector('#f-method');
    if (methodEl) { methodEl.value = 'CC'; methodEl.classList.remove('ocr-filled'); updateConditionalFields(c); }
    ['err-vendor','err-date','err-amount'].forEach(id => { const el = c.querySelector('#'+id); if(el) el.textContent=''; });
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
    fill('f-vendor',      parsed.vendor);
    fill('f-date',        parsed.date);
    fill('f-amount',      parsed.amount);
    fill('f-cc-last4',    parsed.ccLast4);
    fill('f-charge-type', parsed.chargeType);
    fill('f-description', parsed.description);
    fill('f-notes',       parsed.lineItemSummary);
    const methodEl = c.querySelector('#f-method');
    if (methodEl) {
      if (parsed.method) { methodEl.value = parsed.method; methodEl.classList.add('ocr-filled'); }
      else { methodEl.value = 'PO'; }
      updateConditionalFields(c);
    }
    if (parsed.ccLast4) refreshDocFilenames(c);
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
    const vendor     = c.querySelector('#f-vendor')?.value.trim() || 'Unknown';
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
    ok = requireFile(form.querySelector('#f-receipt'), c.querySelector('#err-receipt'), 'A receipt file is required.') && ok;
    ok = requireField('f-vendor', 'err-vendor') && ok;
    ok = requireField('f-date',   'err-date')   && ok;
    ok = requireField('f-amount', 'err-amount') && ok;
    ok = requireField('f-status', 'err-status') && ok;
    const selectedStatus = form.querySelector('#f-status')?.value;
    if (form.querySelector('#f-method').value === 'PO' && selectedStatus !== 'Quote') {
      ok = requireFile(form.querySelector('#f-w9'),      c.querySelector('#err-w9'),      'W9 required for Purchase Orders.') && ok;
      ok = requireFile(form.querySelector('#f-pay-doc'), c.querySelector('#err-pay-doc'), 'ACH / Wire info required for Purchase Orders.') && ok;
    }
    return ok;
  }

  function validateMinimal(form, c) {
    let ok = true;
    function requireField(inputId, errId) {
      const el = form.querySelector('#' + inputId), err = c.querySelector('#' + errId);
      if (!el) return true;
      if (!el.value.trim()) { if (err) err.textContent = 'This field is required.'; el.classList.add('invalid'); return false; }
      if (err) err.textContent = ''; el.classList.remove('invalid'); return true;
    }
    ok = requireField('f-vendor', 'err-vendor') && ok;
    ok = requireField('f-date',   'err-date')   && ok;
    ok = requireField('f-amount', 'err-amount') && ok;
    return ok;
  }

  /* ── Submit ── */
  function submitRecord(form, c, status, isDraft = false) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (['receipt','w9File','payDocFile'].includes(k)) continue;
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
    if (data.isReturn) {
      data.status = 'Refunded';
      data.amount = -Math.abs(data.amount);
    } else {
      data.status = data.status || status;
    }

    const { folder, alert } = assignFolder(data.method, data.linkedFolder || null);
    data.folder = folder;

    const alertEl = c.querySelector('#folder-alert');
    if (alert) { alertEl.textContent = alert; alertEl.classList.add('visible'); }
    else        { alertEl.classList.remove('visible'); }

    addPurchase(data);
    form.reset();
    c.querySelectorAll('.ocr-filled').forEach(el => el.classList.remove('ocr-filled'));
    clearPreview(c);
    c.querySelectorAll('.doc-filename').forEach(el => el.textContent = '');
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
    const methodSel = c.querySelector('#f-method');
    const statusSel = c.querySelector('#f-status');

    fileInput.addEventListener('change', () => handleFile(fileInput, c));
    methodSel.addEventListener('change', () => updateConditionalFields(c));
    statusSel.addEventListener('change', () => updateConditionalFields(c));
    updateConditionalFields(c);

    c.querySelector('#f-w9').addEventListener('change',      e => handleSupportingDoc(e.target, 'w9',  c));
    c.querySelector('#f-pay-doc').addEventListener('change', e => handleSupportingDoc(e.target, 'pay', c));
    c.querySelector('#f-vendor').addEventListener('input',   () => refreshDocFilenames(c));

    c.querySelector('#btn-prev-page').addEventListener('click', () => {
      const pg = (c._previewCurrentPage ?? 1) - 1;
      if (pg >= 1) renderPreviewPage(c, pg);
    });
    c.querySelector('#btn-next-page').addEventListener('click', () => {
      const total = c._previewPdf?.numPages ?? 1;
      const pg    = (c._previewCurrentPage ?? 1) + 1;
      if (pg <= total) renderPreviewPage(c, pg);
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!validateForm(form, c)) return;
      submitRecord(form, c, 'In Review');
    });

    c.querySelector('#btn-save-profile').addEventListener('click', () => {
      if (!validateMinimal(form, c)) return;
      submitRecord(form, c, 'Submitted', true);
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
