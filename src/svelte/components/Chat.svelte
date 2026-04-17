<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '../lib/supabase.js';
  import { authUser, getDisplayName, signIn, signUp, signOut } from '../stores/auth.js';
  import { getActiveProjectId } from '../stores/project.js';

  const { projectId: _propProjectId } = $props();

  function activeProjectId() {
    return _propProjectId || getActiveProjectId() || 'global';
  }

  /* ── Panel open/close ── */
  let open = $state(false);

  /* ── Auth UI state ── */
  let user = $state(null);
  let authView   = $state('signin'); // 'signin' | 'signup'
  let authEmail  = $state('');
  let authPass   = $state('');
  let authName   = $state('');
  let authError  = $state('');
  let authBusy   = $state(false);

  /* ── Chat state ── */
  let channels     = $state([]);
  let activeChannel = $state(null);
  let messages     = $state([]);
  let newMsg       = $state('');
  let sending      = $state(false);
  let loadingMsgs  = $state(false);
  let unread       = $state(0);   // bubble badge count

  let messagesEl;       // ref to scroll container
  let subscription;     // realtime subscription

  /* ── Subscribe to authUser store ── */
  const unsubAuth = authUser.subscribe(u => { user = u; });

  const DEFAULT_CHANNELS = [
    { name: '🎬 All Crew' },
    { name: '🎙️ AD Department' },
    { name: '🎥 Department Heads' },
    { name: '💰 Producers' },
  ];

  /* ── Bootstrap channels for this project ── */
  async function loadChannels() {
    const projectId = activeProjectId();
    if (!projectId || !user) return;

    // Fetch existing channels
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');

    if (error) { console.error('channels load error', error); return; }

    // Seed defaults if none exist yet
    if (data.length === 0) {
      const rows = DEFAULT_CHANNELS.map(c => ({ name: c.name, project_id: projectId }));
      const { data: seeded } = await supabase.from('channels').insert(rows).select();
      channels = seeded ?? [];
    } else {
      channels = data;
    }

    if (channels.length && !activeChannel) {
      activeChannel = channels[0];
      await loadMessages();
    }
  }

  /* ── Load messages for active channel ── */
  async function loadMessages() {
    if (!activeChannel) return;
    loadingMsgs = true;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', activeChannel.id)
      .order('created_at')
      .limit(100);

    if (!error) messages = data ?? [];
    loadingMsgs = false;
    scrollToBottom();
    subscribeRealtime();
  }

  /* ── Realtime subscription ── */
  function subscribeRealtime() {
    if (subscription) supabase.removeChannel(subscription);
    subscription = supabase
      .channel(`messages:${activeChannel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${activeChannel.id}`,
      }, payload => {
        messages = [...messages, payload.new];
        scrollToBottom();
        if (!open) unread += 1;
      })
      .subscribe();
  }

  /* ── Send a message ── */
  async function send() {
    const text = newMsg.trim();
    if (!text || !activeChannel || !user) return;
    sending = true;
    newMsg = '';
    const { error } = await supabase.from('messages').insert({
      channel_id:  activeChannel.id,
      project_id:  activeProjectId(),
      user_name:   getDisplayName(user),
      user_role:   user.user_metadata?.role ?? '',
      text,
    });
    if (error) { console.error('send error', error); newMsg = text; }
    sending = false;
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 30);
  }

  /* ── Switch channel ── */
  async function switchChannel(ch) {
    if (activeChannel?.id === ch.id) return;
    activeChannel = ch;
    messages = [];
    await loadMessages();
  }

  /* ── Open panel ── */
  function toggleOpen() {
    open = !open;
    if (open) {
      unread = 0;
      if (user && channels.length === 0) loadChannels();
      else scrollToBottom();
    }
  }

  /* ── Auth handlers ── */
  async function handleSignIn() {
    authBusy = true; authError = '';
    try {
      await signIn(authEmail, authPass);
      await loadChannels();
    } catch (e) {
      authError = e.message;
    } finally { authBusy = false; }
  }

  async function handleSignUp() {
    authBusy = true; authError = '';
    try {
      await signUp(authEmail, authPass, authName);
      authError = 'Check your email to confirm your account, then sign in.';
      authView = 'signin';
    } catch (e) {
      authError = e.message;
    } finally { authBusy = false; }
  }

  async function handleSignOut() {
    await signOut();
    channels = []; messages = []; activeChannel = null;
  }

  onMount(() => {
    if (user) loadChannels();
  });

  onDestroy(() => {
    unsubAuth();
    if (subscription) supabase.removeChannel(subscription);
  });

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* Group messages by date for dividers */
  let groupedMessages = $derived(() => {
    const groups = [];
    let lastDate = null;
    for (const m of messages) {
      const d = fmtDate(m.created_at);
      if (d !== lastDate) { groups.push({ type: 'divider', label: d }); lastDate = d; }
      groups.push({ type: 'message', ...m });
    }
    return groups;
  });
