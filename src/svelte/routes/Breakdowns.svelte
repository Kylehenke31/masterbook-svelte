<script>
  import { onMount } from 'svelte';

  const BD_KEY       = 'movie-ledger-breakdowns';
  const ELEMENTS_KEY = 'movie-ledger-elements';

  const DEPARTMENTS = [
    'Background Actors','Stunts','Vehicles','Property','Camera','Electric',
    'Special Effects','Wardrobe','Makeup/Hair','Music','Sound',
    'Art Department','Set Dressing','Greenery','Special Equipment',
    'Security','Additional Labor','Visual Effects','Mechanical Effects',
    'Extras','Costumes','Set Construction','Animals','Animal Wrangler',
    'Livestock','Makeup','Miscellaneous','Notes',
  ];

  let container;
  let _scenes  = [];
  let _elements = {};
  let _view    = 'edit';
  let _editIdx = 0;

  /* ── Persistence ── */
  function _load() {
    try { _scenes   = JSON.parse(localStorage.getItem(BD_KEY))       || []; } catch { _scenes   = []; }
    try { _elements = JSON.parse(localStorage.getItem(ELEMENTS_KEY)) || {}; } catch { _elements = {}; }
  }
  function _save() {
    localStorage.setItem(BD_KEY, JSON.stringify(_scenes));
    localStorage.setItem(ELEMENTS_KEY, JSON.stringify(_elements));
  }

  /* ── Helpers ── */
  function _uid()  { return crypto.randomUUID(); }
  function esc(s)  { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _blankScene() {
    const depts = {}; DEPARTMENTS.forEach(d => depts[d] = []);
    return { id:_uid(), sceneNum:'', intExt:'', location:'', dayNight:'', pageCount:'', description:'', bgCount:'', locationAddress:'', scriptDay:'', timing:'', scriptPages:'', castMembers:[], departments:depts };
  }
  function _parsePageCount(s) {
    if (!s) return 0; s=s.trim(); let t=0;
    for (const p of s.split(/\s+/)) { if(p.includes('/')){const [n,d]=p.split('/');if(d&&Number(d))t+=Number(n)/Number(d);}else t+=Number(p)||0; }
    return t;
  }
  function _formatPageTotal(v) {
    const w=Math.floor(v),f=v-w; if(!f)return w.toString();
    const e=Math.round(f*8); if(!e)return w.toString(); if(e===8)return(w+1).toString();
    return w>0?`${w} ${e}/8`:`${e}/8`;
  }
  function _getCastMembers() {
    try {
      const raw = JSON.parse(localStorage.getItem('movie-ledger-cast'));
      if (!raw) return [];
      const members = [];
      if (raw._version === 2) {
        (raw.sections||[]).forEach(sec => (sec.memberIds||[]).forEach(mid => {
          const p = raw.profiles?.[mid]; if (!p) return;
          if (p.characterName?.trim()||p.legalName?.trim()) members.push({castNum:p.castNum||'',role:p.characterName||'',name:p.legalName||''});
        }));
      } else if (Array.isArray(raw)) {
        raw.forEach(sec => (sec.rows||[]).forEach(row => {
          if (row.name?.trim()||row.role?.trim()) members.push({castNum:row.castNum||'',role:row.role||'',name:row.name||''});
        }));
      }
      return members.sort((a,b)=>(Number(a.castNum)||999)-(Number(b.castNum)||999));
    } catch { return []; }
  }
  function _findElement(name, dept) {
    const lower = name.toLowerCase();
    for (const [id, el] of Object.entries(_elements)) { if (el.name.toLowerCase()===lower && el.department===dept) return id; }
    return null;
  }
  function _buildStats() {
    const locSet=new Set(); _scenes.forEach(s=>{const l=(s.locationAddress||'').trim().toUpperCase();if(l)locSet.add(l);});
    const castSet=new Set(); _scenes.forEach(s=>(s.castMembers||[]).forEach(c=>{const k=c.castNum||c.name||c.role;if(k)castSet.add(k);}));
    const totalPages=_scenes.reduce((s,sc)=>s+_parsePageCount(sc.pageCount),0);
    const bgTotal=_scenes.reduce((s,sc)=>s+(Number(sc.bgCount)||0),0);
    const locsHTML=[...locSet].sort().map(l=>`<li>${esc(l)}</li>`).join('')||'<li class="bd-stats-none">No locations yet</li>';
    return `<div class="bd-stats">
      <h3 class="bd-stats-title">Breakdown Summary</h3>
      <div class="bd-stats-grid">
        <div class="bd-stat"><span class="bd-stat-val">${_scenes.length}</span><span class="bd-stat-label">Scenes</span></div>
        <div class="bd-stat"><span class="bd-stat-val">${locSet.size}</span><span class="bd-stat-label">Locations</span></div>
        <div class="bd-stat"><span class="bd-stat-val">${_formatPageTotal(totalPages)}</span><span class="bd-stat-label">Pages</span></div>
        <div class="bd-stat"><span class="bd-stat-val">${castSet.size}</span><span class="bd-stat-label">Cast</span></div>
        <div class="bd-stat"><span class="bd-stat-val">${bgTotal}</span><span class="bd-stat-label">Background</span></div>
      </div>
      <h4 class="bd-stats-subtitle">Locations</h4>
      <ul class="bd-stats-locations">${locsHTML}</ul>
    </div>`;
  }

  /* ── Render dispatch ── */
  function _render() {
    if (!container) return;
    if (_view === 'elements') _renderElements();
    else _renderEditor();
  }

  /* ── Scene card (for list view — not currently used as entry, but kept for reference) ── */
  function _sceneCard(scene, idx) {
    const ie=(scene.intExt||'').toUpperCase(),dn=(scene.dayNight||'').toUpperCase();
    const isInt=ie==='INT'||ie==='INT/EXT',isExt=ie==='EXT';
    let cc='';
    if(dn==='DAWN')cc='bd-slug--dawn';else if(dn==='DUSK')cc='bd-slug--dusk';
    else if(isInt&&dn==='DAY')cc='bd-slug--int-day';else if(isExt&&dn==='DAY')cc='bd-slug--ext-day';
    else if(isInt&&(dn==='NITE'||dn==='NIGHT'))cc='bd-slug--int-night';else if(isExt&&(dn==='NITE'||dn==='NIGHT'))cc='bd-slug--ext-night';
    let dnA=''; if(dn==='DAY')dnA='D';else if(dn==='NITE'||dn==='NIGHT')dnA='N';else if(dn==='DAWN')dnA='Dn';else if(dn==='DUSK')dnA='Dk';else dnA=scene.dayNight||'';
    const setting=[scene.intExt,scene.location].filter(Boolean).join('  ');
    const castIds=(scene.castMembers||[]).map(c=>c.castNum||'').filter(Boolean).join(', ');
    return `<div class="bd-card" data-idx="${idx}">
      <div class="bd-card-actions">
        <button class="btn btn--ghost btn--sm bd-card-dup" data-idx="${idx}" title="Duplicate">⧉</button>
        <button class="btn btn--ghost btn--sm bd-card-del" data-idx="${idx}" title="Delete">✕</button>
      </div>
      <div class="bd-slug ${cc}">
        <div class="bd-slug-cell bd-slug-scnum"><span class="bd-slug-val-bold">${esc(scene.sceneNum||'—')}</span></div>
        <div class="bd-slug-cell bd-slug-setting"><span class="bd-slug-val-bold">${esc(setting||'—')}</span><span class="bd-slug-desc">${esc(scene.description||'')}</span></div>
        <div class="bd-slug-cell bd-slug-dn"><span class="bd-slug-val">${esc(dnA)}${scene.scriptDay?' '+esc(scene.scriptDay):''}</span></div>
        <div class="bd-slug-cell bd-slug-pg"><span class="bd-slug-val">${esc(scene.pageCount||'')}</span></div>
        <div class="bd-slug-cell bd-slug-cast"><span class="bd-slug-val">${castIds?'Cast: '+esc(castIds):''}</span><span class="bd-slug-bg">BG: ${esc(scene.bgCount??'')}</span></div>
        <div class="bd-slug-cell bd-slug-loc"><span class="bd-slug-val">${esc(scene.locationAddress||'')}</span></div>
        <div class="bd-slug-cell bd-slug-timing"><span class="bd-slug-val">${esc(scene.timing||'')}</span></div>
      </div>
    </div>`;
  }

  /* ── Scene Editor ── */
  function _renderEditor() {
    if (_scenes.length === 0) { _scenes.push(_blankScene()); _save(); }
    if (_editIdx === null || _editIdx >= _scenes.length) _editIdx = 0;
    const scene = _scenes[_editIdx];
    const castMembers = _getCastMembers();
    const selectedCast = scene.castMembers || [];

    const castHTML = castMembers.length === 0
      ? '<p class="bd-hint">No cast members found. Add them in the Personnel › Cast tab first.</p>'
      : castMembers.map(cm => {
          const label = cm.castNum ? `${cm.castNum}. ${cm.role||cm.name}` : (cm.role||cm.name);
          const checked = selectedCast.some(sc=>sc.castNum===cm.castNum&&sc.name===cm.name) ? ' checked' : '';
          return `<label class="bd-cast-check"><input type="checkbox" data-cast-num="${esc(cm.castNum)}" data-cast-name="${esc(cm.name)}" data-cast-role="${esc(cm.role)}"${checked}/> ${esc(label)}</label>`;
        }).join('');

    const deptsHTML = DEPARTMENTS.map(dept => {
      const items = (scene.departments?.[dept] || []);
      const tagsHTML = items.map((item, ii) => {
        const elName = _elements[item.elementId]?.name || item.text || '';
        return `<div class="bd-dept-tag"><span class="bd-dept-tag-text">${esc(elName)}</span><button class="bd-dept-tag-del" data-dept="${esc(dept)}" data-item-idx="${ii}" title="Remove">✕</button></div>`;
      }).join('');
      return `<div class="bd-dept-section" data-dept="${esc(dept)}">
        <span class="bd-dept-name">${esc(dept)}</span>
        <div class="bd-dept-tags">${tagsHTML}</div>
        <div class="bd-dept-ac-wrap">
          <input type="text" class="bd-dept-input bd-dept-ac-input" data-dept="${esc(dept)}" placeholder="Add…" autocomplete="off" />
          <div class="bd-dept-ac-dropdown" data-dept-dd="${esc(dept)}"></div>
        </div>
      </div>`;
    }).join('');

    const timelineHTML = _scenes.map((s, si) =>
      `<span class="bd-tl-item${si===_editIdx?' bd-tl-item--active':''}" data-tl-idx="${si}" title="Scene ${esc(s.sceneNum||'?')}">${esc(s.sceneNum||'?')}</span>`
    ).join('');

    container.innerHTML = `
      <section class="bd-section">
        <div class="bd-toolbar">
          <button class="btn btn--ghost btn--sm" id="bd-back">← Back</button>
          <div class="bd-nav-arrows">
            <button class="btn btn--ghost btn--sm" id="bd-prev" ${_editIdx<=0?'disabled':''}>&lt;</button>
            <span class="bd-nav-label">Scene ${esc(scene.sceneNum||'?')} <span class="bd-nav-count">(${_editIdx+1} of ${_scenes.length})</span></span>
            <button class="btn btn--ghost btn--sm" id="bd-next" ${_editIdx>=_scenes.length-1?'disabled':''}>&gt;</button>
          </div>
          <div class="bd-toolbar-actions">
            <button class="btn btn--ghost btn--sm" id="bd-elements-btn">Key Elements</button>
            <button class="btn btn--ghost btn--sm" id="bd-dup-scene">⧉ Duplicate</button>
            <button class="btn btn--ghost btn--sm" id="bd-del-scene">✕ Delete</button>
            <button class="btn btn--primary btn--sm" id="bd-add-scene">+ Add Scene</button>
            <button class="btn btn--primary btn--sm" id="bd-save">Save</button>
          </div>
        </div>
        <div class="bd-timeline">${timelineHTML}</div>
        <div class="bd-editor-scroll">
          <div class="bd-editor">
            <fieldset class="bd-fieldset">
              <legend>Scene Info</legend>
              <div class="bd-meta-row">
                <label class="bd-label">Scene #<input type="text" class="bd-input" id="bd-sceneNum" value="${esc(scene.sceneNum)}" /></label>
                <label class="bd-label">Int/Ext
                  <select class="bd-select" id="bd-intExt">
                    <option value="">—</option>
                    <option value="INT"${scene.intExt==='INT'?' selected':''}>INT</option>
                    <option value="EXT"${scene.intExt==='EXT'?' selected':''}>EXT</option>
                    <option value="INT/EXT"${scene.intExt==='INT/EXT'?' selected':''}>INT/EXT</option>
                  </select>
                </label>
                <label class="bd-label bd-label--set-wrap bd-label--grow">Set
                  <div class="bd-set-ac-wrap">
                    <input type="text" class="bd-input" id="bd-location" value="${esc(scene.location)}" autocomplete="off" />
                    <div class="bd-set-ac-dropdown" id="bd-set-dropdown"></div>
                  </div>
                </label>
                <label class="bd-label">D/N
                  <select class="bd-select" id="bd-dayNight">
                    <option value="">—</option>
                    <option value="DAY"${scene.dayNight==='DAY'?' selected':''}>DAY</option>
                    <option value="NITE"${scene.dayNight==='NITE'?' selected':''}>NITE</option>
                    <option value="DAWN"${scene.dayNight==='DAWN'?' selected':''}>DAWN</option>
                    <option value="DUSK"${scene.dayNight==='DUSK'?' selected':''}>DUSK</option>
                  </select>
                </label>
              </div>
              <div class="bd-meta-row">
                <label class="bd-label bd-label--grow">Synopsis<input type="text" class="bd-input" id="bd-description" maxlength="100" value="${esc(scene.description)}" /></label>
              </div>
              <div class="bd-meta-row">
                <label class="bd-label">Page Count<input type="text" class="bd-input" id="bd-pageCount" value="${esc(scene.pageCount)}" placeholder="e.g. 3/8" /></label>
                <label class="bd-label">Script Day<input type="text" class="bd-input" id="bd-scriptDay" value="${esc(scene.scriptDay)}" /></label>
                <label class="bd-label">BG Count<input type="text" class="bd-input" id="bd-bgCount" value="${esc(scene.bgCount)}" /></label>
                <label class="bd-label bd-label--grow">Location / Address<input type="text" class="bd-input" id="bd-locationAddress" value="${esc(scene.locationAddress)}" /></label>
                <label class="bd-label">Timing<input type="text" class="bd-input" id="bd-timing" value="${esc(scene.timing)}" placeholder="e.g. 01:30" /></label>
                <label class="bd-label">Script Pages<input type="text" class="bd-input" id="bd-scriptPages" value="${esc(scene.scriptPages)}" /></label>
              </div>
            </fieldset>
            <fieldset class="bd-fieldset">
              <legend>Cast Members</legend>
              <div class="bd-cast-grid">${castHTML}</div>
            </fieldset>
            <fieldset class="bd-fieldset">
              <legend>Elements</legend>
              <div class="bd-depts">${deptsHTML}</div>
            </fieldset>
          </div>
        </div>
      </section>
    `;

    _attachEditorListeners(scene);
  }

  function _collectScene(scene) {
    scene.sceneNum        = container.querySelector('#bd-sceneNum')?.value?.trim() || '';
    scene.intExt          = container.querySelector('#bd-intExt')?.value || '';
    scene.location        = container.querySelector('#bd-location')?.value?.trim() || '';
    scene.dayNight        = container.querySelector('#bd-dayNight')?.value || '';
    scene.pageCount       = container.querySelector('#bd-pageCount')?.value?.trim() || '';
    scene.scriptDay       = container.querySelector('#bd-scriptDay')?.value?.trim() || '';
    scene.bgCount         = container.querySelector('#bd-bgCount')?.value?.trim() || '';
    scene.locationAddress = container.querySelector('#bd-locationAddress')?.value?.trim() || '';
    scene.timing          = container.querySelector('#bd-timing')?.value?.trim() || '';
    scene.scriptPages     = container.querySelector('#bd-scriptPages')?.value?.trim() || '';
    scene.description     = container.querySelector('#bd-description')?.value?.trim() || '';
    scene.castMembers = [];
    container.querySelectorAll('.bd-cast-check input:checked').forEach(chk => {
      scene.castMembers.push({ castNum:chk.dataset.castNum, name:chk.dataset.castName, role:chk.dataset.castRole });
    });
  }

  function _attachEditorListeners(scene) {
    container.querySelector('#bd-back').addEventListener('click', () => { _collectScene(scene); _save(); window.location.hash = '#schedules'; });
    container.querySelector('#bd-save').addEventListener('click', () => {
      _collectScene(scene); _save();
      const btn = container.querySelector('#bd-save');
      btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save', 1500);
    });
    container.querySelector('#bd-add-scene').addEventListener('click', () => {
      _collectScene(scene); _save(); _scenes.push(_blankScene()); _save();
      _editIdx = _scenes.length - 1; _renderEditor();
    });
    container.querySelector('#bd-dup-scene').addEventListener('click', () => {
      _collectScene(scene); _save();
      const dupe = JSON.parse(JSON.stringify(scene)); dupe.id = _uid(); dupe.sceneNum = (dupe.sceneNum||'')+' (copy)';
      _scenes.splice(_editIdx+1, 0, dupe); _save(); _editIdx = _editIdx+1; _renderEditor();
    });
    container.querySelector('#bd-del-scene').addEventListener('click', () => {
      const label = scene.sceneNum || `Scene ${_editIdx+1}`;
      if (!confirm(`Delete scene "${label}"?`)) return;
      _scenes.splice(_editIdx, 1);
      if (_scenes.length === 0) _scenes.push(_blankScene());
      _editIdx = Math.min(_editIdx, _scenes.length-1); _save(); _renderEditor();
    });
    container.querySelector('#bd-elements-btn').addEventListener('click', () => { _collectScene(scene); _save(); _view='elements'; _render(); });

    container.querySelector('#bd-prev')?.addEventListener('click', () => { _collectScene(scene); _save(); _editIdx=Math.max(0,_editIdx-1); _renderEditor(); });
    container.querySelector('#bd-next')?.addEventListener('click', () => { _collectScene(scene); _save(); _editIdx=Math.min(_scenes.length-1,_editIdx+1); _renderEditor(); });

    container.querySelectorAll('.bd-tl-item').forEach(item => {
      item.addEventListener('click', () => { _collectScene(scene); _save(); _editIdx=Number(item.dataset.tlIdx); _renderEditor(); });
    });

    // Set autocomplete
    const setInput = container.querySelector('#bd-location');
    const setDD    = container.querySelector('#bd-set-dropdown');
    if (setInput && setDD) {
      const allSets = []; _scenes.forEach(s=>{const l=(s.location||'').trim();if(l&&!allSets.includes(l))allSets.push(l);}); allSets.sort();
      const showDD = () => {
        const q=setInput.value.trim().toLowerCase();
        const f=allSets.filter(s=>!q||s.toLowerCase().includes(q));
        if(!f.length){setDD.style.display='none';return;}
        setDD.innerHTML=f.map(s=>`<div class="bd-ac-option" data-ac-val="${esc(s)}">${esc(s)}</div>`).join('');
        setDD.style.display='block';
        setDD.querySelectorAll('.bd-ac-option').forEach(opt=>{opt.addEventListener('mousedown',e=>{e.preventDefault();setInput.value=opt.dataset.acVal;setDD.style.display='none';});});
      };
      setInput.addEventListener('input', showDD); setInput.addEventListener('focus', showDD);
      setInput.addEventListener('blur', ()=>setTimeout(()=>setDD.style.display='none',150));
    }

    // Department element autocomplete
    container.querySelectorAll('.bd-dept-ac-input').forEach(inp => {
      const dept = inp.dataset.dept;
      const dd   = container.querySelector(`[data-dept-dd="${CSS.escape(dept)}"]`);
      const getExisting = () => { const s=new Set(); for(const el of Object.values(_elements)){if(el.department===dept)s.add(el.name);} return [...s].sort(); };
      const showDD = () => {
        const q=inp.value.trim().toLowerCase(), existing=getExisting();
        const cur=(scene.departments?.[dept]||[]).map(it=>(_elements[it.elementId]?.name||it.text||'').toLowerCase());
        const f=existing.filter(n=>!cur.includes(n.toLowerCase())&&(!q||n.toLowerCase().includes(q)));
        if(!f.length){if(dd){dd.innerHTML='';dd.style.display='none';}return;}
        if(dd){dd.innerHTML=f.map(n=>`<div class="bd-ac-option" data-ac-val="${esc(n)}">${esc(n)}</div>`).join('');dd.style.display='block';
          dd.querySelectorAll('.bd-ac-option').forEach(opt=>{opt.addEventListener('mousedown',e=>{e.preventDefault();_addElement(dept,opt.dataset.acVal,scene);});});}
      };
      inp.addEventListener('input', showDD); inp.addEventListener('focus', showDD);
      inp.addEventListener('blur', ()=>setTimeout(()=>{if(dd)dd.style.display='none';},150));
      inp.addEventListener('keydown', e=>{if(e.key==='Enter'){e.preventDefault();const t=inp.value.trim();if(t)_addElement(dept,t,scene);}});
    });

    container.querySelectorAll('.bd-dept-tag-del').forEach(btn => {
      btn.addEventListener('click', () => {
        _collectScene(scene);
        const dept=btn.dataset.dept, ii=Number(btn.dataset.itemIdx);
        scene.departments[dept].splice(ii,1); _save(); _renderEditor();
      });
    });
  }

  function _addElement(dept, text, scene) {
    if (!scene.departments[dept]) scene.departments[dept] = [];
    let elementId = _findElement(text, dept);
    if (!elementId) { elementId=_uid(); _elements[elementId]={id:elementId,name:text,department:dept}; }
    scene.departments[dept].push({ elementId, text });
    _save(); _renderEditor();
  }

  /* ── Key Elements view ── */
  function _renderElements() {
    const byDept = {};
    for (const el of Object.values(_elements)) { if(!byDept[el.department])byDept[el.department]=[]; byDept[el.department].push(el); }
    const usageCount = {};
    _scenes.forEach(scene => DEPARTMENTS.forEach(dept => (scene.departments?.[dept]||[]).forEach(item => { if(item.elementId) usageCount[item.elementId]=(usageCount[item.elementId]||0)+1; })));
    const active = DEPARTMENTS.filter(d=>byDept[d]?.length>0);
    const total  = Object.keys(_elements).length;

    const deptsHTML = active.length === 0
      ? '<p class="bd-empty">No key elements yet. Elements are created automatically when you add items to department breakdowns in a scene.</p>'
      : active.map(dept => {
          const rows = byDept[dept].sort((a,b)=>a.name.localeCompare(b.name)).map(el => {
            const count = usageCount[el.id]||0;
            return `<div class="bd-el-row" data-el-id="${el.id}">
              <input type="text" class="bd-el-name" data-el-id="${el.id}" value="${esc(el.name)}" />
              <span class="bd-el-count" title="Used in ${count} scene(s)">${count} scene${count!==1?'s':''}</span>
              <button class="btn btn--ghost btn--sm bd-el-del" data-el-id="${el.id}" title="Delete element">✕</button>
            </div>`;
          }).join('');
          return `<div class="bd-el-dept"><h4 class="bd-el-dept-name">${esc(dept)}</h4>${rows}</div>`;
        }).join('');

    container.innerHTML = `
      <section class="bd-section">
        <div class="bd-toolbar">
          <button class="btn btn--ghost btn--sm" id="bd-el-back">← Back to Scenes</button>
          <h2>Key Elements <span class="bd-el-total">(${total})</span></h2>
          <div class="bd-toolbar-actions"></div>
        </div>
        <div class="bd-editor-scroll">
          <p class="bd-hint">Edit an element name below and it will update everywhere that element appears across all scene breakdowns.</p>
          <div class="bd-elements-list">${deptsHTML}</div>
        </div>
      </section>
    `;

    container.querySelector('#bd-el-back').addEventListener('click', () => { _view='edit'; _render(); });

    container.querySelectorAll('.bd-el-name').forEach(inp => {
      inp.addEventListener('blur', () => {
        const elId=inp.dataset.elId, newName=inp.value.trim();
        if (!newName||!_elements[elId]) return;
        const old=_elements[elId].name; if(newName===old) return;
        _elements[elId].name=newName;
        _scenes.forEach(scene=>DEPARTMENTS.forEach(dept=>(scene.departments?.[dept]||[]).forEach(item=>{if(item.elementId===elId)item.text=newName;})));
        _save();
      });
      inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inp.blur();} });
    });

    container.querySelectorAll('.bd-el-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const elId=btn.dataset.elId, el=_elements[elId]; if(!el) return;
        const count=usageCount[elId]||0;
        if (count>0&&!confirm(`"${el.name}" is used in ${count} scene(s). Remove it from all?`)) return;
        _scenes.forEach(scene=>DEPARTMENTS.forEach(dept=>{if(scene.departments?.[dept]) scene.departments[dept]=scene.departments[dept].filter(item=>item.elementId!==elId);}));
        delete _elements[elId]; _save(); _renderElements();
      });
    });
  }

  onMount(() => {
    _load();
    if (_scenes.length === 0) { _scenes.push(_blankScene()); _save(); }
    if (_editIdx === null || _editIdx >= _scenes.length) _editIdx = 0;
    _render();
  });
</script>

<div bind:this={container}></div>
