<script>
  import { onMount } from 'svelte';
  import { currentRoute } from './stores/router.js';

  // Placeholder route components — will be replaced as we migrate each feature
  import Home from './routes/Home.svelte';
  import ElementsReport from './routes/ElementsReport.svelte';
  import Insurance from './routes/Insurance.svelte';
  import Files from './routes/Files.svelte';
  import Vendors from './routes/Vendors.svelte';
  import ProjectSetup from './routes/ProjectSetup.svelte';
  import Personnel from './routes/Personnel.svelte';

  let route;
  currentRoute.subscribe(r => route = r);

  onMount(() => {
    const update = () => currentRoute.set(window.location.hash.slice(1) || 'home');
    window.addEventListener('hashchange', update);
    update();
    return () => window.removeEventListener('hashchange', update);
  });
</script>

<div class="app-shell">
  <header class="app-header">
    <nav class="app-nav">
      <a href="#log"      class:active={route === 'log'}>Purchase Log</a>
      <a href="#calendar" class:active={route === 'calendar'}>Calendar</a>
      <a href="#crew"     class:active={route === 'crew'}>Personnel</a>
      <a href="#vendors"  class:active={route === 'vendors'}>Vendors</a>
    </nav>
    <span class="header-project-title">The Masterbook</span>
  </header>

  <main class="app-main" class:app-main--full={route === 'crew'}>
    {#if route === 'home' || !route}
      <Home />
    {:else if route === 'crew'}
      <Personnel />
    {:else if route === 'elements-report'}
      <ElementsReport />
    {:else if route === 'insurance'}
      <Insurance />
    {:else if route === 'files'}
      <Files />
    {:else if route === 'vendors'}
      <Vendors />
    {:else if route === 'setup' || route === 'settings'}
      <ProjectSetup />
    {:else}
      <div class="coming-soon">
        <h2>#{route}</h2>
        <p>Migration in progress…</p>
      </div>
    {/if}
  </main>

  <footer class="app-footer">
    The Masterbook &copy; {new Date().getFullYear()}
  </footer>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 24px;
    height: 52px;
    background: var(--surface-1, #1a1a1a);
    border-bottom: 1px solid var(--border, #333);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .app-nav {
    display: flex;
    gap: 4px;
  }

  .app-nav a {
    padding: 6px 12px;
    border-radius: 6px;
    color: var(--text-muted, #888);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.15s, background 0.15s;
  }

  .app-nav a:hover,
  .app-nav a.active {
    color: var(--text, #eee);
    background: var(--surface-2, #2a2a2a);
  }

  .header-project-title {
    margin-left: auto;
    font-size: 0.875rem;
    color: var(--text-muted, #888);
  }

  .app-main {
    flex: 1;
    padding: 24px;
  }

  .app-main--full {
    padding: 0;
    max-width: 100%;
  }

  .app-footer {
    padding: 12px 24px;
    font-size: 0.75rem;
    color: var(--text-muted, #555);
    border-top: 1px solid var(--border, #333);
    text-align: center;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 50vh;
    gap: 8px;
    color: var(--text-muted, #888);
  }

  .coming-soon h2 {
    font-size: 1.5rem;
    color: var(--text, #eee);
  }
</style>
