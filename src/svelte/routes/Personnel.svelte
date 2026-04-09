<script>
  import CrewList from './CrewList.svelte';
  import CastList from './CastList.svelte';

  const TAB_KEY = 'movie-ledger-personnel-tab';

  let tab = $state(localStorage.getItem(TAB_KEY) || 'crew');

  function setTab(t) {
    tab = t;
    localStorage.setItem(TAB_KEY, t);
  }
</script>

{#if tab === 'crew'}
  <CrewList {tab} {setTab} />
{:else}
  <CastList {tab} {setTab} />
{/if}
