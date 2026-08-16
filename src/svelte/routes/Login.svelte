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
     A placeholder, and deliberately labelled as one in the code so nobody
     later mistakes it for protection. It checks that a person ticked a box in
     a browser, which stops nothing: a script signing up calls the Supabase API
     directly and never loads this page at all.

     Real verification has to be server-side. Supabase will do it natively with
     hCaptcha or Cloudflare Turnstile — enabled in its auth settings, with the
     widget's token passed to signUp, which is already plumbed through
     auth.js's captchaToken argument. Until that decision is made, this holds
     the place in the form so the layout does not shift when it arrives. */
  let humanChecked = $state(false);

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
      if (!humanChecked) { error = 'Please confirm you are a human.'; return; }
    }
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
    confirm = '';
    humanChecked = false;
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
        <label for="login-password">Password</label>
        <!-- One toggle drives both boxes: revealing one and not the other
             defeats the second box, whose whole job is letting you see that
             they agree. The input's type is switched rather than the masking
             faked in CSS, so a password manager still sees a password field
             and the characters never sit in the DOM as plain text.

             tabindex="-1" keeps it out of the tab order on purpose. Tab from
             the password field goes to the next field, and on the last one to
             the submit button — so the habitual tab-then-Enter submits, rather
             than landing on this and putting the password on screen while
             someone believes they have just signed in. It stays reachable by
             mouse and by touch; only the keyboard walks past it. -->
        <div class="login-input-wrap">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            bind:value={password}
            autocomplete={view === 'signin' ? 'current-password' : 'new-password'}
            disabled={busy}
          />
          <button type="button" class="login-eye"
              onclick={() => { showPassword = !showPassword; }}
              aria-pressed={showPassword} disabled={busy} tabindex="-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}>
              {#if showPassword}
                  <!-- The icon reports the state, not the action: an open eye while
                       the password is on screen, struck through while it is hidden. -->
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                  stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                  stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                {/if}
            </button>
        </div>
      </div>

      {#if view === 'signup'}
        <div class="login-field">
          <label for="login-confirm">Confirm Password</label>
          <div class="login-input-wrap">
            <input
              id="login-confirm"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              bind:value={confirm}
              autocomplete="new-password"
              disabled={busy}
            />
            <button type="button" class="login-eye"
                onclick={() => { showPassword = !showPassword; }}
                aria-pressed={showPassword} disabled={busy} tabindex="-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}>
                {#if showPassword}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                {/if}
              </button>
          </div>
          <!-- Only once they have diverged and something is actually typed.
               Flagging a mismatch on the first keystroke of the second box is
               telling someone they are wrong while they are still typing. -->
          {#if confirm.length > 0 && password !== confirm}
            <span class="login-warn">These do not match yet.</span>
          {/if}
        </div>

        <label class="login-human">
          <input type="checkbox" bind:checked={humanChecked} disabled={busy} />
          <span>I am a human</span>
        </label>
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

  /* The 72px left inset places the card where the project list sits on a
     desktop. On a phone it just shoves a 340px card into what is left of a
     375px screen, squeezing it to 279px and hanging it off-centre. Below
     560px it centres instead. */
  @media (max-width: 560px) {
    .login-wrap {
      padding: 24px 16px;
      align-items: center;
    }
    .login-card { max-width: 100%; }
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

  /* The eye sits inside the box, so the field keeps one outline and the
     control is where the text it hides is. The input is padded on the right by
     the eye's width so a long password runs behind the label, not under it. */
  .login-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  /* Scoped through .login-field so this beats the plain `.login-field input`
     rule further down, which is the same specificity and wins on order. */
  .login-field .login-input-wrap input {
    padding-right: 38px;
  }

  .login-eye {
    position: absolute;
    right: 1px;
    top: 1px;
    bottom: 1px;
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 0;
    padding: 0;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition: color 0.15s;
  }
  .login-eye:hover:not(:disabled),
  .login-eye:focus-visible { color: var(--accent); }
  .login-eye:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
  .login-eye:disabled { opacity: 0.4; cursor: default; }

  /* Placeholder human check — see the note in the script. */
  .login-human {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--text-secondary, #ccc);
    cursor: pointer;
    user-select: none;
    padding: 2px 0;
  }
  .login-human input {
    width: 15px;
    height: 15px;
    accent-color: var(--accent);
    cursor: pointer;
    flex: 0 0 auto;
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
