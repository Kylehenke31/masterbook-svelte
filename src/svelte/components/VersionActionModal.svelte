<script>
  /**
   * Shared modal for budget-draft actions (BudgetVersionBar + BudgetDrafts page).
   * `modal` shapes:
   *   { type: 'name',    title, confirmLabel, onConfirm(name) }
   *   { type: 'commit',  title, confirmLabel, onConfirm(message) }
   *   { type: 'confirm', title, message, confirmLabel, secondaryLabel?, danger?, onConfirm(), onSecondary()? }
   *   { type: 'stub',    title, message }
   */
  let { modal = $bindable(null), inputValue = $bindable('') } = $props();

  function close() { modal = null; inputValue = ''; }

  function submitInput() {
    if (modal.type === 'name' && !inputValue.trim()) return;
    modal.onConfirm(inputValue.trim());
  }
</script>

{#if modal}
  <div class="vam-overlay" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="vam-modal" role="dialog" aria-modal="true">
      <div class="vam-title">{modal.title}</div>

      {#if modal.type === 'name'}
        <input
          class="vam-input"
          type="text"
          bind:value={inputValue}
          placeholder="Draft name"
          onkeydown={(e) => e.key === 'Enter' && submitInput()}
        />
        <div class="vam-actions">
          <button class="btn btn--ghost btn--sm" onclick={close}>Cancel</button>
          <button class="btn btn--primary btn--sm" onclick={submitInput}>{modal.confirmLabel}</button>
        </div>

      {:else if modal.type === 'commit'}
        <textarea
          class="vam-textarea"
          bind:value={inputValue}
          placeholder="What changed? (optional)"
          rows="3"
        ></textarea>
        <div class="vam-actions">
          <button class="btn btn--ghost btn--sm" onclick={close}>Cancel</button>
          <button class="btn btn--primary btn--sm" onclick={submitInput}>{modal.confirmLabel}</button>
        </div>

      {:else if modal.type === 'confirm'}
        <p class="vam-message">{modal.message}</p>
        <div class="vam-actions">
          <button class="btn btn--ghost btn--sm" onclick={close}>Cancel</button>
          {#if modal.onSecondary}
            <button class="btn btn--ghost btn--sm" onclick={modal.onSecondary}>{modal.secondaryLabel}</button>
          {/if}
          <button class={modal.danger ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm'} onclick={modal.onConfirm}>{modal.confirmLabel}</button>
        </div>

      {:else if modal.type === 'stub'}
        <p class="vam-message">{modal.message}</p>
        <div class="vam-actions">
          <button class="btn btn--primary btn--sm" onclick={close}>Got it</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .vam-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(2px);
  }

  .vam-modal {
    background: var(--bg-surface, #17171a);
    border: 1px solid var(--border, #2c2c35);
    box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    width: 100%;
    max-width: 420px;
    padding: 20px;
  }

  .vam-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
    margin-bottom: 12px;
  }

  .vam-message {
    font-size: 0.85rem;
    color: var(--text-secondary, #9896a0);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .vam-input, .vam-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    background: var(--bg-elevated, #1f1f24);
    border: 1px solid var(--border, #2c2c35);
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    margin-bottom: 16px;
    font-family: inherit;
  }
  .vam-textarea { resize: vertical; }
  .vam-input:focus, .vam-textarea:focus { outline: none; border-color: var(--gold, #c9a84c); }

  .vam-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
