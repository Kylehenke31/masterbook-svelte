/* ============================================================
   The Masterbook — scriptOrder.js
   One-Liner (Script Order): All breakdown scenes sorted by
   scene number, with PDF/Print export.
   ============================================================ */

const BD_KEY      = 'movie-ledger-breakdowns';
const SO_KEY      = 'movie-ledger-script-order';

let _container = null;
let _settings  = {};  // { draftVersion, draftDate }

/* ── Entry ── */
export function renderScriptOrder(container) {
  _container = container;
  _loadSettings();
  _render();
}

/* ── Persistence ── */
function _loadSettings() {
  try { _settings = JSON.parse(localStorage.getItem(SO_KEY)) || {}; } catch { _settings = {}; }
  // Default date to today if not set
  if (!_settings.draftDate) {
    const today = new Date();
    _settings.draftDate = today.toISOString().slice(0, 10);
    _saveSettings();
  }
}
function _saveSettings() { localStorage.setItem(SO_KEY, JSON.stringify(_settings)); }

/* ── Helpers ── */
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _getScenes() {
  try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; }
}

function _getProjectName() {
  try {
    const p = JSON.parse(localStorage.getItem('movie-ledger-project'));
    return p?.title || 'Untitled Project';
  } catch { return 'Untitled Project'; }
}

/* Sort scenes by scene number — numeric-aware */
function _sortBySceneNum(scenes) {
  return [...scenes].sort((a, b) => {
    const na = _parseSceneNum(a.sceneNum);
    const nb = _parseSceneNum(b.sceneNum);
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const va = na[i] ?? -1;
      const vb = nb[i] ?? -1;
      if (va !== vb) return va - vb;
    }
    return 0;
  });
}

function _parseSceneNum(str) {
  if (!str) return [0];
  // Tokenise into alternating numeric / alpha parts, e.g.
  //   "1pt"  → ["1","pt"]   "12" → ["12"]   "1 pt2" → ["1","pt","2"]
  //   "1a"   → ["1","a"]    "1b" → ["1","b"]
  const tokens = str.trim().split(/[-./\s]+/);   // split on delimiters first
  const parts = [];
  for (const tok of tokens) {
    // Further split each token into runs of digits vs letters
    const sub = tok.match(/[0-9]+|[A-Za-z]+/g);
    if (sub) parts.push(...sub);
  }
  if (parts.length === 0) return [0];
  return parts.map(p => {
    const n = Number(p);
    // Numbers sort naturally; letters sort after any number at the same
    // position but among themselves alphabetically (a=1, b=2, …)
    if (!isNaN(n)) return n;
    return p.toLowerCase().charCodeAt(0) + 10000;   // 'a'→10097, 'b'→10098 …
  });
}

/* ── Color class ── */
function _colorClass(scene) {
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  const isInt = ie === 'INT' || ie === 'INT/EXT';
  const isExt = ie === 'EXT';
  if (dn === 'DAWN') return 'bd-slug--dawn';
  if (dn === 'DUSK') return 'bd-slug--dusk';
  if (isInt && dn === 'DAY') return 'bd-slug--int-day';
  if (isExt && dn === 'DAY') return 'bd-slug--ext-day';
  if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--int-night';
  if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--ext-night';
  return '';
}

function _dnAbbrev(scene) {
  const dn = (scene.dayNight || '').toUpperCase();
  if (dn === 'DAY') return 'D';
  if (dn === 'NITE' || dn === 'NIGHT') return 'N';
  if (dn === 'DAWN') return 'Dn';
  if (dn === 'DUSK') return 'Dk';
  return scene.dayNight || '';
}

