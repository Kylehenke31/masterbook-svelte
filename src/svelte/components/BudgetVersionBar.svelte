<script>
  import {
    listVersions, getActiveVersionId, getActiveVersionName,
    hasLiveBudgetData, suggestedDraftName,
    saveCurrentAsVersion, createFreshBudget, loadVersion,
    duplicateVersion, renameVersion, deleteVersion,
  } from '../lib/budgetVersions.js';

  const { onVersionChanged } = $props();

  let versions   = $state([]);
  let activeId   = $state(null);
  let activeName = $state('Untitled Budget');

  let showDropdown = $state(false);
  let openMenuId    = $state(null); // which version row's "…" menu is open

  /* Modal — one shared shape, only one open at a time.
     type: 'name' | 'confirm' | 'stub' */
  let modal = $state(null);
  let modalInput = $state('');

  function refresh() {
    versions   = listVersions();
    activeId   = getActiveVersionId();
    activeName = getActiveVersionName();
  }
  refresh();

  function fmtRelative(iso) {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toggleDropdown() {
    showDropdown = !showDropdown;
    openMenuId = null;
  }
  function closeAll() {
    showDropdown = false;
    openMenuId = null;
  }
  function toggleRowMenu(id) {
    openMenuId = openMenuId === id ? null : id;
  }

  function closeModal() { modal = null; modalInput = ''; }

  /* ── Actions ── */
  function actionNewBudget() {
    openMenuId = null;
    if (hasLiveBudgetData()) {
      modal = {
        type: 'confirm',
        title: 'Create Fresh Budget',
        message: 'Starting a new budget clears all current bid amounts from view. Save the current budget as a draft first so you can come back to it?',
        confirmLabel: 'Save Draft & Create Fresh',
        secondaryLabel: 'Discard & Create Fresh',
        onConfirm: () => {
          modalInput = suggestedDraftName();
          modal = {
            type: 'name',
            title: 'Save Current Draft',
            confirmLabel: 'Save & Create Fresh',
            onConfirm: (name) => {
              saveCurrentAsVersion(name);
              createFreshBudget();
              refresh(); closeModal(); closeAll(); onVersionChanged?.();
            },
          };
        },
        onSecondary: () => {
          createFreshBudget();
          refresh(); closeModal(); closeAll(); onVersionChanged?.();
        },
      };
    } else {
      createFreshBudget();
      refresh(); closeAll(); onVersionChanged?.();
    }
  }

  function actionSaveDraft() {
    openMenuId = null;
    modalInput = suggestedDraftName();
    modal = {
      type: 'name',
      title: 'Save Current as Draft',
      confirmLabel: 'Save',
      onConfirm: (name) => {
        saveCurrentAsVersion(name);
        refresh(); closeModal();
      },
    };
  }

  function actionLoad(v) {
    openMenuId = null;
    modal = {
      type: 'confirm',
      title: `Load "${v.name}"?`,
      message: 'This replaces your current budget. Any changes since your last save will be lost unless you save them as a draft first.',
      confirmLabel: 'Save Current & Load',
      secondaryLabel: 'Discard & Load',
      onConfirm: () => {
        modalInput = suggestedDraftName();
        modal = {
          type: 'name',
          title: 'Save Current Draft',
          confirmLabel: 'Save & Load',
          onConfirm: (name) => {
            saveCurrentAsVersion(name);
            loadVersion(v.id);
            refresh(); closeModal(); closeAll(); onVersionChanged?.();
          },
        };
      },
      onSecondary: () => {
        loadVersion(v.id);
        refresh(); closeModal(); closeAll(); onVersionChanged?.();
      },
    };
  }

  function actionDuplicate(v) {
    openMenuId = null;
    duplicateVersion(v.id);
    refresh();
  }

  function actionRename(v) {
    openMenuId = null;
    modalInput = v.name;
    modal = {
      type: 'name',
      title: 'Rename Draft',
      confirmLabel: 'Rename',
      onConfirm: (name) => {
        renameVersion(v.id, name);
        refresh(); closeModal();
      },
    };
  }

  function actionDelete(v) {
    openMenuId = null;
    modal = {
      type: 'confirm',
      danger: true,
      title: `Delete "${v.name}"?`,
      message: 'This cannot be undone. Make sure this draft is backed up elsewhere (exported, printed, or saved outside the app) before deleting it.',
      confirmLabel: "Yes, it's backed up — Delete",
      onConfirm: () => {
        deleteVersion(v.id);
        refresh(); closeModal();
        if (activeId === v.id) onVersionChanged?.();
      },
    };
  }

  function actionStub(kind) {
    openMenuId = null;
    modal = kind === 'folder'
      ? {
          type: 'stub',
          title: 'Show in Folder',
          message: 'This will jump to the linked budget folder in the File Cabinet once that feature is built.',
        }
      : {
          type: 'stub',
          title: 'Permissions',
          message: 'Once multiple user accounts are supported, the project admin will be able to control view, edit, and access permissions for each draft here.',
        };
  }

  function submitNameModal() {
    if (!modalInput.trim()) return;
    modal.onConfirm(modalInput.trim());
  }
</script>

<svelte:window onclick={(e) => {
  if ((showDropdown || openMenuId) && !e.target.closest('.bvb-wrap')) closeAll();
}} />

<div class="bvb-wrap">
  <button class="bvb-trigger" onclick={toggleDropdown}>
    <span class="bvb-label">Editing:</span>
    <span class="bvb-name">{activeName}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" class="bvb-chevron">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if showDropdown}
    <div class="bvb-dropdown">
      <div class="bvb-actions">
        <button class="btn btn--ghost btn--sm" onclick={actionNewBudget}>+ New Budget</button>
        <button class="btn btn--ghost btn--sm" onclick={actionSaveDraft}>Save Current as Draft</button>
      </div>

      <div class="bvb-divider"></div>
      <div class="bvb-section-label">Saved Drafts</div>

      <div class="bvb-list">
        {#each versions as v (v.id)}
          <div class="bvb-row" class:bvb-row--active={v.id === activeId}>
            <button class="bvb-row-main" onclick={() => actionLoad(v)} title="Load this draft">
              <span class="bvb-row-name">{v.name}</span>
              <span class="bvb-row-meta">{fmtRelative(v.updatedAt)}</span>
            </button>

            <div class="bvb-row-menu-wrap">
              <button class="bvb-kebab" onclick={(e) => { e.stopPropagation(); toggleRowMenu(v.id); }} title="More actions">⋯</button>

              {#if openMenuId === v.id}
                <div class="bvb-menu" role="menu">
                  <button class="bvb-menu-item" role="menuitem" onclick={() => actionLoad(v)}>Open / Return To</button>
                  <button class="bvb-menu-item" role="menuitem" onclick={() => actionDuplicate(v)}>Duplicate</button>
                  <button class="bvb-menu-item" role="menuitem" onclick={() => actionRename(v)}>Rename</button>
                  <button class="bvb-menu-item" role="menuitem" onclick={() => actionStub('folder')}>Show in Folder</button>
                  <button class="bvb-menu-item" role="menuitem" onclick={() => actionStub('permissions')}>Permissions</button>
                  <div class="bvb-menu-divider"></div>
                  <button class="bvb-menu-item bvb-menu-item--danger" role="menuitem" onclick={() => actionDelete(v)}>Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="bvb-empty">No saved drafts yet.</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if modal}
  <div class="bvb-modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
    <div class="bvb-modal" role="dialog" aria-modal="true">
      <div class="bvb-modal-title">{modal.title}</div>

      {#if modal.type === 'name'}
        <input
          class="bvb-modal-input"
          type="text"
          bind:value={modalInput}
          placeholder="Draft name"
          onkeydown={(e) => e.key === 'Enter' && submitNameModal()}
        />
        <div class="bvb-modal-actions">
          <button class="btn btn--ghost btn--sm" onclick={closeModal}>Cancel</button>
          <button class="btn btn--primary btn--sm" onclick={submitNameModal}>{modal.confirmLabel}</button>
        </div>

      {:else if modal.type === 'confirm'}
        <p class="bvb-modal-message">{modal.message}</p>
        <div class="bvb-modal-actions">
          <button class="btn btn--ghost btn--sm" onclick={closeModal}>Cancel</button>
          {#if modal.onSecondary}
            <button class="btn btn--ghost btn--sm" onclick={modal.onSecondary}>{modal.secondaryLabel}</button>
          {/if}
          <button class={modal.danger ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm'} onclick={modal.onConfirm}>{modal.confirmLabel}</button>
        </div>

      {:else if modal.type === 'stub'}
        <p class="bvb-modal-message">{modal.message}</p>
        <div class="bvb-modal-actions">
          <button class="btn btn--primary btn--sm" onclick={closeModal}>Got it</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bvb-wrap {
    position: relative;
    display: inline-block;
    margin: 10px 16px 0;
  }

  .bvb-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--bg-elevated, #1f1f24);
    border: 1px solid var(--border, #2c2c35);
    color: var(--text-primary, #eee);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bvb-trigger:hover { background: var(--bg-hover, #26262d); }

  .bvb-label { color: var(--text-muted, #888); }
  .bvb-name  { font-weight: 700; }
  .bvb-chevron { flex-shrink: 0; color: var(--text-muted, #888); }

  .bvb-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 320px;
    max-width: 90vw;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 400;
    padding: 10px;
  }

  .bvb-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bvb-actions .btn { width: 100%; justify-content: flex-start; }

  .bvb-divider {
    height: 1px;
    background: var(--border, #2c2c35);
    margin: 10px 0 6px;
  }

  .bvb-section-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted, #888);
    padding: 2px 2px 6px;
  }

  .bvb-list {
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bvb-row {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .bvb-row--active .bvb-row-name { color: var(--gold, #c9a84c); }

  .bvb-row-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 8px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .bvb-row-main:hover { background: var(--bg-elevated, #1f1f24); }

  .bvb-row-name {
    font-size: 0.8rem;
    color: var(--text-primary, #eee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .bvb-row-meta {
    font-size: 0.68rem;
    color: var(--text-muted, #888);
  }

  .bvb-row-menu-wrap { position: relative; flex-shrink: 0; }

  .bvb-kebab {
    width: 28px;
    height: 100%;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    font-size: 1rem;
  }
  .bvb-kebab:hover { color: var(--text-primary, #eee); background: var(--bg-elevated, #1f1f24); }

  .bvb-menu {
    position: absolute;
    top: 0;
    left: calc(100% + 4px);
    min-width: 180px;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 410;
    padding: 4px 0;
  }

  .bvb-menu-item {
    display: block;
    width: 100%;
    padding: 7px 12px;
    background: none;
    border: none;
    text-align: left;
    color: var(--text-secondary, #9896a0);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bvb-menu-item:hover { background: var(--bg-elevated, #1f1f24); color: var(--text-primary, #eee); }
  .bvb-menu-item--danger { color: var(--red, #e05252); }
  .bvb-menu-item--danger:hover { background: rgba(224,82,82,0.1); color: var(--red, #e05252); }

  .bvb-menu-divider {
    height: 1px;
    background: var(--border, #2c2c35);
    margin: 4px 0;
  }

  .bvb-empty {
    padding: 10px 8px;
    font-size: 0.8rem;
    color: var(--text-muted, #888);
  }

  /* ── Modal ── */
  .bvb-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(2px);
  }

  .bvb-modal {
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    width: 100%;
    max-width: 420px;
    padding: 20px;
  }

  .bvb-modal-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
    margin-bottom: 12px;
  }

  .bvb-modal-message {
    font-size: 0.85rem;
    color: var(--text-secondary, #9896a0);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .bvb-modal-input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    background: var(--bg-elevated, #1f1f24);
    border: 1px solid var(--border, #2c2c35);
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    margin-bottom: 16px;
  }
  .bvb-modal-input:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .bvb-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
