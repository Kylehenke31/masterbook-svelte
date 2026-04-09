/* ============================================================
   The Masterbook — breakdowns.js
   Scene Breakdown Editor with Key Elements management.
   Each scene has metadata (number, int/ext, location, D/N, pages)
   plus department categories containing key element references.
   ============================================================ */

const BD_KEY       = 'movie-ledger-breakdowns';
const ELEMENTS_KEY = 'movie-ledger-elements';

/* ── Department categories ── */
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
let _elements  = {};  // { elementId: { id, name, department } }
let _view      = 'list';       // 'list' | 'edit' | 'elements'
let _editIdx   = null;

/* ── Entry ── */
export function renderBreakdowns(container) {
  _container = container;
  _load();
  if (_scenes.length === 0) {
    _scenes.push(_blankScene());
    _save();
  }
  if (_editIdx === null || _editIdx >= _scenes.length) _editIdx = 0;
  _view = 'edit';
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

/* ── Cast data (for cast member picker) — supports v1 and v2 formats ── */
function _getCastMembers() {
  try {
    const raw = JSON.parse(localStorage.getItem('movie-ledger-cast'));
    if (!raw) return [];
    const members = [];
    if (raw._version === 2) {
      // v2: profiles-based
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
      // v1: sections with rows
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

/* ── Render dispatch ── */
function _render() {
  if (_view === 'elements') _renderElements();
  else                      _renderEditor();  // always go to editor (no slug list)
}

/* ══════════════════════════════════════════════════════════════
   SCENE LIST
   ══════════════════════════════════════════════════════════════ */
function _parsePageCount(str) {
  if (!str) return 0;
  str = str.trim();
  // "1 2/8" → 1 + 2/8, "3/8" → 3/8, "2" → 2
  const parts = str.split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/');
      if (den && Number(den)) total += Number(num) / Number(den);
    } else {
      total += Number(p) || 0;
    }
  }
  return total;
}

function _formatPageTotal(val) {
  // Convert decimal back to eighths display: 1.375 → "1 3/8"
  const whole = Math.floor(val);
  const frac = val - whole;
  if (frac === 0) return whole.toString();
  const eighths = Math.round(frac * 8);
  if (eighths === 0) return whole.toString();
  if (eighths === 8) return (whole + 1).toString();
  return whole > 0 ? `${whole} ${eighths}/8` : `${eighths}/8`;
}

function _buildStats() {
  const sceneCount = _scenes.length;

  // Unique locations
  const locSet = new Set();
  _scenes.forEach(s => {
    const loc = (s.locationAddress || '').trim().toUpperCase();
    if (loc) locSet.add(loc);
  });
  const locationCount = locSet.size;
  const locationList = Array.from(locSet).sort();

  // Total pages
  const totalPages = _scenes.reduce((sum, s) => sum + _parsePageCount(s.pageCount), 0);

  // Unique cast count
  const castSet = new Set();
  _scenes.forEach(s => {
    (s.castMembers || []).forEach(c => {
      const key = c.castNum || c.name || c.role;
      if (key) castSet.add(key);
    });
  });
  const castCount = castSet.size;

  // Total BG
  const bgTotal = _scenes.reduce((sum, s) => sum + (Number(s.bgCount) || 0), 0);

  const locsHTML = locationList.length
    ? locationList.map(l => `<li>${esc(l)}</li>`).join('')
    : '<li class="bd-stats-none">No locations yet</li>';

  return `
    <div class="bd-stats">
      <h3 class="bd-stats-title">Breakdown Summary</h3>
      <div class="bd-stats-grid">
        <div class="bd-stat">
          <span class="bd-stat-val">${sceneCount}</span>
          <span class="bd-stat-label">Scenes</span>
        </div>
        <div class="bd-stat">
          <span class="bd-stat-val">${locationCount}</span>
          <span class="bd-stat-label">Locations</span>
        </div>
        <div class="bd-stat">
          <span class="bd-stat-val">${_formatPageTotal(totalPages)}</span>
          <span class="bd-stat-label">Pages</span>
        </div>
        <div class="bd-stat">
          <span class="bd-stat-val">${castCount}</span>
          <span class="bd-stat-label">Cast</span>
        </div>
        <div class="bd-stat">
          <span class="bd-stat-val">${bgTotal}</span>
          <span class="bd-stat-label">Background</span>
        </div>
      </div>
      <h4 class="bd-stats-subtitle">Locations</h4>
      <ul class="bd-stats-locations">${locsHTML}</ul>
    </div>`;
}

function _renderList() {
  const scenesHTML = _scenes.length === 0
    ? '<p class="bd-empty">No scenes yet. Add your first scene to begin building the breakdown.</p>'
    : _scenes.map((s, i) => _sceneCard(s, i)).join('');

  const statsHTML = _scenes.length > 0 ? _buildStats() : '';

  _container.innerHTML = `
    <section class="bd-section">
      <div class="bd-toolbar">
        <h2>Scene Breakdowns</h2>
        <div class="bd-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="bd-elements-btn">Key Elements</button>
          <button class="btn btn--primary btn--sm" id="bd-add-scene">+ Add Scene</button>
        </div>
      </div>
      <div class="bd-list-wrapper">
        <div class="bd-list">${scenesHTML}</div>
        ${statsHTML}
      </div>
    </section>
  `;

  _container.querySelector('#bd-add-scene').addEventListener('click', () => {
    _scenes.push(_blankScene());
    _save();
    _editIdx = _scenes.length - 1;
    _view = 'edit';
    _render();
  });
  _container.querySelector('#bd-elements-btn').addEventListener('click', () => {
    _view = 'elements';
    _render();
  });
  /* Card clicks */
  _container.querySelectorAll('.bd-card').forEach(card => {
    card.addEventListener('click', () => {
      _editIdx = Number(card.dataset.idx);
      _view = 'edit';
      _render();
    });
  });

  /* Delete buttons */
  _container.querySelectorAll('.bd-card-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const label = _scenes[idx].sceneNum || `Scene ${idx + 1}`;
      if (!confirm(`Delete scene "${label}"?`)) return;
      _scenes.splice(idx, 1);
      _save();
      _render();
    });
  });

  /* Duplicate buttons */
  _container.querySelectorAll('.bd-card-dup').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const dupe = JSON.parse(JSON.stringify(_scenes[idx]));
      dupe.id = _uid();
      dupe.sceneNum = dupe.sceneNum + ' (copy)';
      _scenes.splice(idx + 1, 0, dupe);
      _save();
      _render();
    });
  });
}

