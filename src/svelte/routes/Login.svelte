<script>
  import { signIn, signUp } from '../stores/auth.js';

  let { onSuccess = () => {} } = $props();

  let view      = $state('signin');   // 'signin' | 'signup'
  let email     = $state('');
  let password  = $state('');
  let name      = $state('');
  let error     = $state('');
  let busy      = $state(false);

  /* An invite link lands here as /?invite=<address>.
     It is not a token and grants nothing on its own — accept_project_invites()
     matches on the address you actually authenticate as. It is here because
     that matching is exactly what goes wrong by hand: sign up with a different
     address and the invite is simply never found, with nothing on screen to
     say why. Prefilling the field, and saying plainly which address the invite
     belongs to, is what stops that. */
  let invitedEmail = $state('');
  try {
    const invited = new URLSearchParams(window.location.search).get('invite');
    if (invited && invited.includes('@')) {
      invitedEmail = invited.trim().toLowerCase();
      email = invitedEmail;
      view  = 'signup';   // an invited address usually has no account yet
    }
  } catch { /* a malformed URL is not worth failing the login screen over */ }

  // Warn only once they have actually diverged, not while they are mid-typing
  // a fresh address in a field they deliberately cleared.
  let addressMismatch = $derived(
    !!invitedEmail && email.trim().length > 0 &&
    email.trim().toLowerCase() !== invitedEmail
  );

  async function handleSubmit() {
    error = '';
    if (!email.trim() || !password.trim()) { error = 'Email and password are required.'; return; }
    if (view === 'signup' && !name.trim())  { error = 'Display name is required.'; return; }
    busy = true;
    try {
      if (view === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim());
      }
      onSuccess();
    } catch (e) {
      error = e.message || 'Something went wrong. Please try again.';
    } finally {
      busy = false;
    }
  }

  function switchView(v) {
    view = v;
    error = '';
  }
</script>

<div class="login-wrap">
  <div class="login-card">

    <!-- Logo -->
    <div class="login-logo-wrap">
      <img src="/logo-night.png" class="login-logo login-logo--dark" alt="The Masterbook" />
      <img src="/logo-day.png"   class="login-logo login-logo--light" alt="The Masterbook" />
    </div>

    <h1 class="login-title">The Masterbook</h1>

    {#if invitedEmail}
      <p class="login-invite">
        You have been invited as <strong>{invitedEmail}</strong>.
        Sign in or create an account with that address to join the project.
      </p>
    {/if}

    <!-- Tabs -->
    <div class="login-tabs">
      <button
        class="login-tab"
        class:login-tab--active={view === 'signin'}
        onclick={() => switchView('signin')}
      >Sign In</button>
      <button
        class="login-tab"
        class:login-tab--active={view === 'signup'}
        onclick={() => switchView('signup')}
      >Create Account</button>
    </div>

    <!-- Form -->
    <form class="login-form" onsubmit={e => { e.preventDefault(); handleSubmit(); }}>

      {#if view === 'signup'}
        <div class="login-field">
          <label for="login-name">Display Name</label>
          <input
            id="login-name"
            type="text"
            placeholder="Your name"
            bind:value={name}
            autocomplete="name"
            disabled={busy}
          />
        </div>
      {/if}

      <div class="login-field">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          bind:value={email}
          autocomplete="email"
          disabled={busy}
        />
        {#if addressMismatch}
          <span class="login-warn">
            The invite is for {invitedEmail}. Using a different address here will
            create an account without that project.
          </span>
        {/if}
      </div>

      <div class="login-field">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="••••••••"
          bind:value={password}
          autocomplete={view === 'signin' ? 'current-password' : 'new-password'}
          disabled={busy}
        />
      </div>

      {#if error}
        <p class="login-error">{error}</p>
      {/if}

      <button type="submit" class="login-submit" disabled={busy}>
        {#if busy}
          <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
        {:else}
          {view === 'signin' ? 'Sign In' : 'Create Account'}
        {/if}
      </button>

    </form>

  </div>
</div>

<style>
  .login-wrap {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-base, #111);
    z-index: 9999;
    padding: 24px;
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    padding: 40px 36px 36px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  /* Logo */
  .login-logo-wrap {
    margin-bottom: 16px;
  }
  .login-logo {
    width: 72px;
    height: auto;
    display: block;
  }
  .login-logo--light { display: none; }
  :global([data-theme="light"]) .login-logo--dark  { display: none; }
  :global([data-theme="light"]) .login-logo--light { display: block; }

  .login-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
    margin: 0 0 4px;
    text-align: center;
  }

  .login-subtitle {
    font-size: 0.8rem;
    color: var(--text-muted, #888);
    margin: 0 0 28px;
    text-align: center;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Tabs */
  .login-tabs {
    display: flex;
    width: 100%;
    gap: 0;
    border: 1px solid var(--border, #333);
    border-radius: 0;
    overflow: hidden;
    margin-bottom: 24px;
  }

  .login-tab {
    flex: 1;
    padding: 9px 12px;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .login-tab:hover { color: var(--text-primary, #eee); }

  .login-tab--active {
    background: rgba(201, 168, 76, 0.12);
    color: var(--gold, #c9a84c);
    font-weight: 600;
  }

  /* Form */
  .login-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .login-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .login-field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .login-field input {
    padding: 10px 12px;
    background: var(--bg-elevated, #222);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    color: var(--text-primary, #eee);
    font-size: 0.9rem;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }

  .login-field input:focus {
    outline: none;
    border-color: var(--gold, #c9a84c);
  }

  .login-field input:disabled {
    opacity: 0.5;
  }

  .login-error {
    font-size: 0.8rem;
    color: #e66;
    margin: 0;
    padding: 8px 12px;
    background: rgba(220, 60, 60, 0.08);
    border: 1px solid rgba(220, 60, 60, 0.2);
    border-radius: 0;
    line-height: 1.4;
  }

  .login-invite {
    font-size: 0.8rem;
    color: var(--text-secondary, #ccc);
    margin: 0 0 18px;
    padding: 10px 12px;
    background: rgba(200, 164, 77, 0.08);
    border: 1px solid rgba(200, 164, 77, 0.3);
    line-height: 1.5;
    text-align: left;
  }
  .login-invite strong { color: var(--text-primary, #eee); }

  .login-warn {
    display: block;
    margin-top: 5px;
    font-size: 0.72rem;
    line-height: 1.4;
    color: #d9a441;
  }

  .login-submit {
    width: 100%;
    padding: 12px;
    background: var(--gold, #c9a84c);
    color: #111;
    border: none;
    border-radius: 0;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    margin-top: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s, transform 0.1s;
  }

  .login-submit:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .login-submit:disabled {
    opacity: 0.5;
    cursor: default;
    transform: none;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin {
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
</style>
