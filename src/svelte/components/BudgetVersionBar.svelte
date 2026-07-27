<script>
  import {
    getActiveVersionId, getActiveVersionName, hasUncommittedChanges, suggestedDraftName,
    createNamedDraft, forkLiveAsNewDraft, commitToActiveDraft, createFreshBudget,
  } from '../lib/budgetVersions.js';
  import { commitBudgetChanges } from '../lib/budgetCommits.js';
  import VersionActionModal from './VersionActionModal.svelte';

  const { onVersionChanged } = $props();

  let activeName = $state('Untitled Budget');
  let modal      = $state(null);
  let modalInput = $state('');

  function refresh() {
    activeName = getActiveVersionName();
  }
  refresh();

  function closeModal() { modal = null; modalInput = ''; }

  /* Ask to commit (in place) or discard the outgoing draft's pending
     edits, then run `proceed`. Skips the prompt entirely if there's
     nothing uncommitted to lose. */
  function withUncommittedGuard(proceed) {
    if (!hasUncommittedChanges()) { proceed(); return; }
    modal = {
      type: 'confirm',
      title: 'Uncommitted Changes',
      message: `"${activeName}" has changes that haven't been committed yet. Commit them first so they aren't lost?`,
      confirmLabel: 'Commit & Continue',
      secondaryLabel: 'Discard & Continue',
      onConfirm: () => {
        modalInput = '';
        modal = {
          type: 'commit',
          title: 'Commit Changes',
          confirmLabel: 'Commit & Continue',
          onConfirm: (message) => {
            const activeId = getActiveVersionId();
            commitToActiveDraft();
            commitBudgetChanges(message, activeId, activeName);
            closeModal();
            proceed();
          },
        };
      },
      onSecondary: () => {
        closeModal();
        proceed();
      },
    };
  }

  function actionNewBudget() {
    withUncommittedGuard(() => {
      modalInput = suggestedDraftName();
      modal = {
        type: 'name',
        title: 'Name This Budget',
        confirmLabel: 'Create',
        onConfirm: (name) => {
          createFreshBudget();
          createNamedDraft(name);
          refresh(); closeModal(); onVersionChanged?.();
        },
      };
    });
  }

  function actionSaveAsNewDraft() {
    modalInput = suggestedDraftName();
    modal = {
      type: 'name',
      title: 'Save Current as New Draft',
      confirmLabel: 'Save',
      onConfirm: (name) => {
        forkLiveAsNewDraft(name);
        closeModal();
      },
    };
  }

  function actionCommit() {
    const activeId = getActiveVersionId();
    if (!activeId) {
      // Nothing to commit into yet — name a draft first, then commit.
      modalInput = suggestedDraftName();
      modal = {
        type: 'name',
        title: 'Name This Budget',
        confirmLabel: 'Create & Commit',
        onConfirm: (name) => {
          createNamedDraft(name);
          refresh();
          modalInput = '';
          modal = {
            type: 'commit',
            title: 'Commit Changes',
            confirmLabel: 'Commit',
            onConfirm: (message) => {
              commitToActiveDraft();
              commitBudgetChanges(message, getActiveVersionId(), activeName);
              closeModal();
            },
          };
        },
      };
      return;
    }
    modalInput = '';
    modal = {
      type: 'commit',
      title: 'Commit Changes',
      confirmLabel: 'Commit',
      onConfirm: (message) => {
        commitToActiveDraft();
        commitBudgetChanges(message, activeId, activeName);
        closeModal();
      },
    };
  }

  function goToDrafts() {
    // Just navigating doesn't touch the live budget or which draft is
    // active, so there's nothing to guard here — Mark as Active on the
    // Drafts page is where the uncommitted-changes check applies.
    window.location.hash = '#budget-drafts';
  }
</script>

<div class="bvb-wrap">
  <span class="bvb-label">Editing:</span>
  <span class="bvb-name">{activeName}</span>

  <div class="bvb-actions">
    <button class="btn btn--ghost btn--sm" onclick={goToDrafts}>Manage Drafts</button>
    <button class="btn btn--ghost btn--sm" onclick={actionNewBudget}>+ New Budget</button>
    <button class="btn btn--ghost btn--sm" onclick={actionSaveAsNewDraft}>Save as New Draft</button>
    <button class="btn btn--primary btn--sm" onclick={actionCommit}>Commit Changes</button>
  </div>
</div>

<VersionActionModal bind:modal bind:inputValue={modalInput} />

<style>
  .bvb-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 10px 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border, #2c2c35);
  }

  .bvb-label { color: var(--text-muted, #888); font-size: 0.8rem; }
  .bvb-name  { font-weight: 700; color: var(--text-primary, #eee); font-size: 0.8rem; margin-right: auto; }

  .bvb-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
