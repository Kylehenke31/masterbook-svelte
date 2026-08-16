<script>
  import { onMount } from 'svelte';
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

  /* The toolbar is an HTML string built inside budget.js, so it cannot call
     these directly. It asks by event; this is the only listener, and it is
     removed with the component so a remount does not leave two. */
  onMount(() => {
    const onAction = (e) => {
      const a = e?.detail?.action;
      if (a === 'new-budget')  actionNewBudget();
      else if (a === 'save-draft') actionSaveAsNewDraft();
      else if (a === 'commit')     actionCommit();
    };
    window.addEventListener('masterbook-budget-action', onAction);
    return () => window.removeEventListener('masterbook-budget-action', onAction);
  });

  function goToDrafts() {
    // Just navigating doesn't touch the live budget or which draft is
    // active, so there's nothing to guard here — Mark as Active on the
    // Drafts page is where the uncommitted-changes check applies.
    window.location.hash = '#budget-drafts';
  }
</script>

<!-- No bar of its own any more. This row said "Editing: <name>" above a
     toolbar that could hold the same buttons, and the name it spent a row on
     now titles the summary panel below. The component remains because it owns
     these actions, their modals and the uncommitted-changes guard; the buttons
     that trigger them live in the toolbar that budget.js renders, which reaches
     them through the event below. -->
<VersionActionModal bind:modal bind:inputValue={modalInput} />


