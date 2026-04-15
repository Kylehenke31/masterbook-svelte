/**
 * Creative tab — data layer.
 * All creative data lives under a single localStorage key, keyed by dept slug.
 */

export const CREATIVE_KEY = 'movie-ledger-creative';

/** Department definitions */
export const DEPARTMENTS = [
  { id: 'camera',       label: 'Camera',            shortLabel: 'Camera'   },
  { id: 'locations',    label: 'Locations',          shortLabel: 'Locs'     },
  { id: 'prod-design',  label: 'Production Design',  shortLabel: 'Prod Des' },
  { id: 'costume',      label: 'Costume Design',     shortLabel: 'Costume'  },
  { id: 'property',     label: 'Property',           shortLabel: 'Props'    },
  { id: 'hair-makeup',  label: 'Hair & Make-Up',     shortLabel: 'H&MU'     },
  { id: 'stunts',       label: 'Stunts',             shortLabel: 'Stunts'   },
  { id: 'continuity',   label: 'Continuity',         shortLabel: 'Cont.'    },
];

/**
 * Which breakdown element categories belong to each creative dept.
 * Used to filter elements for the Elements Deck.
 */
export const DEPT_BD_CATEGORIES = {
  'camera':      ['Camera', 'Special Equipment'],
  'locations':   [], // locations come from scene.location field, not elements
  'prod-design': ['Art Department', 'Set Dressing', 'Set Construction', 'Greenery'],
  'costume':     ['Wardrobe', 'Costumes'],
  'property':    ['Property'],
  'hair-makeup': ['Makeup/Hair', 'Makeup'],
  'stunts':      ['Stunts'],
  'continuity':  ['Miscellaneous', 'Notes'],
};

/* ── Persistence ── */
export function loadCreative() {
  try { return JSON.parse(localStorage.getItem(CREATIVE_KEY)) || {}; } catch { return {}; }
}
export function saveCreative(data) {
  localStorage.setItem(CREATIVE_KEY, JSON.stringify(data));
}
export function loadDept(deptId) {
  return loadCreative()[deptId] || _blankDept(deptId);
}
export function saveDept(deptId, deptData) {
  const all = loadCreative();
  all[deptId] = deptData;
  saveCreative(all);
}

function _blankDept(deptId) {
  const base = {
    creativeDeck: { slides: [] },
    elementsDeck: { annotations: {} },
  };
  if (deptId === 'camera') {
    base.shotList     = {};           // { [sceneNum]: { shots: [] } }
    base.cameraReports = [];          // [{ id, date, label, filename, data, notes }]
  }
  if (deptId === 'locations') {
    base.scoutingBoard = {};          // { [locationKey]: { ... } }
  }
  return base;
}

/* ── Breakdown helpers ── */
export function loadScenes() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-breakdowns')) || []; } catch { return []; }
}
export function loadElements() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-elements')) || {}; } catch { return {}; }
}

/**
 * Return elements relevant to a dept, each annotated with the scenes they appear in.
 * For the 'locations' dept this returns [] — use getScriptedLocations() instead.
 */
export function getElementsForDept(deptId) {
  const categories = DEPT_BD_CATEGORIES[deptId] || [];
  if (!categories.length) return [];

  const elements = loadElements();
  const scenes   = loadScenes();

  // Which elements match this dept's categories?
  const deptEls = Object.values(elements).filter(el => {
    const d = (el.department || '').toLowerCase();
    return categories.some(cat => d === cat.toLowerCase());
  });

  // Map: elementId → scene numbers it appears in
  const elScenes = {};
  scenes.forEach(scene => {
    Object.values(scene).forEach(val => {
      if (!Array.isArray(val)) return;
      val.forEach(item => {
        if (!item?.elementId) return;
        if (!elScenes[item.elementId]) elScenes[item.elementId] = [];
        elScenes[item.elementId].push(scene.sceneNum || '?');
      });
    });
  });

  return deptEls.map(el => ({
    ...el,
    scenesIn: [...new Set(elScenes[el.id] || [])],
  }));
}

/**
 * Return unique scripted locations from breakdowns, each with the scenes that use it.
 * Used by the Locations dept Elements Deck and Scouting Board.
 */
export function getScriptedLocations() {
  const scenes = loadScenes();
  const map = {};
  scenes.forEach(scene => {
    const loc = (scene.location || '').trim();
    if (!loc) return;
    const key = loc.toUpperCase();
    if (!map[key]) map[key] = { key, displayName: loc, scenes: [] };
    map[key].scenes.push({
      sceneNum:    scene.sceneNum  || '',
      intExt:      scene.intExt   || '',
      dayNight:    scene.dayNight  || '',
      description: scene.description || '',
    });
  });
  return Object.values(map).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Return scenes in shoot order from the active one-liner draft.
 * Falls back to breakdowns order if no draft exists.
 */
export function getShootOrderScenes() {
  try {
    const OL_KEY     = 'movie-ledger-one-liner-drafts';
    const ACTIVE_KEY = 'movie-ledger-one-liner-active';
    const drafts   = JSON.parse(localStorage.getItem(OL_KEY))     || {};
    const activeId = localStorage.getItem(ACTIVE_KEY)             || Object.keys(drafts)[0];

    if (activeId && drafts[activeId]?.items?.length) {
      const bdScenes = loadScenes();
      return drafts[activeId].items.map(item => {
        // items carry snapshot scene data; enrich with live breakdown data if available
        const live = bdScenes.find(s => s.sceneNum === item.sceneNum);
        return live || item;
      }).filter(Boolean);
    }
  } catch { /* fall through */ }
  return loadScenes(); // fallback: breakdowns order
}
