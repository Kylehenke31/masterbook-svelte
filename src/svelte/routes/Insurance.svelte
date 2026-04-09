<script>
  import { PDFDocument, StandardFonts, PDFName, PDFString } from 'pdf-lib';

  const VENDORS_KEY  = 'movie-ledger-vendors';
  const INS_CERT_KEY = 'movie-ledger-ins-cert';

  // ── State ──────────────────────────────────────────────────
  let vendors          = $state([]);
  let certDataUrl      = $state(null);
  let selectedIdx      = $state(null);
  let addPhone         = $state(false);
  let addEmail         = $state(false);
  let previewSrc       = $state(null);
  let downloadHref     = $state(null);
  let downloadFilename = $state('COI.pdf');

  // ── Load ───────────────────────────────────────────────────
  try { vendors = JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; } catch { vendors = []; }
  certDataUrl = localStorage.getItem(INS_CERT_KEY) || null;
  if (certDataUrl) previewSrc = certDataUrl;

  let sortedVendors = $derived(
    vendors
      .map((v, i) => ({ ...v, _origIdx: i }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );

  // ── Today MM/DD/YYYY ───────────────────────────────────────
  function todayStr() {
    const d = new Date();
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  }

  // ── Upload template ────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      certDataUrl = reader.result;
      previewSrc  = reader.result;
      localStorage.setItem(INS_CERT_KEY, certDataUrl);
      selectedIdx = null;
      downloadHref = null;
    };
    reader.readAsDataURL(file);
  }

  function removeTemplate() {
    if (!confirm('Remove the certificate template?')) return;
    certDataUrl = null;
    previewSrc  = null;
    downloadHref = null;
    localStorage.removeItem(INS_CERT_KEY);
    selectedIdx = null;
  }

  // ── Fill PDF ───────────────────────────────────────────────
  async function fillCert(vendor) {
    if (!certDataUrl || !vendor) return;

    const base64 = certDataUrl.split(',')[1];
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    const pdfDoc   = await PDFDocument.load(bytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const form     = pdfDoc.getForm();

    // DATE field
    try {
      const dateField = form.getTextField('DATE');
      dateField.setFontSize(10);
      dateField.setText(todayStr());
    } catch { /* field may not exist in this template */ }

    // Certificate Holder (Text1)
    try {
      const holderField = form.getTextField('Text1');
      holderField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/Helv 8 Tf 0 g'));
      const lines = [
        vendor.name         || '',
        vendor.streetAddress || '',
        vendor.cityStateZip  || '',
      ].filter(l => l.trim());
      if (addPhone && vendor.phone?.trim()) lines.push(vendor.phone.trim());
      if (addEmail && vendor.email?.trim()) lines.push(vendor.email.trim());
      holderField.setText(lines.map(l => '  ' + l).join('\n'));
      holderField.updateAppearances(helvetica);
    } catch { /* field may not exist */ }

    form.flatten();

    const filledBytes = await pdfDoc.save();
    const blob = new Blob([filledBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);

    previewSrc       = url;
    downloadHref     = url;
    downloadFilename = `COI_${(vendor.name || 'vendor').replace(/[^a-zA-Z0-9 _-]/g, '').trim()}.pdf`;
  }

  // ── Select vendor ──────────────────────────────────────────
  function selectVendor(origIdx) {
    selectedIdx = origIdx;
    const vendor = vendors[origIdx];
    if (vendor && certDataUrl) fillCert(vendor);
  }

  // ── Re-fill when options change ────────────────────────────
  function onOptionChange() {
    if (selectedIdx == null) return;
    const vendor = vendors[selectedIdx];
    if (vendor && certDataUrl) fillCert(vendor);
  }
</script>

<section class="ins-section">
  <div class="ins-header">
    <h2 class="ins-title">Insurance — COI Generator</h2>
    <p class="ins-subtitle">Upload a blank certificate template, then select a vendor to auto-populate.</p>
  </div>

  <div class="ins-columns">

    <!-- LEFT: Vendor list -->
    <div class="ins-col ins-col-left">
      <div class="ins-col-header">
        <span class="ins-col-label">Vendors</span>
        <span class="ins-vendor-count">{vendors.length}</span>
      </div>

      <div class="ins-vendor-list">
        {#if sortedVendors.length === 0}
          <div class="ins-vendor-empty">
            No vendors saved yet.<br />
            Add vendors in the <a href="#vendors">Vendors</a> page.
          </div>
        {:else}
          {#each sortedVendors as v (v._origIdx)}
            <div
              class="ins-vendor-item"
              class:ins-vendor--active={selectedIdx === v._origIdx}
              role="button"
              tabindex="0"
              onclick={() => selectVendor(v._origIdx)}
              onkeydown={e => e.key === 'Enter' && selectVendor(v._origIdx)}
            >
              <span class="ins-vendor-name">{v.name}</span>
              <span class="ins-vendor-type">{v.type}</span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="ins-options">
        <label class="ins-option">
          <input type="checkbox" bind:checked={addPhone} onchange={onOptionChange} />
          Add Phone Number
        </label>
        <label class="ins-option">
          <input type="checkbox" bind:checked={addEmail} onchange={onOptionChange} />
          Add Email
        </label>
      </div>
    </div>

    <!-- RIGHT: Certificate preview -->
    <div class="ins-col ins-col-right">
      <div class="ins-col-header">
        <span class="ins-col-label">Certificate Template</span>
        <div class="ins-cert-actions">
          <label class="btn btn--primary btn--sm" style="cursor:pointer;">
            Upload Blank Cert
            <input type="file" accept="application/pdf" hidden onchange={handleFileChange} />
          </label>
          {#if certDataUrl}
            <button class="btn btn--ghost btn--sm btn--danger-text" onclick={removeTemplate}>Remove</button>
          {/if}
          {#if downloadHref}
            <a class="btn btn--ghost btn--sm" href={downloadHref} download={downloadFilename}>
              Download Filled Cert
            </a>
          {/if}
        </div>
      </div>

      <div class="ins-cert-preview">
        {#if previewSrc}
          <iframe src={previewSrc} class="ins-cert-iframe" title="Certificate Preview"></iframe>
        {:else}
          <div class="ins-cert-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
                 width="48" height="48" style="opacity:.3;margin-bottom:8px;">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <p>No certificate template uploaded.</p>
            <p class="ins-cert-hint">Click <strong>Upload Blank Cert</strong> to get started.</p>
          </div>
        {/if}
      </div>
    </div>

  </div>
</section>

<style>
  .ins-section { padding: 4px 0; }

  .ins-header { margin-bottom: 20px; }
  .ins-title  { font-size: 1.25rem; margin-bottom: 4px; }
  .ins-subtitle { font-size: 0.85rem; color: var(--text-muted, #888); }

  .ins-columns {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .ins-col-left  { width: 260px; flex-shrink: 0; }
  .ins-col-right { flex: 1; min-width: 0; }

  .ins-col-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #333);
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .ins-col-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #888);
  }

  .ins-vendor-count {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    background: var(--surface-2, #2a2a2a);
    padding: 1px 6px;
    border-radius: 10px;
  }

  .ins-vendor-list {
    max-height: 420px;
    overflow-y: auto;
    margin-bottom: 12px;
  }

  .ins-vendor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .ins-vendor-item:hover      { background: var(--surface-2, #2a2a2a); }
  .ins-vendor--active         { background: var(--surface-2, #2a2a2a); outline: 1px solid var(--accent, #6a8a6a); }

  .ins-vendor-name { font-size: 0.875rem; }
  .ins-vendor-type { font-size: 0.75rem; color: var(--text-muted, #888); }

  .ins-vendor-empty {
    font-size: 0.85rem;
    color: var(--text-muted, #888);
    padding: 16px 0;
    line-height: 1.6;
  }

  .ins-options { display: flex; flex-direction: column; gap: 6px; }
  .ins-option  { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; cursor: pointer; }

  .ins-cert-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .ins-cert-preview {
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-2, #1a1a1a);
    height: 520px;
  }

  .ins-cert-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .ins-cert-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted, #888);
    text-align: center;
    gap: 4px;
  }

  .ins-cert-hint { font-size: 0.8rem; opacity: 0.7; }

  .btn--danger-text { color: var(--earth-red, #b84f4f); }
</style>
