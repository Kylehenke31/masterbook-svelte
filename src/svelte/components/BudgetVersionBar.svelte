<script>
  import {
    getActiveVersionName, hasLiveBudgetData, suggestedDraftName,
    saveCurrentAsVersion, createFreshBudget,
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

  function actionNewBudget() {
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
              refresh(); closeModal(); onVersionChanged?.();
            },
          };
        },
        onSecondary: () => {
          createFreshBudget();
          refresh(); closeModal(); onVersionChanged?.();
        },
      };
    } else {
      createFreshBudget();
      refresh(); onVersionChanged?.();
    }
  }

  function actionSaveDraft() {
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

  function actionCommit() {
    modalInput = '';
    modal = {
      type: 'commit',
      title: 'Commit Changes',
      confirmLabel: 'Commit',
      onConfirm: (message) => {
        commitBudgetChanges(message, activeName);
        closeModal();
      },
    };
  }

  function goToDrafts() {
    window.location.hash = '#budget-drafts';
  }
</script>

<div class="bvb-wrap">
  <span class="bvb-label">Editing:</span>
  <span class="bvb-name">{activeName}</span>

  <div class="bvb-actions">
    <button class="btn btn--ghost btn--sm" onclick={goToDrafts}>Manage Drafts</button>
    <button class="btn btn--ghost btn--sm" onclick={actionNewBudget}>+ New Budget</button>
    <button class="btn btn--ghost btn--sm" onclick={actionSaveDraft}>Save as Draft</button>
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