</script>

<!-- ── Floating bubble ── -->
<button class="chat-bubble" onclick={toggleOpen} title="Project Chat">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
  {#if unread > 0}
    <span class="chat-badge">{unread > 99 ? '99+' : unread}</span>
  {/if}
</button>

<!-- ── Slide-in panel ── -->
{#if open}
  <div class="chat-panel">

    <!-- Panel header -->
    <div class="chat-panel-hdr">
      <span class="chat-panel-title">Project Chat</span>
      <div class="chat-panel-hdr-actions">
        {#if user}
          <span class="chat-user-name">{getDisplayName(user)}</span>
          <button class="chat-signout-btn" onclick={handleSignOut} title="Sign out">↩</button>
        {/if}
        <button class="chat-close-btn" onclick={toggleOpen}>✕</button>
      </div>
    </div>

    {#if !user}
      <!-- ── Auth form ── -->
      <div class="chat-auth">
        <div class="chat-auth-tabs">
          <button class="chat-auth-tab" class:chat-auth-tab--active={authView === 'signin'}
            onclick={() => { authView = 'signin'; authError = ''; }}>Sign In</button>
          <button class="chat-auth-tab" class:chat-auth-tab--active={authView === 'signup'}
            onclick={() => { authView = 'signup'; authError = ''; }}>Create Account</button>
        </div>

        {#if authView === 'signup'}
          <input class="chat-auth-input" type="text" placeholder="Display name"
            bind:value={authName} />
        {/if}
        <input class="chat-auth-input" type="email" placeholder="Email"
          bind:value={authEmail} onkeydown={e => e.key === 'Enter' && (authView === 'signin' ? handleSignIn() : handleSignUp())} />
        <input class="chat-auth-input" type="password" placeholder="Password"
          bind:value={authPass} onkeydown={e => e.key === 'Enter' && (authView === 'signin' ? handleSignIn() : handleSignUp())} />

        {#if authError}
          <p class="chat-auth-error">{authError}</p>
        {/if}

        <button class="chat-auth-submit" onclick={authView === 'signin' ? handleSignIn : handleSignUp}
          disabled={authBusy}>
          {authBusy ? '…' : authView === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </div>

    {:else}
      <!-- ── Channel tabs ── -->
      <div class="chat-channels">
        {#each channels as ch (ch.id)}
          <button class="chat-channel-tab" class:chat-channel-tab--active={activeChannel?.id === ch.id}
            onclick={() => switchChannel(ch)}>
            {ch.name}
          </button>
        {/each}
      </div>

      <!-- ── Messages ── -->
      <div class="chat-messages" bind:this={messagesEl}>
        {#if loadingMsgs}
          <div class="chat-loading">Loading…</div>
        {:else if groupedMessages().length === 0}
          <div class="chat-empty">No messages yet. Say hello 👋</div>
        {:else}
          {#each groupedMessages() as item}
            {#if item.type === 'divider'}
              <div class="chat-date-divider"><span>{item.label}</span></div>
            {:else}
              {@const isMe = item.user_name === getDisplayName(user)}
              <div class="chat-msg" class:chat-msg--me={isMe}>
                {#if !isMe}
                  <div class="chat-msg-meta">
                    <span class="chat-msg-author">{item.user_name}</span>
                    {#if item.user_role}<span class="chat-msg-role">{item.user_role}</span>{/if}
                    <span class="chat-msg-time">{fmtTime(item.created_at)}</span>
                  </div>
                {/if}
                <div class="chat-msg-bubble">{item.text}</div>
                {#if isMe}
                  <div class="chat-msg-time chat-msg-time--me">{fmtTime(item.created_at)}</div>
                {/if}
              </div>
            {/if}
          {/each}
        {/if}
      </div>

      <!-- ── Composer ── -->
      <div class="chat-composer">
        <textarea
          class="chat-composer-input"
          placeholder="Message {activeChannel?.name ?? ''}…"
          rows="1"
          bind:value={newMsg}
          onkeydown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        ></textarea>
        <button class="chat-send-btn" onclick={send} disabled={sending || !newMsg.trim()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    {/if}

  </div>
{/if}

<style>
  /* ── Floating bubble ── */
  .chat-bubble {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--gold, #c9a84c);
    color: #111;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
    z-index: 900;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .chat-bubble:hover { transform: scale(1.06); box-shadow: 0 6px 18px rgba(0,0,0,0.45); }

  .chat-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: #e44;
    color: #fff;
    border-radius: 9px;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* ── Panel ── */
  .chat-panel {
    position: fixed;
    bottom: 84px;
    right: 24px;
    width: 320px;
    height: 520px;
    background: var(--bg-surface, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 899;
    animation: chat-slide-up 0.18s ease;
  }

  @keyframes chat-slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Panel header ── */
  .chat-panel-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: var(--bg-elevated, #222);
    border-bottom: 1px solid var(--border, #333);
    flex-shrink: 0;
  }
  .chat-panel-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary, #eee);
  }
  .chat-panel-hdr-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chat-user-name {
    font-size: 0.72rem;
    color: var(--text-secondary, #888);
  }
  .chat-signout-btn, .chat-close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.1s;
  }
  .chat-signout-btn:hover, .chat-close-btn:hover { color: var(--text-primary, #eee); }

  /* ── Auth form ── */
  .chat-auth {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 16px;
    overflow-y: auto;
  }
  .chat-auth-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  .chat-auth-tab {
    flex: 1;
    padding: 6px;
    background: var(--bg-elevated, #222);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-secondary, #888);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .chat-auth-tab--active {
    background: rgba(201,168,76,0.12);
    border-color: var(--gold, #c9a84c);
    color: var(--gold, #c9a84c);
  }
  .chat-auth-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--bg-elevated, #222);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text-primary, #eee);
    font-size: 0.825rem;
    box-sizing: border-box;
  }
  .chat-auth-input:focus { outline: none; border-color: var(--gold, #c9a84c); }
  .chat-auth-error {
    font-size: 0.775rem;
    color: #e66;
    margin: 0;
    line-height: 1.4;
  }
  .chat-auth-submit {
    padding: 9px;
    background: var(--gold, #c9a84c);
    color: #111;
    border: none;
    border-radius: 6px;
    font-size: 0.825rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.1s;
  }
  .chat-auth-submit:disabled { opacity: 0.6; cursor: default; }

  /* ── Channel tabs ── */
  .chat-channels {
    display: flex;
    gap: 0;
    overflow-x: auto;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border, #333);
    scrollbar-width: none;
  }
  .chat-channels::-webkit-scrollbar { display: none; }
  .chat-channel-tab {
    flex-shrink: 0;
    padding: 8px 12px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    color: var(--text-secondary, #888);
    font-size: 0.75rem;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .chat-channel-tab:hover { color: var(--text-primary, #eee); }
  .chat-channel-tab--active {
    color: var(--gold, #c9a84c);
    border-bottom-color: var(--gold, #c9a84c);
    font-weight: 600;
  }

  /* ── Messages ── */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 12px 4px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scroll-behavior: smooth;
  }
  .chat-loading, .chat-empty {
    margin: auto;
    color: var(--text-secondary, #888);
    font-size: 0.825rem;
    text-align: center;
  }

  /* Date dividers */
  .chat-date-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
  }
  .chat-date-divider::before, .chat-date-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border, #333);
  }
  .chat-date-divider span {
    font-size: 0.68rem;
    color: var(--text-secondary, #888);
    white-space: nowrap;
  }

  /* Message bubbles */
  .chat-msg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 85%;
  }
  .chat-msg--me {
    align-self: flex-end;
    align-items: flex-end;
  }
  .chat-msg-meta {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-bottom: 3px;
  }
  .chat-msg-author {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-primary, #eee);
  }
  .chat-msg-role {
    font-size: 0.65rem;
    color: var(--text-secondary, #888);
  }
  .chat-msg-time {
    font-size: 0.62rem;
    color: var(--text-secondary, #666);
  }
  .chat-msg-time--me { margin-top: 3px; }
  .chat-msg-bubble {
    padding: 8px 11px;
    background: var(--bg-elevated, #2a2a2a);
    border-radius: 12px;
    border-bottom-left-radius: 3px;
    color: var(--text-primary, #eee);
    font-size: 0.825rem;
    line-height: 1.45;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .chat-msg--me .chat-msg-bubble {
    background: rgba(201,168,76,0.18);
    border-radius: 12px;
    border-bottom-right-radius: 3px;
  }

  /* ── Composer ── */
  .chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--border, #333);
    flex-shrink: 0;
  }
  .chat-composer-input {
    flex: 1;
    padding: 8px 10px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    color: var(--text-primary, #eee);
    font-size: 0.825rem;
    resize: none;
    max-height: 100px;
    line-height: 1.4;
    font-family: inherit;
  }
  .chat-composer-input:focus { outline: none; border-color: var(--gold, #c9a84c); }
  .chat-send-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--gold, #c9a84c);
    color: #111;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.12s;
  }
  .chat-send-btn:disabled { opacity: 0.4; cursor: default; }
  .chat-send-btn:not(:disabled):hover { opacity: 0.85; }
</style>
