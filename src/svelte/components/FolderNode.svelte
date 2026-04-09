<script>
  import { getContext } from 'svelte';
  import FolderNode from './FolderNode.svelte';

  let { node, depth = 0 } = $props();

  // Access shared state from Files.svelte via context
  const ctx = getContext('files');

  let isOpen     = $derived(!!ctx.expanded[node.id]);
  let folderFiles = $derived(ctx.files[node.id] || []);
  let isTop = $derived(depth === 0);

  function filteredFiles() {
    if (!ctx.search) return folderFiles;
    return folderFiles.filter(f => f.name.toLowerCase().includes(ctx.search.toLowerCase()));
  }

  function treeMatches(n) {
    if (ctx.matchesSearch(n.label, n.id)) return true;
    if (n.children) return n.children.some(c => treeMatches(c));
    if (n.dynamic === 'callsheets') return ctx.getCallSheetDays().some(d => ctx.matchesSearch(d.label, d.id));
    return false;
  }
</script>


{#if !ctx.search || treeMatches(node)}
  <div class="files-node" style="padding-left:{depth * 20}px">
    <div
      class="files-row"
      class:files-row--top={isTop}
      role="button"
      tabindex="0"
      onclick={() => ctx.toggle(node.id)}
      onkeydown={e => e.key === 'Enter' && ctx.toggle(node.id)}
    >
      <span class="files-chevron" class:open={isOpen}>▶</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16" class="folder-icon">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <span class="files-label" class:top={isTop}>{node.label}</span>
      {#if folderFiles.length > 0}
        <span class="files-badge">{folderFiles.length}</span>
      {/if}
    </div>

    {#if isOpen}
      {#if node.children}
        {#each node.children as child (child.id)}
          <FolderNode node={child} depth={depth + 1} />
        {/each}
      {/if}

      {#if node.dynamic === 'callsheets'}
        {#each ctx.getCallSheetDays() as day (day.id)}
          {#if !ctx.search || ctx.matchesSearch(day.label, day.id)}
            <FolderNode node={day} depth={depth + 1} />
          {/if}
        {/each}
      {/if}

      {#each filteredFiles() as f, fi}
        <div class="files-file" style="padding-left:{(depth + 1) * 20}px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="file-icon">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <a class="files-file-name" href={f.dataUrl} download={f.name}>{f.name}</a>
          <span class="files-file-size">{ctx.formatSize(f.size)}</span>
          <button class="files-file-del" onclick={e => { e.stopPropagation(); ctx.deleteFile(node.id, fi); }} title="Remove">✕</button>
        </div>
      {/each}

      <div class="files-upload" style="padding-left:{(depth + 1) * 20}px">
        <label class="files-upload-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add File
          <input type="file" hidden multiple onchange={e => ctx.handleUpload(node.id, e)} />
        </label>
      </div>
    {/if}
  </div>
{/if}

<style>
  .files-node { }

  .files-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .files-row:hover    { background: var(--surface-2, #222); }
  .files-row--top     { font-weight: 600; }

  .files-chevron {
    font-size: 0.6rem;
    color: var(--text-muted, #666);
    transition: transform 0.15s;
    flex-shrink: 0;
    width: 10px;
  }
  .files-chevron.open { transform: rotate(90deg); }

  .folder-icon { color: var(--text-muted, #888); flex-shrink: 0; }

  .files-label      { font-size: 0.875rem; flex: 1; }
  .files-label.top  { font-size: 0.9rem; font-weight: 600; }

  .files-badge {
    font-size: 0.7rem;
    background: var(--surface-2, #2a2a2a);
    color: var(--text-muted, #888);
    padding: 1px 6px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .files-file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
  }
  .file-icon { color: var(--text-muted, #888); flex-shrink: 0; }

  .files-file-name {
    flex: 1;
    font-size: 0.8rem;
    color: var(--accent, #7a9a7a);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .files-file-name:hover { text-decoration: underline; }

  .files-file-size {
    font-size: 0.75rem;
    color: var(--text-muted, #666);
    flex-shrink: 0;
  }

  .files-file-del {
    background: none;
    border: none;
    color: var(--text-muted, #666);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 1px 4px;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }
  .files-file:hover .files-file-del { opacity: 1; }
  .files-file-del:hover { color: var(--earth-red, #b84f4f); }

  .files-upload { padding: 2px 0 4px; }

  .files-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px dashed var(--border, #333);
    transition: color 0.12s, border-color 0.12s;
  }
  .files-upload-btn:hover {
    color: var(--text, #eee);
    border-color: var(--accent, #6a8a6a);
  }
</style>
