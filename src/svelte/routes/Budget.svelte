<script>
  import { onMount, onDestroy } from 'svelte';
  import { renderBudget, renderBudgetOverview, renderHotCosts, disposeBudgetOverview } from '../../budget.js';
  import { ensureActiveLoaded } from '../lib/budgetVersions.js';
  import BudgetVersionBar from '../components/BudgetVersionBar.svelte';

  /**
   * view: 'overview' | 'lines' | 'hot-costs'
   * Passed from App.svelte based on the active hash route.
   */
  let { view = 'overview' } = $props();

  let container;

  function renderCurrentView() {
    if (!container) return;
    disposeBudgetOverview();   // switching views re-renders; drop the old handlers first
    // First time this project's Budget page is ever opened (no live data
    // yet), load the active draft. No-ops once anything has been
    // edited, so it never clobbers live work.
    ensureActiveLoaded();
    if (view === 'overview') {
      renderBudgetOverview(container);
    } else if (view === 'lines') {
      renderBudget(container);
    } else if (view === 'hot-costs') {
      renderHotCosts(container);
    }
  }

  onMount(renderCurrentView);

  onDestroy(() => {
    // The overview binds document-level listeners to close its toolbar menus;
    // without this they outlive the markup they were closing.
    disposeBudgetOverview();
    if (container) container.innerHTML = '';
  });
</script>

<BudgetVersionBar onVersionChanged={renderCurrentView} />

<div
  bind:this={container}
  class="budget-root"
  class:budget-root--full={view === 'lines'}
></div>

<style>
  .budget-root {
    /* Overview and hot-costs get normal app padding from .app-main */
    width: 100%;
    min-height: 100%;
  }

  /*
   * The line-items view is very wide (many columns).
   * Remove horizontal overflow clipping so the horizontal
   * scrollbar appears on the container rather than being hidden.
   */
  .budget-root--full {
    overflow-x: auto;
  }
</style>
