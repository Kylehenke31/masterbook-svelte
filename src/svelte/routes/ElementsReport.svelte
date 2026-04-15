<script>
  import { navigate } from '../stores/router.js';

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

  // ── State ──────────────────────────────────────────────────
  let scenes   = $state([]);
  let elements = $state({});

  // ── Load ───────────────────────────────────────────────────
  try { scenes   = JSON.parse(localStorage.getItem(BD_KEY))       || []; } catch { scenes   = []; }
  try { elements = JSON.parse(localStorage.getItem(ELEMENTS_KEY)) || {}; } catch { elements = {}; }

  // ── Persistence ────────────────────────────────────────────
  function save() {
    localStorage.setItem(BD_KEY,       JSON.stringify(scenes));
    localStorage.setItem(ELEMENTS_KEY, JSON.stringify(elements));
  }

  function getProjectName() {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project'))?.title || 'Untitled Project'; }
    catch { return 'Untitled Project'; }
  }

  // ── Usage map: elementId → [sceneNum, ...] ─────────────────
  function getUsage() {
    const usage = {};
    scenes.forEach((scene, si) => {
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

  // ── Derived display data ───────────────────────────────────
  let byDept = $derived.by(() => {
    const map = {};
    for (const el of Object.values(elements)) {
      if (!map[el.department]) map[el.department] = [];
      map[el.department].push(el);
    }
    return map;
  });

  let deptsWithElements = $derived(
    DEPARTMENTS.filter(d => byDept[d]?.length > 0)
  );

  let totalElements = $derived(Object.keys(elements).length);

  // ── Rename ─────────────────────────────────────────────────
  function renameElement(elId, newName) {
    newName = newName.trim();
    if (!newName || !elements[elId] || newName === elements[elId].name) return;
    elements[elId].name = newName;
    scenes.forEach(scene => {
      DEPARTMENTS.forEach(dept => {
        (scene.departments?.[dept] || []).forEach(item => {
          if (item.elementId === elId) item.text = newName;
        });
      });
    });
    elements = { ...elements };
    scenes = [...scenes];
    save();
  }

  // ── Delete ─────────────────────────────────────────────────
  function deleteElement(elId) {
    const el = elements[elId];
    if (!el) return;
    const usage = getUsage();
    const usedIn = usage[elId] || [];
    if (usedIn.length > 0 && !confirm(`"${el.name}" is used in ${usedIn.length} scene(s). Remove it from all?`)) return;
    scenes.forEach(scene => {
      DEPARTMENTS.forEach(dept => {
        if (scene.departments?.[dept]) {
          scene.departments[dept] = scene.departments[dept].filter(item => item.elementId !== elId);
        }
      });
    });
    const updated = { ...elements };
    delete updated[elId];
    elements = updated;
    scenes = [...scenes];
    save();
  }

  // ── Print ──────────────────────────────────────────────────
  function openPrintView() {
    const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const projectName = getProjectName();
    const usage = getUsage();
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let bodyHTML = '';
    for (const dept of deptsWithElements) {
      const els = (byDept[dept] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      bodyHTML += `<div class="dept-group"><h3 class="dept-title">${e(dept)}</h3>`;
      bodyHTML += `<table class="el-table"><thead><tr><th>Element</th><th>Scenes</th></tr></thead><tbody>`;
      for (const el of els) {
        const s = (usage[el.id] || []).join(', ') || '—';
        bodyHTML += `<tr><td class="el-name">${e(el.name)}</td><td class="el-scenes">${e(s)}</td></tr>`;
      }
      bodyHTML += '</tbody></table></div>';
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Elements — ${e(projectName)}</title>
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
  <div class="hdr-title">${e(projectName)} — ELEMENTS REPORT</div>
  <div class="hdr-sub">${e(today)}</div>
</div>
${bodyHTML}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }
</script>

<section class="er-section">
  <div class="er-toolbar">
    <button class="btn btn--ghost btn--sm" onclick={() => navigate('schedules')}>← Back</button>
    <h2>Elements Report <span class="er-total">({totalElements})</span></h2>
    <div class="er-toolbar-actions">
      <button class="btn btn--ghost btn--sm" onclick={openPrintView}>Print / PDF</button>
    </div>
  </div>

  <p class="er-hint">
    Edit an element name below and it will update everywhere.
    The scene list shows where each element is used.
  </p>

  <div class="er-list">
    {#if deptsWithElements.length === 0}
      <p class="er-empty">
        No elements yet. Elements are created when you add items to departments in the Scene Breakdown editor.
      </p>
    {:else}
      {#each deptsWithElements as dept}
        {@const els = (byDept[dept] || []).slice().sort((a, b) => a.name.localeCompare(b.name))}
        {@const usage = getUsage()}
        <div class="er-dept-group">
          <h4 class="er-dept-name">
            {dept} <span class="er-dept-count">({els.length})</span>
          </h4>
          {#each els as el (el.id)}
            {@const sceneList = usage[el.id] || []}
            <div class="er-row">
              <input
                type="text"
                class="er-name"
                value={el.name}
                onblur={e => renameElement(el.id, e.target.value)}
                onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }}}
              />
              <span class="er-scenes" title={sceneList.join(', ')}>
                {sceneList.length} scene{sceneList.length !== 1 ? 's' : ''}{sceneList.length > 0 ? ': ' + sceneList.join(', ') : ''}
              </span>
              <button
                class="btn btn--ghost btn--sm er-del"
                onclick={() => deleteElement(el.id)}
                title="Delete"
              >✕</button>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .er-section {
    max-width: 900px;
    margin: 0 auto;
  }

  .er-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .er-toolbar h2 {
    flex: 1;
    font-size: 1.25rem;
  }

  .er-total {
    font-size: 0.875rem;
    color: var(--text-muted, #888);
    font-weight: 400;
  }

  .er-hint {
    font-size: 0.8rem;
    color: var(--text-muted, #888);
    margin-bottom: 20px;
  }

  .er-empty {
    color: var(--text-muted, #888);
    font-size: 0.9rem;
    padding: 32px 0;
    text-align: center;
  }

  .er-dept-group {
    margin-bottom: 24px;
  }

  .er-dept-name {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #888);
    border-bottom: 1px solid var(--border, #333);
    padding-bottom: 4px;
    margin-bottom: 6px;
  }

  .er-dept-count {
    font-weight: 400;
    opacity: 0.7;
  }

  .er-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border-subtle, #222);
  }

  .er-name {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 3px 6px;
    width: 220px;
    transition: border-color 0.15s;
  }

  .er-name:hover {
    border-color: var(--border, #333);
  }

  .er-name:focus {
    outline: none;
    border-color: var(--gold, #6a8a6a);
    background: var(--bg-elevated, #1e1e1e);
  }

  .er-scenes {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .er-del {
    opacity: 0;
    transition: opacity 0.15s;
    color: var(--earth-red, #b84f4f);
    flex-shrink: 0;
  }

  .er-row:hover .er-del {
    opacity: 1;
  }
</style>
