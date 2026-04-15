<script>
  const BD_KEY       = 'movie-ledger-breakdowns';
  const OL_DRAFTS    = 'movie-ledger-one-liner-drafts';
  const ELEMENTS_KEY = 'movie-ledger-elements';
  const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';
  const CAST_KEY     = 'movie-ledger-cast';

  const DEPARTMENTS = [
    'Background Actors', 'Stunts', 'Vehicles', 'Property', 'Camera', 'Electric',
    'Special Effects', 'Wardrobe', 'Makeup/Hair', 'Music', 'Sound',
    'Art Department', 'Set Dressing', 'Greenery', 'Special Equipment',
    'Security', 'Additional Labor', 'Visual Effects', 'Mechanical Effects',
    'Extras', 'Costumes', 'Set Construction', 'Animals', 'Animal Wrangler',
    'Livestock', 'Makeup', 'Miscellaneous', 'Notes',
  ];

  /* ── State ── */
  let orderMode      = $state('script');   // 'script' | 'draft'
  let selectedDraftId = $state('');

  /* ── Data helpers ── */
  function getScenes()      { try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; } }
  function getDrafts()      { try { return JSON.parse(localStorage.getItem(OL_DRAFTS)) || {}; } catch { return {}; } }
  function getElements()    { try { return JSON.parse(localStorage.getItem(ELEMENTS_KEY)) || {}; } catch { return {}; } }
  function getProjectName() {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project'))?.title || 'Untitled Project'; }
    catch { return 'Untitled Project'; }
  }

  function getCastMembers() {
    try {
      const raw = JSON.parse(localStorage.getItem(CAST_KEY));
      if (!raw) return [];
      const members = [];
      if (raw._version === 2) {
        (raw.sections || []).forEach(sec => {
          (sec.memberIds || []).forEach(mid => {
            const p = raw.profiles?.[mid];
            if (!p) return;
            if (p.characterName?.trim() || p.legalName?.trim())
              members.push({ castNum: p.castNum || '', role: p.characterName || '', name: p.legalName || '' });
          });
        });
      } else if (Array.isArray(raw)) {
        raw.forEach(sec => (sec.rows || []).forEach(row => {
          if (row.name?.trim() || row.role?.trim())
            members.push({ castNum: row.castNum || '', role: row.role || '', name: row.name || '' });
        }));
      }
      return members.sort((a,b) => (Number(a.castNum)||999) - (Number(b.castNum)||999));
    } catch { return []; }
  }

  function getCastConflicts() {
    const c = {};
    try {
      const raw = JSON.parse(localStorage.getItem(CAST_KEY));
      if (!raw || raw._version !== 2) return c;
      for (const prof of Object.values(raw.profiles || {})) {
        if (!prof.castNum) continue;
        c[prof.castNum] = { holdDays: new Set(prof.holdDays||[]), offDays: new Set(prof.offDays||[]) };
      }
    } catch {}
    return c;
  }

  function buildShootDates() {
    try {
      const dt = JSON.parse(localStorage.getItem(DAYTYPES_KEY)) || {};
      return Object.entries(dt).filter(([,t])=>t==='shoot').map(([d])=>d).sort();
    } catch { return []; }
  }

  /* ── Sort ── */
  function parseSceneNum(str) {
    if (!str) return [0];
    const tokens = str.trim().split(/[-./\s]+/);
    const parts = [];
    for (const tok of tokens) { const sub = tok.match(/[0-9]+|[A-Za-z]+/g); if (sub) parts.push(...sub); }
    if (!parts.length) return [0];
    return parts.map(p => { const n=Number(p); return isNaN(n)?p.toLowerCase().charCodeAt(0)+10000:n; });
  }
  function sortBySceneNum(scenes) {
    return [...scenes].sort((a,b)=>{
      const na=parseSceneNum(a.sceneNum), nb=parseSceneNum(b.sceneNum);
      for (let i=0;i<Math.max(na.length,nb.length);i++){
        const va=na[i]??-1, vb=nb[i]??-1;
        if (va!==vb) return va-vb;
      }
      return 0;
    });
  }

  /* ── Derived ── */
  let drafts     = $derived(getDrafts());
  let draftKeys  = $derived(Object.keys(drafts));

  /* ── Generate ── */
  function generate() {
    const scenes = getScenes();
    let orderedScenes;
    let activeDraft = null;

    if (orderMode === 'draft' && selectedDraftId) {
      const draft = drafts[selectedDraftId];
      if (!draft) { alert('Select a draft.'); return; }
      activeDraft = draft;
      const sceneMap = {};
      scenes.forEach(s => { sceneMap[s.id] = s; });
      orderedScenes = [];
      for (const item of draft.items) {
        if (item.type === 'scene') {
          const s = sceneMap[item.sceneId];
          if (s) orderedScenes.push(s);
        }
      }
    } else {
      orderedScenes = sortBySceneNum(scenes);
    }

    openPrintView(orderedScenes, activeDraft);
  }

  function buildSceneDateMap(draft) {
    const scenes   = getScenes();
    const sceneMap = {};
    scenes.forEach(s => { sceneMap[s.id] = s; });
    const shootDates = buildShootDates();
    const days = [];
    let cur = [];
    for (const item of draft.items) {
      if (item.type === 'scene') { const s = sceneMap[item.sceneId]; if (s) cur.push(s); }
      else if (item.type === 'daybreak') { if (cur.length) { days.push(cur); cur = []; } }
    }
    if (cur.length) days.push(cur);
    const map = {};
    days.forEach((dayScenes, idx) => {
      const date = shootDates[idx];
      if (!date) return;
      dayScenes.forEach(s => { map[s.id] = date; });
    });
    return map;
  }

  /* ── Print ── */
  function openPrintView(scenes, activeDraft) {
    const projectName   = getProjectName();
    const elements      = getElements();
    const castLookup    = {};
    getCastMembers().forEach(cm => { castLookup[cm.castNum] = cm; });
    const sceneDateMap  = activeDraft ? buildSceneDateMap(activeDraft) : {};
    const castConflicts = getCastConflicts();
    const totalPages    = Math.max(1, Math.ceil(scenes.length / 2));

    const e = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const sceneBlocks = scenes.map(scene => {
      const setting    = [scene.intExt, scene.location].filter(Boolean).join('  ');
      const sceneDate  = sceneDateMap[scene.id];

      const castList = (scene.castMembers || []).map(cm => {
        const full = castLookup[cm.castNum];
        let conflictClass = '', conflictTitle = '';
        if (sceneDate && cm.castNum && castConflicts[cm.castNum]) {
          const cc = castConflicts[cm.castNum];
          if (cc.holdDays.has(sceneDate)) { conflictClass=' ss-cast-conflict'; conflictTitle=' title="HOLD DAY conflict"'; }
          else if (cc.offDays.has(sceneDate)) { conflictClass=' ss-cast-conflict ss-cast-conflict--off'; conflictTitle=' title="OFF DAY conflict"'; }
        }
        return `<div class="ss-cast-row${conflictClass}"${conflictTitle}><span class="ss-cast-num">${e(cm.castNum)}</span><span class="ss-cast-name">${e(full?.role||cm.role||cm.name||'')}</span></div>`;
      }).join('');

      const deptsWithItems = DEPARTMENTS.filter(d => (scene.departments?.[d]||[]).length > 0);
      let elementsHTML = '';
      if (deptsWithItems.length) {
        elementsHTML = '<div class="ss-elements">' + deptsWithItems.map(dept => {
          const bullets = scene.departments[dept].map(item => `<li>${e(elements[item.elementId]?.name||item.text||'')}</li>`).join('');
          return `<div class="ss-elem-group"><div class="ss-elem-dept">${e(dept)}</div><ul class="ss-elem-list">${bullets}</ul></div>`;
        }).join('') + '</div>';
      }

      return `<div class="ss-scene-block">
        <div class="ss-page-header">
          <div class="ss-scene-num">${e(scene.sceneNum||'—')}</div>
          <div class="ss-scene-setting">${e(setting||'—')}</div>
          <div class="ss-scene-dn">${e(scene.dayNight||'')}</div>
        </div>
        <div class="ss-page-meta">
          <div class="ss-meta-item"><span class="ss-meta-label">Pages:</span> ${e(scene.pageCount||'—')}</div>
          <div class="ss-meta-item"><span class="ss-meta-label">Script Day:</span> ${e(scene.scriptDay||'—')}</div>
          <div class="ss-meta-item"><span class="ss-meta-label">Timing:</span> ${e(scene.timing||'—')}</div>
          <div class="ss-meta-item"><span class="ss-meta-label">Script Pages:</span> ${e(scene.scriptPages||'—')}</div>
          <div class="ss-meta-item"><span class="ss-meta-label">Location:</span> ${e(scene.locationAddress||'—')}</div>
          <div class="ss-meta-item"><span class="ss-meta-label">BG:</span> ${e(scene.bgCount||'—')}</div>
        </div>
        ${scene.description?`<div class="ss-synopsis"><span class="ss-meta-label">Synopsis:</span> ${e(scene.description)}</div>`:''}
        ${castList?`<div class="ss-cast-section"><div class="ss-section-title">Cast</div>${castList}</div>`:''}
        ${elementsHTML}
      </div>`;
    });

    let pagesHTML = '';
    for (let p = 0; p < totalPages; p++) {
      const s1 = sceneBlocks[p*2] || '';
      const s2 = sceneBlocks[p*2+1] || '';
      pagesHTML += `<div class="ss-page${p>0?' ss-page-break':''}">${s1}${s2?'<hr class="ss-divider">'+s2:''}<div class="ss-page-footer">${e(projectName)} — ${p+1} of ${totalPages}</div></div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shooting Schedule — ${e(projectName)}</title>
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
.ss-cast-conflict .ss-cast-num,.ss-cast-conflict .ss-cast-name{color:#c00}
.ss-cast-conflict::after{content:'⚠';margin-left:4px;color:#c00;font-size:9px}
.ss-cast-conflict--off .ss-cast-num,.ss-cast-conflict--off .ss-cast-name{color:#b00}
.ss-elements{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin-bottom:8px}
.ss-elem-group{break-inside:avoid}
.ss-elem-dept{font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.03em;border-bottom:1px solid #ccc;padding-bottom:1px;margin-bottom:2px}
.ss-elem-list{list-style:disc;padding-left:14px;font-size:9px;margin:0}
.ss-elem-list li{padding:1px 0}
.ss-page-footer{position:absolute;bottom:16px;left:30px;right:30px;text-align:center;font-size:8px;color:#555}
</style></head><body>
${pagesHTML}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }
</script>

<section class="ss-section">
  <div class="ss-toolbar">
    <button class="btn btn--ghost btn--sm" onclick={() => window.location.hash = '#schedules'}>← Back</button>
    <h2>Shooting Schedule</h2>
  </div>

  <div class="ss-controls">
    <p class="ss-desc">Generate a scene-by-scene booklet. Choose how to order the scenes:</p>

    <div class="ss-order-row">
      <label class="ss-radio">
        <input type="radio" name="ss-order" value="script" bind:group={orderMode} /> Script Order
      </label>
      {#if draftKeys.length > 0}
        <label class="ss-radio">
          <input type="radio" name="ss-order" value="draft" bind:group={orderMode} /> Shoot Order Draft:
        </label>
        <select class="ss-draft-select" bind:value={selectedDraftId} disabled={orderMode !== 'draft'}>
          {#each draftKeys as id}
            <option value={id}>{drafts[id].name}</option>
          {/each}
        </select>
      {:else}
        <span class="ss-hint">No Shoot Order drafts yet.</span>
      {/if}
    </div>

    <button class="btn btn--primary" style="margin-top:16px;" onclick={generate}>
      Generate &amp; Print / PDF
    </button>
  </div>
</section>

<style>
  .ss-section { max-width: 600px; }

  .ss-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .ss-toolbar h2 { font-size: 1.1rem; }

  .ss-desc { color: var(--text-muted, #888); font-size: 0.875rem; margin-bottom: 16px; }

  .ss-order-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .ss-radio {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .ss-hint { font-size: 0.8rem; color: var(--text-muted, #888); }

  .ss-draft-select {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 5px 8px;
  }
  .ss-draft-select:disabled { opacity: 0.4; }
</style>
