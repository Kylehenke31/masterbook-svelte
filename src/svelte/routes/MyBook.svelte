<script>
  /**
   * MyBook.svelte — the signed-in user's own corner of the project.
   *
   * Two things belong to a person rather than to the production: the cards
   * they are allowed to spend on, and the submissions they filed. Everything
   * here is scoped to one of those two facts.
   *
   * Note "mine" has two distinct meanings and both matter:
   *   - a charge on a card assigned to me (I am accountable for the card)
   *   - a submission I filed (I am accountable for the paperwork)
   * They overlap but neither contains the other — someone else may submit a
   * charge on my card, and I may submit a petty cash expense on no card at
   * all. Both are shown, separately.
   */
  import { onDestroy } from 'svelte';
  import { getPurchases } from '../../data.js';
  import { authUser, getDisplayName } from '../stores/auth.js';

  const CARDS_KEY = 'movie-ledger-credit-cards';

  let user = $state(null);
  const unsubAuth = authUser.subscribe(u => { user = u; });
  onDestroy(() => unsubAuth());

  let cards = $state([]);
  let purchases = $state([]);

  function load() {
    try { cards = JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch { cards = []; }
    // Copy, don't alias. getPurchases() hands back the live DB.purchases array,
    // so assigning it straight to $state stores the same reference every time
    // and nothing re-renders when the ledger changes underneath us.
    purchases = [...getPurchases()];
  }
  load();

  // The ledger arrives asynchronously after sign-in, so re-read when it lands.
  const onPurchasesLoaded = () => load();
  window.addEventListener('masterbook-purchases-loaded', onPurchasesLoaded);
  onDestroy(() => window.removeEventListener('masterbook-purchases-loaded', onPurchasesLoaded));

  let myCards = $derived(user ? cards.filter(c => c.userId === user.id) : []);

  /** Charges on a card assigned to me, whoever submitted them. */
  function chargesForCard(card) {
    return purchases.filter(p =>
      p.method === 'CC' && p.ccCardType === card.cardType && p.ccLast4 === card.last4);
  }

  /**
   * Submissions I filed. Records created before submittedByUserId existed have
   * no author at all — they are deliberately not guessed at from the name,
   * which is not a stable identifier.
   */
  let mySubmissions = $derived(
    user ? purchases.filter(p => p.submittedByUserId === user.id) : []);

  // Anything awaiting a decision is what the user actually came here for.
  const OPEN_STATUSES = ['In Review', 'Pending Approval', 'Submitted'];
  let awaitingReview = $derived(mySubmissions.filter(p => OPEN_STATUSES.includes(p.status)));
  let settled        = $derived(mySubmissions.filter(p => !OPEN_STATUSES.includes(p.status)));

  /**
   * Charges on my cards that nobody is credited with submitting. These predate
   * author stamping; they are surfaced rather than hidden because they are
   * still my responsibility to account for.
   */
  let unattributedOnMyCards = $derived(
    myCards.flatMap(c => chargesForCard(c)).filter(p => !p.submittedByUserId));

  function fmt(n) {
    const v = Number(n) || 0;
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function statusClass(s) {
    if (s === 'Approved') return 'mb-pill--approved';
    if (s === 'Void') return 'mb-pill--void';
    if (s === 'Refunded') return 'mb-pill--refunded';
    if (OPEN_STATUSES.includes(s)) return 'mb-pill--open';
    return '';
  }

  const goto = hash => { window.location.hash = hash; };
</script>

<section class="mb-page">
  <header class="mb-header">
    <div>
      <h2 class="mb-title">My Book</h2>
      <p class="mb-subtitle">
        {user ? getDisplayName(user) : 'Not signed in'}
      </p>
    </div>
    <button class="btn btn--primary btn--sm" onclick={() => goto('#submit')}>+ New Submission</button>
  </header>

  <!-- ══ My Cards ══ -->
  <div class="mb-section">
    <h3 class="mb-section-title">My Cards</h3>
    {#if myCards.length === 0}
      <p class="mb-empty">
        No cards are assigned to you. An admin can assign one under
        <button class="mb-link" onclick={() => goto('#credit-cards')}>Credit Cards</button>.
      </p>
    {:else}
      <div class="mb-cards">
        {#each myCards as c (c.cardType + c.last4)}
          {@const charges = chargesForCard(c)}
          <button class="mb-card" onclick={() => goto('#credit-cards')}>
            <span class="mb-card-type">{c.cardType}</span>
            <span class="mb-card-num">···· {c.last4}</span>
            <span class="mb-card-meta">
              {charges.length} charge{charges.length === 1 ? '' : 's'}
              · {fmt(charges.reduce((s, p) => s + (Number(p.amount) || 0), 0))}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ══ Awaiting review ══ -->
  <div class="mb-section">
    <h3 class="mb-section-title">
      Awaiting Review
      {#if awaitingReview.length}<span class="mb-count">{awaitingReview.length}</span>{/if}
    </h3>
    {#if awaitingReview.length === 0}
      <p class="mb-empty">Nothing of yours is waiting on a decision.</p>
    {:else}
      <table class="mb-table">
        <thead>
          <tr><th>Folder</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each awaitingReview as p (p.id)}
            <tr>
              <td class="mb-mono">{p.folder || '—'}</td>
              <td>{p.date || '—'}</td>
              <td>{p.vendor || '—'}</td>
              <td class="mb-amount">{fmt(p.amount)}</td>
              <td><span class="mb-pill {statusClass(p.status)}">{p.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- ══ Settled ══ -->
  {#if settled.length}
    <div class="mb-section">
      <h3 class="mb-section-title">Settled <span class="mb-count">{settled.length}</span></h3>
      <table class="mb-table">
        <thead>
          <tr><th>Folder</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each settled as p (p.id)}
            <tr>
              <td class="mb-mono">{p.folder || '—'}</td>
              <td>{p.date || '—'}</td>
              <td>{p.vendor || '—'}</td>
              <td class="mb-amount">{fmt(p.amount)}</td>
              <td><span class="mb-pill {statusClass(p.status)}">{p.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- ══ Unattributed charges on my cards ══ -->
  {#if unattributedOnMyCards.length}
    <div class="mb-section">
      <h3 class="mb-section-title">
        On My Cards, No Submitter <span class="mb-count">{unattributedOnMyCards.length}</span>
      </h3>
      <p class="mb-note">
        These charges are on a card assigned to you but were filed before the app
        recorded who submitted an expense, so nobody is credited with them.
      </p>
      <table class="mb-table">
        <thead>
          <tr><th>Folder</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each unattributedOnMyCards as p (p.id)}
            <tr>
              <td class="mb-mono">{p.folder || '—'}</td>
              <td>{p.date || '—'}</td>
              <td>{p.vendor || '—'}</td>
              <td class="mb-amount">{fmt(p.amount)}</td>
              <td><span class="mb-pill {statusClass(p.status)}">{p.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .mb-page { padding: 4px 0 40px; }

  .mb-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 22px;
  }
  .mb-title { font-size: 1.35rem; font-weight: 700; color: var(--text-primary); margin: 0; }
  .mb-subtitle { font-size: 0.8rem; color: var(--text-secondary); margin: 3px 0 0; }

  .mb-section { margin-bottom: 30px; }
  .mb-section-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--text-muted);
    padding-bottom: 7px; margin: 0 0 11px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .mb-count {
    font-size: 0.68rem; padding: 1px 6px; color: var(--bg-base);
    background: var(--gold); letter-spacing: 0;
  }

  .mb-empty, .mb-note { font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 10px; }

  .mb-link {
    background: none; border: none; padding: 0; font: inherit;
    color: var(--gold); cursor: pointer; text-decoration: underline;
  }

  .mb-cards { display: flex; flex-wrap: wrap; gap: 10px; }
  .mb-card {
    display: flex; flex-direction: column; gap: 3px; align-items: flex-start;
    min-width: 180px; padding: 11px 13px; cursor: pointer; font: inherit;
    text-align: left; color: var(--text-primary);
    background: var(--bg-elevated); border: 1px solid var(--border);
    transition: border-color var(--transition), background var(--transition);
  }
  .mb-card:hover { border-color: var(--gold); background: var(--bg-hover); }
  .mb-card-type { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; color: var(--text-muted); }
  .mb-card-num  { font-size: 1rem; font-weight: 700; }
  .mb-card-meta { font-size: 0.72rem; color: var(--text-secondary); }

  .mb-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .mb-table th {
    text-align: left; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-muted);
    padding: 6px 9px; border-bottom: 1px solid var(--border);
  }
  .mb-table td { padding: 8px 9px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); }
  .mb-mono { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
  .mb-amount { font-variant-numeric: tabular-nums; text-align: right; }

  .mb-pill {
    display: inline-block; padding: 2px 7px; font-size: 0.68rem; font-weight: 700;
    color: var(--text-secondary); background: var(--bg-elevated);
  }
  .mb-pill--open     { background: var(--row-review); color: var(--blue); }
  .mb-pill--approved { background: var(--row-approved); color: var(--green); }
  .mb-pill--refunded { background: var(--red-light); color: var(--red); }
  .mb-pill--void     { background: var(--void-bg); color: var(--void-text); }
</style>
