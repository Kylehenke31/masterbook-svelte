/* ============================================================
   The Masterbook — insurance.js
   Insurance COI Generator: upload a blank certificate template,
   select a vendor, and auto-populate the cert fields.
   ============================================================ */

const VENDORS_KEY  = 'movie-ledger-vendors';
const INS_CERT_KEY = 'movie-ledger-ins-cert';   // base64 PDF template

let _container = null;
let _selectedVendorIdx = null;

/* ── Entry Point ── */
export function renderInsurance(container) {
  _container = container;
  _selectedVendorIdx = null;
  _render();
}

/* ── Helpers ── */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _getVendors() {
  try { return JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; } catch { return []; }
}

function _getCert() {
  return localStorage.getItem(INS_CERT_KEY) || null;
}
function _saveCert(dataUrl) {
  localStorage.setItem(INS_CERT_KEY, dataUrl);
}
function _clearCert() {
  localStorage.removeItem(INS_CERT_KEY);
}

/* ── Format today's date as MM/DD/YYYY ── */
function _todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/* ── Fill the PDF template with vendor data ── */
async function _fillCert(vendor) {
  const certDataUrl = _getCert();
  if (!certDataUrl || !vendor) return;

  // Read checkbox states
  const addPhone = _container.querySelector('#ins-opt-phone')?.checked ?? false;
  const addEmail = _container.querySelector('#ins-opt-email')?.checked ?? false;

  // Convert base64 data-URL → Uint8Array
  const base64 = certDataUrl.split(',')[1];
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const { PDFDocument, StandardFonts, PDFName, PDFString } = PDFLib;
  const pdfDoc = await PDFDocument.load(bytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  // Fill DATE field (top right) — font 2 sizes smaller than default 12 → 10pt
  try {
    const dateField = form.getTextField('DATE');
    dateField.setFontSize(10);
    dateField.setText(_todayStr());
  } catch (e) { console.warn('Could not fill DATE field:', e); }

  // Fill Certificate Holder field (bottom left) — 8pt, nudged right
  try {
    const holderField = form.getTextField('Text1');
    // Field lacks a /DA entry; set it manually so setFontSize works
    holderField.acroField.dict.set(PDFName.of('DA'), PDFString.of('/Helv 8 Tf 0 g'));
    const lines = [
      vendor.name || '',
      vendor.streetAddress || '',
      vendor.cityStateZip || ''
    ].filter(l => l.trim());
    if (addPhone && vendor.phone?.trim()) lines.push(vendor.phone.trim());
    if (addEmail && vendor.email?.trim()) lines.push(vendor.email.trim());
    // Prepend spaces to nudge text away from left edge
    holderField.setText(lines.map(l => '  ' + l).join('\n'));
    holderField.updateAppearances(helvetica);
  } catch (e) { console.warn('Could not fill Text1 field:', e); }

  // Flatten so fields are baked into the PDF visually
  form.flatten();

  const filledBytes = await pdfDoc.save();
  const blob = new Blob([filledBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  // Show in preview iframe
  const iframe = _container.querySelector('.ins-cert-iframe');
  if (iframe) {
    iframe.src = url;
  }

  // Also offer a download
  _showDownloadBtn(url, vendor.name);
}

/* ── Show / update Download button ── */
function _showDownloadBtn(blobUrl, vendorName) {
  let btn = _container.querySelector('#ins-download-btn');
  if (!btn) {
    btn = document.createElement('a');
    btn.id = 'ins-download-btn';
    btn.className = 'btn btn--primary btn--sm';
    btn.style.marginLeft = '8px';
    btn.textContent = 'Download Filled Cert';
    const actions = _container.querySelector('.ins-cert-actions');
    if (actions) actions.appendChild(btn);
  }
  btn.href = blobUrl;
  const safeName = (vendorName || 'vendor').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  btn.download = `COI_${safeName}.pdf`;
}

/* ══════════════════════════════════════════════════════════════
   MAIN RENDER — two-column layout
   ══════════════════════════════════════════════════════════════ */
function _render() {
  const vendors = _getVendors();
  const cert    = _getCert();

  const vendorRows = vendors.length
    ? vendors
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((v, i) => {
          const origIdx = vendors.indexOf(v);
          const active  = origIdx === _selectedVendorIdx ? ' ins-vendor--active' : '';
          return `<div class="ins-vendor-item${active}" data-ins-vendor="${origIdx}">
            <span class="ins-vendor-name">${esc(v.name)}</span>
            <span class="ins-vendor-type">${esc(v.type)}</span>
          </div>`;
        }).join('')
    : `<div class="ins-vendor-empty">No vendors saved yet.<br>Add vendors in the <a href="#vendors">Vendors</a> page.</div>`;

  _container.innerHTML = `
    <section class="ins-section">
      <div class="ins-header">
        <div>
          <h2 class="ins-title">Insurance — COI Generator</h2>
          <p class="ins-subtitle">Upload a blank certificate template, then select a vendor to auto-populate.</p>
        </div>
      </div>

      <div class="ins-columns">
        <!-- LEFT: Vendor list -->
        <div class="ins-col ins-col-left">
          <div class="ins-col-header">
            <span class="ins-col-label">Vendors</span>
            <span class="ins-vendor-count">${vendors.length}</span>
          </div>
          <div class="ins-vendor-list">
            ${vendorRows}
          </div>
          <div class="ins-options">
            <label class="ins-option"><input type="checkbox" id="ins-opt-phone" /> Add Phone Number</label>
            <label class="ins-option"><input type="checkbox" id="ins-opt-email" /> Add Email</label>
          </div>
        </div>

        <!-- RIGHT: Certificate preview -->
        <div class="ins-col ins-col-right">
          <div class="ins-col-header">
            <span class="ins-col-label">Certificate Template</span>
            <div class="ins-cert-actions">
              <button class="btn btn--primary btn--sm" id="ins-upload-btn">Upload Blank Cert</button>
              ${cert ? `<button class="btn btn--ghost btn--sm btn--danger-text" id="ins-remove-btn">Remove</button>` : ''}
            </div>
            <input type="file" id="ins-cert-file" accept="application/pdf" hidden />
          </div>
          <div class="ins-cert-preview">
            ${cert
              ? `<iframe src="${esc(cert)}" class="ins-cert-iframe" title="Certificate Preview"></iframe>`
              : `<div class="ins-cert-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" style="opacity:.3;margin-bottom:8px;">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <p>No certificate template uploaded.</p>
                  <p class="ins-cert-hint">Click <strong>Upload Blank Cert</strong> to get started.</p>
                </div>`
            }
          </div>
        </div>
      </div>
    </section>`;

  _wireEvents();
}

/* ── Wire Events ── */
function _wireEvents() {
  const uploadBtn  = _container.querySelector('#ins-upload-btn');
  const fileInput  = _container.querySelector('#ins-cert-file');
  const removeBtn  = _container.querySelector('#ins-remove-btn');

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      _saveCert(reader.result);
      _selectedVendorIdx = null;
      _render();
    };
    reader.readAsDataURL(file);
  });

  removeBtn?.addEventListener('click', () => {
    if (!confirm('Remove the certificate template?')) return;
    _clearCert();
    _selectedVendorIdx = null;
    _render();
  });

  // Re-fill when checkbox options change
  _container.querySelectorAll('#ins-opt-phone, #ins-opt-email').forEach(cb => {
    cb.addEventListener('change', () => {
      if (_selectedVendorIdx == null) return;
      const vendors = _getVendors();
      const vendor = vendors[_selectedVendorIdx];
      if (vendor && _getCert()) _fillCert(vendor);
    });
  });

  // Vendor selection → fill cert
  _container.querySelectorAll('[data-ins-vendor]').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.insVendor, 10);
      _selectedVendorIdx = idx;

      // Highlight
      _container.querySelectorAll('.ins-vendor-item').forEach(el => el.classList.remove('ins-vendor--active'));
      item.classList.add('ins-vendor--active');

      // Fill the cert if a template is uploaded
      const vendors = _getVendors();
      const vendor = vendors[idx];
      if (vendor && _getCert()) {
        _fillCert(vendor);
      }
    });
  });
}
