<script>
  import { onMount } from 'svelte';
  import {
    loadDept, saveDept,
    getElementsForDept, getShootOrderScenes,
  } from '../lib/creative.js';

  const DEPT = 'camera';

  /* ── Tab state ── */
  let activeTab = $state('deck');   // 'deck' | 'elements' | 'shotlist' | 'reports'

  /* ── Creative Deck ── */
  let slides        = $state([]);
  let selectedSlide = $state(null);

  /* ── Elements Deck ── */
  let elements    = $state([]);
  let annotations = $state({});

  /* ── Shot List ── */
  let shootScenes = $state([]);
  let shotList    = $state({});
  let expandedScene = $state(null);
  const SHOT_SIZES = ['ECU','CU','MCU','MS','MWS','WS','EWS','Insert','OTS','Two Shot'];
  const SHOT_MOVES = ['Static','Pan','Tilt','Dolly In','Dolly Out','Track L','Track R','Handheld','Steadicam','Crane/Jib','Drone'];

  /* ── Camera Reports ── */
  let reports = $state([]);

  function _load() {
    const d     = loadDept(DEPT);
    slides      = d.creativeDeck?.slides    ?? [];
    annotations = d.elementsDeck?.annotations ?? {};
    shotList    = d.shotList    ?? {};
    reports     = d.cameraReports ?? [];
    elements    = getElementsForDept(DEPT);
    shootScenes = getShootOrderScenes();
    if (slides.length && !selectedSlide) selectedSlide = slides[0].id;
  }

  function _save() {
    saveDept(DEPT, {
      creativeDeck:  { slides },
      elementsDeck:  { annotations },
      shotList,
      cameraReports: reports,
    });
  }

  /* ─────────── Creative Deck ─────────── */
  function addSlide() {
    const s = { id: crypto.randomUUID(), title: 'Untitled', body: '', image: null, notes: '' };
    slides = [...slides, s];
    selectedSlide = s.id;
    _save();
  }

  function removeSlide(id) {
    slides = slides.filter(s => s.id !== id);
    if (selectedSlide === id) selectedSlide = slides[0]?.id ?? null;
    _save();
  }

  function updateSlide(id, field, value) {
    slides = slides.map(s => s.id === id ? { ...s, [field]: value } : s);
    _save();
  }

  function handleSlideImage(id, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { updateSlide(id, 'image', ev.target.result); };
    reader.readAsDataURL(file);
  }

  function removeSlideImage(id) {
    updateSlide(id, 'image', null);
  }

  /* ─────────── Elements Deck ─────────── */
  function setAnnotation(elementId, field, value) {
    annotations = {
      ...annotations,
      [elementId]: { ...(annotations[elementId] ?? {}), [field]: value },
    };
    _save();
  }

  /* ─────────── Shot List ─────────── */
  function addShot(sceneNum) {
    const existing = shotList[sceneNum]?.shots ?? [];
    const num = existing.length + 1;
    const shot = {
      id: crypto.randomUUID(),
      num,
      size: 'MS',
      lens: '',
      movement: 'Static',
      description: '',
      notes: '',
      completed: false,
    };
    shotList = {
      ...shotList,
      [sceneNum]: { shots: [...existing, shot] },
    };
    _save();
  }

  function updateShot(sceneNum, shotId, field, value) {
    const shots = (shotList[sceneNum]?.shots ?? []).map(sh =>
      sh.id === shotId ? { ...sh, [field]: value } : sh
    );
    shotList = { ...shotList, [sceneNum]: { shots } };
    _save();
  }

  function removeShot(sceneNum, shotId) {
    const shots = (shotList[sceneNum]?.shots ?? []).filter(sh => sh.id !== shotId);
    shotList = { ...shotList, [sceneNum]: { shots } };
    _save();
  }

  function toggleExpand(sceneNum) {
    expandedScene = expandedScene === sceneNum ? null : sceneNum;
  }

  /* ─────────── Camera Reports ─────────── */
  function addReport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const r = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().slice(0, 10),
        label: file.name.replace(/\.[^.]+$/, ''),
        filename: file.name,
        data: ev.target.result,
        notes: '',
        uploadedAt: new Date().toISOString(),
      };
      reports = [...reports, r];
      _save();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function updateReport(id, field, value) {
    reports = reports.map(r => r.id === id ? { ...r, [field]: value } : r);
    _save();
  }

  function removeReport(id) {
    if (!confirm('Remove this camera report?')) return;
    reports = reports.filter(r => r.id !== id);
    _save();
  }

  onMount(_load);
