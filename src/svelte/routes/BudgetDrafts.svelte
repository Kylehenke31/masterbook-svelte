<script>
  import {
    listVersions, getActiveVersionId, getActiveVersionName, hasUncommittedChanges, suggestedDraftName,
    commitToActiveDraft, markAsActive, duplicateVersion, renameVersion, deleteVersion, setDraftNotes,
  } from '../lib/budgetVersions.js';
  import { commitBudgetChanges, listCommits, latestCommitForVersion } from '../lib/budgetCommits.js';
  import { computeBudgetSummary, COMMERCIAL_SECTIONS, FEATURE_SECTIONS } from '../../budget.js';
  import VersionActionModal from '../components/VersionActionModal.svelte';

  let versions = $state([]);
  let activeId = $state(null);
  let selectedId = $state(null);

  let notesDraft = $state('');
  let notesSaved = $state(true);

  let modal      = $state(null);
  let modalInput = $state('');
  let commits    = $state([]);

  function sectionDefs() {
    try {
      const proj = JSON.parse(localStorage.getItem('movie-ledger-project'));
      return proj?.budgetTemplate === 'feature' ? FEATURE_SECTIONS : COMMERCIAL_SECTIONS;
    } catch { return COMMERCIAL_SECTIONS; }
  }

  function refresh() {
    versions = listVersions();
    activeId = getActiveVersionId();
    commits  = listCommits();
    if (!selectedId && versions.length) selectedId = versions[0].id;
    if (selectedId && !versions.find(v => v.id === selectedId)) selectedId = versions[0]?.id ?? null;
    syncNotesDraft();
  }
  refresh();

  function selected() {
    return versions.find(v => v.id === selectedId) || null;
  }

  function summary() {
    const v = selected();
    if (!v) return null;
    return computeBudgetSummary(sectionDefs(), v.data?.budget);
  }

  function fmtMoney(n) {
    if (!n) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

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

  function selectDraft(id) {
    selectedId = id;
    syncNotesDraft();
  }

  function syncNotesDraft() {
    notesDraft = selected()?.notes || '';
    notesSaved = true;
  }

  function onNotesInput() {
    notesSaved = false;
  }

  function saveNotes() {
    const v = selected();
    if (!v) return;
    setDraftNotes(v.id, notesDraft);
    refresh();
    notesSaved = true;
  }

  function closeModal() { modal = null; modalInput = ''; }

  /* ── Actions (operate on the selected draft) ── */
  function actionMarkActive(v) {
    if (v.id === activeId) return;
    const doSwitch = () => {
      markAsActive(v.id);
      refresh(); closeModal();
    };
    if (!hasUncommittedChanges()) { doSwitch(); return; }
    const outgoingName = getActiveVersionName();
    modal = {
      type: 'confirm',
      title: 'Uncommitted Changes',
      message: `"${outgoingName}" has changes that haven't been committed yet. Commit them first so they aren't lost?`,
      confirmLabel: 'Commit & Switch',
      secondaryLabel: 'Discard & Switch',
      onConfirm: () => {
        modalInput = '';
        modal = {
          type: 'commit',
          title: 'Commit Changes',
          confirmLabel: 'Commit & Switch',
          onConfirm: (message) => {
            const outgoingId = getActiveVersionId();
            commitToActiveDraft();
            commitBudgetChanges(message, outgoingId, outgoingName);
            doSwitch();
          },
        };
      },
      onSecondary: doSwitch,
    };
  }

  function actionDuplicate(v) {
    const copy = duplicateVersion(v.id);
    refresh();
    if (copy) selectDraft(copy.id);
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
        if (selectedId === v.id) selectedId = null;
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

  <div class="bd-body">
    <div class="bd-list">
      {#each versions as v (v.id)}
        <button class="bd-row" class:bd-row--selected={v.id === selectedId} onclick={() => selectDraft(v.id)}>
          <span class="bd-row-name">{v.name}</span>
          <span class="bd-row-meta">{fmtRelative(v.updatedAt)}</span>
          <span class="bd-dot" class:bd-dot--active={v.id === activeId} title={v.id === activeId ? 'Active draft' : ''}></span>
        </button>
      {:else}
        <div class="bd-empty">No saved drafts yet.</div>
      {/each}
    </div>

    <div class="bd-detail">
      {#if selected()}
        {@const v = selected()}
        {@const s = summary()}
        <div class="bd-detail-header">
          <span class="bd-detail-name">{v.name}</span>
          {#if v.id === activeId}<span class="bd-badge bd-badge--gold">Active</span>{/if}
        </div>

        <div class="bd-detail-actions">
          <button class="btn btn--ghost btn--sm" onclick={() => actionMarkActive(v)} disabled={v.id === activeId}>Mark as Active</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionDuplicate(v)}>Duplicate</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionRename(v)}>Rename</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionStub('folder')}>Show in Folder</button>
          <button class="btn btn--ghost btn--sm" onclick={() => actionStub('permissions')}>Permissions</button>
          <button class="btn btn--danger btn--sm" onclick={() => actionDelete(v)}>Delete</button>
        </div>

        {#if latestCommitForVersion(v.id)}
          {@const lc = latestCommitForVersion(v.id)}
          <div class="bd-last-commit">Last commit: "{lc.message}" — {lc.userLabel} · {fmtRelative(lc.timestamp)}</div>
        {/if}

        <div class="bd-topsheet">
          <div class="bd-topsheet-title">Top Sheet Preview</div>
          <table class="bd-topsheet-table">
            <tbody>
              {#each s.sectionTotals as t (t.id)}
                <tr>
                  <td class="bd-ts-id">{t.id}</td>
                  <td class="bd-ts-name">{t.name}</td>
                  <td class="bd-ts-num">{fmtMoney(t.bidTotal)}</td>
                </tr>
              {/each}
              <tr>
                <td class="bd-ts-id">Q</td>
                <td class="bd-ts-name">Insurance</td>
                <td class="bd-ts-num">{fmtMoney(s.qBid)}</td>
              </tr>
              <tr>
                <td class="bd-ts-id">R</td>
                <td class="bd-ts-name">Contingency</td>
                <td class="bd-ts-num">{fmtMoney(s.rBid)}</td>
              </tr>
              <tr class="bd-ts-grand">
                <td class="bd-ts-id"></td>
                <td class="bd-ts-name">Grand Total</td>
                <td class="bd-ts-num">{fmtMoney(s.grandBid)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bd-notes">
          <div class="bd-notes-title">Notes</div>
          <textarea
            class="bd-notes-textarea"
            bind:value={notesDraft}
            oninput={onNotesInput}
            placeholder="e.g. This draft has an additional day of skeleton crew labor, waiving the editor fee, etc."
            rows="4"
          ></textarea>
          <button class="btn btn--primary btn--sm" onclick={saveNotes} disabled={notesSaved}>
            {notesSaved ? 'Saved' : 'Save Notes'}
          </button>
        </div>
      {:else}
        <div class="bd-empty">Select a draft to preview it here.</div>
      {/if}
    </div>
  </div>

  <div class="bd-commits">
    <h3>Commit History</h3>
    <p class="bd-commits-note">A minimal log of budget checkpoints — who committed, and an optional note on what changed.</p>

    <div class="bd-commit-list">
      {#each commits as c (c.id)}
        <div class="bd-commit-row">
          <span class="bd-commit-message">{c.message}</span>
          <span class="bd-commit-meta">{c.userLabel} · {c.versionName} · {fmtRelative(c.timestamp)}</span>
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
    max-width: 1100px;
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

  .bd-body {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 16px;
    align-items: start;
  }

  .bd-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bd-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 10px;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    cursor: pointer;
    text-align: left;
    width: 100%;
  }
  .bd-row:hover { background: var(--bg-elevated, #1f1f24); }
  .bd-row--selected {
    border-color: var(--gold, #8cabcf);
  }

  .bd-row-name {
    flex: 1;
    font-size: 0.85rem;
    color: var(--text-primary, #eee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .bd-row-meta {
    font-size: 0.68rem;
    color: var(--text-muted, #888);
    flex-shrink: 0;
  }

  .bd-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: transparent;
    flex-shrink: 0;
  }
  .bd-dot--active {
    background: var(--green, #22c55e);
    box-shadow: 0 0 4px var(--green, #22c55e);
  }

  .bd-detail {
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    padding: 18px;
    min-height: 200px;
  }

  .bd-detail-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .bd-detail-name {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
  }

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
  .bd-badge--gold { color: var(--gold, #8cabcf); border-color: var(--gold, #8cabcf); }

  .bd-detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border, #2c2c35);
  }

  .bd-topsheet-title, .bd-notes-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted, #888);
    margin-bottom: 8px;
  }

  .bd-topsheet-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  .bd-topsheet-table td {
    padding: 5px 6px;
    font-size: 0.82rem;
    border-bottom: 1px solid var(--border-subtle, #232328);
  }
  .bd-ts-id { color: var(--gold, #8cabcf); font-weight: 700; width: 24px; }
  .bd-ts-name { color: var(--text-secondary, #9896a0); }
  .bd-ts-num { text-align: right; color: var(--text-primary, #eee); font-variant-numeric: tabular-nums; }
  .bd-ts-grand td { border-top: 2px solid var(--border, #2c2c35); border-bottom: none; font-weight: 700; }
  .bd-ts-grand .bd-ts-name, .bd-ts-grand .bd-ts-num { color: var(--text-primary, #eee); }

  .bd-notes-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    background: var(--bg-elevated, #1f1f24);
    border: 1px solid var(--border, #2c2c35);
    color: var(--text-primary, #eee);
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 10px;
  }
  .bd-notes-textarea:focus { outline: none; border-color: var(--gold, #8cabcf); }

  .bd-empty {
    padding: 16px;
    font-size: 0.85rem;
    color: var(--text-muted, #888);
    background: var(--bg-surface, #17171a);
    border: 1px dashed var(--border, #2c2c35);
  }

  .bd-last-commit {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    margin-bottom: 16px;
  }

  .bd-commits {
    margin-top: 32px;
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
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
  }

  .bd-commit-message {
    font-size: 0.85rem;
    color: var(--text-primary, #eee);
  }

  .bd-commit-meta {
    font-size: 0.72rem;
    color: var(--text-muted, #888);
    margin-top: 2px;
  }
</style>
