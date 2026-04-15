<script>
  import { DEPARTMENTS, loadDept } from '../lib/creative.js';

  const DEPT_ICONS = {
    'camera':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><rect x="2" y="7" width="15" height="11" rx="2"/><path d="M17 9l5-3v12l-5-3"/></svg>`,
    'locations':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    'prod-design': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    'costume':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M20 7l-8-5-8 5v10l8 5 8-5V7z"/></svg>`,
    'property':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`,
    'hair-makeup': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><path d="M7 10v2a5 5 0 0010 0v-2"/><path d="M12 17v5"/><path d="M9 22h6"/></svg>`,
    'stunts':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    'continuity':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
  };

  const DEPT_ROUTES = {
    'camera':      'creative-camera',
    'locations':   'creative-locations',
    'prod-design': 'creative-prod-design',
    'costume':     'creative-costume',
    'property':    'creative-property',
    'hair-makeup': 'creative-hair-makeup',
    'stunts':      'creative-stunts',
    'continuity':  'creative-continuity',
  };

  function slideCount(deptId) {
    return loadDept(deptId)?.creativeDeck?.slides?.length ?? 0;
  }
  function annotationCount(deptId) {
    return Object.keys(loadDept(deptId)?.elementsDeck?.annotations ?? {}).length;
  }
</script>

<div class="cr-hub">
  <div class="cr-hub-header">
    <h2 class="cr-hub-title">Creative</h2>
    <p class="cr-hub-sub">Department-level creative tools, decks, and production elements.</p>
  </div>

  <div class="cr-dept-grid">
    {#each DEPARTMENTS as dept}
      {@const slides = slideCount(dept.id)}
      {@const annots = annotationCount(dept.id)}
      <a class="cr-dept-card" href="#{DEPT_ROUTES[dept.id]}">
        <div class="cr-dept-icon">
          {@html DEPT_ICONS[dept.id] ?? ''}
        </div>
        <div class="cr-dept-info">
          <div class="cr-dept-name">{dept.label}</div>
          <div class="cr-dept-meta">
            {#if slides || annots}
              {slides} slide{slides !== 1 ? 's' : ''}
              {#if annots} · {annots} element{annots !== 1 ? 's' : ''} annotated{/if}
            {:else}
              <span class="cr-dept-empty">No content yet</span>
            {/if}
          </div>
        </div>
        <svg class="cr-dept-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </a>
    {/each}
  </div>
</div>

<style>
  .cr-hub {
    max-width: 760px;
    padding: 32px 0;
  }

  .cr-hub-header {
    margin-bottom: 28px;
  }

  .cr-hub-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
    margin: 0 0 6px;
  }

  .cr-hub-sub {
    font-size: 0.875rem;
    color: var(--text-secondary, #888);
    margin: 0;
  }

  .cr-dept-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 12px;
  }

  .cr-dept-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 18px;
    background: var(--bg-surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
  }

  .cr-dept-card:hover {
    border-color: var(--gold, #c9a84c);
    background: var(--bg-hover, #252525);
  }

  .cr-dept-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gold, #c9a84c);
    flex-shrink: 0;
  }

  .cr-dept-info {
    flex: 1;
    min-width: 0;
  }

  .cr-dept-name {
    font-size: 0.925rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
    margin-bottom: 3px;
  }

  .cr-dept-meta {
    font-size: 0.775rem;
    color: var(--text-secondary, #888);
  }

  .cr-dept-empty {
    font-style: italic;
    opacity: 0.7;
  }

  .cr-dept-arrow {
    color: var(--text-secondary, #666);
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .cr-dept-card:hover .cr-dept-arrow {
    color: var(--gold, #c9a84c);
  }
</style>
