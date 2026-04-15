<script>
  const VENDORS_KEY = 'movie-ledger-vendors';

  // ── State ──────────────────────────────────────────────────
  let vendors  = $state([]);
  let view     = $state('list');   // 'list' | 'form'
  let editIdx  = $state(null);     // null = new, number = editing
  let sortKey  = $state(null);     // 'type' | 'name'
  let sortAsc  = $state(true);

  // Form fields
  let fType         = $state('');
  let fName         = $state('');
  let fContact      = $state('');
  let fPhone        = $state('');
  let fEmail        = $state('');
  let fStreet       = $state('');
  let fCityStateZip = $state('');
  let fQuotes       = $state('');
  let fNotes        = $state('');
  let nameError     = $state(false);

  // ── Load ───────────────────────────────────────────────────
  try { vendors = JSON.parse(localStorage.getItem(VENDORS_KEY)) || []; } catch { vendors = []; }

  function save() { localStorage.setItem(VENDORS_KEY, JSON.stringify(vendors)); }

  // ── Derived ────────────────────────────────────────────────
  let sortedIndices = $derived.by(() => {
    const indices = vendors.map((_, i) => i);
    if (!sortKey) return indices;
    return indices.sort((a, b) => {
      const va = (vendors[a][sortKey] || '').toLowerCase();
      const vb = (vendors[b][sortKey] || '').toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  });

  let usedTypes = $derived(
    [...new Set(vendors.map(v => v.type?.trim()).filter(Boolean))].sort()
  );

  // ── Sort ───────────────────────────────────────────────────
  function setSort(key) {
    if (sortKey === key) sortAsc = !sortAsc;
    else { sortKey = key; sortAsc = true; }
  }

  function sortIcon(key) {
    return sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';
  }

  // ── Phone format ───────────────────────────────────────────
  function formatPhone(val) {
    const d = val.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return val;
  }

  // ── Open form ──────────────────────────────────────────────
  function openForm(idx) {
    editIdx = idx;
    const v = idx === null ? {} : vendors[idx];
    fType         = v.type         || '';
    fName         = v.name         || '';
    fContact      = v.contact      || '';
    fPhone        = v.phone        || '';
    fEmail        = v.email        || '';
    fStreet       = v.streetAddress || '';
    fCityStateZip = v.cityStateZip  || '';
    fQuotes       = v.quotes       || '';
    fNotes        = v.notes        || '';
    nameError     = false;
    view = 'form';
  }

  function closeForm() { view = 'list'; editIdx = null; }

  // ── Save form ──────────────────────────────────────────────
  function saveForm() {
    if (!fName.trim()) { nameError = true; return; }
    const data = {
      type: fType.trim(), name: fName.trim(), contact: fContact.trim(),
      phone: formatPhone(fPhone.trim()), email: fEmail.trim(),
      streetAddress: fStreet.trim(), cityStateZip: fCityStateZip.trim(),
      quotes: fQuotes.trim(), notes: fNotes.trim(),
    };
    if (editIdx === null) vendors = [...vendors, data];
    else { vendors = vendors.map((v, i) => i === editIdx ? data : v); }
    save();
    closeForm();
  }

  // ── Delete ─────────────────────────────────────────────────
  function deleteVendor(idx) {
    const name = vendors[idx]?.name || 'Untitled';
    if (!confirm(`Delete vendor "${name}"?`)) return;
    vendors = vendors.filter((_, i) => i !== idx);
    save();
    if (view === 'form') closeForm();
  }
</script>

<!-- ══ LIST VIEW ══════════════════════════════════════════════ -->
{#if view === 'list'}
  <section class="vnd-section">
    <div class="vnd-header">
      <div>
        <h2 class="vnd-title">Vendors</h2>
        <p class="vnd-subtitle">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''} catalogued</p>
      </div>
      <button class="btn btn--primary btn--sm" onclick={() => openForm(null)}>+ Add Vendor</button>
    </div>

    {#if vendors.length === 0}
      <div class="vnd-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="48" height="48" style="opacity:.3;margin-bottom:8px;">
          <path d="M3 21V8l9-6 9 6v13"/><path d="M9 21V12h6v9"/><rect x="1" y="8" width="22" height="3" rx="1"/>
        </svg>
        <p>No vendors yet. Click <strong>+ Add Vendor</strong> to get started.</p>
      </div>
    {:else}
      <div class="vnd-table-wrap">
        <table class="vnd-table">
          <thead>
            <tr>
              <th class="sortable" onclick={() => setSort('type')}>Type{sortIcon('type')}</th>
              <th class="sortable" onclick={() => setSort('name')}>Vendor Name{sortIcon('name')}</th>
              <th>Primary Contact</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Quotes</th>
              <th>Notes</th>
              <th class="vnd-th-folder"></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each sortedIndices as i (i)}
              {@const v = vendors[i]}
              <tr class="vnd-row" onclick={() => openForm(i)}>
                <td class="vnd-type">{v.type}</td>
                <td class="vnd-name-cell">{v.name}</td>
                <td>{v.contact}</td>
                <td class="vnd-phone-cell">{v.phone || ''}</td>
                <td>{v.email}</td>
                <td class="vnd-addr-cell" title="{v.streetAddress || ''}{v.streetAddress && v.cityStateZip ? ', ' : ''}{v.cityStateZip || ''}">
                  {v.streetAddress || ''}{#if v.streetAddress && v.cityStateZip}<br>{/if}{v.cityStateZip || ''}
                </td>
                <td class="vnd-trunc" title={v.quotes}>{v.quotes || ''}</td>
                <td class="vnd-trunc" title={v.notes}>{v.notes || ''}</td>
                <td class="vnd-folder-cell" onclick={e => e.stopPropagation()}>
                  <button class="btn btn--ghost btn--xs vnd-folder-btn" title="Open vendor subfolder" disabled>📁</button>
                </td>
                <td class="vnd-actions-cell" onclick={e => e.stopPropagation()}>
                  <button class="btn btn--ghost btn--xs" onclick={() => openForm(i)} title="Edit">✎</button>
                  <button class="btn btn--ghost btn--xs btn--danger-text" onclick={() => deleteVendor(i)} title="Delete">✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

<!-- ══ FORM VIEW ══════════════════════════════════════════════ -->
{:else}
  <section class="vnd-section">
    <div class="vnd-header">
      <div>
        <h2 class="vnd-title">{editIdx === null ? 'Add Vendor' : 'Edit Vendor'}</h2>
        <p class="vnd-subtitle">{editIdx === null ? 'Fill in the vendor details below.' : `Editing: ${vendors[editIdx]?.name || 'Untitled'}`}</p>
      </div>
      <button class="btn btn--ghost btn--sm" onclick={closeForm}>← Back</button>
    </div>

    <div class="vnd-form">
      <div class="vnd-form-row vnd-form-row--2col">

        <div class="vnd-field-group">
          <div class="vnd-field">
            <label for="vnd-type">Type</label>
            <input id="vnd-type" class="vnd-input" type="text" list="vnd-type-list"
              bind:value={fType} placeholder="e.g. Camera, Catering..." autocomplete="off" />
            <datalist id="vnd-type-list">
              {#each usedTypes as t}<option value={t}></option>{/each}
            </datalist>
          </div>
          <div class="vnd-field">
            <label for="vnd-name">Vendor Name</label>
            <input id="vnd-name" class="vnd-input" class:vnd-input--error={nameError} type="text"
              bind:value={fName} placeholder="Company name"
              oninput={() => nameError = false} />
            {#if nameError}<span class="vnd-field-error">Name is required</span>{/if}
          </div>
          <div class="vnd-field">
            <label for="vnd-street">Street Address</label>
            <input id="vnd-street" class="vnd-input" type="text" bind:value={fStreet} placeholder="123 Main St" />
          </div>
          <div class="vnd-field">
            <label for="vnd-csz">City, State, Zip</label>
            <input id="vnd-csz" class="vnd-input" type="text" bind:value={fCityStateZip} placeholder="Los Angeles, CA 90001" />
          </div>
        </div>

        <div class="vnd-field-group">
          <div class="vnd-field">
            <label for="vnd-contact">Primary Contact</label>
            <input id="vnd-contact" class="vnd-input" type="text" bind:value={fContact} placeholder="Contact name" />
          </div>
          <div class="vnd-field">
            <label for="vnd-phone">Phone</label>
            <input id="vnd-phone" class="vnd-input" type="tel" bind:value={fPhone}
              placeholder="(555) 555-5555"
              onblur={() => fPhone = formatPhone(fPhone.trim())} />
          </div>
          <div class="vnd-field">
            <label for="vnd-email">Email</label>
            <input id="vnd-email" class="vnd-input" type="email" bind:value={fEmail} placeholder="email@vendor.com" />
          </div>
        </div>
      </div>

      <div class="vnd-form-row">
        <div class="vnd-field">
          <label for="vnd-quotes">Quotes</label>
          <textarea id="vnd-quotes" class="vnd-input vnd-textarea" rows="3"
            bind:value={fQuotes} placeholder="Pricing quotes, bid details, rate info..."></textarea>
        </div>
      </div>

      <div class="vnd-form-row">
        <div class="vnd-field">
          <label for="vnd-notes">Notes</label>
          <textarea id="vnd-notes" class="vnd-input vnd-textarea" rows="3"
            bind:value={fNotes} placeholder="Additional notes..."></textarea>
        </div>
      </div>

      <div class="vnd-form-row vnd-form-row--folder">
        <label class="vnd-field-label">Vendor Subfolder</label>
        <button class="btn btn--ghost btn--sm vnd-folder-link" disabled>Open Subfolder</button>
        <span class="vnd-folder-note">File structure not yet configured</span>
      </div>

      <div class="vnd-form-actions">
        <button class="btn btn--primary" onclick={saveForm}>{editIdx === null ? 'Add Vendor' : 'Save Changes'}</button>
        <button class="btn btn--ghost" onclick={closeForm}>Cancel</button>
        {#if editIdx !== null}
          <button class="btn btn--ghost btn--danger-text" style="margin-left:auto"
            onclick={() => deleteVendor(editIdx)}>Delete Vendor</button>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .vnd-section { max-width: 1100px; }

  .vnd-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .vnd-title    { font-size: 1.25rem; margin-bottom: 2px; }
  .vnd-subtitle { font-size: 0.8rem; color: var(--text-muted, #888); }

  .vnd-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: var(--text-muted, #888);
    text-align: center;
  }

  .vnd-table-wrap { overflow-x: auto; }

  .vnd-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .vnd-table thead th {
    text-align: left;
    padding: 7px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
    border-bottom: 1px solid var(--border, #333);
    white-space: nowrap;
  }

  .sortable { cursor: pointer; user-select: none; }
  .sortable:hover { color: var(--text-primary, #eee); }

  .vnd-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle, #222);
    vertical-align: top;
  }

  .vnd-row { cursor: pointer; transition: background 0.1s; }
  .vnd-row:hover { background: var(--bg-elevated, #1e1e1e); }

  .vnd-type       { color: var(--text-muted, #888); font-size: 0.8rem; }
  .vnd-name-cell  { font-weight: 500; }
  .vnd-phone-cell { white-space: nowrap; }
  .vnd-addr-cell  { font-size: 0.8rem; color: var(--text-muted, #aaa); max-width: 160px; }

  .vnd-trunc {
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.8rem;
    color: var(--text-muted, #aaa);
    cursor: help;
  }

  .vnd-actions-cell {
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .vnd-row:hover .vnd-actions-cell { opacity: 1; }
  .btn--danger-text { color: var(--earth-red, #b84f4f); }

  /* ── Form ── */
  .vnd-form { max-width: 720px; }

  .vnd-form-row { margin-bottom: 16px; }

  .vnd-form-row--2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .vnd-field-group { display: flex; flex-direction: column; gap: 12px; }

  .vnd-field { display: flex; flex-direction: column; gap: 4px; }

  .vnd-field label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #888);
  }

  .vnd-input {
    background: var(--bg-elevated, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 5px;
    color: var(--text-primary, #eee);
    font-size: 0.875rem;
    padding: 7px 10px;
    transition: border-color 0.15s;
    font-family: inherit;
  }

  .vnd-input:focus      { outline: none; border-color: var(--gold, #6a8a6a); }
  .vnd-input--error     { border-color: var(--earth-red, #b84f4f); }
  .vnd-textarea         { resize: vertical; }
  .vnd-field-error      { font-size: 0.75rem; color: var(--earth-red, #b84f4f); }

  .vnd-form-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
  }
</style>
