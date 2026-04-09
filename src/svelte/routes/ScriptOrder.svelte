<script>
  const BD_KEY = 'movie-ledger-breakdowns';
  const SO_KEY = 'movie-ledger-script-order';

  /* ── State ── */
  let settings = $state({});

  /* ── Load ── */
  (function () {
    try { settings = JSON.parse(localStorage.getItem(SO_KEY)) || {}; } catch { settings = {}; }
    if (!settings.draftDate) {
      settings.draftDate = new Date().toISOString().slice(0, 10);
      saveSettings();
    }
  })();

  function saveSettings() { localStorage.setItem(SO_KEY, JSON.stringify(settings)); }

  /* ── Data ── */
  function getScenes() {
    try { return JSON.parse(localStorage.getItem(BD_KEY)) || []; } catch { return []; }
  }

  function getProjectName() {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project'))?.title || 'Untitled Project'; }
    catch { return 'Untitled Project'; }
  }

  /* ── Sort ── */
  function parseSceneNum(str) {
    if (!str) return [0];
    const tokens = str.trim().split(/[-./\s]+/);
    const parts = [];
    for (const tok of tokens) {
      const sub = tok.match(/[0-9]+|[A-Za-z]+/g);
      if (sub) parts.push(...sub);
    }
    if (parts.length === 0) return [0];
    return parts.map(p => {
      const n = Number(p);
      return isNaN(n) ? p.toLowerCase().charCodeAt(0) + 10000 : n;
    });
  }

  function sortBySceneNum(scenes) {
    return [...scenes].sort((a, b) => {
      const na = parseSceneNum(a.sceneNum);
      const nb = parseSceneNum(b.sceneNum);
      for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const va = na[i] ?? -1, vb = nb[i] ?? -1;
        if (va !== vb) return va - vb;
      }
      return 0;
    });
  }

  /* ── Derived ── */
  let scenes = $derived(sortBySceneNum(getScenes()));

  /* ── Color ── */
  function colorClass(scene) {
    const ie = (scene.intExt || '').toUpperCase();
    const dn = (scene.dayNight || '').toUpperCase();
    const isInt = ie === 'INT' || ie === 'INT/EXT';
    const isExt = ie === 'EXT';
    if (dn === 'DAWN') return 'bd-slug--dawn';
    if (dn === 'DUSK') return 'bd-slug--dusk';
    if (isInt && dn === 'DAY') return 'bd-slug--int-day';
    if (isExt && dn === 'DAY') return 'bd-slug--ext-day';
    if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--int-night';
    if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'bd-slug--ext-night';
    return '';
  }

  function dnAbbrev(scene) {
    const dn = (scene.dayNight || '').toUpperCase();
    if (dn === 'DAY') return 'D';
    if (dn === 'NITE' || dn === 'NIGHT') return 'N';
    if (dn === 'DAWN') return 'Dn';
    if (dn === 'DUSK') return 'Dk';
    return scene.dayNight || '';
  }

  function getColorKey(scene) {
    const ie = (scene.intExt || '').toUpperCase();
    const dn = (scene.dayNight || '').toUpperCase();
    const isInt = ie === 'INT' || ie === 'INT/EXT';
    const isExt = ie === 'EXT';
    if (dn === 'DAWN') return 'dawn';
    if (dn === 'DUSK') return 'dusk';
    if (isInt && dn === 'DAY') return 'int-day';
    if (isExt && dn === 'DAY') return 'ext-day';
    if (isInt && (dn === 'NITE' || dn === 'NIGHT')) return 'int-night';
    if (isExt && (dn === 'NITE' || dn === 'NIGHT')) return 'ext-night';
    return 'default';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m-1]} ${d}, ${y}`;
  }

  /* ── Print ── */
  function openPrintView() {
    const projectName = getProjectName();
    const draftVer  = settings.draftVersion || '—';
    const draftDate = formatDate(settings.draftDate) || '—';

    const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const slugRows = scenes.map(scene => {
      const setting = [scene.intExt, scene.location].filter(Boolean).join('  ');
      const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ');
      const dnStr   = dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '');
      const ck      = getColorKey(scene);
      return `<tr class="so-row so-row--${ck}">
        <td class="so-td so-td--scnum">${e(scene.sceneNum || '—')}</td>
        <td class="so-td so-td--setting"><strong>${e(setting || '—')}</strong>${scene.description ? '<br><em>' + e(scene.description) + '</em>' : ''}</td>
        <td class="so-td so-td--dn">${e(dnStr)}</td>
        <td class="so-td so-td--pg">${e(scene.pageCount || '')}</td>
        <td class="so-td so-td--cast">${castIds ? 'Cast: ' + e(castIds) : ''}${scene.bgCount ? '<br>BG: ' + e(scene.bgCount) : ''}</td>
        <td class="so-td so-td--loc">${e(scene.locationAddress || '')}</td>
        <td class="so-td so-td--timing">${e(scene.timing || '')}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Script Order — ${e(projectName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.hdr{text-align:center;padding:12px 0 8px;border-bottom:2px solid #000;margin-bottom:4px;position:relative}
.hdr-title{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.hdr-sub{font-size:12px;margin-top:2px;color:#333}
table{width:100%;border-collapse:collapse;margin-top:2px}
th{font-size:10px;font-weight:700;text-align:left;border-bottom:1.5px solid #000;padding:3px 4px}
.so-td{padding:4px 5px;border-bottom:1px solid #999;font-size:10.5px;vertical-align:top}
.so-td--scnum{width:7%;font-weight:700;text-align:center}
.so-td--setting{width:28%}
.so-td--dn{width:6%;text-align:center;font-style:italic}
.so-td--pg{width:7%;text-align:center}
.so-td--cast{width:22%}
.so-td--loc{width:18%;text-align:center;font-style:italic;font-size:10px}
.so-td--timing{width:7%;text-align:center}
.so-row--int-day td{background:#fff}
.so-row--ext-day td{background:#f5e6a3}
.so-row--int-night td{background:#b8cce4}
.so-row--ext-night td{background:#3a5a8c;color:#fff}
.so-row--dawn td{background:#f5d6a8}
.so-row--dusk td{background:#cdb4e0}
em{font-size:9.5px}
@page{margin:0.75in 0.5in 0.6in 0.5in}
.running-foot{position:fixed;bottom:0;right:0;font-size:9px;color:#555}
.running-date{position:fixed;top:0;right:0;font-size:10px;color:#333}
</style></head><body>
<div class="running-date">${e(draftDate)}</div>
<div class="hdr">
  <div class="hdr-title">${e(projectName)} — SCRIPT ORDER</div>
  <div class="hdr-sub">Based on Script Draft v${e(draftVer)} — ${e(draftDate)}</div>
</div>
<table>
  <thead><tr>
    <th>Sc #</th><th>Set / Synopsis</th><th>D/N</th><th>Pages</th><th>Cast / BG</th><th>Location</th><th>Time</th>
  </tr></thead>
  <tbody>${slugRows}</tbody>
</table>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }
</script>

<section class="ol-section">
  <div class="ol-toolbar">
    <button class="btn btn--ghost btn--sm" onclick={() => window.location.hash = '#schedules'}>← Back</button>
    <h2>One-Liner (Script Order)</h2>
    <div class="ol-toolbar-actions">
      <label class="so-draft-label">Draft v
        <input type="text" class="so-draft-input" bind:value={settings.draftVersion}
          placeholder="1.0" onchange={saveSettings} />
      </label>
      <label class="so-draft-label">Date
        <input type="date" class="so-draft-input so-draft-date" bind:value={settings.draftDate}
          onchange={saveSettings} />
      </label>
      <button class="btn btn--ghost btn--sm" onclick={openPrintView}>Print / PDF</button>
    </div>
  </div>

  <div class="ol-list">
    {#if scenes.length === 0}
      <p class="ol-empty">No scenes in the Breakdown yet. Add scenes there first.</p>
    {:else}
      {#each scenes as scene (scene.id)}
        {@const setting = [scene.intExt, scene.location].filter(Boolean).join('  ')}
        {@const castIds = (scene.castMembers || []).map(c => c.castNum || '').filter(Boolean).join(', ')}
        {@const dnStr = dnAbbrev(scene) + (scene.scriptDay ? ' ' + scene.scriptDay : '')}
        <div class="ol-item">
          <div class="bd-slug {colorClass(scene)}">
            <div class="bd-slug-cell bd-slug-scnum"><span class="bd-slug-val-bold">{scene.sceneNum || '—'}</span></div>
            <div class="bd-slug-cell bd-slug-setting">
              <span class="bd-slug-val-bold">{setting || '—'}</span>
              <span class="bd-slug-desc">{scene.description || ''}</span>
            </div>
            <div class="bd-slug-cell bd-slug-dn"><span class="bd-slug-val">{dnStr}</span></div>
            <div class="bd-slug-cell bd-slug-pg"><span class="bd-slug-val">{scene.pageCount || ''}</span></div>
            <div class="bd-slug-cell bd-slug-cast">
              <span class="bd-slug-val">{castIds ? 'Cast: ' + castIds : ''}</span>
              <span class="bd-slug-bg">BG: {scene.bgCount ?? ''}</span>
            </div>
            <div class="bd-slug-cell bd-slug-loc"><span class="bd-slug-val">{scene.locationAddress || ''}</span></div>
            <div class="bd-slug-cell bd-slug-timing"><span class="bd-slug-val">{scene.timing || ''}</span></div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>
