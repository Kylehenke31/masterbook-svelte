<script>
  import {
    listVersions, getActiveVersionId, getCurrentWorkingId, hasLiveBudgetData, suggestedDraftName,
    saveCurrentAsVersion, loadVersion, duplicateVersion, renameVersion, deleteVersion, setCurrentWorkingBudget,
  } from '../lib/budgetVersions.js';
  import { listCommits } from '../lib/budgetCommits.js';
  import VersionActionModal from '../components/VersionActionModal.svelte';

  let versions          = $state([]);
  let activeId          = $state(null);
  let currentWorkingId  = $state(null);
  let commits            = $state([]);

  let modal      = $state(null);
  let modalInput = $state('');

  function refresh() {
    versions         = listVersions();
    activeId         = getActiveVersionId();
    currentWorkingId = getCurrentWorkingId();
    commits          = listCommits();
  }
  refresh();

  function closeModal() { modal = null; modalInput = ''; }

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

  /* ── Actions ── */
  function actionOpen(v) {
    modal = {
      type: 'confirm',
      title: `Open "${v.name}"?`,
      message: 'This replaces your current budget. Any changes since your last save will be lost unless you save them as a draft first.',
      confirmLabel: 'Save Current & Open',
      secondaryLabel: 'Discard & Open',
      onConfirm: () => {
        modalInput = suggestedDraftName();
        modal = {
          type: 'name',
          title: 'Save Current Draft',
          confirmLabel: 'Save & Open',
          onConfirm: (name) => {
            saveCurrentAsVersion(name);
            loadVersion(v.id);
            refresh(); closeModal();
          },
        };
      },
      onSecondary: () => {
        loadVersion(v.id);
        refresh(); closeModal();
      },
    };
  }

  function actionSetCurrentWorking(v) {
    if (v.id === activeId) {
      // Already loaded — just pin it, no data-loss risk.
      setCurrentWorkingBudget(v.id);
      refresh();
      return;
    }
    modal = {
      type: 'confirm',
      title: `Set "${v.name}" as Current Working Budget?`,
      message: 'This becomes the budget that loads automatically when you first open the Budget page. It also switches you to editing it now — any unsaved changes to your current budget will be lost unless saved as a draft first.',
      confirmLabel: 'Save Current & Set',
      secondaryLabel: 'Discard & Set',
      onConfirm: () => {
        modalInput = suggestedDraftName();
        modal = {
          type: 'name',
          title: 'Save Current Draft',
          confirmLabel: 'Save & Set',
          onConfirm: (name) => {
            saveCurrentAsVersion(name);
            setCurrentWorkingBudget(v.id);
            refresh(); closeModal();
          },
        };
      },
      onSecondary: () => {
        setCurrentWorkingBudget(v.id);
        refresh(); closeModal();
      },
    };
  }

  function actionDuplicate(v) {
    duplicateVersion(v.id);
    refresh();
  }

  function actionRename(v) {
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
    modal = {
      type: 'confirm',
      danger: true,
      title: `Delete "${v.name}"?`,
      message: 'This cannot be undone. Make sure this draft is backed up elsewhere (exported, printed, or saved outside the app) before deleting it.',
      confirmLabel: "Yes, it's backed up — Delete",
      onConfirm: () => {
        deleteVersion(v.id);
        refresh(); closeModal();
      },
    };
  }

  function actionStub(kind) {
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
</script>

<div class="bd-page">
  <div class="bd-header">
    <button class="btn btn--ghost btn--sm" onclick={() => { window.location.hash = '#budget-lines'; }}>← Back to Budget</button>
    <h2>Budget Drafts</h2>
  </div>

  <div class="bd-list">
    {#each versions as v (v.id)}
      <div class="bd-row">
        <div class="bd-row-main">
          <span class="bd-row-name">{v.name}</span>
          <div class="bd-row-badges">
            {#if v.id === currentWorkingId}<span class="bd-badge bd-badge--gold">Current Working</span>{/if}
            {#if v.id === activeId}<span class="bd-badge">Currently Editing</span>{/if}
          </div>
          <span class="bd-row-meta">Updated {fmtRelative(v.updatedAt)}</span>
        </div>

        <div class="bd-row-actions">
          <button class="btn btn--ghost btn--sm" onclick={() => actionOpen(v)}>Open</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionSetCurrentWorking(v)} disabled={v.id === currentWorkingId}>Set as Current Working</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionDuplicate(v)}>Duplicate</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionRename(v)}>Rename</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionStub('folder')}>Show in Folder</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionStub('permissions')}>Permissions</button>
          <button class="btn btn--danger btn--sm" onclick={() => actionDelete(v)}>Delete</button>
        </div>
      </div>
    {:else}
      <div class="bd-empty">No saved drafts yet. Use "Save as Draft" from the Budget page to create one.</div>
    {/each}
  </div>

  <div class="bd-commits">
    <h3>Commit History</h3>
    <p class="bd-commits-note">A minimal log of budget checkpoints — who committed, and an optional note on what changed.</p>

    <div class="bd-commit-list">
      {#each commits as c (c.id)}
        <div class="bd-commit-row">
          <div class="bd-commit-main">
            <span class="bd-commit-message">{c.message}</span>
            <span class="bd-commit-meta">{c.userLabel} · {c.versionName} · {fmtRelative(c.timestamp)}</span>
          </div>
        </div>
      {:else}
        <div class="bd-empty">No commits yet. Use "Commit Changes" from the Budget page to log one.</div>
      {/each}
    </div>
  </div>
</div>

<VersionActionModal bind:modal bind:inputValue={modalInput} />

<style>
  .bd-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }

  .bd-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .bd-header h2 { margin: 0; font-size: 1.25rem; color: var(--text-primary, #eee); }

  .bd-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 32px;
  }

  .bd-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
  }

  .bd-row-main {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .bd-row-name {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary, #eee);
  }

  .bd-row-badges { display: flex; gap: 6px; }

  .bd-badge {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--bg-elevated, #1f1f24);
    border: 1px solid var(--border, #2c2c35);
    color: var(--text-secondary, #9896a0);
  }
  .bd-badge--gold {
    color: var(--gold, #c9a84c);
    border-color: var(--gold, #c9a84c);
  }

  .bd-row-meta {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    margin-left: auto;
  }

  .bd-row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .bd-empty {
    padding: 16px;
    font-size: 0.85rem;
    color: var(--text-muted, #888);
    background: var(--bg-surface, #17171a);
    border: 1px dashed var(--border, #2c2c35);
  }

  .bd-commits h3 {
    margin: 0 0 4px;
    font-size: 1rem;
    color: var(--text-primary, #eee);
  }
  .bd-commits-note {
    margin: 0 0 12px;
    font-size: 0.78rem;
    color: var(--text-muted, #888);
  }

  .bd-commit-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bd-commit-row {
    padding: 10px 14px;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
  }

  .bd-commit-message {
    display: block;
    font-size: 0.85rem;
    color: var(--text-primary, #eee);
  }

  .bd-commit-meta {
    display: block;
    font-size: 0.72rem;
    color: var(--text-muted, #888);
    margin-top: 2px;
  }
</style>