function _sceneCard(scene, idx) {
  const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
  const castIds = (scene.castMembers || [])
    .map(c => c.castNum || '')
    .filter(Boolean)
    .join(', ');
  const bgCount = scene.bgCount ?? '';
  const locAddr = scene.locationAddress || '';

  /* Color-coding based on INT/EXT + DAY/NIGHT */
  const ie = (scene.intExt || '').toUpperCase();
  const dn = (scene.dayNight || '').toUpperCase();
  const isInt = ie === 'INT' || ie === 'INT/EXT';
  const isExt = ie === 'EXT';
  const isDay = dn === 'DAY';
  const isNight = dn === 'NITE' || dn === 'NIGHT';
  const isDawn = dn === 'DAWN';
  const isDusk = dn === 'DUSK';
  let colorClass = '';
  if (isDawn)                  colorClass = 'bd-slug--dawn';
  else if (isDusk)             colorClass = 'bd-slug--dusk';
  else if (isInt && isDay)     colorClass = 'bd-slug--int-day';
  else if (isExt && isDay)     colorClass = 'bd-slug--ext-day';
  else if (isInt && isNight)   colorClass = 'bd-slug--int-night';
  else if (isExt && isNight)   colorClass = 'bd-slug--ext-night';

  /* Abbreviate D/N */
  let dnAbbrev = '';
  if (dn === 'DAY') dnAbbrev = 'D';
  else if (dn === 'NITE' || dn === 'NIGHT') dnAbbrev = 'N';
  else if (dn === 'DAWN') dnAbbrev = 'Dn';
  else if (dn === 'DUSK') dnAbbrev = 'Dk';
  else dnAbbrev = scene.dayNight || '';

  const scriptDay = scene.scriptDay || '';

  return `
    <div class="bd-card" data-idx="${idx}">
      <div class="bd-card-actions">
        <button class="btn btn--ghost btn--sm bd-card-dup" data-idx="${idx}" title="Duplicate">⧉</button>
        <button class="btn btn--ghost btn--sm bd-card-del" data-idx="${idx}" title="Delete">✕</button>
      </div>
      <div class="bd-slug ${colorClass}">
        <div class="bd-slug-cell bd-slug-scnum">
          <span class="bd-slug-val-bold">${esc(scene.sceneNum || '—')}</span>
        </div>
        <div class="bd-slug-cell bd-slug-setting">
          <span class="bd-slug-val-bold">${esc(setting || '—')}</span>
          <span class="bd-slug-desc">${esc(scene.description || '')}</span>
        </div>
        <div class="bd-slug-cell bd-slug-dn">
          <span class="bd-slug-val">${esc(dnAbbrev)}${scriptDay ? ' ' + esc(scriptDay) : ''}</span>
        </div>
        <div class="bd-slug-cell bd-slug-pg">
          <span class="bd-slug-val">${esc(scene.pageCount || '')}</span>
        </div>
        <div class="bd-slug-cell bd-slug-cast">
          <span class="bd-slug-val">${castIds ? 'Cast: ' + esc(castIds) : ''}</span>
          <span class="bd-slug-bg">BG: ${esc(bgCount)}</span>
        </div>
        <div class="bd-slug-cell bd-slug-loc">
          <span class="bd-slug-val">${esc(locAddr)}</span>
        </div>
        <div class="bd-slug-cell bd-slug-timing">
          <span class="bd-slug-val">${esc(scene.timing || '')}</span>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   SCENE EDITOR
   ══════════════════════════════════════════════════════════════ */
function _renderEditor() {
  if (_scenes.length === 0) { _scenes.push(_blankScene()); _save(); }
  if (_editIdx === null || _editIdx >= _scenes.length) _editIdx = 0;
  const scene = _scenes[_editIdx];

  const castMembers = _getCastMembers();
  const selectedCast = scene.castMembers || [];

  /* Cast checkboxes — show character/role names */
  const castHTML = castMembers.length === 0
    ? '<p class="bd-hint">No cast members found. Add them in the Personnel &gt; Cast tab first.</p>'
    : castMembers.map(cm => {
        const label = cm.castNum ? `${cm.castNum}. ${cm.role || cm.name}` : (cm.role || cm.name);
        const checked = selectedCast.some(sc => sc.castNum === cm.castNum && sc.name === cm.name) ? ' checked' : '';
        return `<label class="bd-cast-check"><input type="checkbox" data-cast-num="${esc(cm.castNum)}" data-cast-name="${esc(cm.name)}" data-cast-role="${esc(cm.role)}"${checked}/> ${esc(label)}</label>`;
      }).join('');

  /* Elements sections — 4-column grid with autocomplete */
  const deptsHTML = DEPARTMENTS.map(dept => {
    const items = (scene.departments?.[dept] || []);
    const itemsHTML = items.map((item, ii) => {
      const elName = _elements[item.elementId]?.name || item.text || '';
      return `<div class="bd-dept-tag">
        <span class="bd-dept-tag-text">${esc(elName)}</span>
        <button class="bd-dept-tag-del" data-dept="${esc(dept)}" data-item-idx="${ii}" title="Remove">✕</button>
      </div>`;
    }).join('');

    return `
      <div class="bd-dept-section" data-dept="${esc(dept)}">
        <span class="bd-dept-name">${esc(dept)}</span>
        <div class="bd-dept-tags">${itemsHTML}</div>
        <div class="bd-dept-ac-wrap">
          <input type="text" class="bd-dept-input bd-dept-ac-input" data-dept="${esc(dept)}" placeholder="Add…" autocomplete="off" />
          <div class="bd-dept-ac-dropdown" data-dept-dd="${esc(dept)}"></div>
        </div>
      </div>`;
  }).join('');

  /* Scene timeline */
  const timelineHTML = _scenes.map((s, si) => {
    const active = si === _editIdx ? ' bd-tl-item--active' : '';
    return `<span class="bd-tl-item${active}" data-tl-idx="${si}" title="Scene ${esc(s.sceneNum || '?')}">${esc(s.sceneNum || '?')}</span>`;
  }).join('');

  /* Set autocomplete suggestions */
  const existingSets = new Set();
  _scenes.forEach(s => { const loc = (s.location || '').trim(); if (loc) existingSets.add(loc); });

  _container.innerHTML = `
    <section class="bd-section">
      <div class="bd-toolbar">
        <button class="btn btn--ghost btn--sm" id="bd-back">← Back</button>
        <div class="bd-nav-arrows">
          <button class="btn btn--ghost btn--sm" id="bd-prev" title="Previous scene" ${_editIdx <= 0 ? 'disabled' : ''}>&lt;</button>
          <span class="bd-nav-label">Scene ${esc(scene.sceneNum || '?')} <span class="bd-nav-count">(${_editIdx + 1} of ${_scenes.length})</span></span>
          <button class="btn btn--ghost btn--sm" id="bd-next" title="Next scene" ${_editIdx >= _scenes.length - 1 ? 'disabled' : ''}>&gt;</button>
        </div>
        <div class="bd-toolbar-actions">
          <button class="btn btn--ghost btn--sm" id="bd-elements-btn">Key Elements</button>
          <button class="btn btn--ghost btn--sm" id="bd-dup-scene" title="Duplicate this scene">⧉ Duplicate</button>
          <button class="btn btn--ghost btn--sm" id="bd-del-scene" title="Delete this scene">✕ Delete</button>
          <button class="btn btn--primary btn--sm" id="bd-add-scene">+ Add Scene</button>
          <button class="btn btn--primary btn--sm" id="bd-save">Save</button>
        </div>
      </div>

      <!-- Scene timeline -->
      <div class="bd-timeline">${timelineHTML}</div>

      <div class="bd-editor-scroll">
        <div class="bd-editor">
          <!-- Scene metadata — 3 rows -->
          <fieldset class="bd-fieldset">
            <legend>Scene Info</legend>
            <!-- Row 1: Scene identity -->
            <div class="bd-meta-row">
              <label class="bd-label">Scene #
                <input type="text" class="bd-input" id="bd-sceneNum" value="${esc(scene.sceneNum)}" />
              </label>
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
                  <input type="text" class="bd-input" id="bd-location" value="${esc(scene.location)}" placeholder="" autocomplete="off" />
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
            <!-- Row 2: Description -->
            <div class="bd-meta-row">
              <label class="bd-label bd-label--grow">Synopsis
                <input type="text" class="bd-input" id="bd-description" maxlength="100" value="${esc(scene.description)}" placeholder="" />
              </label>
            </div>
            <!-- Row 3: Production details -->
            <div class="bd-meta-row">
              <label class="bd-label">Page Count
                <input type="text" class="bd-input" id="bd-pageCount" value="${esc(scene.pageCount)}" placeholder="e.g. 3/8" />
              </label>
              <label class="bd-label">Script Day
                <input type="text" class="bd-input" id="bd-scriptDay" value="${esc(scene.scriptDay)}" placeholder="" />
              </label>
              <label class="bd-label">BG Count
                <input type="text" class="bd-input" id="bd-bgCount" value="${esc(scene.bgCount)}" placeholder="" />
              </label>
              <label class="bd-label bd-label--grow">Location / Address
                <input type="text" class="bd-input" id="bd-locationAddress" value="${esc(scene.locationAddress)}" placeholder="" />
              </label>
              <label class="bd-label">Timing
                <input type="text" class="bd-input" id="bd-timing" value="${esc(scene.timing)}" placeholder="e.g. 01:30" />
              </label>
              <label class="bd-label">Script Pages
                <input type="text" class="bd-input" id="bd-scriptPages" value="${esc(scene.scriptPages)}" placeholder="" />
              </label>
            </div>
          </fieldset>

          <!-- Cast -->
          <fieldset class="bd-fieldset">
            <legend>Cast Members</legend>
            <div class="bd-cast-grid">${castHTML}</div>
          </fieldset>

          <!-- Elements -->
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

function _attachEditorListeners(scene) {
  /* Back — return to Schedules hub */
  _container.querySelector('#bd-back').addEventListener('click', () => {
    _collectScene(scene);
    _save();
    window.location.hash = '#schedules';
  });

  /* Save — stay in editor */
  _container.querySelector('#bd-save').addEventListener('click', () => {
    _collectScene(scene);
    _save();
    const btn = _container.querySelector('#bd-save');
    btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save', 1500);
  });

  /* Add Scene */
  _container.querySelector('#bd-add-scene').addEventListener('click', () => {
    _collectScene(scene); _save();
    _scenes.push(_blankScene());
    _save();
    _editIdx = _scenes.length - 1;
    _renderEditor();
  });

  /* Duplicate Scene */
  _container.querySelector('#bd-dup-scene').addEventListener('click', () => {
    _collectScene(scene); _save();
    const dupe = JSON.parse(JSON.stringify(scene));
    dupe.id = _uid();
    dupe.sceneNum = (dupe.sceneNum || '') + ' (copy)';
    _scenes.splice(_editIdx + 1, 0, dupe);
    _save();
    _editIdx = _editIdx + 1;
    _renderEditor();
  });

  /* Delete Scene */
  _container.querySelector('#bd-del-scene').addEventListener('click', () => {
    const label = scene.sceneNum || `Scene ${_editIdx + 1}`;
    if (!confirm(`Delete scene "${label}"?`)) return;
    _scenes.splice(_editIdx, 1);
    if (_scenes.length === 0) { _scenes.push(_blankScene()); }
    _editIdx = Math.min(_editIdx, _scenes.length - 1);
    _save();
    _renderEditor();
  });

  /* Key Elements */
  _container.querySelector('#bd-elements-btn').addEventListener('click', () => {
    _collectScene(scene); _save();
    _view = 'elements';
    _render();
  });

  /* Prev / Next navigation */
  const prevBtn = _container.querySelector('#bd-prev');
  const nextBtn = _container.querySelector('#bd-next');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    _collectScene(scene); _save();
    _editIdx = Math.max(0, _editIdx - 1);
    _renderEditor();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    _collectScene(scene); _save();
    _editIdx = Math.min(_scenes.length - 1, _editIdx + 1);
    _renderEditor();
  });

  /* Timeline clicks */
  _container.querySelectorAll('.bd-tl-item').forEach(item => {
    item.addEventListener('click', () => {
      _collectScene(scene); _save();
      _editIdx = Number(item.dataset.tlIdx);
      _renderEditor();
    });
  });

  /* Set autocomplete */
  const setInput = _container.querySelector('#bd-location');
  const setDD = _container.querySelector('#bd-set-dropdown');
  if (setInput && setDD) {
    const allSets = [];
    _scenes.forEach(s => { const loc = (s.location || '').trim(); if (loc && !allSets.includes(loc)) allSets.push(loc); });
    allSets.sort((a, b) => a.localeCompare(b));

    function _showSetDD() {
      const q = setInput.value.trim().toLowerCase();
      const filtered = allSets.filter(s => !q || s.toLowerCase().includes(q));
      if (!filtered.length) { setDD.style.display = 'none'; return; }
      setDD.innerHTML = filtered.map(s => `<div class="bd-ac-option" data-ac-val="${esc(s)}">${esc(s)}</div>`).join('');
      setDD.style.display = 'block';
      setDD.querySelectorAll('.bd-ac-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          setInput.value = opt.dataset.acVal;
          setDD.style.display = 'none';
        });
      });
    }
    setInput.addEventListener('input', _showSetDD);
    setInput.addEventListener('focus', _showSetDD);
    setInput.addEventListener('blur', () => { setTimeout(() => { setDD.style.display = 'none'; }, 150); });
  }

  /* Autocomplete inputs for elements */
  _container.querySelectorAll('.bd-dept-ac-input').forEach(inp => {
    const dept = inp.dataset.dept;
    const dd = _container.querySelector(`[data-dept-dd="${CSS.escape(dept)}"]`);

    function _getExisting() {
      // Gather all element names used in this department across all scenes
      const names = new Set();
      for (const el of Object.values(_elements)) {
        if (el.department === dept) names.add(el.name);
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    function _showDropdown() {
      const query = inp.value.trim().toLowerCase();
      const existing = _getExisting();
      // Already in this scene
      const currentItems = (scene.departments?.[dept] || []).map(it => (_elements[it.elementId]?.name || it.text || '').toLowerCase());
      const filtered = existing.filter(n => !currentItems.includes(n.toLowerCase()) && (!query || n.toLowerCase().includes(query)));
      if (!filtered.length) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
      dd.innerHTML = filtered.map(n => `<div class="bd-ac-option" data-ac-val="${esc(n)}">${esc(n)}</div>`).join('');
      dd.style.display = 'block';
      dd.querySelectorAll('.bd-ac-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          _addElement(dept, opt.dataset.acVal, scene);
        });
      });
    }

    inp.addEventListener('input', _showDropdown);
    inp.addEventListener('focus', _showDropdown);
    inp.addEventListener('blur', () => { setTimeout(() => { dd.style.display = 'none'; }, 150); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = inp.value.trim();
        if (text) _addElement(dept, text, scene);
      }
    });
  });

  function _addElement(dept, text, scene) {
    if (!scene.departments[dept]) scene.departments[dept] = [];
    // Find or create element
    let elementId = _findElement(text, dept);
    if (!elementId) {
      elementId = _uid();
      _elements[elementId] = { id: elementId, name: text, department: dept };
    }
    scene.departments[dept].push({ elementId, text });
    _save();
    _renderEditor();
  }

  /* Remove element tag */
  _container.querySelectorAll('.bd-dept-tag-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _collectScene(scene);
      const dept = btn.dataset.dept;
      const ii = Number(btn.dataset.itemIdx);
      scene.departments[dept].splice(ii, 1);
      _save();
      _renderEditor();
    });
  });
}

