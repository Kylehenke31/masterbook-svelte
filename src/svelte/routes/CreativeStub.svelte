<script>
  import { onMount } from 'svelte';
  import {
    loadDept, saveDept,
    getElementsForDept, DEPARTMENTS,
  } from '../lib/creative.js';

  let { deptId = 'prod-design' } = $props();

  /* ── Derived dept label ── */
  const dept = DEPARTMENTS.find(d => d.id === deptId);
  const deptLabel = dept?.label ?? deptId;

  /* ── Tabs ── */
  let activeTab   = $state('creative');
  let deckSubView = $state('uploads'); // 'uploads' | 'builder'

  /* ── Creative Deck ── */
  let slides        = $state([]);
  let selectedSlide = $state(null);
  let newSlideTitle = $state('');

  /* ── Elements Deck ── */
  let elements    = $state([]);
  let annotations = $state({});

  /* ── Creative Deck Documents ── */
  let deckDocs = $state([]);

  /* ── Load / Save ── */
  function load() {
    const d = loadDept(deptId);
    slides      = d.creativeDeck?.slides      ?? [];
    annotations = d.elementsDeck?.annotations ?? {};
    deckDocs    = d.creativeDeck?.documents   ?? [];
    elements    = getElementsForDept(deptId);
    if (selectedSlide !== null && selectedSlide >= slides.length) selectedSlide = null;
  }

  function persist() {
    const d = loadDept(deptId);
    d.creativeDeck  = { slides, documents: deckDocs };
    d.elementsDeck  = { annotations };
    saveDept(deptId, d);
  }

  onMount(load);

  /* ── Creative Deck actions ── */
  function addSlide() {
    const title = newSlideTitle.trim();
    if (!title) return;
    slides = [...slides, { id: crypto.randomUUID(), title, images: [], notes: '' }];
    newSlideTitle = '';
    selectedSlide = slides.length - 1;
    persist();
  }

  function removeSlide(idx) {
    slides = slides.filter((_, i) => i !== idx);
    if (selectedSlide === idx) selectedSlide = null;
    else if (selectedSlide > idx) selectedSlide = selectedSlide - 1;
    persist();
  }

  function updateSlideNotes(idx, val) {
    slides[idx] = { ...slides[idx], notes: val };
    persist();
  }

  function addImage(idx, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = { id: crypto.randomUUID(), filename: file.name, data: ev.target.result, caption: '' };
      slides[idx] = { ...slides[idx], images: [...(slides[idx].images ?? []), img] };
      slides = [...slides];
      persist();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function removeImage(slideIdx, imgId) {
    slides[slideIdx] = { ...slides[slideIdx], images: slides[slideIdx].images.filter(i => i.id !== imgId) };
    slides = [...slides];
    persist();
  }

  function updateCaption(slideIdx, imgId, val) {
    const imgs = slides[slideIdx].images.map(i => i.id === imgId ? { ...i, caption: val } : i);
    slides[slideIdx] = { ...slides[slideIdx], images: imgs };
    slides = [...slides];
    persist();
  }

  /* ── Creative Deck Document actions ── */
  function addDeckDoc(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      deckDocs = [...deckDocs, {
        id: crypto.randomUUID(),
        filename: file.name,
        label: file.name.replace(/\.[^.]+$/, ''),
        data: ev.target.result,
        uploadedAt: new Date().toISOString(),
      }];
      persist();
    };
    reader.readAsDataURL(file); e.target.value = '';
  }
  function removeDeckDoc(id) {
    if (!confirm('Remove this document?')) return;
    deckDocs = deckDocs.filter(d => d.id !== id); persist();
  }
  function updateDeckDocLabel(id, value) {
    deckDocs = deckDocs.map(d => d.id === id ? { ...d, label: value } : d); persist();
  }

  /* ── Elements Deck actions ── */
  function getAnnotation(elId) {
    return annotations[elId] ?? { notes: '', status: 'pending', flag: false };
  }

  function saveAnnotation(elId, patch) {
    annotations = { ...annotations, [elId]: { ...getAnnotation(elId), ...patch } };
    persist();
  }

  const STATUS_OPTS = ['pending', 'in-progress', 'complete', 'hold'];
</script>

