/* ============================================================
   The Masterbook — shootingSchedule.js
   Shooting Schedule: Scene-by-scene booklet matching the
   Breakdown editor layout. Can be ordered by Script Order
   or from a Shoot Order draft.
   ============================================================ */

const BD_KEY       = 'movie-ledger-breakdowns';
const OL_DRAFTS    = 'movie-ledger-one-liner-drafts';
const ELEMENTS_KEY = 'movie-ledger-elements';
const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
const CAST_KEY     = 'movie-ledger-cast';

let _container = null;
let _orderMode = 'script';   // 'script' | draftId
let _scenes    = [];

/* ── Entry ── */
export function renderShootingSchedule(container) {
  _container = container;
  _loadScenes();
  _renderControls();
}

/* ── Persistence ── */
function _loadScenes() {
  try { _scenes = JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { _scenes = []; }
}

function _getElements() {
  try { return JSON.parse(localStorage.getItem(ELEMENTS_KEY)) || {}; } catch { return {}; }
}

function _getDrafts() {
  try { return JSON.parse(localStorage.getItem(OL_DRAFTS)) || {}; } catch { return {}; }
}

function _getProjectName() {
  try {
    const p = JSON.parse(localStorage.getItem('movie-ledger-project'));
    return p?.title || 'Untitled Project';
  } catch { return 'Untitled Project'; }
}

function _getCastMembers() {
  try {
    const raw = JSON.parse(localStorage.getItem('movie-ledger-cast'));
    if (!raw) return [];
    const members = [];
    if (raw._version === 2) {
      (raw.sections || []).forEach(sec => {
        (sec.memberIds || []).forEach(mid => {
          const p = raw.profiles?.[mid];
          if (!p) return;
          if (p.characterName?.trim() || p.legalName?.trim()) {
            members.push({ castNum: p.castNum || '', role: p.characterName || '', name: p.legalName || '' });
          }
        });
      });
    } else if (Array.isArray(raw)) {
      raw.forEach(section => {
        (section.rows || []).forEach(row => {
          if (row.name?.trim() || row.role?.trim()) {
            members.push({ castNum: row.castNum || '', role: row.role || '', name: row.name || '' });
          }
        });
      });
    }
    return members.sort((a, b) => (Number(a.castNum) || 999) - (Number(b.castNum) || 999));
  } catch { return []; }
}

/* ── Cast profile hold/off days ── */
function _getCastConflicts() {
  // Returns { castNum: { holdDays: Set, offDays: Set } }
  const conflicts = {};
  try {
    const raw = JSON.parse(localStorage.getItem(CAST_KEY));
    if (!raw || raw._version !== 2) return conflicts;
    for (const prof of Object.values(raw.profiles || {})) {
      if (!prof.castNum) continue;
      conflicts[prof.castNum] = {
        holdDays: new Set(prof.holdDays || []),
        offDays:  new Set(prof.offDays  || []),
      };
    }
  } catch { /* ignore */ }
  return conflicts;
}

function _getDayTypes() {
  try { return JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {}; } catch { return {}; }
}

/* Build shoot-date list (sorted) from day types */
function _buildShootDates() {
  const dayTypes = _getDayTypes();
  return Object.entries(dayTypes)
    .filter(([, type]) => type === 'shoot')
    .map(([dateStr]) => dateStr)
    .sort();
}

/* Build day-break groups from a draft → array of arrays of scene objects */
function _buildDayGroups(draft) {
  const sceneMap = {};
  _scenes.forEach(s => { sceneMap[s.id] = s; });
  const days = [];
  let cur = [];
  for (const item of draft.items) {
    if (item.type === 'scene') {
      const s = sceneMap[item.sceneId];
      if (s) cur.push(s);
    } else if (item.type === 'daybreak') {
      if (cur.length > 0) { days.push(cur); cur = []; }
    }
  }
  if (cur.length > 0) days.push(cur);
  return days;
}

/* Build sceneId → calendar date string mapping */
function _buildSceneDateMap(draft) {
  const dayGroups = _buildDayGroups(draft);
  const shootDates = _buildShootDates();
  const map = {}; // sceneId → 'YYYY-MM-DD'
  dayGroups.forEach((dayScenes, idx) => {
    const date = shootDates[idx]; // may be undefined if not enough shoot dates assigned
    if (!date) return;
    dayScenes.forEach(s => { map[s.id] = date; });
  });
  return map;
}

/* ── Helpers ── */
function _e(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _parseSceneNum(str) {
  if (!str) return [0];
  const tokens = str.trim().split(/[-./\s]+/);
  const parts = [];
  for (const tok of tokens) {
    const sub = tok.match(/[0-9]+|[A-Za-z]+/g);
    if (sub) parts.push(...sub);
  }
  if (parts.length === 0) return [0];
  return parts.map(p => {
    const n = Number(p);
    if (!isNaN(n)) return n;
    return p.toLowerCase().charCodeAt(0) + 10000;
  });
}

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

/* ── DEPARTMENTS list (matching breakdowns.js) ── */
const DEPARTMENTS = [
  'Background Actors', 'Stunts', 'Vehicles', 'Property', 'Camera', 'Electric',
  'Special Effects', 'Wardrobe', 'Makeup/Hair', 'Music', 'Sound',
  'Art Department', 'Set Dressing', 'Greenery', 'Special Equipment',
  'Security', 'Additional Labor', 'Visual Effects', 'Mechanical Effects',
  'Extras', 'Costumes', 'Set Construction', 'Animals', 'Animal Wrangler',
  'Livestock', 'Makeup', 'Miscellaneous', 'Notes',
];

/* ══════════════════════════════════════════════════════════════
   CONTROLS VIEW
   ══════════════════════════════════════════════════════════════ */
function _renderControls() {
  const drafts = _getDrafts();
  const draftKeys = Object.keys(drafts);

  const draftOptions = draftKeys.map(id =>
    `<option value="${_e(id)}">${_e(drafts[id].name)}</option>`
  ).join('');

  _container.innerHTML = `
    <section class="ss-section">
      <div class="ss-toolbar">
        <button class="btn btn--ghost btn--sm" id="ss-back">← Back</button>
        <h2>Shooting Schedule</h2>
      </div>
      <div class="ss-controls">
        <p class="ss-desc">Generate a scene-by-scene booklet. Choose how to order the scenes:</p>
        <div class="ss-order-row">
          <label class="ss-radio"><input type="radio" name="ss-order" value="script" checked /> Script Order</label>
          ${draftKeys.length > 0 ? `
          <label class="ss-radio"><input type="radio" name="ss-order" value="draft" /> Shoot Order Draft:</label>
          <select class="ss-draft-select" id="ss-draft-pick" ${_orderMode !== 'draft' ? 'disabled' : ''}>${draftOptions}</select>
          ` : '<span class="ss-hint">No Shoot Order drafts yet.</span>'}
        </div>
        <button class="btn btn--primary" id="ss-generate" style="margin-top:16px;">Generate & Print / PDF</button>
      </div>
    </section>
  `;

  _container.querySelector('#ss-back').addEventListener('click', () => {
    window.location.hash = '#schedules';
  });

  const radios = _container.querySelectorAll('input[name="ss-order"]');
  const draftSelect = _container.querySelector('#ss-draft-pick');
  radios.forEach(r => {
    r.addEventListener('change', () => {
      _orderMode = r.value === 'script' ? 'script' : 'draft';
      if (draftSelect) draftSelect.disabled = _orderMode !== 'draft';
    });
  });

  _container.querySelector('#ss-generate').addEventListener('click', () => {
    let orderedScenes;
    let activeDraft = null;
    if (_orderMode === 'draft' && draftSelect) {
      const draftId = draftSelect.value;
      const draft = drafts[draftId];
      if (!draft) { alert('Select a draft.'); return; }
      activeDraft = draft;
      orderedScenes = [];
      for (const item of draft.items) {
        if (item.type === 'scene') {
          const s = _scenes.find(sc => sc.id === item.sceneId);
          if (s) orderedScenes.push(s);
        }
      }
    } else {
      orderedScenes = _sortBySceneNum(_scenes);
    }
    _openPrintView(orderedScenes, activeDraft);
  });
}

/* ══════════════════════════════════════════════════════════════
   PRINT VIEW — Scene-by-scene booklet
   ══════════════════════════════════════════════════════════════ */
function _openPrintView(scenes, activeDraft) {
  const projectName = _getProjectName();
  const elements = _getElements();
  const castLookup = {};
  _getCastMembers().forEach(cm => { castLookup[cm.castNum] = cm; });

  // Conflict detection: only available when using a draft (scenes have dates)
  const sceneDateMap = activeDraft ? _buildSceneDateMap(activeDraft) : {};
  const castConflicts = _getCastConflicts();

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const totalPages = Math.ceil(scenes.length / 2);

  // Build scene blocks (no color coding — all white/black)
  const sceneBlocks = scenes.map((scene, i) => {
    const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
    const sceneDate = sceneDateMap[scene.id]; // 'YYYY-MM-DD' or undefined
    const castList = (scene.castMembers || []).map(cm => {
      const full = castLookup[cm.castNum];
      // Check for hold/off day conflict
      let conflictClass = '';
      let conflictTitle = '';
      if (sceneDate && cm.castNum && castConflicts[cm.castNum]) {
        const cc = castConflicts[cm.castNum];
        if (cc.holdDays.has(sceneDate)) {
          conflictClass = ' ss-cast-conflict';
          conflictTitle = ' title="HOLD DAY conflict"';
        } else if (cc.offDays.has(sceneDate)) {
          conflictClass = ' ss-cast-conflict ss-cast-conflict--off';
          conflictTitle = ' title="OFF DAY conflict"';
        }
      }
      return `<div class="ss-cast-row${conflictClass}"${conflictTitle}><span class="ss-cast-num">${_e(cm.castNum)}</span><span class="ss-cast-name">${_e(full?.role || cm.role || cm.name || '')}</span></div>`;
    }).join('');

    // Elements by department — bullet points under sub-headers
    let elementsHTML = '';
    const deptsWithItems = DEPARTMENTS.filter(d => (scene.departments?.[d] || []).length > 0);
    if (deptsWithItems.length > 0) {
      elementsHTML = '<div class="ss-elements">' + deptsWithItems.map(dept => {
        const bullets = scene.departments[dept].map(item =>
          `<li>${_e(elements[item.elementId]?.name || item.text || '')}</li>`
        ).join('');
        return `<div class="ss-elem-group">
          <div class="ss-elem-dept">${_e(dept)}</div>
          <ul class="ss-elem-list">${bullets}</ul>
        </div>`;
      }).join('') + '</div>';
    }

    return `
    <div class="ss-scene-block">
      <div class="ss-page-header">
        <div class="ss-scene-num">${_e(scene.sceneNum || '—')}</div>
        <div class="ss-scene-setting">${_e(setting || '—')}</div>
        <div class="ss-scene-dn">${_e(scene.dayNight || '')}</div>
      </div>

      <div class="ss-page-meta">
        <div class="ss-meta-item"><span class="ss-meta-label">Pages:</span> ${_e(scene.pageCount || '—')}</div>
        <div class="ss-meta-item"><span class="ss-meta-label">Script Day:</span> ${_e(scene.scriptDay || '—')}</div>
        <div class="ss-meta-item"><span class="ss-meta-label">Timing:</span> ${_e(scene.timing || '—')}</div>
        <div class="ss-meta-item"><span class="ss-meta-label">Script Pages:</span> ${_e(scene.scriptPages || '—')}</div>
        <div class="ss-meta-item"><span class="ss-meta-label">Location:</span> ${_e(scene.locationAddress || '—')}</div>
        <div class="ss-meta-item"><span class="ss-meta-label">BG:</span> ${_e(scene.bgCount || '—')}</div>
      </div>

      ${scene.description ? `<div class="ss-synopsis"><span class="ss-meta-label">Synopsis:</span> ${_e(scene.description)}</div>` : ''}

      ${castList ? `<div class="ss-cast-section"><div class="ss-section-title">Cast</div>${castList}</div>` : ''}

      ${elementsHTML}
    </div>`;
  });

  // Group into pages of 2 scenes each
  let pagesHTML = '';
  for (let p = 0; p < totalPages; p++) {
    const pageNum = p + 1;
    const scene1 = sceneBlocks[p * 2] || '';
    const scene2 = sceneBlocks[p * 2 + 1] || '';
    pagesHTML += `
    <div class="ss-page${p > 0 ? ' ss-page-break' : ''}">
      ${scene1}
      ${scene2 ? '<hr class="ss-divider">' + scene2 : ''}
      <div class="ss-page-footer">${_e(projectName)} — ${pageNum} of ${totalPages}</div>
    </div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shooting Schedule — ${_e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff}
@media print{@page{margin:0.5in}}
.ss-page{padding:20px 30px;min-height:9in;position:relative;display:flex;flex-direction:column}
.ss-page-break{page-break-before:always}
.ss-scene-block{margin-bottom:12px}
.ss-divider{border:none;border-top:2px solid #000;margin:16px 0}
.ss-page-header{display:flex;align-items:baseline;gap:12px;padding-bottom:8px;border-bottom:2px solid #000;margin-bottom:10px}
.ss-scene-num{font-size:20px;font-weight:700}
.ss-scene-setting{font-size:14px;font-weight:700;flex:1}
.ss-scene-dn{font-size:13px;font-weight:600;font-style:italic}
.ss-page-meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:8px;font-size:10px}
.ss-meta-item{display:flex;gap:4px}
.ss-meta-label{font-weight:700}
.ss-synopsis{font-size:10px;font-style:italic;margin-bottom:8px;padding:4px 8px;background:#f5f5f5;border-radius:3px}
.ss-cast-section{margin-bottom:8px}
.ss-section-title{font-weight:700;font-size:10px;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #000;padding-bottom:2px}
.ss-cast-row{display:flex;gap:8px;font-size:10px;padding:1px 0}
.ss-cast-num{font-weight:700;min-width:24px}
.ss-cast-conflict .ss-cast-num{color:#c00}
.ss-cast-conflict .ss-cast-name{color:#c00}
.ss-cast-conflict::after{content:'⚠';margin-left:4px;color:#c00;font-size:9px}
.ss-cast-conflict--off .ss-cast-num{color:#b00}
.ss-cast-conflict--off .ss-cast-name{color:#b00}
.ss-elements{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin-bottom:8px}
.ss-elem-group{break-inside:avoid}
.ss-elem-dept{font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.03em;border-bottom:1px solid #ccc;padding-bottom:1px;margin-bottom:2px}
.ss-elem-list{list-style:disc;padding-left:14px;font-size:9px;margin:0}
.ss-elem-list li{padding:1px 0}
.ss-page-footer{position:absolute;bottom:16px;left:30px;right:30px;text-align:center;font-size:8px;color:#555}
</style></head><body>
${pagesHTML}
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}
