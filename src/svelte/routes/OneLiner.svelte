<script>
  import { onMount } from 'svelte';

  const OL_KEY       = 'movie-ledger-one-liner-drafts';
  const OL_ACTIVE    = 'movie-ledger-one-liner-active';
  const BD_KEY       = 'movie-ledger-breakdowns';
  const DAYTYPES_KEY = 'movie-ledger-crew-daytypes';

  let container;

  let _drafts       = {};
  let _activeDraftId = null;
  let _dragIdx      = null;

  /* ── Persistence ── */
  function _loadDrafts() {
    try { _drafts = JSON.parse(localStorage.getItem(OL_KEY)) || {}; } catch { _drafts = {}; }
    _activeDraftId = localStorage.getItem(OL_ACTIVE) || null;

    if (Object.keys(_drafts).length === 0) {
      try {
        const old = JSON.parse(localStorage.getItem('movie-ledger-one-liner'));
        if (Array.isArray(old) && old.length > 0) {
          const id = _uid();
          _drafts[id] = { name: 'Draft 1', items: old };
          _activeDraftId = id;
          _saveDrafts(); return;
        }
      } catch {}
      const id = _uid();
      _drafts[id] = { name: 'Draft 1', items: [] };
      _activeDraftId = id;
      _saveDrafts();
    }
    if (!_activeDraftId || !_drafts[_activeDraftId]) {
      _activeDraftId = Object.keys(_drafts)[0];
      localStorage.setItem(OL_ACTIVE, _activeDraftId);
    }
  }
  function _saveDrafts() {
    localStorage.setItem(OL_KEY, JSON.stringify(_drafts));
    localStorage.setItem(OL_ACTIVE, _activeDraftId);
  }
  function _items()           { return _drafts[_activeDraftId]?.items || []; }
  function _setItems(items)   { _drafts[_activeDraftId].items = items; }

  /* ── Helpers ── */
  function _uid()  { return crypto.randomUUID(); }
  function esc(s)  { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _getBreakdownScenes() { try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; } }
  function _getProjectName()     { try { return JSON.parse(localStorage.getItem('movie-ledger-project'))?.title || 'Untitled Project'; } catch { return 'Untitled Project'; } }
  function _findScene(id)        { return _getBreakdownScenes().find(s => s.id === id) || null; }
  function _getShootDates()      { try { const dt = JSON.parse(localStorage.getItem(DAYTYPES_KEY))||{}; return Object.entries(dt).filter(([,t])=>t==='shoot').map(([d])=>d).sort(); } catch { return []; } }
  function _fmtShootDate(str)    { if (!str) return ''; const d = new Date(str+'T12:00:00'); return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }

  function _parseTimingToMin(s) { if (!s) return 0; s=s.trim(); if (s.includes(':')) { const [h,m]=s.split(':').map(Number); return (h||0)*60+(m||0); } return Number(s)||0; }
  function _formatTimingTotal(m) { if (!m) return '0:00'; return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`; }
  function _parsePageCount(s) {
    if (!s) return 0; s=s.trim(); let total=0;
    for (const p of s.split(/\s+/)) { if (p.includes('/')) { const [n,d]=p.split('/'); if (d&&Number(d)) total+=Number(n)/Number(d); } else total+=Number(p)||0; }
    return total;
  }
  function _formatPageTotal(v) {
    const w=Math.floor(v), f=v-w;
    if (!f) return w.toString();
    const e=Math.round(f*8);
    if (!e) return w.toString(); if (e===8) return (w+1).toString();
    return w>0?`${w} ${e}/8`:`${e}/8`;
  }
  function _parseSceneNum(str) {
    if (!str) return [0];
    const parts=[];
    for (const tok of str.trim().split(/[-./\s]+/)) { const sub=tok.match(/[0-9]+|[A-Za-z]+/g); if (sub) parts.push(...sub); }
    return parts.length?parts.map(p=>{const n=Number(p);return isNaN(n)?p.toLowerCase().charCodeAt(0)+10000:n;}):[0];
  }
  function _sortBySceneNum(scenes) {
    return [...scenes].sort((a,b)=>{const na=_parseSceneNum(a.sceneNum),nb=_parseSceneNum(b.sceneNum);for(let i=0;i<Math.max(na.length,nb.length);i++){const va=na[i]??-1,vb=nb[i]??-1;if(va!==vb)return va-vb;}return 0;});
  }
  function _getDayNum(idx) { let c=0; for(let i=0;i<=idx;i++) if(_items()[i].type==='daybreak') c++; return c; }
  function _tallyDay(dbIdx) {
    const items=_items(); let start=0;
    for (let i=dbIdx-1;i>=0;i--) { if(items[i].type==='daybreak'){start=i+1;break;} }
    let pages=0,timing=0;
    for (let i=start;i<dbIdx;i++) { if(items[i].type==='scene'){const s=_findScene(items[i].sceneId);if(s){pages+=_parsePageCount(s.pageCount);timing+=_parseTimingToMin(s.timing);}}}
    return {pages,timing};
  }
  function _colorClass(scene) {
    const ie=(scene.intExt||'').toUpperCase(),dn=(scene.dayNight||'').toUpperCase();
    const isInt=ie==='INT'||ie==='INT/EXT',isExt=ie==='EXT';
    if(dn==='DAWN') return 'bd-slug--dawn'; if(dn==='DUSK') return 'bd-slug--dusk';
    if(isInt&&dn==='DAY') return 'bd-slug--int-day'; if(isExt&&dn==='DAY') return 'bd-slug--ext-day';
    if(isInt&&(dn==='NITE'||dn==='NIGHT')) return 'bd-slug--int-night';
    if(isExt&&(dn==='NITE'||dn==='NIGHT')) return 'bd-slug--ext-night';
    return '';
  }
  function _dnAbbrev(scene) { const dn=(scene.dayNight||'').toUpperCase(); if(dn==='DAY')return 'D'; if(dn==='NITE'||dn==='NIGHT')return 'N'; if(dn==='DAWN')return 'Dn'; if(dn==='DUSK')return 'Dk'; return scene.dayNight||''; }
  function _getColorKey(scene) {
    const ie=(scene.intExt||'').toUpperCase(),dn=(scene.dayNight||'').toUpperCase();
    const isInt=ie==='INT'||ie==='INT/EXT',isExt=ie==='EXT';
    if(dn==='DAWN')return 'dawn';if(dn==='DUSK')return 'dusk';
    if(isInt&&dn==='DAY')return 'int-day';if(isExt&&dn==='DAY')return 'ext-day';
    if(isInt&&(dn==='NITE'||dn==='NIGHT'))return 'int-night';if(isExt&&(dn==='NITE'||dn==='NIGHT'))return 'ext-night';
    return 'default';
  }

  /* ── Render ── */
  function _render() {
    if (!container) return;
    const items = _items();
    const draftKeys = Object.keys(_drafts);
    const draftOptions = draftKeys.map(id => `<option value="${esc(id)}"${id===_activeDraftId?' selected':''}>${esc(_drafts[id].name)}</option>`).join('');
    const slugsHTML = items.length === 0
      ? '<p class="ol-empty">No scenes added yet. Use the Scene Picker to add scenes.</p>'
      : items.map((item, idx) => _renderItem(item, idx)).join('');

    container.innerHTML = `
      <section class="ol-section">
        <div class="ol-toolbar">
          <button class="btn btn--ghost btn--sm" id="ol-back">← Back</button>
          <h2>One-Liner (Shoot Order)</h2>
          <div class="ol-toolbar-actions">
            <button class="btn btn--ghost btn--sm" id="ol-scene-picker-btn">Scene Picker</button>
            <button class="btn btn--ghost btn--sm" id="ol-add-blank">+ Divider</button>
            <button class="btn btn--ghost btn--sm" id="ol-add-daybreak">+ Day Break</button>
            <button class="btn btn--ghost btn--sm" id="ol-print-btn">Print / PDF</button>
            <button class="btn btn--primary btn--sm" id="ol-save">Save</button>
          </div>
        </div>
        <div class="ol-draft-bar">
          <label class="ol-draft-label">Draft:
            <select class="ol-draft-select" id="ol-draft-select">${draftOptions}</select>
          </label>
          <button class="btn btn--ghost btn--sm" id="ol-draft-new" title="New Draft">+ New</button>
          <button class="btn btn--ghost btn--sm" id="ol-draft-rename" title="Rename Draft">Rename</button>
          <button class="btn btn--ghost btn--sm" id="ol-draft-dup" title="Duplicate Draft">Duplicate</button>
          ${draftKeys.length > 1 ? '<button class="btn btn--ghost btn--sm ol-draft-del" id="ol-draft-del" title="Delete Draft">Delete</button>' : ''}
        </div>
        <div class="ol-list" id="ol-list">${slugsHTML}</div>
      </section>
      <div class="ol-picker-overlay" id="ol-picker-overlay" style="display:none;">
        <div class="ol-picker-modal" id="ol-picker-modal">
          <div class="ol-picker-header">
            <h3>Scene Picker</h3>
            <button class="btn btn--ghost btn--sm" id="ol-picker-close">✕</button>
          </div>
          <div class="ol-picker-body" id="ol-picker-body"></div>
        </div>
      </div>
    `;
    _wireEvents();
  }

  function _renderItem(item, idx) {
    const dragAttr = `draggable="true" data-idx="${idx}"`;
    if (item.type === 'blank') {
      const dText=item.text||'',dBold=item.bold?'active':'',dItal=item.italic?'active':'',dSize=item.fontSize||14;
      const dColor=item.fontColor||'#ffffff',dAlign=item.align||'center',dFill=item.fillColor||'#333333';
      const bStyle=item.bold?'font-weight:700;':'',iStyle=item.italic?'font-style:italic;':'';
      const aL=dAlign==='left'?'active':'',aC=dAlign==='center'?'active':'',aR=dAlign==='right'?'active':'';
      return `<div class="ol-item ol-item--divider" ${dragAttr}>
        <span class="ol-drag-handle" title="Drag to reorder">☰</span>
        <div class="ol-divider-wrap" style="background:${esc(dFill)};">
          <div class="ol-divider-toolbar" data-idx="${idx}">
            <button class="ol-div-btn ol-div-bold ${dBold}" data-act="bold" data-idx="${idx}" title="Bold">B</button>
            <button class="ol-div-btn ol-div-italic ${dItal}" data-act="italic" data-idx="${idx}" title="Italic"><em>I</em></button>
            <label class="ol-div-size-label" title="Font Size"><input type="number" class="ol-div-size" data-idx="${idx}" value="${dSize}" min="8" max="36" step="1"/><span>px</span></label>
            <label class="ol-div-color-label" title="Font Color">A<input type="color" class="ol-div-fcolor" data-idx="${idx}" value="${esc(dColor)}"/></label>
            <span class="ol-div-sep"></span>
            <button class="ol-div-btn ol-div-align ${aL}" data-act="left" data-idx="${idx}" title="Align Left">⫷</button>
            <button class="ol-div-btn ol-div-align ${aC}" data-act="center" data-idx="${idx}" title="Align Center">☰</button>
            <button class="ol-div-btn ol-div-align ${aR}" data-act="right" data-idx="${idx}" title="Align Right">⫸</button>
            <span class="ol-div-sep"></span>
            <label class="ol-div-color-label" title="Fill Color">▐<input type="color" class="ol-div-fill" data-idx="${idx}" value="${esc(dFill)}"/></label>
          </div>
          <input type="text" class="ol-divider-text" data-idx="${idx}" value="${esc(dText)}" placeholder="Enter divider text…"
            style="font-size:${dSize}px;color:${esc(dColor)};text-align:${dAlign};${bStyle}${iStyle}" />
        </div>
        <button class="btn btn--ghost btn--sm ol-item-dup" data-idx="${idx}" title="Duplicate">⧉</button>
        <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
      </div>`;
    }
    if (item.type === 'daybreak') {
      const dayNum=_getDayNum(idx),tally=_tallyDay(idx),shootDates=_getShootDates();
      const dateLabel=shootDates[dayNum-1]?` — ${_fmtShootDate(shootDates[dayNum-1])}`:'';
      return `<div class="ol-item ol-item--daybreak" ${dragAttr}>
        <span class="ol-drag-handle" title="Drag to reorder">☰</span>
        <div class="ol-daybreak-bar">
          <span class="ol-daybreak-label">END OF DAY ${dayNum}${esc(dateLabel)}</span>
          <span class="ol-daybreak-totals">
            <span class="ol-daybreak-pages">${_formatPageTotal(tally.pages)} pg</span>
            <span class="ol-daybreak-timing">${_formatTimingTotal(tally.timing)}</span>
          </span>
        </div>
        <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
      </div>`;
    }
    const scene = _findScene(item.sceneId);
    if (!scene) {
      return `<div class="ol-item ol-item--missing" ${dragAttr}>
        <span class="ol-drag-handle" title="Drag to reorder">☰</span>
        <div class="bd-slug"><div class="bd-slug-cell" style="grid-column:1/-1;text-align:center;color:#999;">Scene removed from breakdown</div></div>
        <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
      </div>`;
    }
    const setting=[scene.intExt,scene.location].filter(Boolean).join('  ');
    const castIds=(scene.castMembers||[]).map(c=>c.castNum||'').filter(Boolean).join(', ');
    const dnStr=_dnAbbrev(scene)+(scene.scriptDay?' '+scene.scriptDay:'');
    return `<div class="ol-item" ${dragAttr}>
      <span class="ol-drag-handle" title="Drag to reorder">☰</span>
      <div class="bd-slug ${_colorClass(scene)}">
        <div class="bd-slug-cell bd-slug-scnum"><span class="bd-slug-val-bold">${esc(scene.sceneNum||'—')}</span></div>
        <div class="bd-slug-cell bd-slug-setting"><span class="bd-slug-val-bold">${esc(setting||'—')}</span><span class="bd-slug-desc">${esc(scene.description||'')}</span></div>
        <div class="bd-slug-cell bd-slug-dn"><span class="bd-slug-val">${esc(dnStr)}</span></div>
        <div class="bd-slug-cell bd-slug-pg"><span class="bd-slug-val">${esc(scene.pageCount||'')}</span></div>
        <div class="bd-slug-cell bd-slug-cast"><span class="bd-slug-val">${castIds?'Cast: '+esc(castIds):''}</span><span class="bd-slug-bg">BG: ${esc(scene.bgCount??'')}</span></div>
        <div class="bd-slug-cell bd-slug-loc"><span class="bd-slug-val">${esc(scene.locationAddress||'')}</span></div>
        <div class="bd-slug-cell bd-slug-timing"><span class="bd-slug-val">${esc(scene.timing||'')}</span></div>
      </div>
      <button class="btn btn--ghost btn--sm ol-item-del" data-idx="${idx}" title="Remove">✕</button>
    </div>`;
  }

  /* ── Wire events ── */
  function _wireEvents() {
    container.querySelector('#ol-back').addEventListener('click', () => { _saveDrafts(); window.location.hash = '#schedules'; });
    container.querySelector('#ol-save').addEventListener('click', () => {
      _saveDrafts();
      const btn = container.querySelector('#ol-save');
      btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save', 1500);
    });
    container.querySelector('#ol-scene-picker-btn').addEventListener('click', () => _openPicker());
    container.querySelector('#ol-picker-close').addEventListener('click', () => _closePicker());
    container.querySelector('#ol-picker-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) _closePicker(); });
    container.querySelector('#ol-add-blank').addEventListener('click', () => { _items().push({ type: 'blank' }); _saveDrafts(); _render(); });
    container.querySelector('#ol-add-daybreak').addEventListener('click', () => { _items().push({ type: 'daybreak' }); _saveDrafts(); _render(); });
    container.querySelector('#ol-print-btn').addEventListener('click', () => _openPrintView());

    container.querySelector('#ol-draft-select').addEventListener('change', e => { _activeDraftId = e.target.value; _saveDrafts(); _render(); });
    container.querySelector('#ol-draft-new').addEventListener('click', () => {
      const id = _uid(); _drafts[id] = { name: `Draft ${Object.keys(_drafts).length + 1}`, items: [] };
      _activeDraftId = id; _saveDrafts(); _render();
    });
    container.querySelector('#ol-draft-rename').addEventListener('click', () => {
      const n = prompt('Rename draft:', _drafts[_activeDraftId].name);
      if (n?.trim()) { _drafts[_activeDraftId].name = n.trim(); _saveDrafts(); _render(); }
    });
    container.querySelector('#ol-draft-dup').addEventListener('click', () => {
      const src = _drafts[_activeDraftId], id = _uid();
      _drafts[id] = { name: src.name + ' (copy)', items: JSON.parse(JSON.stringify(src.items)) };
      _activeDraftId = id; _saveDrafts(); _render();
    });
    container.querySelector('#ol-draft-del')?.addEventListener('click', () => {
      if (!confirm(`Delete "${_drafts[_activeDraftId].name}"?`)) return;
      delete _drafts[_activeDraftId];
      _activeDraftId = Object.keys(_drafts)[0];
      _saveDrafts(); _render();
    });

    container.querySelectorAll('.ol-item-del').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _items().splice(Number(btn.dataset.idx), 1); _saveDrafts(); _render(); });
    });
    container.querySelectorAll('.ol-item-dup').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); const idx=Number(btn.dataset.idx), items=_items();
        items.splice(idx+1, 0, JSON.parse(JSON.stringify(items[idx])));
        _saveDrafts(); _render();
      });
    });
    container.querySelectorAll('.ol-divider-text').forEach(inp => {
      inp.addEventListener('input', () => { _items()[Number(inp.dataset.idx)].text = inp.value; _saveDrafts(); });
    });
    container.querySelectorAll('.ol-div-bold, .ol-div-italic').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); const idx=Number(btn.dataset.idx),act=btn.dataset.act;
        _items()[idx][act] = !_items()[idx][act]; _saveDrafts(); _render();
      });
    });
    container.querySelectorAll('.ol-div-size').forEach(inp => {
      inp.addEventListener('change', () => {
        _items()[Number(inp.dataset.idx)].fontSize = Math.max(8, Math.min(36, Number(inp.value)||14));
        _saveDrafts(); _render();
      });
    });
    container.querySelectorAll('.ol-div-fcolor').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx=Number(inp.dataset.idx); _items()[idx].fontColor = inp.value; _saveDrafts();
        const t = container.querySelector(`.ol-divider-text[data-idx="${idx}"]`); if(t) t.style.color = inp.value;
      });
    });
    container.querySelectorAll('.ol-div-align').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation(); _items()[Number(btn.dataset.idx)].align = btn.dataset.act; _saveDrafts(); _render();
      });
    });
    container.querySelectorAll('.ol-div-fill').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx=Number(inp.dataset.idx); _items()[idx].fillColor = inp.value; _saveDrafts();
        const w = inp.closest('.ol-divider-wrap'); if(w) w.style.background = inp.value;
      });
    });

    // Drag and drop
    container.querySelectorAll('.ol-item').forEach(el => {
      el.addEventListener('dragstart', e => {
        _dragIdx = Number(el.dataset.idx); el.classList.add('ol-item--dragging'); e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('ol-item--dragging'); _dragIdx = null;
        container.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d => d.classList.remove('ol-drop-above','ol-drop-below'));
      });
      el.addEventListener('dragover', e => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const t=Number(el.dataset.idx); if(t===_dragIdx) return;
        container.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d => d.classList.remove('ol-drop-above','ol-drop-below'));
        const rect=el.getBoundingClientRect();
        el.classList.add(e.clientY < rect.top+rect.height/2 ? 'ol-drop-above' : 'ol-drop-below');
      });
      el.addEventListener('dragleave', () => el.classList.remove('ol-drop-above','ol-drop-below'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        const t=Number(el.dataset.idx); if(_dragIdx===null||_dragIdx===t) return;
        const rect=el.getBoundingClientRect();
        let at=e.clientY<rect.top+rect.height/2?t:t+1;
        const cur=_items(); const [moved]=cur.splice(_dragIdx,1);
        if(at>_dragIdx) at--; cur.splice(at,0,moved);
        _dragIdx=null; _saveDrafts(); _render();
      });
    });
  }

  /* ── Scene Picker ── */
  function _openPicker() { container.querySelector('#ol-picker-overlay').style.display='flex'; _populatePicker(); }
  function _closePicker() { container.querySelector('#ol-picker-overlay').style.display='none'; }

  function _populatePicker() {
    const body = container.querySelector('#ol-picker-body');
    const allScenes = _sortBySceneNum(_getBreakdownScenes());
    const includedIds = new Set(_items().filter(i=>i.type==='scene').map(i=>i.sceneId));
    const allChecked = allScenes.length > 0 && allScenes.every(s=>includedIds.has(s.id));

    body.innerHTML = `
      <label class="ol-pick-row ol-pick-row--all">
        <input type="checkbox" id="ol-select-all" ${allChecked?'checked':''}/>
        <strong>Select All</strong>
      </label>
      <div class="ol-pick-list">
        ${allScenes.map(s => {
          const setting=[s.intExt,s.location].filter(Boolean).join(' ');
          return `<label class="ol-pick-row"><input type="checkbox" class="ol-pick-chk" data-scene-id="${esc(s.id)}"${includedIds.has(s.id)?' checked':''}/><span class="ol-pick-num">${esc(s.sceneNum||'?')}</span><span class="ol-pick-set">${esc(setting||'—')}</span><span class="ol-pick-syn">${esc(s.description||'')}</span></label>`;
        }).join('')}
      </div>`;

    body.querySelector('#ol-select-all')?.addEventListener('change', e => {
      body.querySelectorAll('.ol-pick-chk').forEach(c => c.checked = e.target.checked);
      _syncPickerToItems(); _updateSlugList();
    });
    body.querySelectorAll('.ol-pick-chk').forEach(chk => {
      chk.addEventListener('change', () => { _syncPickerToItems(); _updateSlugList(); });
    });
  }

  function _syncPickerToItems() {
    const allScenes = _getBreakdownScenes();
    const checked = new Set();
    container.querySelectorAll('.ol-pick-chk:checked').forEach(c => checked.add(c.dataset.sceneId));
    const items = _items();
    const filtered = items.filter(i => i.type !== 'scene' || checked.has(i.sceneId));
    _setItems(filtered);
    const existing = new Set(filtered.filter(i=>i.type==='scene').map(i=>i.sceneId));
    allScenes.forEach(s => { if (checked.has(s.id) && !existing.has(s.id)) filtered.push({ type:'scene', sceneId:s.id }); });
    _saveDrafts();
  }

  function _updateSlugList() {
    const listEl = container.querySelector('#ol-list');
    if (!listEl) return;
    const items = _items();
    listEl.innerHTML = items.length === 0
      ? '<p class="ol-empty">No scenes added yet. Use the Scene Picker to add scenes.</p>'
      : items.map((item, idx) => _renderItem(item, idx)).join('');
    // Re-wire drag+delete on new elements
    listEl.querySelectorAll('.ol-item-del').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _items().splice(Number(btn.dataset.idx), 1); _saveDrafts(); _updateSlugList(); });
    });
    listEl.querySelectorAll('.ol-item').forEach(el => {
      el.addEventListener('dragstart', e => { _dragIdx=Number(el.dataset.idx); el.classList.add('ol-item--dragging'); e.dataTransfer.effectAllowed='move'; });
      el.addEventListener('dragend', () => { el.classList.remove('ol-item--dragging'); _dragIdx=null; });
      el.addEventListener('dragover', e => {
        e.preventDefault(); const t=Number(el.dataset.idx); if(t===_dragIdx) return;
        listEl.querySelectorAll('.ol-drop-above,.ol-drop-below').forEach(d=>d.classList.remove('ol-drop-above','ol-drop-below'));
        const r=el.getBoundingClientRect(); el.classList.add(e.clientY<r.top+r.height/2?'ol-drop-above':'ol-drop-below');
      });
      el.addEventListener('dragleave', () => el.classList.remove('ol-drop-above','ol-drop-below'));
      el.addEventListener('drop', e => {
        e.preventDefault(); const t=Number(el.dataset.idx); if(_dragIdx===null||_dragIdx===t) return;
        const r=el.getBoundingClientRect(); let at=e.clientY<r.top+r.height/2?t:t+1;
        const cur=_items(); const [mv]=cur.splice(_dragIdx,1); if(at>_dragIdx) at--; cur.splice(at,0,mv);
        _dragIdx=null; _saveDrafts(); _updateSlugList();
      });
    });
  }

  /* ── Print / PDF ── */
  function _openPrintView() {
    const items = _items();
    const projectName = _getProjectName();
    const draftName = _drafts[_activeDraftId]?.name || 'Draft';
    const dateStr = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const _e = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const shootDates = _getShootDates();

    let rowsHTML = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'blank') {
        const dFill=item.fillColor||'#333333',dColor=item.fontColor||'#ffffff',dSize=item.fontSize||14,dAlign=item.align||'center';
        const bS=item.bold?'font-weight:700;':'',iS=item.italic?'font-style:italic;':'';
        rowsHTML += `<tr><td colspan="7" class="so-td so-td--divider" style="background:${_e(dFill)};color:${_e(dColor)};font-size:${dSize}px;text-align:${dAlign};${bS}${iS}padding:6px 8px;">${_e(item.text||'')}</td></tr>`;
        continue;
      }
      if (item.type === 'daybreak') {
        const dayNum=_getDayNum(i),tally=_tallyDay(i),sd=shootDates[dayNum-1];
        const pdLabel=sd?` — ${_fmtShootDate(sd)}`:'';
        rowsHTML += `<tr class="so-row--daybreak"><td colspan="3" class="so-td so-td--daybreak-label">END OF DAY ${dayNum}${_e(pdLabel)}</td><td class="so-td so-td--daybreak-pg">${_e(_formatPageTotal(tally.pages))}</td><td colspan="2" class="so-td"></td><td class="so-td so-td--daybreak-timing">${_e(_formatTimingTotal(tally.timing))}</td></tr>`;
        continue;
      }
      const scene = _findScene(item.sceneId); if (!scene) continue;
      const setting=[scene.intExt,scene.location].filter(Boolean).join('  ');
      const castIds=(scene.castMembers||[]).map(c=>c.castNum||'').filter(Boolean).join(', ');
      const dnStr=_dnAbbrev(scene)+(scene.scriptDay?' '+scene.scriptDay:'');
      const ck=_getColorKey(scene);
      rowsHTML += `<tr class="so-row so-row--${ck}"><td class="so-td so-td--scnum">${_e(scene.sceneNum||'—')}</td><td class="so-td so-td--setting"><strong>${_e(setting||'—')}</strong>${scene.description?'<br><em>'+_e(scene.description)+'</em>':''}</td><td class="so-td so-td--dn">${_e(dnStr)}</td><td class="so-td so-td--pg">${_e(scene.pageCount||'')}</td><td class="so-td so-td--cast">${castIds?'Cast: '+_e(castIds):''}${scene.bgCount?'<br>BG: '+_e(scene.bgCount):''}</td><td class="so-td so-td--loc">${_e(scene.locationAddress||'')}</td><td class="so-td so-td--timing">${_e(scene.timing||'')}</td></tr>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shoot Order — ${_e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.hdr{text-align:center;padding:12px 0 8px;border-bottom:2px solid #000;margin-bottom:4px;position:relative}
.hdr-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.hdr-sub{font-size:12px;margin-top:2px;color:#333}.hdr-date{position:absolute;top:12px;right:0;font-size:10px;color:#333}
table{width:100%;border-collapse:collapse;margin-top:2px}
th{font-size:10px;font-weight:700;text-align:left;border-bottom:1.5px solid #000;padding:3px 4px}
.so-td{padding:4px 5px;border-bottom:1px solid #999;font-size:10.5px;vertical-align:top}
.so-td--scnum{width:7%;font-weight:700;text-align:center}.so-td--setting{width:28%}
.so-td--dn{width:6%;text-align:center;font-style:italic}.so-td--pg{width:7%;text-align:center}
.so-td--cast{width:22%}.so-td--loc{width:18%;text-align:center;font-style:italic;font-size:10px}.so-td--timing{width:7%;text-align:center}
.so-row--int-day td{background:#fff}.so-row--ext-day td{background:#f5e6a3}.so-row--int-night td{background:#b8cce4}
.so-row--ext-night td{background:#3a5a8c;color:#fff}.so-row--dawn td{background:#f5d6a8}.so-row--dusk td{background:#cdb4e0}
.so-row--daybreak td{background:#222;color:#fff;font-weight:700;font-size:11px;padding:6px 8px;border-bottom:2px solid #000}
.so-td--daybreak-label{text-transform:uppercase;letter-spacing:0.05em}.so-td--daybreak-pg{text-align:center}.so-td--daybreak-timing{text-align:center}
em{font-size:9.5px}@page{margin:0.75in 0.5in 0.6in 0.5in}
.running-date{position:fixed;top:0;right:0;font-size:10px;color:#333}.running-foot{position:fixed;bottom:0;right:0;font-size:9px;color:#555}
</style></head><body>
<div class="running-date">${_e(dateStr)}</div>
<div class="hdr"><div class="hdr-title">${_e(projectName)} — SHOOT ORDER</div><div class="hdr-sub">${_e(draftName)} — ${_e(dateStr)}</div></div>
<table><thead><tr><th>Sc #</th><th>Set / Synopsis</th><th>D/N</th><th>Pages</th><th>Cast / BG</th><th>Location</th><th>Time</th></tr></thead>
<tbody>${rowsHTML}</tbody></table>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html); w.document.close();
  }

  onMount(() => {
    _loadDrafts();
    _render();
  });
</script>

<div bind:this={container}></div>
