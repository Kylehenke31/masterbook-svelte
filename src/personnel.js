/* ============================================================
   The Masterbook — personnel.js
   Wrapper that renders Crew / Cast tabs inside a single
   "Personnel" page.  Toggle is injected into the sub-list
   toolbar so it sits to the left of the date range.
   ============================================================ */

import { renderCrewList } from './crewList.js?v=13';
import { renderCastList } from './castList.js?v=4';

const TAB_KEY = 'movie-ledger-personnel-tab';   // 'crew' | 'cast'

function _getActiveTab() {
  return localStorage.getItem(TAB_KEY) || 'crew';
}

function _setActiveTab(tab) {
  localStorage.setItem(TAB_KEY, tab);
}

function _buildToggle(active) {
  return `<div class="personnel-toggle">
    <div class="personnel-toggle-track">
      <button class="personnel-toggle-btn${active==='crew'?' personnel-toggle-btn--active':''}" data-tab="crew">Crew</button>
      <button class="personnel-toggle-btn${active==='cast'?' personnel-toggle-btn--active':''}" data-tab="cast">Cast</button>
      <span class="personnel-toggle-slider" style="transform:translateX(${active==='cast'?'100%':'0'})"></span>
    </div>
  </div>`;
}

export function renderPersonnel(container) {
  const active = _getActiveTab();

  container.innerHTML = `
    <section class="crew-section personnel-section">
      <div id="personnel-content"></div>
    </section>
  `;

  const content = container.querySelector('#personnel-content');

  function showTab(tab) {
    _setActiveTab(tab);
    content.innerHTML = '';
    if (tab === 'crew') renderCrewList(content);
    else                renderCastList(content);

    // Inject toggle into the toolbar
    const toolbar = content.querySelector('.crew-toolbar');
    if (toolbar) {
      toolbar.insertAdjacentHTML('afterbegin', _buildToggle(tab));
      // Wire up toggle buttons
      toolbar.querySelectorAll('.personnel-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.tab !== tab) showTab(btn.dataset.tab);
        });
      });
    }
  }

  showTab(active);
}
