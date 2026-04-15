<script>
  import { onMount } from 'svelte';
  import {
    loadDept, saveDept,
    getScriptedLocations,
  } from '../lib/creative.js';

  const DEPT = 'locations';

  /* ── Tab state ── */
  let activeTab = $state('deck');  // 'deck' | 'elements' | 'scouting'

  /* ── Creative Deck ── */
  let slides        = $state([]);
  let selectedSlide = $state(null);

  /* ── Scouting Board ── */
  let scriptedLocations = $state([]);  // from breakdowns
  let scoutingBoard     = $state({});  // { [locationKey]: { options, locked, agreement, notes } }
  let expandedLocation  = $state(null);
  let addingOptionFor   = $state(null); // locationKey currently showing add-option form
  let newOption         = $state({ name: '', address: '', notes: '' });

  function _load() {
    const d         = loadDept(DEPT);
    slides          = d.creativeDeck?.slides ?? [];
    scoutingBoard   = d.scoutingBoard ?? {};
    scriptedLocations = getScriptedLocations();
    if (slides.length && !selectedSlide) selectedSlide = slides[0].id;
    // Ensure every scripted location has a board entry
    const updated = { ...scoutingBoard };
    let dirty = false;
    scriptedLocations.forEach(loc => {
      if (!updated[loc.key]) {
        updated[loc.key] = { options: [], locked: false, lockedOptionId: null, agreement: null, notes: '' };
        dirty = true;
      }
    });
    if (dirty) { scoutingBoard = updated; _save(); }
  }

  function _save() {
    saveDept(DEPT, {
      creativeDeck:  { slides },
      elementsDeck:  { annotations: {} },
      scoutingBoard,
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

  /* ─────────── Scouting Board ─────────── */
  function toggleLocation(key) {
    expandedLocation = expandedLocation === key ? null : key;
    addingOptionFor = null;
  }

  function updateBoardField(key, field, value) {
    scoutingBoard = {
      ...scoutingBoard,
      [key]: { ...scoutingBoard[key], [field]: value },
    };
    _save();
  }

  function startAddOption(key) {
    addingOptionFor = key;
    newOption = { name: '', address: '', notes: '' };
  }

  function confirmAddOption(key) {
    if (!newOption.name.trim()) return;
    const opt = { id: crypto.randomUUID(), ...newOption, photos: [], directorApproved: false };
    const entry = { ...(scoutingBoard[key] ?? { options: [], locked: false, lockedOptionId: null, agreement: null, notes: '' }) };
    entry.options = [...(entry.options ?? []), opt];
    scoutingBoard = { ...scoutingBoard, [key]: entry };
    addingOptionFor = null;
    _save();
  }

  function updateOption(locKey, optId, field, value) {
    const entry = { ...scoutingBoard[locKey] };
    entry.options = entry.options.map(o => o.id === optId ? { ...o, [field]: value } : o);
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function removeOption(locKey, optId) {
    if (!confirm('Remove this scouting option?')) return;
    const entry = { ...scoutingBoard[locKey] };
    entry.options = entry.options.filter(o => o.id !== optId);
    if (entry.lockedOptionId === optId) { entry.locked = false; entry.lockedOptionId = null; }
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function toggleDirectorApproval(locKey, optId) {
    const opt = scoutingBoard[locKey]?.options?.find(o => o.id === optId);
    if (!opt) return;
    updateOption(locKey, optId, 'directorApproved', !opt.directorApproved);
  }

  function lockLocation(locKey, optId) {
    const entry = { ...scoutingBoard[locKey] };
    entry.locked = true;
    entry.lockedOptionId = optId;
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function unlockLocation(locKey) {
    const entry = { ...scoutingBoard[locKey] };
    entry.locked = false;
    entry.lockedOptionId = null;
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function addPhoto(locKey, optId, e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    let remaining = files.length;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const photo = { id: crypto.randomUUID(), filename: file.name, data: ev.target.result, caption: '' };
        const entry = { ...scoutingBoard[locKey] };
        entry.options = entry.options.map(o => {
          if (o.id !== optId) return o;
          return { ...o, photos: [...(o.photos ?? []), photo] };
        });
        scoutingBoard = { ...scoutingBoard, [locKey]: entry };
        remaining--;
        if (remaining === 0) _save();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removePhoto(locKey, optId, photoId) {
    const entry = { ...scoutingBoard[locKey] };
    entry.options = entry.options.map(o => {
      if (o.id !== optId) return o;
      return { ...o, photos: (o.photos ?? []).filter(p => p.id !== photoId) };
    });
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function updatePhotoCaption(locKey, optId, photoId, caption) {
    const entry = { ...scoutingBoard[locKey] };
    entry.options = entry.options.map(o => {
      if (o.id !== optId) return o;
      return { ...o, photos: (o.photos ?? []).map(p => p.id === photoId ? { ...p, caption } : p) };
    });
    scoutingBoard = { ...scoutingBoard, [locKey]: entry };
    _save();
  }

  function uploadAgreement(locKey, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const entry = { ...scoutingBoard[locKey] };
      entry.agreement = { filename: file.name, data: ev.target.result, uploadedAt: new Date().toISOString() };
      scoutingBoard = { ...scoutingBoard, [locKey]: entry };
      _save();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function removeAgreement(locKey) {
    if (!confirm('Remove the location agreement?')) return;
    updateBoardField(locKey, 'agreement', null);
  }

  onMount(_load);
</script>

<div class="crdept">
  <div class="crdept-header">
    <a href="#creative" class="crdept-back">← Creative</a>
    <h2 class="crdept-title">Locations</h2>
  </div>

  <div class="crdept-tabs">
    {#each [['deck','Creative Deck'],['elements','Elements Deck'],['scouting','Scouting Board']] as [id, label]}
      <button class="crdept-tab" class:crdept-tab--active={activeTab === id}
        onclick={() => activeTab = id}>{label}</button>
    {/each}
  </div>

  <div class="crdept-body">

    <!-- ══════════ CREATIVE DECK ══════════ -->
    {#if activeTab === 'deck'}
      <div class="deck-layout">
        <div class="deck-sidebar">
          <button class="btn-add-slide" onclick={addSlide}>+ Add Slide</button>
          {#each slides as s (s.id)}
            <div class="deck-slide-thumb" class:deck-slide-thumb--active={selectedSlide === s.id}
              role="button" tabindex="0"
              onclick={() => selectedSlide = s.id}
              onkeydown={e => e.key === 'Enter' && (selectedSlide = s.id)}>
              {#if s.image}
                <img src={s.image} alt={s.title} class="deck-thumb-img" />
              {:else}
                <div class="deck-thumb-blank"></div>
              {/if}
              <span class="deck-thumb-title">{s.title || 'Untitled'}</span>
              <button class="deck-thumb-del" onclick={e => { e.stopPropagation(); removeSlide(s.id); }}>✕</button>
            </div>
          {:else}
            <p class="deck-empty">No slides yet.</p>
          {/each}
        </div>
        <div class="deck-editor">
          {#if selectedSlide}
            {@const slide = slides.find(s => s.id === selectedSlide)}
            {#if slide}
              <div class="deck-img-area">
                {#if slide.image}
                  <img src={slide.image} alt={slide.title} class="deck-img-preview" />
                  <div class="deck-img-actions">
                    <label class="btn-sm">Replace<input type="file" accept="image/*" hidden onchange={e => handleSlideImage(slide.id, e)}></label>
                    <button class="btn-sm btn-ghost" onclick={() => updateSlide(slide.id, 'image', null)}>Remove</button>
                  </div>
                {:else}
                  <label class="deck-img-upload">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>Click to upload image</span>
                    <input type="file" accept="image/*" hidden onchange={e => handleSlideImage(slide.id, e)}>
                  </label>
                {/if}
              </div>
              <div class="deck-fields">
                <label class="deck-field">
                  <span class="deck-field-label">Title</span>
                  <input class="deck-input" type="text" value={slide.title}
                    oninput={e => updateSlide(slide.id, 'title', e.target.value)} placeholder="Slide title…" />
                </label>
                <label class="deck-field">
                  <span class="deck-field-label">Description / Notes</span>
                  <textarea class="deck-textarea" rows="4" value={slide.body}
                    oninput={e => updateSlide(slide.id, 'body', e.target.value)} placeholder="Creative notes…"></textarea>
                </label>
              </div>
            {/if}
          {:else}
            <div class="deck-no-selection">{slides.length ? 'Select a slide.' : 'Add your first slide.'}</div>
          {/if}
        </div>
      </div>

    <!-- ══════════ ELEMENTS DECK ══════════ -->
    {:else if activeTab === 'elements'}
      <div class="eldeck">
        <p class="eldeck-hint">Scripted locations from your breakdowns — each is a data node for the Locations department.</p>
        {#if scriptedLocations.length}
          <div class="eldeck-list">
            {#each scriptedLocations as loc (loc.key)}
              <div class="elnode">
                <div class="elnode-header">
                  <span class="elnode-name">{loc.displayName}</span>
                  <span class="elnode-scenes">
                    {loc.scenes.length} scene{loc.scenes.length !== 1 ? 's' : ''}: {loc.scenes.map(s => s.sceneNum).join(', ')}
                  </span>
                </div>
                <p class="elnode-scene-list">
                  {#each loc.scenes as s}
                    <span class="elnode-scene-tag">{s.sceneNum} {s.intExt} {s.dayNight}</span>
                  {/each}
                </p>
              </div>
            {/each}
          </div>
        {:else}
          <div class="cr-empty">
            <p>No scripted locations found in your breakdowns.</p>
            <p>Add scenes with locations in <a href="#breakdowns">Breakdowns</a> first.</p>
          </div>
        {/if}
      </div>

    <!-- ══════════ SCOUTING BOARD ══════════ -->
    {:else if activeTab === 'scouting'}
      <div class="scout">
        <p class="scout-hint">Each scripted location from your breakdowns appears below. Add real-world scouting options, get director approval, then lock the confirmed location.</p>

        {#if scriptedLocations.length}
          {#each scriptedLocations as loc (loc.key)}
            {@const board = scoutingBoard[loc.key] ?? { options: [], locked: false }}
            <div class="scout-node" class:scout-node--locked={board.locked}>
              <!-- Location header -->
              <button class="scout-node-hdr" onclick={() => toggleLocation(loc.key)}>
                <div class="scout-node-left">
                  {#if board.locked}
                    <span class="scout-lock-badge">🔒 LOCKED</span>
                  {/if}
                  <span class="scout-loc-name">{loc.displayName}</span>
                  <span class="scout-loc-meta">
                    {loc.scenes.length} scene{loc.scenes.length !== 1 ? 's' : ''} ·
                    {board.options?.length ?? 0} option{(board.options?.length ?? 0) !== 1 ? 's' : ''}
                    {#if board.options?.some(o => o.directorApproved)} · ✓ Director approved{/if}
                  </span>
                </div>
                <svg class="sl-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points={expandedLocation === loc.key ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/>
                </svg>
              </button>

              {#if expandedLocation === loc.key}
                <div class="scout-node-body">

                  <!-- Scene list -->
                  <div class="scout-scenes">
                    {#each loc.scenes as s}
                      <span class="scout-scene-chip">{s.sceneNum} · {s.intExt} {s.location} {s.dayNight}</span>
                    {/each}
                  </div>

                  <!-- Location notes -->
                  <textarea class="scout-location-notes" rows="2" placeholder="General notes for this scripted location…"
                    value={board.notes ?? ''}
                    oninput={e => updateBoardField(loc.key, 'notes', e.target.value)}></textarea>

                  <!-- Options -->
                  <div class="scout-options">
                    {#each board.options ?? [] as opt (opt.id)}
                      <div class="scout-option"
                        class:scout-option--approved={opt.directorApproved}
                        class:scout-option--locked={board.lockedOptionId === opt.id}>
                        <div class="scout-opt-top">
                          <div class="scout-opt-fields">
                            <input class="scout-input scout-input--name" type="text" value={opt.name} placeholder="Location name (e.g. Blue Bottle on Market St)"
                              oninput={e => updateOption(loc.key, opt.id, 'name', e.target.value)} />
                            <input class="scout-input" type="text" value={opt.address} placeholder="Address"
                              oninput={e => updateOption(loc.key, opt.id, 'address', e.target.value)} />
                            <textarea class="scout-notes" rows="2" placeholder="Scouting notes…"
                              value={opt.notes ?? ''}
                              oninput={e => updateOption(loc.key, opt.id, 'notes', e.target.value)}></textarea>
                          </div>
                          <div class="scout-opt-actions">
                            <button class="scout-approval-btn"
                              class:scout-approval-btn--approved={opt.directorApproved}
                              onclick={() => toggleDirectorApproval(loc.key, opt.id)}>
                              {opt.directorApproved ? '✓ Director Approved' : 'Director Approval'}
                            </button>
                            {#if !board.locked}
                              <button class="scout-lock-btn" onclick={() => lockLocation(loc.key, opt.id)} title="Lock this as the confirmed location">
                                🔒 Lock Location
                              </button>
                            {:else if board.lockedOptionId === opt.id}
                              <button class="scout-unlock-btn" onclick={() => unlockLocation(loc.key)}>Unlock</button>
                            {/if}
                            <button class="scout-remove-btn" onclick={() => removeOption(loc.key, opt.id)}>Remove</button>
                          </div>
                        </div>

                        <!-- Photos -->
                        <div class="scout-photos">
                          {#each opt.photos ?? [] as photo (photo.id)}
                            <div class="scout-photo">
                              <img src={photo.data} alt={photo.filename} class="scout-photo-img" />
                              <input class="scout-photo-caption" type="text" value={photo.caption}
                                placeholder="Caption…"
                                oninput={e => updatePhotoCaption(loc.key, opt.id, photo.id, e.target.value)} />
                              <button class="scout-photo-del" onclick={() => removePhoto(loc.key, opt.id, photo.id)}>✕</button>
                            </div>
                          {/each}
                          <label class="scout-add-photo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            <span>Add Photos</span>
                            <input type="file" accept="image/*" multiple hidden onchange={e => addPhoto(loc.key, opt.id, e)}>
                          </label>
                        </div>
                      </div>
                    {/each}

                    <!-- Add option form -->
                    {#if addingOptionFor === loc.key}
                      <div class="scout-add-form">
                        <h4 class="scout-add-title">New Scouting Option</h4>
                        <input class="scout-input" type="text" placeholder="Location name *" bind:value={newOption.name} />
                        <input class="scout-input" type="text" placeholder="Address" bind:value={newOption.address} />
                        <textarea class="scout-notes" rows="2" placeholder="Initial notes…" bind:value={newOption.notes}></textarea>
                        <div class="scout-add-actions">
                          <button class="btn-primary-sm" onclick={() => confirmAddOption(loc.key)}>Add Option</button>
                          <button class="btn-ghost-sm" onclick={() => addingOptionFor = null}>Cancel</button>
                        </div>
                      </div>
                    {:else}
                      <button class="scout-add-option-btn" onclick={() => startAddOption(loc.key)}>+ Add Scouting Option</button>
                    {/if}
                  </div>

                  <!-- Location Agreement -->
                  <div class="scout-agreement">
                    <span class="scout-agreement-label">Location Agreement</span>
                    {#if board.agreement}
                      <span class="scout-agreement-file">{board.agreement.filename}</span>
                      <a href={board.agreement.data} download={board.agreement.filename} class="btn-sm">Download</a>
                      <button class="btn-sm btn-ghost btn-danger" onclick={() => removeAgreement(loc.key)}>Remove</button>
                    {:else}
                      <label class="btn-sm scout-agreement-upload">
                        Upload Agreement
                        <input type="file" accept="application/pdf,image/*" hidden onchange={e => uploadAgreement(loc.key, e)}>
                      </label>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="cr-empty">
            <p>No scripted locations found in your breakdowns.</p>
            <p>Add scenes with locations in <a href="#breakdowns">Breakdowns</a> first.</p>
          </div>
        {/if}
      </div>
    {/if}

  </div>
</div>

<style>
  /* ── Inherited from CreativeCamera for shared deck styles ── */
  .crdept { width: 100%; }
  .crdept-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .crdept-back { font-size: 0.8rem; color: var(--text-secondary, #888); text-decoration: none; }
  .crdept-back:hover { color: var(--gold, #c9a84c); }
  .crdept-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary, #eee); margin: 0; }

  .crdept-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border, #333); margin-bottom: 24px; }
  .crdept-tab { padding: 8px 18px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font-size: 0.875rem; color: var(--text-secondary, #888); cursor: pointer; transition: color 0.15s, border-color 0.15s; }
  .crdept-tab:hover { color: var(--text-primary, #eee); }
  .crdept-tab--active { color: var(--gold, #c9a84c); border-bottom-color: var(--gold, #c9a84c); font-weight: 600; }
  .crdept-body { width: 100%; }

  .cr-empty { padding: 48px 24px; text-align: center; color: var(--text-secondary, #888); font-size: 0.875rem; line-height: 1.8; }
  .cr-empty a { color: var(--gold, #c9a84c); }

  /* Deck (same as CreativeCamera) */
  .deck-layout { display: flex; height: calc(100vh - 200px); border: 1px solid var(--border, #333); border-radius: 8px; overflow: hidden; }
  .deck-sidebar { width: 180px; flex-shrink: 0; border-right: 1px solid var(--border, #333); background: var(--bg-surface, #1a1a1a); display: flex; flex-direction: column; overflow-y: auto; }
  .btn-add-slide { margin: 10px 8px 6px; padding: 7px; font-size: 0.8rem; background: var(--gold, #c9a84c); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .deck-slide-thumb { position: relative; width: 100%; padding: 8px; border: none; background: none; cursor: pointer; text-align: left; border-bottom: 1px solid var(--border, #2a2a2a); transition: background 0.1s; }
  .deck-slide-thumb:hover { background: var(--bg-hover, #252525); }
  .deck-slide-thumb--active { background: rgba(201,168,76,0.1); }
  .deck-thumb-img { width: 100%; height: 72px; object-fit: cover; border-radius: 4px; display: block; margin-bottom: 4px; }
  .deck-thumb-blank { width: 100%; height: 72px; border-radius: 4px; background: var(--bg-elevated, #252525); margin-bottom: 4px; }
  .deck-thumb-title { font-size: 0.75rem; color: var(--text-primary, #ddd); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deck-thumb-del { position: absolute; top: 6px; right: 6px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.6); border: none; color: #ccc; font-size: 9px; cursor: pointer; display: none; align-items: center; justify-content: center; }
  .deck-slide-thumb:hover .deck-thumb-del { display: flex; }
  .deck-empty { padding: 20px 12px; font-size: 0.75rem; color: var(--text-secondary, #888); text-align: center; line-height: 1.6; }
  .deck-editor { flex: 1; min-width: 0; background: var(--bg-main, #161616); overflow-y: auto; display: flex; flex-direction: column; }
  .deck-no-selection { margin: auto; color: var(--text-secondary, #888); font-size: 0.875rem; }
  .deck-img-area { position: relative; flex-shrink: 0; }
  .deck-img-upload { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 220px; cursor: pointer; border-bottom: 1px solid var(--border, #333); background: var(--bg-elevated, #1e1e1e); color: var(--text-secondary, #888); font-size: 0.8rem; }
  .deck-img-upload:hover { background: var(--bg-hover, #252525); }
  .deck-img-preview { width: 100%; max-height: 280px; object-fit: contain; display: block; background: #000; }
  .deck-img-actions { position: absolute; bottom: 8px; right: 8px; display: flex; gap: 6px; }
  .deck-fields { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  .deck-field { display: flex; flex-direction: column; gap: 5px; }
  .deck-field-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary, #888); }
  .deck-input, .deck-textarea { background: var(--bg-surface, #1e1e1e); border: 1px solid var(--border, #333); border-radius: 6px; color: var(--text-primary, #eee); padding: 8px 10px; font-size: 0.875rem; resize: vertical; font-family: inherit; }
  .deck-input:focus, .deck-textarea:focus { outline: none; border-color: var(--gold, #c9a84c); }

  /* Elements Deck */
  .eldeck { max-width: 760px; }
  .eldeck-hint { font-size: 0.8rem; color: var(--text-secondary, #888); margin-bottom: 20px; }
  .eldeck-list { display: flex; flex-direction: column; gap: 10px; }
  .elnode { border: 1px solid var(--border, #333); border-radius: 8px; padding: 12px 14px; background: var(--bg-surface, #1e1e1e); }
  .elnode-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .elnode-name { font-weight: 600; color: var(--text-primary, #eee); font-size: 0.9rem; flex: 1; }
  .elnode-scenes { font-size: 0.75rem; color: var(--text-secondary, #888); }
  .elnode-scene-list { margin: 0; display: flex; flex-wrap: wrap; gap: 5px; }
  .elnode-scene-tag { font-size: 0.72rem; background: var(--bg-elevated, #2a2a2a); border: 1px solid var(--border, #333); border-radius: 4px; padding: 2px 6px; color: var(--text-secondary, #aaa); }

  /* ──────── Scouting Board ──────── */
  .scout { max-width: 920px; }
  .scout-hint { font-size: 0.8rem; color: var(--text-secondary, #888); margin-bottom: 20px; line-height: 1.6; }

  .scout-node {
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 10px;
    margin-bottom: 10px;
    overflow: hidden;
    background: var(--bg-surface, #1e1e1e);
    transition: border-color 0.15s;
  }
  .scout-node--locked { border-color: var(--gold, #c9a84c); }

  .scout-node-hdr {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary, #eee);
    transition: background 0.1s;
  }
  .scout-node-hdr:hover { background: var(--bg-hover, #252525); }

  .scout-node-left { flex: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .scout-lock-badge { font-size: 0.72rem; font-weight: 700; color: var(--gold, #c9a84c); letter-spacing: 0.05em; }
  .scout-loc-name { font-size: 0.95rem; font-weight: 600; }
  .scout-loc-meta { font-size: 0.78rem; color: var(--text-secondary, #888); }
  .sl-chevron { flex-shrink: 0; color: var(--text-secondary, #666); }

  .scout-node-body { padding: 0 16px 16px; }

  .scout-scenes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .scout-scene-chip { font-size: 0.72rem; background: var(--bg-elevated, #2a2a2a); border: 1px solid var(--border, #333); border-radius: 4px; padding: 2px 8px; color: var(--text-secondary, #aaa); }

  .scout-location-notes {
    width: 100%;
    background: var(--bg-main, #161616);
    border: 1px solid var(--border, #2a2a2a);
    border-radius: 6px;
    color: var(--text-primary, #ddd);
    font-size: 0.8rem;
    padding: 7px 10px;
    resize: none;
    font-family: inherit;
    box-sizing: border-box;
    margin-bottom: 16px;
  }
  .scout-location-notes:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .scout-options { display: flex; flex-direction: column; gap: 12px; }

  .scout-option {
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 14px;
    background: var(--bg-main, #161616);
    transition: border-color 0.15s;
  }
  .scout-option--approved { border-color: #2a6b3a; }
  .scout-option--locked { border-color: var(--gold, #c9a84c); background: rgba(201,168,76,0.04); }

  .scout-opt-top { display: flex; gap: 14px; margin-bottom: 12px; }
  .scout-opt-fields { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .scout-opt-actions { display: flex; flex-direction: column; gap: 6px; min-width: 160px; }

  .scout-input {
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    padding: 7px 10px;
    font-size: 0.83rem;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  .scout-input--name { font-weight: 600; }
  .scout-input:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .scout-notes {
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    padding: 7px 10px;
    font-size: 0.8rem;
    resize: none;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }
  .scout-notes:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .scout-approval-btn {
    padding: 6px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #444);
    border-radius: 6px;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }
  .scout-approval-btn:hover { border-color: #2a6b3a; color: #4caf70; }
  .scout-approval-btn--approved { border-color: #2a6b3a; color: #4caf70; background: rgba(76,175,112,0.08); }

  .scout-lock-btn {
    padding: 6px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    background: rgba(201,168,76,0.1);
    border: 1px solid var(--gold, #c9a84c);
    border-radius: 6px;
    color: var(--gold, #c9a84c);
    cursor: pointer;
    text-align: left;
  }
  .scout-lock-btn:hover { background: rgba(201,168,76,0.2); }

  .scout-unlock-btn {
    padding: 6px 10px;
    font-size: 0.78rem;
    background: none;
    border: 1px solid var(--border, #444);
    border-radius: 6px;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
  }

  .scout-remove-btn {
    padding: 5px 10px;
    font-size: 0.75rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    text-align: left;
  }
  .scout-remove-btn:hover { border-color: #e55; color: #e55; }

  /* Photos */
  .scout-photos { display: flex; flex-wrap: wrap; gap: 8px; }

  .scout-photo {
    position: relative;
    width: 120px;
  }
  .scout-photo-img { width: 120px; height: 80px; object-fit: cover; border-radius: 6px; display: block; }
  .scout-photo-caption { width: 120px; font-size: 0.7rem; background: transparent; border: none; border-bottom: 1px solid var(--border, #333); color: var(--text-secondary, #aaa); padding: 3px 0; box-sizing: border-box; font-family: inherit; }
  .scout-photo-del { position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; border-radius: 50%; background: rgba(0,0,0,0.7); border: none; color: #fff; font-size: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

  .scout-add-photo {
    width: 120px;
    height: 80px;
    border: 1px dashed var(--border, #444);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    color: var(--text-secondary, #888);
    font-size: 0.7rem;
    transition: border-color 0.15s, color 0.15s;
  }
  .scout-add-photo:hover { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }

  /* Add option form */
  .scout-add-form { border: 1px dashed var(--border, #444); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-surface, #1e1e1e); }
  .scout-add-title { margin: 0 0 6px; font-size: 0.85rem; font-weight: 600; color: var(--text-primary, #eee); }
  .scout-add-actions { display: flex; gap: 8px; }

  .scout-add-option-btn { width: 100%; padding: 10px; font-size: 0.83rem; background: none; border: 1px dashed var(--border, #444); border-radius: 8px; color: var(--text-secondary, #888); cursor: pointer; transition: border-color 0.15s, color 0.15s; }
  .scout-add-option-btn:hover { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }

  /* Agreement */
  .scout-agreement { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border, #2a2a2a); flex-wrap: wrap; }
  .scout-agreement-label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary, #888); }
  .scout-agreement-file { font-size: 0.8rem; color: var(--text-primary, #ddd); }
  .scout-agreement-upload { cursor: pointer; }

  /* Shared buttons */
  .btn-primary-sm { padding: 6px 14px; font-size: 0.8rem; font-weight: 600; background: var(--gold, #c9a84c); color: #000; border: none; border-radius: 6px; cursor: pointer; }
  .btn-ghost-sm { padding: 6px 14px; font-size: 0.8rem; background: none; border: 1px solid var(--border, #444); border-radius: 6px; color: var(--text-secondary, #aaa); cursor: pointer; }
  .btn-sm { padding: 4px 10px; font-size: 0.775rem; background: var(--bg-elevated, #2a2a2a); border: 1px solid var(--border, #333); border-radius: 5px; color: var(--text-primary, #eee); cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-ghost { background: transparent; }
  .btn-danger:hover { border-color: #e55; color: #e55; }
</style>