function _collectScene(scene) {
  scene.sceneNum    = _container.querySelector('#bd-sceneNum')?.value?.trim() || '';
  scene.intExt      = _container.querySelector('#bd-intExt')?.value || '';
  scene.location    = _container.querySelector('#bd-location')?.value?.trim() || '';
  scene.dayNight    = _container.querySelector('#bd-dayNight')?.value || '';
  scene.pageCount   = _container.querySelector('#bd-pageCount')?.value?.trim() || '';
  scene.scriptDay   = _container.querySelector('#bd-scriptDay')?.value?.trim() || '';
  scene.bgCount     = _container.querySelector('#bd-bgCount')?.value?.trim() || '';
  scene.locationAddress = _container.querySelector('#bd-locationAddress')?.value?.trim() || '';
  scene.timing      = _container.querySelector('#bd-timing')?.value?.trim() || '';
  scene.scriptPages = _container.querySelector('#bd-scriptPages')?.value?.trim() || '';
  scene.description = _container.querySelector('#bd-description')?.value?.trim() || '';

  /* Cast */
  scene.castMembers = [];
  _container.querySelectorAll('.bd-cast-check input:checked').forEach(chk => {
    scene.castMembers.push({ castNum: chk.dataset.castNum, name: chk.dataset.castName, role: chk.dataset.castRole });
  });

  /* Department items are managed via tag add/remove — no re-collection needed */
}

