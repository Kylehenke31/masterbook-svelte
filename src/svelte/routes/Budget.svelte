<script>
  import { onMount, onDestroy } from 'svelte';
  import { renderBudget, renderBudgetOverview, renderHotCosts } from '../../budget.js';

  /**
   * view: 'overview' | 'lines' | 'hot-costs'
   * Passed from App.svelte based on the active hash route.
   */
  let { view = 'overview' } = $props();

  let container;

  onMount(() => {
    if (!container) return;

    if (view === 'overview') {
      renderBudgetOverview(container);
    } else if (view === 'lines') {
      renderBudget(container);
    } else if (view === 'hot-costs') {
      renderHotCosts(container);
    }
  });

  onDestroy(() => {
    if (container) container.innerHTML = '';
  });
</script>

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