/* ══════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════ */
function _render() {
  const scenes = _sortBySceneNum(_getScenes());

  const slugsHTML = scenes.length === 0
    ? '<p class="ol-empty">No scenes in the Breakdown yet. Add scenes there first.</p>'
    : scenes.map(scene => _renderSlug(scene)).join('');

  _container.innerHTML = `
    <section class="ol-section">
      <div class="ol-toolbar">
        <button class="btn btn--ghost btn--sm" id="so-back">← Back</button>
        <h2>One-Liner (Script Order)</h2>
        <div class="ol-toolbar-actions">
          <label class="so-draft-label">Draft v<input type="text" class="so-draft-input" id="so-draft-ver" value="${esc(_settings.draftVersion || '')}" placeholder="1.0" /></label>
          <label class="so-draft-label">Date<input type="date" class="so-draft-input so-draft-date" id="so-draft-date" value="${esc(_settings.draftDate || '')}" /></label>
          <button class="btn btn--ghost btn--sm" id="so-print-btn">Print / PDF</button>
        </div>
      </div>

      <div class="ol-list" id="so-list">
        ${slugsHTML}
      </div>
    </section>
  `;

  _wireEvents();
}

function _renderSlug(scene) {
  const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
  const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
  const bgCount = scene.bgCount ?? '';
  const locAddr = scene.locationAddress || '';
  const cc = _colorClass(scene);
  const dnStr = _dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '');

  return `<div class="ol-item">
    <div class="bd-slug ${cc}">
      <div class="bd-slug-cell bd-slug-scnum"><span class="bd-slug-val-bold">${esc(scene.sceneNum || '—')}</span></div>
      <div class="bd-slug-cell bd-slug-setting">
        <span class="bd-slug-val-bold">${esc(setting || '—')}</span>
        <span class="bd-slug-desc">${esc(scene.description || '')}</span>
      </div>
      <div class="bd-slug-cell bd-slug-dn"><span class="bd-slug-val">${esc(dnStr)}</span></div>
      <div class="bd-slug-cell bd-slug-pg"><span class="bd-slug-val">${esc(scene.pageCount || '')}</span></div>
      <div class="bd-slug-cell bd-slug-cast">
        <span class="bd-slug-val">${castIds ? 'Cast: ' + esc(castIds) : ''}</span>
        <span class="bd-slug-bg">BG: ${esc(bgCount)}</span>
      </div>
      <div class="bd-slug-cell bd-slug-loc"><span class="bd-slug-val">${esc(locAddr)}</span></div>
      <div class="bd-slug-cell bd-slug-timing"><span class="bd-slug-val">${esc(scene.timing || '')}</span></div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   EVENTS
   ══════════════════════════════════════════════════════════════ */
function _wireEvents() {
  _container.querySelector('#so-back').addEventListener('click', () => {
    _collectDraft();
    window.location.hash = '#schedules';
  });

  _container.querySelector('#so-print-btn').addEventListener('click', () => {
    _collectDraft();
    _openPrintView();
  });

  // Auto-save draft fields on change
  ['so-draft-ver', 'so-draft-date'].forEach(id => {
    const el = _container.querySelector('#' + id);
    if (el) el.addEventListener('change', _collectDraft);
  });
}

function _collectDraft() {
  _settings.draftVersion = _container.querySelector('#so-draft-ver')?.value?.trim() || '';
  _settings.draftDate = _container.querySelector('#so-draft-date')?.value || '';
  _saveSettings();
}

/* ══════════════════════════════════════════════════════════════
   PRINT VIEW
   ══════════════════════════════════════════════════════════════ */
function _openPrintView() {
  const scenes = _sortBySceneNum(_getScenes());
  const projectName = _getProjectName();
  const draftVer = _settings.draftVersion || '—';
  const draftDate = _settings.draftDate ? _formatDate(_settings.draftDate) : '—';

  const slugRows = scenes.map(scene => {
    const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
    const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
    const bgCount = scene.bgCount ?? '';
    const locAddr = scene.locationAddress || '';
    const dnStr = _dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '');
    const ck = _getColorKey(scene);

    return `<tr class="so-row so-row--${ck}">
      <td class="so-td so-td--scnum">${_e(scene.sceneNum || '—')}</td>
      <td class="so-td so-td--setting"><strong>${_e(setting || '—')}</strong>${scene.description ? '<br><em>' + _e(scene.description) + '</em>' : ''}</td>
      <td class="so-td so-td--dn">${_e(dnStr)}</td>
      <td class="so-td so-td--pg">${_e(scene.pageCount || '')}</td>
      <td class="so-td so-td--cast">${castIds ? 'Cast: ' + _e(castIds) : ''}${bgCount ? '<br>BG: ' + _e(bgCount) : ''}</td>
      <td class="so-td so-td--loc">${_e(locAddr)}</td>
      <td class="so-td so-td--timing">${_e(scene.timing || '')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Script Order — ${_e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.hdr{text-align:center;padding:12px 0 8px;border-bottom:2px solid #000;margin-bottom:4px;position:relative}
.hdr-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.hdr-sub{font-size:12px;margin-top:2px;color:#333}
.hdr-date{position:absolute;top:12px;right:0;font-size:10px;color:#333}
table{width:100%;border-collapse:collapse;margin-top:2px}
th{font-size:10px;font-weight:700;text-align:left;border-bottom:1.5px solid #000;padding:3px 4px}
.so-td{padding:4px 5px;border-bottom:1px solid #999;font-size:10.5px;vertical-align:top}
.so-td--scnum{width:7%;font-weight:700;text-align:center}
.so-td--setting{width:28%}
.so-td--dn{width:6%;text-align:center;font-style:italic}
.so-td--pg{width:7%;text-align:center}
.so-td--cast{width:22%}
.so-td--loc{width:18%;text-align:center;font-style:italic;font-size:10px}
.so-td--timing{width:7%;text-align:center}
.so-row--int-day td{background:#fff}
.so-row--ext-day td{background:#f5e6a3}
.so-row--int-night td{background:#b8cce4}
.so-row--ext-night td{background:#3a5a8c;color:#fff}
.so-row--dawn td{background:#f5d6a8}
.so-row--dusk td{background:#cdb4e0}
em{font-size:9.5px}
@page{margin:0.75in 0.5in 0.6in 0.5in}
.hdr{position:relative}
.hdr-date-right{position:absolute;top:12px;right:0;font-size:10px;color:#333}
.running-foot{position:fixed;bottom:0;right:0;font-size:9px;color:#555}
.running-date{position:fixed;top:0;right:0;font-size:10px;color:#333}
</style></head><body>
<div class="running-date">${_e(draftDate)}</div>
<div class="running-foot" id="pg-foot"></div>
<div class="hdr">
  <div class="hdr-title">${_e(projectName)} — SCRIPT ORDER</div>
  <div class="hdr-sub">Based on Script Draft v${_e(draftVer)} — ${_e(draftDate)}</div>
</div>
<table>
  <thead><tr>
    <th>Sc #</th><th>Set / Synopsis</th><th>D/N</th><th>Pages</th><th>Cast / BG</th><th>Location</th><th>Time</th>
  </tr></thead>
  <tbody>${slugRows}</tbody>
</table>
<script>
window.onload=function(){
  // Compute total page count and stamp it into the fixed footer
  var bodyH=document.body.scrollHeight;
  // Approximate printable height per page in px (~9.15in at 96dpi)
  var pageH=879;
  var total=Math.max(1,Math.ceil(bodyH/pageH));
  var foot=document.getElementById('pg-foot');
  // For single-page docs, just show "1"
  // For multi-page, Chrome repeats position:fixed on each printed page
  // but content stays the same; show total as fallback
  if(total===1){
    foot.textContent='1';
  } else {
    // Use CSS counters via generated content for per-page numbering
    var s=document.createElement('style');
    s.textContent='.running-foot{counter-reset:none}.running-foot::after{content:counter(page)}';
    document.head.appendChild(s);
    foot.textContent='';
  }
  window.print();
}
</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function _e(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function _getColorKey(scene) {
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  const isInt = ie === 'INT' || ie === 'INT/EXT';
  const isExt = ie === 'EXT';
  if (dn === 'DAWN') return 'dawn';
  if (dn === 'DUSK') return 'dusk';
  if (isInt && dn === 'DAY') return 'int-day';
  if (isExt && dn === 'DAY') return 'ext-day';
  if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'int-night';
  if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'ext-night';
  return 'default';
}
