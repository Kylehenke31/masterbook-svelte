<script>
  import { signIn, signUp } from '../stores/auth.js';

  let { onSuccess = () => {} } = $props();

  let view      = $state('signin');   // 'signin' | 'signup'
  let email     = $state('');
  let password  = $state('');
  let confirm   = $state('');
  let name      = $state('');
  let error     = $state('');
  let busy      = $state(false);

  // One toggle for both boxes. Revealing one and not the other would defeat
  // the point of the second box, which is to see that they agree.
  let showPassword = $state(false);

  /* ── Human check ───────────────────────────────────────────────
     Cloudflare Turnstile, because Supabase verifies the token itself: the
     widget hands us one, we pass it to signUp, and the server rejects the
     signup if it does not check out. A challenge implemented in this file
     would be worth nothing — anything the page can validate, a script can
     skip by calling the API directly.

     Inert until VITE_TURNSTILE_SITE_KEY is set, so signup keeps working while
     the key and the matching Supabase setting are still to be arranged. When
     it is set, the token becomes required. */
  const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  const captchaRequired = !!TURNSTILE_SITE_KEY;
  let captchaToken = $state('');
  let captchaEl    = $state(null);
  let captchaError = $state('');
  let widgetId     = null;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (!window.__turnstileLoading) {
      window.__turnstileLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('could not load the human check'));
        document.head.appendChild(s);
      });
    }
    return window.__turnstileLoading;
  }

  // Rendered only on the signup tab, and torn down when leaving it — a stale
  // widget hands back a token tied to a challenge the server has forgotten.
  $effect(() => {
    if (!captchaRequired || view !== 'signup' || !captchaEl) return;
    let cancelled = false;
    captchaError = '';
    loadTurnstile()
      .then(() => {
        if (cancelled || !captchaEl) return;
        widgetId = window.turnstile.render(captchaEl, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          callback: (token) => { captchaToken = token; captchaError = ''; },
          'expired-callback': () => { captchaToken = ''; },
          'error-callback': () => {
            captchaToken = '';
            captchaError = 'The human check failed to load. Refresh and try again.';
          },
        });
      })
      .catch(e => { if (!cancelled) captchaError = e.message; });

    return () => {
      cancelled = true;
      captchaToken = '';
      if (widgetId !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId); } catch { /* already gone */ }
        widgetId = null;
      }
    };
  });

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
    if (view === 'signup') {
      if (!name.trim()) { error = 'Display name is required.'; return; }
      // Checked here rather than left to a mismatch on the next sign-in, which
      // is where a typed-twice-wrong password otherwise surfaces: locked out
      // of an account you just made, with no idea which of the two took.
      if (password !== confirm) { error = 'The two passwords do not match.'; return; }
      if (captchaRequired && !captchaToken) {
        error = 'Please complete the human check below.';
        return;
      }
    }
    busy = true;
    try {
      if (view === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim(), captchaToken || undefined);
      }
      onSuccess();
    } catch (e) {
      error = e.message || 'Something went wrong. Please try again.';
      // A token is single-use: whatever went wrong, the one we hold is spent,
      // so the widget has to issue another before they can try again.
      if (captchaRequired && widgetId !== null && window.turnstile) {
        captchaToken = '';
        try { window.turnstile.reset(widgetId); } catch { /* nothing to reset */ }
      }
    } finally {
      busy = false;
    }
  }

  function switchView(v) {
    view = v;
    error = '';
    confirm = '';
    showPassword = false;
  }
</script>

<!-- Signing in is the first entry on the project menu, not a separate screen
     in front of it. Same photograph, same centred mark, and the card sits
     where the list of projects will be once there is someone to list them
     for — so signing in reads as arriving at the menu rather than as passing
     through a gate to somewhere else. -->
<div class="login-wrap">
  <div class="login-logo-wrap">
    <img src="/logo-day.png" class="login-logo" alt="The Masterbook" />
  </div>

  <div class="login-card">

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
        <!-- One toggle drives both boxes. The input's type is switched rather
             than the masking faked in CSS, so a password manager still sees a
             password field. -->
        <div class="login-field-head">
          <label for="login-password">Password</label>
          <button type="button" class="login-reveal"
            onclick={() => { showPassword = !showPassword; }}
            aria-pressed={showPassword} disabled={busy}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          id="login-password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          bind:value={password}
          autocomplete={view === 'signin' ? 'current-password' : 'new-password'}
          disabled={busy}
        />
      </div>

      {#if view === 'signup'}
        <div class="login-field">
          <label for="login-confirm">Confirm Password</label>
          <input
            id="login-confirm"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            bind:value={confirm}
            autocomplete="new-password"
            disabled={busy}
          />
          <!-- Only once they have diverged and something is actually typed.
               Flagging a mismatch on the first keystroke of the second box is
               telling someone they are wrong while they are still typing. -->
          {#if confirm.length > 0 && password !== confirm}
            <span class="login-warn">These do not match yet.</span>
          {/if}
        </div>

        {#if captchaRequired}
          <div class="login-field">
            <div bind:this={captchaEl} class="login-captcha"></div>
            {#if captchaError}<span class="login-warn">{captchaError}</span>{/if}
          </div>
        {/if}
      {/if}

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
  /* The project menu's photograph, and its geometry: mark centred at the top,
     content held off the left edge where the project list sits. */
  .login-wrap {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background-image: url('/project-menu-bg.jpg');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    z-index: 9999;
    padding: 32px 24px 24px 72px;
    overflow-y: auto;
  }

  .login-card {
    width: 100%;
    max-width: 340px;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 0;
    padding: 40px 36px 36px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  /* Centred on the screen, matching the project menu — the same mark in the
     same place, so signing in and arriving are one continuous screen.
     Always the dark one: this is a pale photograph whatever the theme. */
  .login-logo-wrap {
    align-self: center;
    margin-bottom: 56px;
  }
  .login-logo {
    width: 180px;
    height: auto;
    display: block;
  }

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
    background: rgba(140, 171, 207, 0.12);
    color: var(--gold, #8cabcf);
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

  /* Label on the left, reveal on the right, sharing the label's line so the
     toggle costs no vertical space of its own. */
  .login-field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .login-reveal {
    background: none;
    border: 0;
    padding: 0;
    font-family: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition: color 0.15s;
  }
  .login-reveal:hover:not(:disabled),
  .login-reveal:focus-visible { color: var(--accent); }
  .login-reveal:disabled { opacity: 0.5; cursor: default; }

  /* Turnstile renders a fixed-width iframe; centring it keeps it from sitting
     off to one side of a 340px card. */
  .login-captcha {
    display: flex;
    justify-content: center;
    min-height: 65px;
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
    border-color: var(--gold, #8cabcf);
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
    background: rgba(140, 171, 207, 0.08);
    border: 1px solid rgba(140, 171, 207, 0.3);
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
    background: var(--gold, #8cabcf);
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