</script>

<div class="crdept">
  <!-- Header -->
  <div class="crdept-header">
    <a href="#creative" class="crdept-back">← Creative</a>
    <h2 class="crdept-title">Camera</h2>
  </div>

  <!-- Tab bar -->
  <div class="crdept-tabs">
    {#each [['deck','Creative Deck'],['elements','Elements Deck'],['shotlist','Shot List'],['reports','Camera Reports']] as [id, label]}
      <button class="crdept-tab" class:crdept-tab--active={activeTab === id}
        onclick={() => activeTab = id}>{label}</button>
    {/each}
  </div>

  <div class="crdept-body">

    <!-- ══════════ CREATIVE DECK ══════════ -->
    {#if activeTab === 'deck'}
      <div class="deck-layout">
        <!-- Slide list -->
        <div class="deck-sidebar">
          <button class="btn-add-slide" onclick={addSlide}>+ Add Slide</button>
          {#each slides as s (s.id)}
            <div
              class="deck-slide-thumb"
              class:deck-slide-thumb--active={selectedSlide === s.id}
              role="button"
              tabindex="0"
              onclick={() => selectedSlide = s.id}
              onkeydown={e => e.key === 'Enter' && (selectedSlide = s.id)}
            >
              {#if s.image}
                <img src={s.image} alt={s.title} class="deck-thumb-img" />
              {:else}
                <div class="deck-thumb-blank"></div>
              {/if}
              <span class="deck-thumb-title">{s.title || 'Untitled'}</span>
              <button class="deck-thumb-del" onclick={e => { e.stopPropagation(); removeSlide(s.id); }} title="Delete slide">✕</button>
            </div>
          {:else}
            <p class="deck-empty">No slides yet.<br>Click "+ Add Slide" to start.</p>
          {/each}
        </div>

        <!-- Slide editor -->
        <div class="deck-editor">
          {#if selectedSlide}
            {@const slide = slides.find(s => s.id === selectedSlide)}
            {#if slide}
              <!-- Image area -->
              <div class="deck-img-area">
                {#if slide.image}
                  <img src={slide.image} alt={slide.title} class="deck-img-preview" />
                  <div class="deck-img-actions">
                    <label class="btn-sm">Replace Image<input type="file" accept="image/*" hidden onchange={e => handleSlideImage(slide.id, e)}></label>
                    <button class="btn-sm btn-ghost" onclick={() => removeSlideImage(slide.id)}>Remove</button>
                  </div>
                {:else}
                  <label class="deck-img-upload">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>Click to upload image</span>
                    <input type="file" accept="image/*" hidden onchange={e => handleSlideImage(slide.id, e)}>
                  </label>
                {/if}
              </div>

              <!-- Fields -->
              <div class="deck-fields">
                <label class="deck-field">
                  <span class="deck-field-label">Title</span>
                  <input class="deck-input" type="text" value={slide.title}
                    oninput={e => updateSlide(slide.id, 'title', e.target.value)} placeholder="Slide title…" />
                </label>
                <label class="deck-field">
                  <span class="deck-field-label">Description / Notes</span>
                  <textarea class="deck-textarea" rows="4" value={slide.body}
                    oninput={e => updateSlide(slide.id, 'body', e.target.value)} placeholder="Creative notes, references, intent…"></textarea>
                </label>
                <label class="deck-field">
                  <span class="deck-field-label">Production Notes</span>
                  <textarea class="deck-textarea deck-textarea--sm" rows="2" value={slide.notes}
                    oninput={e => updateSlide(slide.id, 'notes', e.target.value)} placeholder="Internal notes…"></textarea>
                </label>
              </div>
            {/if}
          {:else}
            <div class="deck-no-selection">
              {#if slides.length}Select a slide to edit it.{:else}Add your first slide to get started.{/if}
            </div>
          {/if}
        </div>
      </div>

    <!-- ══════════ ELEMENTS DECK ══════════ -->
    {:else if activeTab === 'elements'}
      <div class="eldeck">
        <p class="eldeck-hint">Camera and Special Equipment elements from your script breakdowns. Add notes and status for each.</p>
        {#if elements.length}
          <div class="eldeck-list">
            {#each elements as el (el.id)}
              {@const ann = annotations[el.id] ?? {}}
              <div class="elnode" class:elnode--locked={ann.status === 'Locked'} class:elnode--done={ann.status === 'Done'}>
                <div class="elnode-header">
                  <span class="elnode-name">{el.name}</span>
                  <span class="elnode-dept">{el.department}</span>
                  <span class="elnode-scenes">
                    {#if el.scenesIn.length}
                      Scenes: {el.scenesIn.join(', ')}
                    {:else}
                      No scenes
                    {/if}
                  </span>
                  <select class="elnode-status" value={ann.status ?? ''}
                    onchange={e => setAnnotation(el.id, 'status', e.target.value)}>
                    <option value="">No Status</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Locked">Locked</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <textarea class="elnode-notes" rows="2" placeholder="Department notes for this element…"
                  value={ann.notes ?? ''}
                  oninput={e => setAnnotation(el.id, 'notes', e.target.value)}></textarea>
              </div>
            {/each}
          </div>
        {:else}
          <div class="cr-empty">
            <p>No Camera or Special Equipment elements found in your script breakdowns.</p>
            <p>Add elements in the <a href="#breakdowns">Breakdowns</a> module first.</p>
          </div>
        {/if}
      </div>

    <!-- ══════════ SHOT LIST ══════════ -->
    {:else if activeTab === 'shotlist'}
      <div class="shotlist">
        <div class="shotlist-header">
          <p class="shotlist-hint">Scenes are pulled from your active One-Liner shoot order.</p>
        </div>
        {#if shootScenes.length}
          {#each shootScenes as scene (scene.sceneNum)}
            {@const shots = shotList[scene.sceneNum]?.shots ?? []}
            <div class="sl-scene" class:sl-scene--expanded={expandedScene === scene.sceneNum}>
              <!-- Scene header row -->
              <button class="sl-scene-hdr" onclick={() => toggleExpand(scene.sceneNum)}>
                <span class="sl-scene-num">{scene.sceneNum || '?'}</span>
                <span class="sl-scene-meta">{[scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' · ')}</span>
                <span class="sl-scene-desc">{scene.description || ''}</span>
                <span class="sl-scene-shotcount">{shots.length} shot{shots.length !== 1 ? 's' : ''}</span>
                <svg class="sl-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points={expandedScene === scene.sceneNum ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/>
                </svg>
              </button>

              {#if expandedScene === scene.sceneNum}
                <div class="sl-shots">
                  {#if shots.length}
                    <table class="sl-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Size</th><th>Lens</th><th>Movement</th><th>Description</th><th>Notes</th><th>✓</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each shots as shot (shot.id)}
                          <tr class:sl-row--done={shot.completed}>
                            <td class="sl-td-num">{shot.num}</td>
                            <td>
                              <select class="sl-select" value={shot.size}
                                onchange={e => updateShot(scene.sceneNum, shot.id, 'size', e.target.value)}>
                                {#each SHOT_SIZES as sz}<option value={sz}>{sz}</option>{/each}
                              </select>
                            </td>
                            <td><input class="sl-input" type="text" value={shot.lens} placeholder="35mm"
                              oninput={e => updateShot(scene.sceneNum, shot.id, 'lens', e.target.value)}></td>
                            <td>
                              <select class="sl-select" value={shot.movement}
                                onchange={e => updateShot(scene.sceneNum, shot.id, 'movement', e.target.value)}>
                                {#each SHOT_MOVES as mv}<option value={mv}>{mv}</option>{/each}
                              </select>
                            </td>
                            <td><input class="sl-input sl-input--wide" type="text" value={shot.description} placeholder="Shot description…"
                              oninput={e => updateShot(scene.sceneNum, shot.id, 'description', e.target.value)}></td>
                            <td><input class="sl-input" type="text" value={shot.notes} placeholder="Notes…"
                              oninput={e => updateShot(scene.sceneNum, shot.id, 'notes', e.target.value)}></td>
                            <td><input type="checkbox" checked={shot.completed}
                              onchange={e => updateShot(scene.sceneNum, shot.id, 'completed', e.target.checked)}></td>
                            <td><button class="sl-del" onclick={() => removeShot(scene.sceneNum, shot.id)} title="Delete shot">✕</button></td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {/if}
                  <button class="sl-add-shot" onclick={() => addShot(scene.sceneNum)}>+ Add Shot</button>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="cr-empty">
            <p>No scenes in your shoot order yet.</p>
            <p>Build your shoot order in the <a href="#one-liner">One-Liner</a> module first.</p>
          </div>
        {/if}
      </div>

    <!-- ══════════ CAMERA REPORTS ══════════ -->
    {:else if activeTab === 'reports'}
      <div class="camreports">
        <div class="camreports-top">
          <label class="btn-upload">
            + Upload Camera Report
            <input type="file" accept="image/*,application/pdf" hidden onchange={addReport}>
          </label>
        </div>
        {#if reports.length}
          <div class="camreports-grid">
            {#each reports as r (r.id)}
              <div class="camrep-card">
                <div class="camrep-preview">
                  {#if r.data?.startsWith('data:image')}
                    <img src={r.data} alt={r.filename} class="camrep-img" />
                  {:else}
                    <div class="camrep-pdf-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span>PDF</span>
                    </div>
                  {/if}
                </div>
                <div class="camrep-info">
                  <input class="camrep-label" type="text" value={r.label}
                    oninput={e => updateReport(r.id, 'label', e.target.value)} placeholder="Label…" />
                  <input class="camrep-date" type="date" value={r.date}
                    onchange={e => updateReport(r.id, 'date', e.target.value)} />
                  <textarea class="camrep-notes" rows="2" placeholder="Notes…" value={r.notes}
                    oninput={e => updateReport(r.id, 'notes', e.target.value)}></textarea>
                </div>
                <div class="camrep-actions">
                  <a href={r.data} download={r.filename} class="btn-sm">Download</a>
                  <button class="btn-sm btn-ghost btn-danger" onclick={() => removeReport(r.id)}>Remove</button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="cr-empty">Upload camera reports from each shoot day.</div>
        {/if}
      </div>
    {/if}

  </div>
</div>

<style>
  /* ── Shell ── */
  .crdept { width: 100%; }

  .crdept-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }

  .crdept-back {
    font-size: 0.8rem;
    color: var(--text-secondary, #888);
    text-decoration: none;
  }
  .crdept-back:hover { color: var(--gold, #c9a84c); }

  .crdept-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
    margin: 0;
  }

  /* ── Tabs ── */
  .crdept-tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--border, #333);
    margin-bottom: 24px;
  }

  .crdept-tab {
    padding: 8px 18px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    font-size: 0.875rem;
    color: var(--text-secondary, #888);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .crdept-tab:hover { color: var(--text-primary, #eee); }
  .crdept-tab--active {
    color: var(--gold, #c9a84c);
    border-bottom-color: var(--gold, #c9a84c);
    font-weight: 600;
  }

  .crdept-body { width: 100%; }

  /* ── Shared empty state ── */
  .cr-empty {
    padding: 48px 24px;
    text-align: center;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
    line-height: 1.8;
  }
  .cr-empty a { color: var(--gold, #c9a84c); }

  /* ──────── Creative Deck ──────── */
  .deck-layout {
    display: flex;
    gap: 0;
    height: calc(100vh - 200px);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    overflow: hidden;
  }

  .deck-sidebar {
    width: 180px;
    flex-shrink: 0;
    border-right: 1px solid var(--border, #333);
    background: var(--bg-surface, #1a1a1a);
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
  }

  .btn-add-slide {
    margin: 10px 8px 6px;
    padding: 7px;
    font-size: 0.8rem;
    background: var(--gold, #c9a84c);
    color: #000;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: opacity 0.15s;
  }
  .btn-add-slide:hover { opacity: 0.85; }

  .deck-slide-thumb {
    position: relative;
    width: 100%;
    padding: 8px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid var(--border, #2a2a2a);
    transition: background 0.1s;
  }
  .deck-slide-thumb:hover { background: var(--bg-hover, #252525); }
  .deck-slide-thumb--active { background: rgba(201,168,76,0.1); }

  .deck-thumb-img {
    width: 100%;
    height: 72px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
    margin-bottom: 4px;
  }

  .deck-thumb-blank {
    width: 100%;
    height: 72px;
    border-radius: 4px;
    background: var(--bg-elevated, #252525);
    margin-bottom: 4px;
  }

  .deck-thumb-title {
    font-size: 0.75rem;
    color: var(--text-primary, #ddd);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .deck-thumb-del {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0,0,0,0.6);
    border: none;
    color: #ccc;
    font-size: 9px;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .deck-slide-thumb:hover .deck-thumb-del { display: flex; }

  .deck-empty {
    padding: 20px 12px;
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    text-align: center;
    line-height: 1.6;
  }

  .deck-editor {
    flex: 1;
    min-width: 0;
    background: var(--bg-main, #161616);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .deck-no-selection {
    margin: auto;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
  }

  .deck-img-area {
    position: relative;
    flex-shrink: 0;
  }

  .deck-img-upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 220px;
    cursor: pointer;
    border-bottom: 1px solid var(--border, #333);
    background: var(--bg-elevated, #1e1e1e);
    color: var(--text-secondary, #888);
    font-size: 0.8rem;
    transition: background 0.15s;
  }
  .deck-img-upload:hover { background: var(--bg-hover, #252525); }

  .deck-img-preview {
    width: 100%;
    max-height: 280px;
    object-fit: contain;
    display: block;
    background: #000;
  }

  .deck-img-actions {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
  }

  .deck-fields {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .deck-field { display: flex; flex-direction: column; gap: 5px; }
  .deck-field-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary, #888); }
  .deck-input, .deck-textarea {
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    padding: 8px 10px;
    font-size: 0.875rem;
    resize: vertical;
    font-family: inherit;
  }
  .deck-input:focus, .deck-textarea:focus { outline: none; border-color: var(--gold, #c9a84c); }
  .deck-textarea--sm { resize: none; }

  /* ──────── Elements Deck ──────── */
  .eldeck { max-width: 760px; }
  .eldeck-hint { font-size: 0.8rem; color: var(--text-secondary, #888); margin-bottom: 20px; }

  .eldeck-list { display: flex; flex-direction: column; gap: 10px; }

  .elnode {
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 12px 14px;
    background: var(--bg-surface, #1e1e1e);
    transition: border-color 0.15s;
  }
  .elnode--locked { border-color: var(--gold, #c9a84c); }
  .elnode--done { opacity: 0.6; }

  .elnode-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .elnode-name { font-weight: 600; color: var(--text-primary, #eee); font-size: 0.9rem; flex: 1; }
  .elnode-dept { font-size: 0.75rem; color: var(--text-secondary, #888); background: var(--bg-elevated, #2a2a2a); padding: 2px 7px; border-radius: 10px; }
  .elnode-scenes { font-size: 0.75rem; color: var(--text-secondary, #888); }
  .elnode-status {
    font-size: 0.75rem;
    background: var(--bg-elevated, #252525);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    padding: 3px 6px;
    cursor: pointer;
  }

  .elnode-notes {
    width: 100%;
    background: var(--bg-main, #161616);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 5px;
    color: var(--text-primary, #ddd);
    font-size: 0.8rem;
    padding: 7px 10px;
    resize: none;
    font-family: inherit;
    box-sizing: border-box;
  }
  .elnode-notes:focus { outline: none; border-color: var(--gold, #c9a84c); }

  /* ──────── Shot List ──────── */
  .shotlist { max-width: 960px; }
  .shotlist-header { margin-bottom: 16px; }
  .shotlist-hint { font-size: 0.8rem; color: var(--text-secondary, #888); margin: 0; }

  .sl-scene {
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
    background: var(--bg-surface, #1e1e1e);
  }

  .sl-scene-hdr {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary, #eee);
    transition: background 0.1s;
  }
  .sl-scene-hdr:hover { background: var(--bg-hover, #252525); }

  .sl-scene-num { font-weight: 700; font-size: 0.9rem; min-width: 36px; color: var(--gold, #c9a84c); }
  .sl-scene-meta { font-size: 0.8rem; color: var(--text-secondary, #aaa); min-width: 180px; }
  .sl-scene-desc { flex: 1; font-size: 0.8rem; color: var(--text-secondary, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sl-scene-shotcount { font-size: 0.75rem; color: var(--text-secondary, #888); white-space: nowrap; }
  .sl-chevron { flex-shrink: 0; color: var(--text-secondary, #666); }

  .sl-shots { padding: 0 12px 12px; }

  .sl-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    margin-bottom: 10px;
  }
  .sl-table th {
    text-align: left;
    padding: 5px 6px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary, #888);
    border-bottom: 1px solid var(--border, #333);
  }
  .sl-table td { padding: 4px 6px; border-bottom: 1px solid var(--border, #222); }
  .sl-row--done td { opacity: 0.5; }

  .sl-td-num { font-weight: 700; color: var(--text-secondary, #888); font-size: 0.75rem; width: 28px; }

  .sl-select, .sl-input {
    background: var(--bg-main, #161616);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 4px;
    color: var(--text-primary, #eee);
    padding: 3px 6px;
    font-size: 0.78rem;
    width: 100%;
  }
  .sl-input--wide { min-width: 160px; }
  .sl-select:focus, .sl-input:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .sl-del {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 4px;
  }
  .sl-del:hover { color: #e55; }

  .sl-add-shot {
    font-size: 0.8rem;
    padding: 5px 12px;
    background: none;
    border: 1px dashed var(--border, #444);
    border-radius: 6px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .sl-add-shot:hover { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }

  /* ──────── Camera Reports ──────── */
  .camreports-top { margin-bottom: 20px; }

  .btn-upload {
    display: inline-block;
    padding: 8px 16px;
    background: var(--gold, #c9a84c);
    color: #000;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-upload:hover { opacity: 0.85; }

  .camreports-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .camrep-card {
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-surface, #1e1e1e);
  }

  .camrep-preview {
    height: 140px;
    background: var(--bg-elevated, #252525);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .camrep-img { width: 100%; height: 100%; object-fit: cover; }
  .camrep-pdf-icon { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-secondary, #888); font-size: 0.75rem; }

  .camrep-info { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .camrep-label { font-size: 0.85rem; font-weight: 600; background: transparent; border: none; border-bottom: 1px solid var(--border, #333); color: var(--text-primary, #eee); padding: 2px 0; width: 100%; }
  .camrep-label:focus { outline: none; border-bottom-color: var(--gold, #c9a84c); }
  .camrep-date { font-size: 0.8rem; background: var(--bg-main, #161616); border: 1px solid var(--border, #333); border-radius: 4px; color: var(--text-primary, #eee); padding: 3px 6px; }
  .camrep-notes { font-size: 0.78rem; background: var(--bg-main, #161616); border: 1px solid var(--border, #2a2a2a); border-radius: 4px; color: var(--text-primary, #ddd); padding: 5px 8px; resize: none; font-family: inherit; width: 100%; box-sizing: border-box; }

  .camrep-actions { padding: 8px 12px; display: flex; gap: 8px; border-top: 1px solid var(--border, #2a2a2a); }

  /* ── Shared small buttons ── */
  .btn-sm {
    padding: 4px 10px;
    font-size: 0.775rem;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    transition: background 0.1s;
  }
  .btn-sm:hover { background: var(--bg-hover, #333); }
  .btn-ghost { background: transparent; }
  .btn-danger:hover { border-color: #e55; color: #e55; }
</style>