function _findElement(name, dept) {
  const lower = name.toLowerCase();
  for (const [id, el] of Object.entries(_elements)) {
    if (el.name.toLowerCase() === lower && el.department === dept) return id;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   KEY ELEMENTS VIEW
   ══════════════════════════════════════════════════════════════ */
function _renderElements() {
  /* Group elements by department */
  const byDept = {};
  for (const el of Object.values(_elements)) {
    if (!byDept[el.department]) byDept[el.department] = [];
    byDept[el.department].push(el);
  }

  /* Count how many scenes reference each element */
  const usageCount = {};
  _scenes.forEach(scene => {
    DEPARTMENTS.forEach(dept => {
      (scene.departments?.[dept] || []).forEach(item => {
        if (item.elementId) usageCount[item.elementId] = (usageCount[item.elementId] || 0) + 1;
      });
    });
  });

  const deptsWithElements = DEPARTMENTS.filter(d => byDept[d]?.length > 0);
  const totalElements = Object.keys(_elements).length;

  const deptsHTML = deptsWithElements.length === 0
    ? '<p class="bd-empty">No key elements yet. Elements are created automatically when you add items to department breakdowns in a scene.</p>'
    : deptsWithElements.map(dept => {
        const els = byDept[dept].sort((a, b) => a.name.localeCompare(b.name));
        const rows = els.map(el => {
          const count = usageCount[el.id] || 0;
          return `<div class="bd-el-row" data-el-id="${el.id}">
            <input type="text" class="bd-el-name" data-el-id="${el.id}" value="${esc(el.name)}" />
            <span class="bd-el-count" title="Used in ${count} scene(s)">${count} scene${count !== 1 ? 's' : ''}</span>
            <button class="btn btn--ghost btn--sm bd-el-del" data-el-id="${el.id}" title="Delete element">✕</button>
          </div>`;
        }).join('');
        return `<div class="bd-el-dept">
          <h4 class="bd-el-dept-name">${esc(dept)}</h4>
          ${rows}
        </div>`;
      }).join('');

  _container.innerHTML = `
    <section class="bd-section">
      <div class="bd-toolbar">
        <button class="btn btn--ghost btn--sm" id="bd-el-back">← Back to Scenes</button>
        <h2>Key Elements <span class="bd-el-total">(${totalElements})</span></h2>
        <div class="bd-toolbar-actions"></div>
      </div>
      <div class="bd-editor-scroll">
        <p class="bd-hint">Edit an element name below and it will update everywhere that element appears across all scene breakdowns.</p>
        <div class="bd-elements-list">${deptsHTML}</div>
      </div>
    </section>
  `;

  _container.querySelector('#bd-el-back').addEventListener('click', () => {
    _view = 'edit';
    _render();
  });

  /* Rename element on blur */
  _container.querySelectorAll('.bd-el-name').forEach(inp => {
    inp.addEventListener('blur', () => {
      const elId = inp.dataset.elId;
      const newName = inp.value.trim();
      if (!newName || !_elements[elId]) return;
      const oldName = _elements[elId].name;
      if (newName === oldName) return;
      _elements[elId].name = newName;
      // Update all scene references
      _scenes.forEach(scene => {
        DEPARTMENTS.forEach(dept => {
          (scene.departments?.[dept] || []).forEach(item => {
            if (item.elementId === elId) item.text = newName;
          });
        });
      });
      _save();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
  });

  /* Delete element */
  _container.querySelectorAll('.bd-el-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const elId = btn.dataset.elId;
      const el = _elements[elId];
      if (!el) return;
      const count = usageCount[elId] || 0;
      if (count > 0 && !confirm(`"${el.name}" is used in ${count} scene(s). Remove it from all?`)) return;
      // Remove from all scenes
      _scenes.forEach(scene => {
        DEPARTMENTS.forEach(dept => {
          if (scene.departments?.[dept]) {
            scene.departments[dept] = scene.departments[dept].filter(item => item.elementId !== elId);
          }
        });
      });
      delete _elements[elId];
      _save();
      _renderElements();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */
function _blankScene() {
  const departments = {};
  DEPARTMENTS.forEach(d => departments[d] = []);
  return {
    id: _uid(),
    sceneNum: '',
    intExt: '',
    location: '',
    dayNight: '',
    pageCount: '',
    description: '',
    bgCount: '',
    locationAddress: '',
    scriptDay: '',
    timing: '',
    scriptPages: '',
    castMembers: [],
    departments,
  };
}

function _uid() { return crypto.randomUUID(); }
function esc(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
