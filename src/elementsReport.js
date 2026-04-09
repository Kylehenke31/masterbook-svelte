/* ============================================================
   The Masterbook — elementsReport.js
   Elements Report: Master list of all elements across scenes.
   Editable here — changes propagate to Breakdowns and One-Liners.
   ============================================================ */

const BD_KEY       = 'movie-ledger-breakdowns';
const ELEMENTS_KEY = 'movie-ledger-elements';

const DEPARTMENTS = [
  'Background Actors', 'Stunts', 'Vehicles', 'Property', 'Camera', 'Electric',
  'Special Effects', 'Wardrobe', 'Makeup/Hair', 'Music', 'Sound',
  'Art Department', 'Set Dressing', 'Greenery', 'Special Equipment',
  'Security', 'Additional Labor', 'Visual Effects', 'Mechanical Effects',
  'Extras', 'Costumes', 'Set Construction', 'Animals', 'Animal Wrangler',
  'Livestock', 'Makeup', 'Miscellaneous', 'Notes',
];

let _container = null;
let _scenes    = [];
let _elements  = {};

/* ── Entry ── */
export function renderElementsReport(container) {
  _container = container;
  _load();
  _render();
}

/* ── Persistence ── */
function _load() {
  try { _scenes = JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { _scenes = []; }
  try { _elements = JSON.parse(localStorage.getItem(ELEMENTS_KEY)) || {}; } catch { _elements = {}; }
}
function _save() {
  localStorage.setItem(BD_KEY, JSON.stringify(_scenes));
  localStorage.setItem(ELEMENTS_KEY, JSON.stringify(_elements));
}

function _getProjectName() {
  try {
    const p = JSON.parse(localStorage.getItem('movie-ledger-project'));
    return p?.title || 'Untitled Project';
  } catch { return 'Untitled Project'; }
}

function _e(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Build usage map ── */
function _getUsage() {
  const usage = {};
  _scenes.forEach((scene, si) => {
    DEPARTMENTS.forEach(dept => {
      (scene.departments?.[dept] || []).forEach(item => {
        if (item.elementId) {
          if (!usage[item.elementId]) usage[item.elementId] = [];
          usage[item.elementId].push(scene.sceneNum || `Scene ${si + 1}`);
        }
      });
    });
  });
  return usage;
}

/* ══════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════ */
function _render() {
  const usage = _getUsage();

  // Group elements by department
  const byDept = {};
  for (const el of Object.values(_elements)) {
    if (!byDept[el.department]) byDept[el.department] = [];
    byDept[el.department].push(el);
  }

  const deptsWithElements = DEPARTMENTS.filter(d => byDept[d]?.length > 0);
  const totalElements = Object.keys(_elements).length;

  const deptsHTML = deptsWithElements.length === 0
    ? '<p class="er-empty">No elements yet. Elements are created when you add items to departments in the Scene Breakdown editor.</p>'
    : deptsWithElements.map(dept => {
        const els = byDept[dept].sort((a, b) => a.name.localeCompare(b.name));
        const rows = els.map(el => {
          const scenes = usage[el.id] || [];
          return `<div class="er-row" data-el-id="${el.id}">
            <input type="text" class="er-name" data-el-id="${el.id}" value="${_e(el.name)}" />
            <span class="er-scenes" title="${_e(scenes.join(', '))}">${scenes.length} scene${scenes.length !== 1 ? 's' : ''}: ${_e(scenes.join(', '))}</span>
            <button class="btn btn--ghost btn--sm er-del" data-el-id="${el.id}" title="Delete">✕</button>
          </div>`;
        }).join('');
        return `<div class="er-dept-group">
          <h4 class="er-dept-name">${_e(dept)} <span class="er-dept-count">(${els.length})</span></h4>
          ${rows}
        </div>`;
      }).join('');

  _container.innerHTML = `
    <section class="er-section">
      <div class="er-toolbar">
        <button class="btn btn--ghost btn--sm" id="er-back">← Back</button>
        <h2>Elements Report <span class="er-total">(${totalElements})</span></h2>
        <div class="er-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="er-print-btn">Print / PDF</button>
        </div>
      </div>
      <p class="er-hint">Edit an element name below and it will update everywhere. The scene list shows where each element is used.</p>
      <div class="er-list">${deptsHTML}</div>
    </section>
  `;

  // Back
  _container.querySelector('#er-back').addEventListener('click', () => {
    window.location.hash = '#schedules';
  });

  // Print
  _container.querySelector('#er-print-btn').addEventListener('click', () => _openPrintView());

  // Rename on blur
  _container.querySelectorAll('.er-name').forEach(inp => {
    inp.addEventListener('blur', () => {
      const elId = inp.dataset.elId;
      const newName = inp.value.trim();
      if (!newName || !_elements[elId]) return;
      const oldName = _elements[elId].name;
      if (newName === oldName) return;
      _elements[elId].name = newName;
      _scenes.forEach(scene => {
        DEPARTMENTS.forEach(dept => {
          (scene.departments?.[dept] || []).forEach(item => {
            if (item.elementId === elId) item.text = newName;
          });
        });
      });
      _save();
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  });

  // Delete
  _container.querySelectorAll('.er-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const elId = btn.dataset.elId;
      const el = _elements[elId];
      if (!el) return;
      const scenes = usage[elId] || [];
      if (scenes.length > 0 && !confirm(`"${el.name}" is used in ${scenes.length} scene(s). Remove it from all?`)) return;
      _scenes.forEach(scene => {
        DEPARTMENTS.forEach(dept => {
          if (scene.departments?.[dept]) {
            scene.departments[dept] = scene.departments[dept].filter(item => item.elementId !== elId);
          }
        });
      });
      delete _elements[elId];
      _save();
      _render();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   PRINT VIEW
   ══════════════════════════════════════════════════════════════ */
function _openPrintView() {
  const projectName = _getProjectName();
  const usage = _getUsage();
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const byDept = {};
  for (const el of Object.values(_elements)) {
    if (!byDept[el.department]) byDept[el.department] = [];
    byDept[el.department].push(el);
  }

  const deptsWithElements = DEPARTMENTS.filter(d => byDept[d]?.length > 0);

  let bodyHTML = '';
  for (const dept of deptsWithElements) {
    const els = byDept[dept].sort((a, b) => a.name.localeCompare(b.name));
    bodyHTML += `<div class="dept-group"><h3 class="dept-title">${_e(dept)}</h3>`;
    bodyHTML += `<table class="el-table"><thead><tr><th>Element</th><th>Scenes</th></tr></thead><tbody>`;
    for (const el of els) {
      const scenes = (usage[el.id] || []).join(', ') || '—';
      bodyHTML += `<tr><td class="el-name">${_e(el.name)}</td><td class="el-scenes">${_e(scenes)}</td></tr>`;
    }
    bodyHTML += '</tbody></table></div>';
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Elements — ${_e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;background:#fff}
@media print{@page{margin:0.6in}}
.hdr{text-align:center;padding:12px 0 8px;border-bottom:2px solid #000;margin-bottom:12px}
.hdr-title{font-size:16px;font-weight:700;text-transform:uppercase}
.hdr-sub{font-size:11px;margin-top:2px;color:#333}
.dept-group{margin-bottom:14px}
.dept-title{font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:4px}
.el-table{width:100%;border-collapse:collapse;margin-bottom:8px}
.el-table th{font-size:9px;text-align:left;padding:2px 4px;border-bottom:1px solid #999}
.el-name{font-size:10px;padding:2px 4px;border-bottom:0.5px solid #ddd}
.el-scenes{font-size:9px;color:#555;padding:2px 4px;border-bottom:0.5px solid #ddd}
</style></head><body>
<div class="hdr">
  <div class="hdr-title">${_e(projectName)} — ELEMENTS REPORT</div>
  <div class="hdr-sub">${_e(today)}</div>
</div>
${bodyHTML}
<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}