<div class="crs-wrap">
  <!-- Tab bar -->
  <div class="crs-tabs">
    <button class="crs-tab" class:crs-tab--active={activeTab === 'creative'}
      onclick={() => { activeTab = 'creative'; }}>Creative Deck</button>
    <button class="crs-tab" class:crs-tab--active={activeTab === 'elements'}
      onclick={() => { activeTab = 'elements'; }}>Elements Deck</button>
  </div>

  <!-- ── CREATIVE DECK ── -->
  {#if activeTab === 'creative'}
    <!-- Sub-view toggle -->
    <div class="crs-subview-bar">
      <button class="crs-subview-btn" class:crs-subview-btn--active={deckSubView === 'uploads'}
        onclick={() => deckSubView = 'uploads'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Uploaded Documents
      </button>
      <button class="crs-subview-btn" class:crs-subview-btn--active={deckSubView === 'builder'}
        onclick={() => deckSubView = 'builder'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Build in Masterbook
      </button>
    </div>

    {#if deckSubView === 'uploads'}
      <!-- Uploaded documents -->
      <div class="crs-doc-section">
        <div class="crs-doc-hdr">
          <span class="crs-doc-title">Uploaded Documents</span>
          <label class="crs-doc-upload-btn">
            + Upload Document
            <input type="file" accept="application/pdf,image/*" hidden onchange={addDeckDoc} />
          </label>
        </div>
        {#if deckDocs.length}
          <div class="crs-doc-list">
            {#each deckDocs as doc (doc.id)}
              <div class="crs-doc-item">
                <div class="crs-doc-icon">
                  {#if doc.data?.startsWith('data:image')}
                    <img src={doc.data} alt={doc.filename} class="crs-doc-thumb" />
                  {:else}
                    <div class="crs-doc-pdf-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                      <span>PDF</span>
                    </div>
                  {/if}
                </div>
                <div class="crs-doc-info">
                  <input class="crs-doc-label" type="text" value={doc.label}
                    oninput={e => updateDeckDocLabel(doc.id, e.target.value)} placeholder="Document label…" />
                  <span class="crs-doc-filename">{doc.filename}</span>
                </div>
                <div class="crs-doc-actions">
                  <a href={doc.data} download={doc.filename} class="crs-doc-btn">Download</a>
                  <button class="crs-doc-btn crs-doc-btn--danger" onclick={() => removeDeckDoc(doc.id)}>Remove</button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="crs-doc-empty">No documents yet. Upload PDFs or images built in external software.</div>
        {/if}
      </div>

    {:else}
      <!-- Built-in slide builder -->
      <div class="crs-pane">
        <div class="crs-deck-layout">
          <div class="crs-slide-list">
            <div class="crs-slide-add">
              <input
                class="crs-input"
                placeholder="New slide title…"
                bind:value={newSlideTitle}
                onkeydown={e => e.key === 'Enter' && addSlide()}
              />
              <button class="crs-btn-add" onclick={addSlide}>Add</button>
            </div>
            {#each slides as slide, i}
              <div
                class="crs-slide-item"
                class:crs-slide-item--active={selectedSlide === i}
                role="button"
                tabindex="0"
                onclick={() => { selectedSlide = i; }}
                onkeydown={e => e.key === 'Enter' && (selectedSlide = i)}
              >
                <span class="crs-slide-num">{i + 1}</span>
                <span class="crs-slide-title">{slide.title}</span>
                <button class="crs-slide-del" onclick={e => { e.stopPropagation(); removeSlide(i); }} title="Remove">×</button>
              </div>
            {:else}
              <div class="crs-empty">No slides yet. Add one above.</div>
            {/each}
          </div>

          <div class="crs-slide-detail">
            {#if selectedSlide !== null && slides[selectedSlide]}
              {@const slide = slides[selectedSlide]}
              <h3 class="crs-slide-heading">{slide.title}</h3>
              <div class="crs-img-grid">
                {#each slide.images ?? [] as img (img.id)}
                  <div class="crs-img-card">
                    <img src={img.data} alt={img.filename} class="crs-img-thumb" />
                    <input
                      class="crs-caption-input"
                      placeholder="Caption…"
                      value={img.caption}
                      oninput={e => updateCaption(selectedSlide, img.id, e.target.value)}
                    />
                    <button class="crs-img-del" onclick={() => removeImage(selectedSlide, img.id)} title="Remove image">×</button>
                  </div>
                {/each}
                <label class="crs-img-add" title="Add image">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M12 8v8M8 12h8"/>
                  </svg>
                  <input type="file" accept="image/*" style="display:none" onchange={e => addImage(selectedSlide, e)} />
                </label>
              </div>
              <label class="crs-field-label">Notes</label>
              <textarea
                class="crs-textarea"
                rows="4"
                placeholder="Slide notes…"
                value={slide.notes}
                oninput={e => updateSlideNotes(selectedSlide, e.target.value)}
              ></textarea>
            {:else}
              <div class="crs-placeholder">Select a slide or create a new one.</div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

  <!-- ── ELEMENTS DECK ── -->
  {:else if activeTab === 'elements'}
    <div class="crs-pane">
      {#if elements.length === 0}
        <div class="crs-empty-state">
          <p>No breakdown elements found for <strong>{deptLabel}</strong>.</p>
          <p class="crs-empty-hint">Add elements in the Breakdowns module and they'll appear here.</p>
        </div>
      {:else}
        <div class="crs-el-list">
          {#each elements as el (el.id)}
            {@const ann = getAnnotation(el.id)}
            <div class="crs-el-card">
              <div class="crs-el-header">
                <div class="crs-el-name">{el.name}</div>
                <div class="crs-el-scenes">
                  {#each el.scenesIn as sc}
                    <span class="crs-el-badge">{sc}</span>
                  {/each}
                </div>
                <select
                  class="crs-el-status"
                  class:crs-el-status--complete={ann.status === 'complete'}
                  class:crs-el-status--hold={ann.status === 'hold'}
                  class:crs-el-status--progress={ann.status === 'in-progress'}
                  value={ann.status}
                  onchange={e => saveAnnotation(el.id, { status: e.target.value })}
                >
                  {#each STATUS_OPTS as s}
                    <option value={s}>{s}</option>
                  {/each}
                </select>
                <button
                  class="crs-el-flag"
                  class:crs-el-flag--on={ann.flag}
                  onclick={() => saveAnnotation(el.id, { flag: !ann.flag })}
                  title="Flag">⚑</button>
              </div>
              <textarea
                class="crs-el-notes"
                rows="2"
                placeholder="Department notes…"
                value={ann.notes}
                oninput={e => saveAnnotation(el.id, { notes: e.target.value })}
              ></textarea>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .crs-wrap {
    max-width: 1100px;
    padding: 24px 0;
  }

  /* Tabs */
  .crs-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border, #333);
    padding-bottom: 0;
  }

  .crs-tab {
    padding: 8px 18px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .crs-tab--active {
    color: var(--gold, #c9a84c);
    border-bottom-color: var(--gold, #c9a84c);
  }

  .crs-pane { width: 100%; }

  /* Creative Deck layout */
  .crs-deck-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 20px;
    min-height: 400px;
  }

  .crs-slide-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .crs-slide-add {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .crs-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    font-size: 0.8rem;
  }

  .crs-input:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .crs-btn-add {
    padding: 6px 12px;
    background: var(--gold, #c9a84c);
    color: #111;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .crs-slide-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 7px;
    cursor: pointer;
    color: var(--text-primary, #eee);
    font-size: 0.825rem;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .crs-slide-item--active {
    border-color: var(--gold, #c9a84c);
    background: rgba(201, 168, 76, 0.06);
  }

  .crs-slide-num {
    width: 18px;
    font-size: 0.7rem;
    color: var(--text-secondary, #888);
    flex-shrink: 0;
    text-align: right;
  }

  .crs-slide-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .crs-slide-del {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .crs-slide-del:hover { color: #e05; }

  .crs-empty {
    font-size: 0.8rem;
    color: var(--text-secondary, #888);
    font-style: italic;
    padding: 8px 4px;
  }

  /* Slide detail */
  .crs-slide-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 0;
  }

  .crs-slide-heading {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
    margin: 0;
  }

  .crs-img-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .crs-img-card {
    position: relative;
    width: 140px;
  }

  .crs-img-thumb {
    width: 140px;
    height: 90px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border, #333);
    display: block;
  }

  .crs-caption-input {
    width: 100%;
    margin-top: 4px;
    padding: 4px 6px;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-primary, #eee);
    font-size: 0.75rem;
    box-sizing: border-box;
  }

  .crs-img-del {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0,0,0,0.65);
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crs-img-add {
    width: 140px;
    height: 90px;
    border: 2px dashed var(--border, #333);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary, #888);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .crs-img-add:hover { border-color: var(--gold, #c9a84c); color: var(--gold, #c9a84c); }

  .crs-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary, #888);
  }

  .crs-textarea {
    width: 100%;
    padding: 8px 10px;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    font-size: 0.85rem;
    resize: vertical;
    box-sizing: border-box;
  }

  .crs-textarea:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .crs-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
    font-style: italic;
    border: 1px dashed var(--border, #333);
    border-radius: 8px;
  }

  /* Elements Deck */
  .crs-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 60px 0;
    color: var(--text-secondary, #888);
    font-size: 0.875rem;
  }

  .crs-empty-state strong { color: var(--text-primary, #eee); }

  .crs-empty-hint { font-size: 0.8rem; opacity: 0.7; }

  .crs-el-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .crs-el-card {
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .crs-el-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .crs-el-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
    flex: 1;
    min-width: 120px;
  }

  .crs-el-scenes {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .crs-el-badge {
    padding: 2px 6px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--text-secondary, #888);
  }

  .crs-el-status {
    padding: 4px 8px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .crs-el-status--complete { border-color: #2a7; color: #2a7; }
  .crs-el-status--hold     { border-color: #e82; color: #e82; }
  .crs-el-status--progress { border-color: #4af; color: #4af; }

  .crs-el-flag {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    font-size: 1rem;
    padding: 2px 4px;
    transition: color 0.15s;
  }

  .crs-el-flag--on { color: #e44; }

  .crs-el-notes {
    width: 100%;
    padding: 6px 10px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    font-size: 0.8rem;
    resize: vertical;
    box-sizing: border-box;
  }

  .crs-el-notes:focus { outline: none; border-color: var(--gold, #c9a84c); }

  /* ── Sub-view toggle bar ── */
  .crs-subview-bar {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
  }
  .crs-subview-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    font-size: 0.825rem;
    font-weight: 500;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-secondary, #888);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .crs-subview-btn:hover { background: var(--bg-elevated, #2a2a2a); color: var(--text-primary, #eee); }
  .crs-subview-btn--active {
    background: rgba(201,168,76,0.1);
    border-color: var(--gold, #c9a84c);
    color: var(--gold, #c9a84c);
  }

  /* ── Document section ── */
  .crs-doc-section {
    margin-top: 24px;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    overflow: hidden;
  }
  .crs-doc-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-surface, #1e1e1e);
    border-bottom: 1px solid var(--border, #333);
  }
  .crs-doc-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary, #888);
  }
  .crs-doc-upload-btn {
    padding: 5px 12px;
    font-size: 0.775rem;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    cursor: pointer;
    transition: background 0.1s;
  }
  .crs-doc-upload-btn:hover { background: var(--bg-hover, #333); }
  .crs-doc-list { display: flex; flex-direction: column; }
  .crs-doc-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border, #2a2a2a);
  }
  .crs-doc-item:last-child { border-bottom: none; }
  .crs-doc-thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border, #333);
  }
  .crs-doc-pdf-icon {
    width: 48px;
    height: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-secondary, #888);
    font-size: 0.65rem;
    gap: 2px;
  }
  .crs-doc-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .crs-doc-label {
    padding: 4px 8px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    color: var(--text-primary, #eee);
    font-size: 0.825rem;
    width: 100%;
    max-width: 360px;
  }
  .crs-doc-label:focus { outline: none; border-color: var(--gold, #c9a84c); }
  .crs-doc-filename {
    font-size: 0.7rem;
    color: var(--text-secondary, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crs-doc-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .crs-doc-btn {
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
  .crs-doc-btn:hover { background: var(--bg-hover, #333); }
  .crs-doc-btn--danger:hover { border-color: #e55; color: #e55; }
  .crs-doc-empty {
    padding: 16px 14px;
    font-size: 0.8rem;
    color: var(--text-secondary, #888);
    font-style: italic;
  }
</style>
