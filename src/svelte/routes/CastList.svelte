<script>
  let { tab = 'cast', setTab = () => {} } = $props();

  const CAST_KEY = 'movie-ledger-cast';

  const DEFAULT_SECTIONS = [
    'PRINCIPAL CAST', 'SUPPORTING CAST', 'DAY PLAYERS', 'BACKGROUND',
  ];

  const SIZE_COLS = [
    [['hair','Hair'],['eyes','Eyes'],['height','Height'],['weight','Weight']],
    [['chest','Chest'],['waist','Waist'],['inseam','Inseam'],['suit','Suit']],
    [['shoe','Shoe'],['hat','Hat'],['additional','Addt.']],
  ];

  /* ── State ── */
  let store    = $state({ _version: 2, sections: [], profiles: {} });
  let activeId = $state(null);

  /* ── Load ── */
  (function _load() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(CAST_KEY)); } catch { raw = null; }

    if (raw && raw._version === 2) {
      store = raw;
    } else if (Array.isArray(raw) && raw.length > 0) {
      store = _migrate(raw);
      _save();
    } else {
      store = _defaultStore();
      _save();
    }

    // Pick first available profile
    if (activeId && !store.profiles[activeId]) activeId = null;
    if (!activeId) {
      for (const sec of store.sections) {
        if (sec.memberIds.length > 0) { activeId = sec.memberIds[0]; break; }
      }
    }
  })();

  function _defaultStore() {
    return {
      _version: 2,
      sections: DEFAULT_SECTIONS.map(name => ({ sectionId: _uid(), sectionName: name, memberIds: [] })),
      profiles: {},
    };
  }

  function _migrate(oldData) {
    localStorage.setItem('movie-ledger-cast-v1-backup', JSON.stringify(oldData));
    const s = { _version: 2, sections: [], profiles: {} };
    oldData.forEach(sec => {
      const memberIds = [];
      (sec.rows || []).forEach(row => {
        if (!row.castNum && !row.role && !row.name) return;
        const id = row.id || _uid();
        s.profiles[id] = _blankProfile(id);
        const p = s.profiles[id];
        p.castNum = row.castNum || '';
        p.characterName = row.role || '';
        p.legalName = row.name || '';
        p.contacts.personal.phone = row.phone || '';
        p.contacts.personal.email = row.email || '';
        p.contacts.agency.company = row.rep || '';
        p.contacts.agency.name = row.agentName || '';
        p.contacts.agency.phone = row.agentPhone || '';
        p.contacts.agency.email = row.agentEmail || '';
        p.travel = row.travel || '';
        p.notes  = row.notes  || '';
        p.deal   = row.deal   || '';
        memberIds.push(id);
      });
      s.sections.push({ sectionId: sec.sectionId || _uid(), sectionName: sec.sectionName || 'CAST', memberIds });
    });
    return s;
  }

  function _blankProfile(id) {
    return {
      id: id || _uid(),
      castNum: '', characterName: '', stageName: '', legalName: '',
      headshot: null, terms: '',
      sizes: { hair:'',eyes:'',height:'',weight:'',chest:'',waist:'',inseam:'',suit:'',shoe:'',hat:'',additional:'' },
      holdDays: [], offDays: [], travel: '',
      contacts: {
        personal: { phone:'', email:'', address:'' },
        agency:   { company:'', name:'', phone:'', email:'', address:'' },
        manager:  { company:'', name:'', phone:'', email:'', address:'' },
      },
      notes: '', deal: '',
    };
  }

  function _save() { localStorage.setItem(CAST_KEY, JSON.stringify(store)); }

  /* ── Derived ── */
  let activeProfile = $derived(activeId ? store.profiles[activeId] : null);

  /* ── Actions ── */
  function addMember(secId) {
    const sec = store.sections.find(s => s.sectionId === secId);
    if (!sec) return;
    const profile = _blankProfile();
    store.profiles[profile.id] = profile;
    sec.memberIds.push(profile.id);
    activeId = profile.id;
    _save();
  }

  function deleteMember(mid) {
    const p = store.profiles[mid];
    if (!confirm(`Delete ${p?.characterName || 'this cast member'}?`)) return;
    delete store.profiles[mid];
    store.sections.forEach(sec => {
      sec.memberIds = sec.memberIds.filter(id => id !== mid);
    });
    if (activeId === mid) {
      activeId = null;
      for (const sec of store.sections) {
        if (sec.memberIds.length > 0) { activeId = sec.memberIds[0]; break; }
      }
    }
    _save();
  }

  function addSection() {
    store.sections.push({ sectionId: _uid(), sectionName: 'NEW GROUP', memberIds: [] });
    _save();
  }

  function setSectionName(secId, name) {
    const sec = store.sections.find(s => s.sectionId === secId);
    if (sec) { sec.sectionName = name || 'UNTITLED'; _save(); }
  }

  function setProfileField(key, val) {
    const p = store.profiles[activeId];
    if (!p) return;
    p[key] = val;
    _save();
  }

  function setSizeField(key, val) {
    const p = store.profiles[activeId];
    if (!p) return;
    p.sizes[key] = val;
    _save();
  }

  function setContactField(group, field, val) {
    const p = store.profiles[activeId];
    if (!p) return;
    p.contacts[group][field] = val;
    _save();
  }

  function uploadHeadshot(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const max = 200;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else       { w = Math.round(w * max / h); h = max; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const p = store.profiles[activeId];
        if (p) { p.headshot = canvas.toDataURL('image/jpeg', 0.7); _save(); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeHeadshot() {
    const p = store.profiles[activeId];
    if (p) { p.headshot = null; _save(); }
  }

  function addHoldDay(dateVal) {
    const p = store.profiles[activeId];
    if (!p || !dateVal) return;
    if (!p.holdDays.includes(dateVal)) { p.holdDays.push(dateVal); p.holdDays.sort(); _save(); }
  }

  function removeHoldDay(date) {
    const p = store.profiles[activeId];
    if (p) { p.holdDays = p.holdDays.filter(d => d !== date); _save(); }
  }

  function addOffDay(dateVal) {
    const p = store.profiles[activeId];
    if (!p || !dateVal) return;
    if (!p.offDays.includes(dateVal)) { p.offDays.push(dateVal); p.offDays.sort(); _save(); }
  }

  function removeOffDay(date) {
    const p = store.profiles[activeId];
    if (p) { p.offDays = p.offDays.filter(d => d !== date); _save(); }
  }

  /* ── Helpers ── */
  function _uid() { return crypto.randomUUID(); }

  function fmtDateShort(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
  }

  function memberLabel(p) {
    return p.castNum ? `${p.castNum}. ${p.characterName || 'Untitled'}` : (p.characterName || 'Untitled');
  }

  /* ── Hold/off date inputs (local state) ── */
  let holdDateInput = $state('');
  let offDateInput  = $state('');
</script>

<div class="cast-inner">
  <!-- Toolbar -->
  <div class="crew-toolbar">
    <!-- Crew/Cast toggle -->
    <div class="personnel-toggle">
      <div class="personnel-toggle-track">
        <button class="personnel-toggle-btn" class:personnel-toggle-btn--active={tab==='crew'} onclick={() => setTab('crew')}>Crew</button>
        <button class="personnel-toggle-btn" class:personnel-toggle-btn--active={tab==='cast'} onclick={() => setTab('cast')}>Cast</button>
        <span class="personnel-toggle-slider" style="transform:translateX({tab==='cast'?'100%':'0'})"></span>
      </div>
    </div>

    <div class="crew-toolbar-actions">
      <button class="btn btn--ghost btn--sm" onclick={() => { const s = store.sections[0]; if (s) addMember(s.sectionId); }}>+ Add Cast Member</button>
      <button class="btn btn--ghost btn--sm" onclick={addSection}>+ Group</button>
    </div>
  </div>

  <!-- Layout -->
  <div class="cp-layout">
    <!-- Sidebar -->
    <div class="cp-sidebar">
      {#each store.sections as sec (sec.sectionId)}
        <div class="cp-sec-group">
          <div class="cp-sec-header">
            <span class="cp-sec-name" contenteditable="plaintext-only"
              onblur={e => setSectionName(sec.sectionId, e.target.textContent.trim())}
              onkeydown={e => e.key === 'Enter' && e.target.blur()}>{sec.sectionName}</span>
            <button class="cp-sec-add" title="Add member" onclick={() => addMember(sec.sectionId)}>+</button>
          </div>
          {#each sec.memberIds as mid (mid)}
            {@const p = store.profiles[mid]}
            {#if p}
              <div class="cp-member-card" class:cp-member-card--active={mid === activeId}
                role="button" tabindex="0"
                onclick={() => activeId = mid}
                onkeydown={e => e.key === 'Enter' && (activeId = mid)}>
                {#if p.headshot}
                  <img class="cp-thumb" src={p.headshot} alt="" />
                {:else}
                  <div class="cp-thumb cp-thumb--empty"></div>
                {/if}
                <div class="cp-member-info">
                  <div class="cp-member-char">{memberLabel(p)}</div>
                  <div class="cp-member-actor">{p.legalName || p.stageName || ''}</div>
                </div>
                <button class="cp-member-del" title="Delete"
                  onclick={e => { e.stopPropagation(); deleteMember(mid); }}>✕</button>
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </div>

    <!-- Detail panel -->
    <div class="cp-detail">
      {#if activeProfile}
        {@const p = activeProfile}
        <div class="cp-profile">
          <!-- Top row: headshot + names -->
          <div class="cp-top-row">
            <div class="cp-headshot-wrap">
              <div class="cp-headshot">
                {#if p.headshot}
                  <img src={p.headshot} alt="Headshot" />
                {:else}
                  <span class="cp-headshot-placeholder">Profile Picture<br>(Headshot)</span>
                {/if}
              </div>
              <label class="btn btn--ghost btn--sm cp-headshot-btn" style="cursor:pointer;">
                Upload
                <input type="file" accept="image/*" hidden onchange={e => uploadHeadshot(e.target.files[0])} />
              </label>
              {#if p.headshot}
                <button class="btn btn--ghost btn--sm cp-headshot-btn" onclick={removeHeadshot}>Remove</button>
              {/if}
            </div>
            <div class="cp-names-grid">
              <div class="cp-field">
                <label>Cast #</label>
                <input type="text" value={p.castNum} maxlength="6" style="width:60px;"
                  onblur={e => setProfileField('castNum', e.target.value)} />
              </div>
              <div class="cp-field">
                <label>Character Name</label>
                <input type="text" class="cp-name-input" value={p.characterName} maxlength="35"
                  onblur={e => setProfileField('characterName', e.target.value)} />
              </div>
              <div class="cp-field">
                <label>Stage Name</label>
                <input type="text" class="cp-name-input" value={p.stageName} maxlength="35"
                  onblur={e => setProfileField('stageName', e.target.value)} />
              </div>
              <div class="cp-field">
                <label>Legal Name</label>
                <input type="text" class="cp-name-input" value={p.legalName} maxlength="35"
                  onblur={e => setProfileField('legalName', e.target.value)} />
              </div>
            </div>
          </div>

          <!-- Sizes + Schedule -->
          <div class="cp-mid-row">
            <!-- Sizes -->
            <div class="cp-card cp-card--half">
              <h4 class="cp-card-title">Sizes</h4>
              <div class="cp-sizes-grid">
                {#each SIZE_COLS as col}
                  <div class="cp-size-col">
                    {#each col as [key, lbl]}
                      <div class="cp-size-field">
                        <label>{lbl}</label>
                        <input type="text" value={p.sizes[key]}
                          onblur={e => setSizeField(key, e.target.value)} />
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>

            <!-- Schedule -->
            <div class="cp-card cp-card--half">
              <h4 class="cp-card-title">Schedule</h4>
              <div class="cp-date-section">
                <label>Hold Days</label>
                <div class="cp-chips">
                  {#each p.holdDays as d (d)}
                    <span class="cp-date-chip">
                      {fmtDateShort(d)}
                      <button class="cp-chip-x" onclick={() => removeHoldDay(d)}>✕</button>
                    </span>
                  {:else}
                    <span class="cp-chip-empty">None</span>
                  {/each}
                </div>
                <div class="cp-date-add">
                  <input type="date" bind:value={holdDateInput} />
                  <button class="btn btn--ghost btn--sm" onclick={() => { addHoldDay(holdDateInput); holdDateInput = ''; }}>+ Add</button>
                </div>
              </div>
              <div class="cp-date-section" style="margin-top:10px;">
                <label>Off Days</label>
                <div class="cp-chips">
                  {#each p.offDays as d (d)}
                    <span class="cp-date-chip cp-date-chip--off">
                      {fmtDateShort(d)}
                      <button class="cp-chip-x" onclick={() => removeOffDay(d)}>✕</button>
                    </span>
                  {:else}
                    <span class="cp-chip-empty">None</span>
                  {/each}
                </div>
                <div class="cp-date-add">
                  <input type="date" bind:value={offDateInput} />
                  <button class="btn btn--ghost btn--sm" onclick={() => { addOffDay(offDateInput); offDateInput = ''; }}>+ Add</button>
                </div>
              </div>
              <div class="cp-field" style="margin-top:10px;">
                <label>Travel</label>
                <input type="text" value={p.travel}
                  onblur={e => setProfileField('travel', e.target.value)} />
              </div>
            </div>
          </div>

          <!-- Contacts -->
          <div class="cp-card">
            <h4 class="cp-card-title">Contacts</h4>
            <div class="cp-contacts-grid">
              {#each [['personal','Personal'],['agency','Agency'],['manager','Manager']] as [group, heading]}
                <div class="cp-contact-col">
                  <div class="cp-contact-heading">{heading}</div>
                  {#if group === 'agency'}
                    <div class="cp-field"><label>Agency Co.</label><input type="text" value={p.contacts[group].company} onblur={e => setContactField(group,'company',e.target.value)} /></div>
                    <div class="cp-field"><label>Agent Name</label><input type="text" value={p.contacts[group].name}    onblur={e => setContactField(group,'name',e.target.value)} /></div>
                  {:else if group === 'manager'}
                    <div class="cp-field"><label>Management Co.</label><input type="text" value={p.contacts[group].company} onblur={e => setContactField(group,'company',e.target.value)} /></div>
                    <div class="cp-field"><label>Manager Name</label><input type="text"  value={p.contacts[group].name}    onblur={e => setContactField(group,'name',e.target.value)} /></div>
                  {/if}
                  <div class="cp-field"><label>Phone</label><input type="tel"   value={p.contacts[group].phone}   onblur={e => setContactField(group,'phone',e.target.value)} /></div>
                  <div class="cp-field"><label>Email</label><input type="email" value={p.contacts[group].email}   onblur={e => setContactField(group,'email',e.target.value)} /></div>
                  <div class="cp-field"><label>Address</label><input type="text" value={p.contacts[group].address} onblur={e => setContactField(group,'address',e.target.value)} /></div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Terms & Notes -->
          <div class="cp-card">
            <h4 class="cp-card-title">Additional</h4>
            <div class="cp-field">
              <label>Terms</label>
              <textarea rows="2" onblur={e => setProfileField('deal', e.target.value)}>{p.deal}</textarea>
            </div>
            <div class="cp-field" style="margin-top:6px;">
              <label>Notes</label>
              <textarea rows="3" onblur={e => setProfileField('notes', e.target.value)}>{p.notes}</textarea>
            </div>
          </div>
        </div>
      {:else}
        <div class="cp-empty">Select or add a cast member to view their profile.</div>
      {/if}
    </div>
  </div>
</div>
