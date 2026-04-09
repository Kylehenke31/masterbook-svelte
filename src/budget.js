/* ============================================================
   The Masterbook — budget.js
   Film production budget: Commercial (A–P) and Feature Film templates.
   Inline editable, auto-calculated, localStorage persistence.
   Sub-line detail modal with OT support for labor sections.
   ============================================================ */

import { addPurchase, getPurchases } from './data.js?v=6';

const BUDGET_KEY = 'movie-ledger-budget';
const LOCK_KEY   = 'movie-ledger-budget-lock';

const PROD_INFO_KEY        = 'movie-ledger-prod-info';
const HOT_COST_LOG_KEY     = 'movie-ledger-hot-costs';
// Clean up deprecated fringe-actuals localStorage (now computed from approved purchases)
localStorage.removeItem('movie-ledger-fringe-actuals');

function _loadHotLog() {
  try { return JSON.parse(localStorage.getItem(HOT_COST_LOG_KEY)) || []; } catch { return []; }
}
function _saveHotLog(log) {
  localStorage.setItem(HOT_COST_LOG_KEY, JSON.stringify(log));
}
function _addHotEntry(entry) {
  const log = _loadHotLog();
  log.push(entry);
  _saveHotLog(log);
}

function _loadProdInfo() {
  try { return JSON.parse(localStorage.getItem(PROD_INFO_KEY)) || {}; } catch { return {}; }
}
function _saveProdInfo(data) {
  localStorage.setItem(PROD_INFO_KEY, JSON.stringify(data));
}

/* ── Lock the Bid ── */
function _loadLock() {
  try { _lockState = JSON.parse(localStorage.getItem(LOCK_KEY)) || null; } catch { _lockState = null; }
}
function _saveLock() {
  if (_lockState) {
    localStorage.setItem(LOCK_KEY, JSON.stringify(_lockState));
  } else {
    localStorage.removeItem(LOCK_KEY);
  }
}
function _isBidLocked() {
  return !!_lockState?.locked;
}
function _isRowLocked(rowId) {
  return _isBidLocked() && _lockState.lockedRows && _lockState.lockedRows.includes(rowId);
}
function _isGroupLocked(secId) {
  return _isBidLocked() && _lockState.lockedGroups && _lockState.lockedGroups.includes(secId);
}
function _lockBid() {
  if (!confirm('Lock the bid? This will protect current bid values from editing.')) return;
  // Snapshot current rows and groups
  const lockedRows = [];
  const lockedGroups = [];
  const lockedPW = {};
  const lockedFringes = {};
  _sections.forEach(def => {
    lockedGroups.push(def.id);
    const sec = _budget[def.id];
    if (sec) {
      lockedPW[def.id] = sec.pwRate;
      lockedFringes[def.id] = sec.fringeRate;
      sec.rows.forEach(r => { lockedRows.push(r.id); });
    }
  });
  _lockState = {
    locked: true,
    lockedAt: Date.now(),
    lockedRows,
    lockedGroups,
    lockedPW,
    lockedFringes,
  };
  _saveLock();
  _render();
}
function _unlockBid() {
  if (!confirm('Unlock the bid? This will allow editing of all bid values.')) return;
  _lockState = null;
  _saveLock();
  _render();
}
function _toggleLock() {
  if (_isBidLocked()) _unlockBid(); else _lockBid();
}

/* ── Fringe Actuals — computed from approved purchases with "Group X" line items ── */
let _fringeActuals = {}; // { secId: { total, contributions:[{folder,vendor,amount}] } }

function _getFringeActual(secId) {
  return _fringeActuals[secId]?.total || 0;
}
function _hasFringeActual(secId) {
  return (_fringeActuals[secId]?.contributions.length || 0) > 0;
}

/* ── Commercial Section Definitions ── */
const COMMERCIAL_SECTIONS = [
  { num: 1,  id: 'A', type: 'labor',   name: 'Pre-Production Labor', items: [
    'Line Producer','Assistant Director','Director of Photography','1st Assistant Camera',
    '2nd Assistant Camera','Loader','Lighting Tech (Stills)','Cam Assistant (Stills)',
    'Camera Operator','Gaffer','Best Electric','3rd Electric','Electric/Driver',
    'Prep/Strike/Pre Rig Crew','Key Grip','Best Grip','3rd Grip/Driver','Grip/Driver',
    'Crane Tech 2x','Crane Head Tech','Steadi Cam Operator','Choreographer',
    'Make-Up/Hair','Make-Up/Hair Assistant','Wardrobe Stylist','Wardrobe Assistant',
    'Script Supervisor','Boom Operator','Sound Mixer','VTR Operator',
    'Stunt Coordinator','Safety Officer','Site Rep','Storyboard Artist',
    'Catering Crew','Location Scout','2nd Assistant Director','Medic',
    'Craft Services','Firefighter','Police Officers/Rangers/CHP','Welfare/Teacher',
    'Gang Boss','Teamsters Drivers / Animal Wranglers','Production Supervisor',
    'Production Coordinator','Production Assistant',
  ]},
  { num: 2,  id: 'B', type: 'labor',   name: 'Shoot Labor', items: [
    'Line Producer','Assistant Director','Director of Photography','1st Assistant Camera',
    '2nd Assistant Camera','Loader','Lighting Tech (Stills)','Cam Assistant (Stills)',
    'Camera Operator','Gaffer','Best Electric','3rd Electric','Electric/Driver',
    'Prep/Strike/Pre Rig Crew','Key Grip','Best Grip','3rd Grip/Driver','Grip/Driver',
    'Crane Tech 2x','Crane Head Tech','Steadi Cam Operator','Choreographer',
    'Make-Up/Hair','Make-Up/Hair Assistant','Wardrobe Stylist','Wardrobe Assistant',
    'Script Supervisor','Boom Operator','Sound Mixer','VTR Operator',
    'Stunt Coordinator','Safety Officer','Site Rep','Storyboard Artist',
    'Catering Crew','Location Scout','2nd Assistant Director','Medic',
    'Craft Services','Firefighter','Police Officers/Rangers/CHP','Welfare/Teacher',
    'Gang Boss','Teamsters Drivers / Animal Wranglers','Production Supervisor',
    'Production Coordinator','Production Assistant',
  ]},
  { num: 3,  id: 'C', type: 'expense', name: 'Prep & Wrap Expenses', items: [
    'Craft Services','Per Diems','Hotels','Scouting Expenses','Deliveries & Taxi',
    'Car Rental','Trucking','Casting Director','Casting Facility','Home Econ Supplies',
    'Telephone & Cable','Working Meals','Messengers',
  ]},
  { num: 4,  id: 'D', type: 'expense', name: 'Location Expenses', items: [
    'Location Fees','Permits','Lane Closures','Set Security','Cargo Van',
    'Production Trucking','B Roll Day Truck','Car Rentals','Bus Rentals','Limousines',
    'Dressing Room Vehicles','Production Motorhome','Other Vehicles','Parking/Tolls/Gas',
    'Excess Bags/Homeland Security','Air Fares','Hotels','Per Diems','Talent Meals',
    'Breakfast','Lunch','Dinner','Cabs/Ubers/Lyfts/Other Transportation',
    'Kit Rental','Art Work','Craft Service',
  ]},
  { num: 5,  id: 'E', type: 'expense', name: 'Props, Wardrobe, & Animals', items: [
    'Prop Rental','Prop Purchase','Prop Fabrication','Wardrobe Rental','Wardrobe Purchase',
    'Costumes','Picture Vehicles','Animals & Handlers','Theatrical Makeup',
    'Product Prep / Color Correct','Greens',
  ]},
  { num: 6,  id: 'F', type: 'expense', name: '2nd Unit', items: [
    'DP','1st Assistant Camera','Gaffer','Key Grip','Hair & Make-Up Attendant',
    '2nd Unit Production Assistant','Trucking','Parking/Tolls/Gas','2nd Unit Cam Rental',
    'G/E Package','Grip Rental','Drives Purchase','Meals/Crafty/Water','Kit Fees',
    'Crew Parking','Expendables','Art Rentals',
  ]},
  { num: 7,  id: 'G', type: 'labor',   name: 'Art Department Labor', items: [
    'Production Designer / Art Director','Set Director','Art Department Coordinator',
    'Prop Master','Assistant Props','Swing','Leadperson','Set Dresser','Scenics',
    'Grips / Riggers',
  ]},
  { num: 8,  id: 'H', type: 'expense', name: 'Art Department Expenses', items: [
    'Set Dressing Rentals','Set Dressing Purchases','Art Department Prod Supplies',
    'Art Department Kit Rentals','Special Effects Rentals','Art Department Trucking',
    'Outside Construction','Car Prep','Art Department Meals','Messengers/Deliveries',
  ]},
  { num: 9,  id: 'I', type: 'expense', name: 'Equipment Rental', items: [
    'Camera Rental','Sound Rental','Lighting Rental','Grip Rental','Generator Rental',
    'Crane Rental','VTR Rental','Walkie Talkie Rental','Dolly Rental','SteadiCam',
    'Digitech Equipment','Production Supplies','Jib Arm','Still Equipment',
    'Camera Car','Expendables','Lenses','Cinedrives',
  ]},
  { num: 10, id: 'J', type: 'expense', name: 'Media', items: [
    'Media / Drives','Film','Transcode / Transfer','Process','Dailies',
  ]},
  { num: 11, id: 'K', type: 'expense', name: 'Miscellaneous Production Costs', items: [
    'Petty Cash','Air Shipping and Carriers','Phones and Cables','Cash Under $15 Each',
    'External Billing Costs','Special Insurance','Cell Phones',
    'Foreign Production Services Co.','Stills Unit','Interviewer Questions',
  ]},
  { num: 12, id: 'L', type: 'expense', name: 'Directors Fees | Creative Fees', items: [
    'Director Prep','Director Travel','Director Shoot incl. Edit Fee','Director Post',
    'Fringes','Stills Photographer',
  ]},
  { num: 13, id: 'M', type: 'labor',   name: 'Talent Labor', items: [
    'Lead Talent','Lead Talent','O/C Principal','O/C Principal','O/C Principal',
    'O/C Principal','O/C Extra','O/C Extra','O/C Extra','Hand Models','Voice Over',
  ]},
  { num: 14, id: 'N', type: 'expense', name: 'Talent Expenses', items: [
    'Fitting Fees','Agency Fee','Talent Payroll Service','Talent Wardrobe Allowance',
    'Talent Air Fares','Talent Per Diem','Talent Ground Transportation',
    'Dressing Room Vehicles','Talent Meals',
  ]},
  { num: 15, id: 'O', type: 'labor',   name: 'Post Production Labor', items: [
    'Post Producer','Designer','Offline Editor','Assistant Editor',
    'Post Production Assistant',
  ]},
  { num: 16, id: 'P', type: 'expense', name: 'Editorial | Finishing | Post Production', items: [
    'Film To Tape Color Correction','Tape to Tape Color Correction',
    'One-Light Film to Video Transfer','Transfer Tape Stock','Transfer Dubs',
    'Avid Meridien Bay','Offline Tape Stock','Offline Dubs','Digital Graphics',
    'Digital Rotoscoping','Digital Compositing','Online Edit Bay','Online Stock',
    'Online Dubs','Voice-Over / ADR','Original Music Composition','Music Clearance',
    'Music Library Fees','Audio Sweetening','Audio Stock','Client Dubs',
    'Standards Conversion','Satellite Transmission','Stock Footage','Hard Drive',
  ]},
];

/* ── Feature Film Section Definitions ── */
const FEATURE_SECTIONS = [
  { num: 1,  id: 'A', type: 'expense', name: 'Above the Line - Story & Rights', items: [
    'Story Rights / Option Purchase','Screenplay Purchase','Screenplay Rewrite Fee',
    'Writer Step Deal','Treatment Purchase','Research & Development',
    'Script Clearance & Copyright','Chain of Title Legal Fees',
    'Literary Agent Commission','Story Editor',
  ]},
  { num: 2,  id: 'B', type: 'labor',   name: 'Above the Line - Producers Unit', items: [
    'Executive Producer','Producer','Co-Producer','Associate Producer',
    'Line Producer','Supervising Producer','Production Accountant',
    'Entertainment Attorney (Flat Fee)','Development Executive',
  ]},
  { num: 3,  id: 'C', type: 'labor',   name: 'Above the Line - Direction', items: [
    'Director Fee (Prep)','Director Fee (Shoot)','Director Fee (Post)',
    '1st Assistant Director','2nd Assistant Director','Script Supervisor',
    'DGA Trainee',
  ]},
  { num: 4,  id: 'D', type: 'labor',   name: 'Above the Line - Cast', items: [
    'Lead Actor 1','Lead Actor 2','Lead Actress','Supporting Actor 1',
    'Supporting Actor 2','Day Player 1','Day Player 2','Day Player 3',
    'Stunt Coordinator','Stunt Double','Casting Director','Extras / Background',
    'Voice Artists','ADR Voices',
  ]},
  { num: 5,  id: 'E', type: 'labor',   name: 'Production Staff', items: [
    'Production Manager','Production Coordinator','Assistant Production Coordinator',
    'Production Secretary','Office Production Assistant','Set Production Assistant',
    'DGA Field Representative','SAG Representative','Payroll Service',
    'Medical Advisor','Technical Advisor',
  ]},
  { num: 6,  id: 'F', type: 'labor',   name: 'Camera Department', items: [
    'Director of Photography','Camera Operator A','Camera Operator B',
    '1st Assistant Camera A','1st Assistant Camera B','2nd Assistant Camera',
    'Loader / DIT','Still Photographer','Video Playback Operator',
    'Steadicam Operator','Drone Operator','Behind the Scenes Camera',
  ]},
  { num: 7,  id: 'G', type: 'labor',   name: 'Art Department Labor', items: [
    'Production Designer','Art Director','Set Decorator','Leadman',
    'Set Dresser 1','Set Dresser 2','Prop Master','Assistant Prop Master',
    'Props Buyer','Graphic Designer','Illustrator / Storyboard Artist',
    'Art Department Coordinator','Scenic Artist','Greensman',
  ]},
  { num: 8,  id: 'H', type: 'expense', name: 'Art Department Expenses', items: [
    'Set Dressing Rentals','Set Dressing Purchases','Prop Rentals','Prop Purchases',
    'Prop Fabrication','Set Construction Materials','Scenic Supplies',
    'Art Department Expendables','Art Department Trucking','Kit Rentals (Art Dept)',
    'Petty Cash (Art Dept)','Greenery / Plants','Signage & Graphics',
  ]},
  { num: 9,  id: 'I', type: 'expense', name: 'Set Construction', items: [
    'Construction Coordinator','General Foreman','Head Carpenter',
    'Carpenters (Gang)','Painters','Laborers','Construction Materials - Lumber',
    'Construction Materials - Hardware','Construction Materials - Paint',
    'Construction Equipment Rental','Construction Trucking','Stage Rental',
    'Stage Utilities','Stage Dressing','Strike Labor & Disposal',
  ]},
  { num: 10, id: 'J', type: 'expense', name: 'Set Decoration', items: [
    'Set Decorations Rental','Set Decorations Purchase','Furniture Rentals',
    'Furniture Purchases','Rugs & Drapes','Appliances','Electronics / Screens',
    'Picture Vehicles (Hero)','Breakaway Items','Set Decoration Trucking',
    'Set Decoration Petty Cash',
  ]},
  { num: 11, id: 'K', type: 'expense', name: 'Props', items: [
    'Action Props Rental','Action Props Purchase','Weapons / Armorer Rental',
    'Armorer Kit Fee','Special Props Fabrication','Food Stylist & Food Props',
    'Set Dressing Crossover','Picture Cars Rental','Animals & Wranglers',
    'Animal Permits','Props Truck / Van Rental',
  ]},
  { num: 12, id: 'L', type: 'labor',   name: 'Wardrobe', items: [
    'Costume Designer','Assistant Costume Designer','Key Costumer',
    'Set Costumer 1','Set Costumer 2','Cutter / Tailor','Wardrobe Buyer',
    'Wardrobe PA','Seamstress / Alterations',
  ]},
  { num: 13, id: 'M', type: 'labor',   name: 'Hair & Makeup', items: [
    'Department Head Makeup','Key Makeup Artist','Makeup Artist 2',
    'Additional Makeup Artist','Department Head Hair','Key Hair Stylist',
    'Hair Stylist 2','Additional Hair Stylist','Special FX Makeup Artist',
    'Prosthetics Technician',
  ]},
  { num: 14, id: 'N', type: 'labor',   name: 'Lighting', items: [
    'Gaffer','Best Boy Electric','3rd Electric','Electrics (Gang)',
    'Generator Operator','Dimmer Board Operator','Rigging Gaffer',
    'Rigging Best Boy','Rigging Electrics',
  ]},
  { num: 15, id: 'O', type: 'labor',   name: 'Grip', items: [
    'Key Grip','Best Boy Grip','Dolly Grip','3rd Grip','Grips (Gang)',
    'Rigging Key Grip','Rigging Best Boy Grip','Rigging Grips',
    'Crane / Technocrane Operator',
  ]},
  { num: 16, id: 'P', type: 'labor',   name: 'Sound', items: [
    'Production Sound Mixer','Boom Operator','Cable Person / Utility Sound',
    'Playback Operator','Music Playback Coordinator',
  ]},
  { num: 17, id: 'Q', type: 'expense', name: 'Transportation', items: [
    'Transportation Coordinator','Transportation Captain','Picture Car Captain',
    'Drivers (Gang)','Camera Car & Driver','Insert Car & Driver','Camera Crane Truck',
    'Star Wagon / Dressing Room Vehicle','Honey Wagon','Water Truck',
    'Production Truck (5-ton)','Production Van','Stakebed Truck',
    'Art Department Truck','Fuel','Parking & Tolls','Mileage / Car Allowances',
  ]},
  { num: 18, id: 'R', type: 'expense', name: 'Location Expenses', items: [
    'Location Manager','Assistant Location Manager','Location Scout Fees',
    'Location Fees (Interior)','Location Fees (Exterior)','Permits',
    'Police Officers / Fire Safety','Set Security','Site Rep / Liaison',
    'Location Contingency','Helicopter / Aerial Permit',
    'Breakfast','Lunch (Catering)','Craft Service','Meal Penalties',
    'Air Fares (Crew)','Hotels (Crew)','Per Diems (Crew)',
    'Excess Baggage',
  ]},
  { num: 19, id: 'S', type: 'expense', name: 'Visual Effects', items: [
    'VFX Supervisor (Shoot)','VFX Producer','VFX Coordinator',
    'On-Set VFX Data Wrangler','VFX Studio (Post)','Compositing',
    'CG Modeling & Animation','Motion Capture','Rotoscoping',
    'Digital Environment / Matte Painting','Green / Blue Screen Equipment',
    'VFX Equipment Rental (On-Set)','VFX Playback','Software Licenses',
    'Render Farm / Cloud Compute',
  ]},
  { num: 20, id: 'T', type: 'expense', name: 'Second Unit', items: [
    '2nd Unit Director','2nd Unit DP','2nd Unit 1st AC','2nd Unit Gaffer',
    '2nd Unit Key Grip','2nd Unit Sound Mixer','2nd Unit Script Supervisor',
    '2nd Unit PA','2nd Unit Camera Package','2nd Unit G/E Package',
    '2nd Unit Location Fees','2nd Unit Trucking','2nd Unit Catering',
  ]},
  { num: 21, id: 'U', type: 'expense', name: 'Film & Lab / Digital Media', items: [
    'Digital Media / Hard Drives','Memory Cards / Mags','Data Management (DIT)',
    'Cloud Backup Storage','LTO Tape Archival','Sync & Screen Dailies',
    'Dailies Color Correction','Film Transfer / Scan (if applicable)',
    'Reference Monitors & Calibration','Secure Data Delivery',
  ]},
  { num: 22, id: 'V', type: 'labor',   name: 'Post Production Labor', items: [
    'Post Production Supervisor','Post Production Coordinator',
    'Picture Editor','First Assistant Editor','Second Assistant Editor',
    'Post Production PA','Colorist (DI)','Online Editor / Conform Artist',
    'VFX Editor','Titles Designer',
  ]},
  { num: 23, id: 'W', type: 'expense', name: 'Post Production - Picture', items: [
    'Offline Edit Suite Rental','Online / Conform Suite Rental',
    'DI / Color Grading Suite','Film Output (if applicable)',
    'Deliverables Encoding & QC','Closed Captioning','Subtitling',
    'Stock Footage Licensing','Still Photo Licensing','End Credits Production',
    'Screening Room Rental','Screening Prints / Files','Hard Drives (Post)',
  ]},
  { num: 24, id: 'X', type: 'expense', name: 'Post Production - Sound', items: [
    'Dialogue Editor','Sound Effects Editor','Foley Artist','Foley Mixer',
    'Foley Stage Rental','ADR / Loop Group','ADR Stage Rental',
    'Re-recording Mixer','Mixing Stage Rental','Printmaster / Deliverables',
    'Sound Effects Library Licenses','M&E Mix','Dolby / DTS Encoding',
    'Audio Post Production Coordinator',
  ]},
  { num: 25, id: 'Y', type: 'expense', name: 'Post Production - Music', items: [
    'Composer Fee','Score Recording Sessions','Score Mixing','Score Mastering',
    'Music Editor','Orchestrator / Arranger','Music Clearance (Sync Fees)',
    'Music Clearance (Master Fees)','Music Supervisor','Music Contractor',
    'Musician Fees (AFM)','Studio Rental (Score)','Music Licensing Attorney',
    'Music Library Fees',
  ]},
  { num: 26, id: 'Z', type: 'expense', name: 'Insurance & Legal', items: [
    'Production Package Insurance','Errors & Omissions Insurance',
    'Completion Bond','Entertainment Attorney (Ongoing)','Labor Attorney',
    'Contract Administration','Copyright Registration',
    'Chain of Title Review','Guild Residuals Administration',
  ]},
  { num: 27, id: 'AA', type: 'expense', name: 'Contingency', items: [
    'Contingency (10%)','Executive Producer Overhead',
    'Commissioner / Completion Fee','Misc. Unallocated Costs',
  ]},
];

/* ── Module state ── */
let _container  = null;
let _budget     = {};  // { sectionId: { collapsed, pwRate, fringeRate, rows } }
let _sections   = [];  // active SECTION_DEFS array (set by template)
let _modalOpen  = null; // { secId, rowId }
let _showEst    = false; // toggled by toolbar button; not persisted
let _lockState  = null;  // loaded from localStorage; { locked, lockedAt, lockedRows, lockedGroups, lockedPW, lockedFringes }

// Actuals derived from approved purchase log entries (rebuilt on each render)
let _actualsMap = new Map(); // padded lineNum → { total, contributions:[{folder,vendor,amount}] }
let _rowActuals = {};        // { secId: [ { padded, total, contributions } ] } indexed by rowIdx

/* ── Entry point ── */
export function renderBudget(container) {
  _container = container;
  _loadTemplate();
  _load();
  _loadLock();
  _initQR();
  _buildActualsMap();      // derive Actual + fringe values from approved purchases
  _render();
}

/* ── Template detection ── */
function _loadTemplate() {
  try {
    const proj = JSON.parse(localStorage.getItem('movie-ledger-project'));
    const tpl  = proj?.budgetTemplate || 'commercial';
    _sections  = tpl === 'feature' ? FEATURE_SECTIONS : COMMERCIAL_SECTIONS;
  } catch {
    _sections = COMMERCIAL_SECTIONS;
  }
}

/* ── Persistence ── */
function _load() {
  try { _budget = JSON.parse(localStorage.getItem(BUDGET_KEY)) || {}; } catch { _budget = {}; }
  _sections.forEach(sec => {
    if (!_budget[sec.id]) {
      _budget[sec.id] = {
        collapsed:   true,
        pwRate:      0,
        fringeRate:  0,
        rows:        sec.items.map(_blankRow),
      };
    } else {
      // Ensure new fields exist on old data
      if (_budget[sec.id].pwRate     == null) _budget[sec.id].pwRate     = 0;
      if (_budget[sec.id].fringeRate == null) _budget[sec.id].fringeRate = 0;
      // Back-fill rows for any new default items not yet stored
      while (_budget[sec.id].rows.length < sec.items.length) {
        const idx = _budget[sec.id].rows.length;
        _budget[sec.id].rows.push(_blankRow(sec.items[idx] || ''));
      }
      // Ensure each row has all fields
      _budget[sec.id].rows.forEach(r => {
        if (!r.subLines)         r.subLines  = [];
        if (r.no   == null)      r.no        = '';
        if (r.days == null)      r.days      = '';
        if (r.rate == null)      r.rate      = '';
        if (r.ot15 == null)      r.ot15      = '';
        if (r.ot2  == null)      r.ot2       = '';
        if (r.ot25 == null)      r.ot25      = '';
        if (r.baseHours == null) r.baseHours = 8;
        if (r.eDays == null)     r.eDays     = '';
        if (r.eNo   == null)     r.eNo       = '';
        if (r.eRate == null)     r.eRate     = '';
        if (r.eOt15 == null)     r.eOt15     = '';
        if (r.eOt2  == null)     r.eOt2      = '';
        if (r.eOt25 == null)     r.eOt25     = '';
      });
    }
  });
}

function _save() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(_budget));
}

function _initQR() {
  if (!_budget.__q) _budget.__q = { amount: '', actual: '' };
  if (!_budget.__r) _budget.__r = { rate:   '', actual: '' };
  if (_budget.__q.amount == null) _budget.__q.amount = '';
  if (_budget.__q.actual == null) _budget.__q.actual = '';
  if (_budget.__r.rate   == null) _budget.__r.rate   = '';
  if (_budget.__r.actual == null) _budget.__r.actual = '';
}

function _blankRow(description = '') {
  return {
    id:        _uid(),
    description,
    no:        '',
    days:      '',
    rate:      '',
    ot15:      '',
    ot2:       '',
    ot25:      '',
    baseHours: 8,
    actual:    '',
    subLines:  [],
    // Estimate scratch columns
    eDays: '', eNo: '', eRate: '',
    eOt15: '', eOt2: '', eOt25: '',
  };
}

/* ── Editable section names ── */
function _getSectionName(def) {
  return _budget[def.id]?.customName || def.name;
}
function _setSectionName(secId, name) {
  if (_budget[secId]) {
    _budget[secId].customName = name;
    _save();
  }
}

/* ── Section line-number ranges ── */
// A → 1-50, B → 51-100, C onward → items.length slots each
function _buildSectionRanges() {
  const ranges = {};
  let cursor = 1;
  _sections.forEach(def => {
    // A and B each get 50 slots; all others get exactly their default item count
    const slots = (def.id === 'A' || def.id === 'B') ? 50 : def.items.length;
    ranges[def.id] = { start: cursor, slots };
    cursor += slots;
  });
  return ranges;
}

function _lineNumForRow(ranges, secId, rowIndex) {
  const r = ranges[secId];
  if (!r) return { num: rowIndex + 1, isAdded: false };
  const natural = r.start + rowIndex;
  const isAdded = rowIndex >= r.slots;
  if (isAdded) {
    // Prefix "1" to the natural number (e.g. 51 → 1051)
    return { num: natural, display: String(natural + 1000), isAdded: true };
  }
  return { num: natural, display: String(natural).padStart(4, '0'), isAdded: false };
}

function _blankSubLine(isLabor) {
  if (isLabor) {
    return { id: _uid(), description: '', no: '', days: '', rate: '', ot15: '', ot2: '', ot25: '' };
  }
  return { id: _uid(), description: '', no: '', days: '', rate: '' };
}

/* ── Calculations ── */
// California OT: a day rate already embeds 8 straight + (baseHours−8) at 1.5×.
// Effective divisor = 8 + max(0, baseHours−8) × 1.5
// (e.g. 12-hr day → 8 + 4×1.5 = 14; dividing rate by 14 gives the cost-per-OT-hour baked in)
// Additional OT hours share that same baked-in rate, scaled by their multiplier vs 1.5×:
//   1.5× OT hrs → effOTRate × (1.5/1.5) = effOTRate
//   2×   OT hrs → effOTRate × (2.0/1.5)
//   2.5× OT hrs → effOTRate × (2.5/1.5)
function _otDivisor(baseHours) {
  const hrs = parseFloat(baseHours) || 8;
  return 8 + Math.max(0, hrs - 8) * 1.5;
}

function _calcSubLineTotal(sub, isLabor, baseHours) {
  const no   = parseFloat(sub.no)   || 0;
  const days = parseFloat(sub.days) || 0;
  const rate = parseFloat(sub.rate) || 0;
  const base = no * days * rate;
  if (!isLabor) return base;
  // rate/divisor = true hourly rate; 1.5× ÷1.5 cancels; 2× and 2.5× scale from there
  const effHourly = rate / _otDivisor(baseHours);
  const ot15 = (parseFloat(sub.ot15) || 0) * effHourly * 1.5;
  const ot2  = (parseFloat(sub.ot2)  || 0) * effHourly * 2;
  const ot25 = (parseFloat(sub.ot25) || 0) * effHourly * 2.5;
  return base + ot15 + ot2 + ot25;
}

function _calcRowBid(secDef, row) {
  if (row.subLines && row.subLines.length > 0) {
    const isLabor = secDef.type === 'labor';
    return row.subLines.reduce((s, sl) => s + _calcSubLineTotal(sl, isLabor, row.baseHours), 0);
  }
  const no   = parseFloat(row.no)   || 1;
  const days = parseFloat(row.days) || 0;
  const rate = parseFloat(row.rate) || 0;
  const base = no * days * rate;
  if (secDef.type !== 'labor') return base;
  const effHourly = rate / _otDivisor(row.baseHours);
  const ot15 = (parseFloat(row.ot15) || 0) * effHourly * 1.5;
  const ot2  = (parseFloat(row.ot2)  || 0) * effHourly * 2;
  const ot25 = (parseFloat(row.ot25) || 0) * effHourly * 2.5;
  return base + ot15 + ot2 + ot25;
}

function _sectionHasActual(secId) {
  return (_rowActuals[secId] || []).some(r => r.total > 0) || _getFringeActual(secId) > 0;
}

function _hasAnyActual() {
  return _sections.some(d => _sectionHasActual(d.id));
}

function _fmt4(n) { return String(n).padStart(4, '0'); }

function _fmtRowVariance(bid, computedActual, hasActual) {
  if (!hasActual) return '—';
  return _fmtVariance(computedActual - bid);
}

function _fmtSecVariance(secId) {
  if (!_sectionHasActual(secId)) return '—';
  const bid    = _sectionEstimateTotal(secId);
  const actual = _sectionActualEstimateTotal(secId);
  return _fmtVariance(actual - bid);
}

function _sectionSubTotal(secId) {
  const def = _sections.find(d => d.id === secId);
  if (!def) return 0;
  return (_budget[secId]?.rows || []).reduce((s, r) => s + _calcRowBid(def, r), 0);
}

function _sectionEstimateTotal(secId) {
  const sec      = _budget[secId];
  const subTotal = _sectionSubTotal(secId);
  const pw       = subTotal * ((parseFloat(sec?.pwRate) || 0) / 100);
  const fringe   = subTotal * ((parseFloat(sec?.fringeRate) || 0) / 100);
  return subTotal + pw + fringe;
}

function _sectionActualSubTotal(secId) {
  return (_rowActuals[secId] || []).reduce((s, r) => s + r.total, 0);
}

function _sectionActualEstimateTotal(secId) {
  const actSub    = _sectionActualSubTotal(secId);
  // P&W+Fringe actuals ONLY from approved "Group X" purchases — never percentage-based
  const actRates  = _getFringeActual(secId);
  return actSub + actRates;
}

/* A–P subtotal (base for contingency calculation) */
function _apBid()    { return _sections.reduce((s, d) => s + _sectionEstimateTotal(d.id), 0); }
function _apActual() { return _sections.reduce((s, d) => s + _sectionActualEstimateTotal(d.id), 0); }

/* Q – Insurance (direct dollar entry) */
function _qBid()    { return parseFloat(_budget.__q?.amount) || 0; }
function _qActual() { return parseFloat(_budget.__q?.actual) || 0; }

/* R – Contingency (% of A–P) */
function _rBid()    { return _ceil2(_apBid() * (parseFloat(_budget.__r?.rate) || 0) / 100); }
function _rActual() { return parseFloat(_budget.__r?.actual) || 0; }

/* Grand totals include A–P + Q + R */
function _grandBid()    { return _apBid()    + _qBid()    + _rBid(); }
function _grandActual() { return _apActual() + _qActual() + _rActual(); }

/* P&W + Fringes totals across all sections (informational) */
function _totalPWFBid() {
  return _sections.reduce((sum, def) => {
    const sec   = _budget[def.id];
    const sub   = _sectionSubTotal(def.id);
    const pw    = sub * ((parseFloat(sec?.pwRate)     || 0) / 100);
    const fr    = sub * ((parseFloat(sec?.fringeRate) || 0) / 100);
    return sum + pw + fr;
  }, 0);
}
function _totalPWFActual() {
  // P&W+Fringe actuals ONLY from approved "Group X" purchases — never percentage-based
  return _sections.reduce((sum, def) => sum + _getFringeActual(def.id), 0);
}

/* ── Estimate (scratch) calculations ── */
function _calcRowEst(secDef, row) {
  const no   = parseFloat(row.eNo)   || 1;
  const days = parseFloat(row.eDays) || 0;
  const rate = parseFloat(row.eRate) || 0;
  const base = no * days * rate;
  if (secDef.type !== 'labor') return base;
  const effHourly = rate / _otDivisor(row.baseHours);
  const ot15 = (parseFloat(row.eOt15) || 0) * effHourly * 1.5;
  const ot2  = (parseFloat(row.eOt2)  || 0) * effHourly * 2;
  const ot25 = (parseFloat(row.eOt25) || 0) * effHourly * 2.5;
  return base + ot15 + ot2 + ot25;
}

function _sectionEstSubTotal(secId) {
  const def = _sections.find(d => d.id === secId);
  if (!def) return 0;
  return (_budget[secId]?.rows || []).reduce((s, r) => s + _calcRowEst(def, r), 0);
}

function _sectionEstTotal(secId) {
  const sec    = _budget[secId];
  const estSub = _sectionEstSubTotal(secId);
  const pw     = estSub * ((parseFloat(sec?.pwRate)     || 0) / 100);
  const fringe = estSub * ((parseFloat(sec?.fringeRate) || 0) / 100);
  return estSub + pw + fringe;
}

/* ── Global line number counter ── */
function _buildGlobalLineMap() {
  // Returns { secId: { rowId: { display, isAdded } } }
  const ranges = _buildSectionRanges();
  const map = {};
  _sections.forEach(def => {
    map[def.id] = {};
    (_budget[def.id]?.rows || []).forEach((row, i) => {
      map[def.id][row.id] = _lineNumForRow(ranges, def.id, i);
    });
  });
  return map;
}

/**
 * Public API for linking purchase-log line items to budget rows.
 * Returns Map<"0001", { lineNum, description, sectionName, sectionId }>
 * Covers every row across all sections in the active template.
 */
export function getBudgetLineMap() {
  _loadTemplate();
  _load();
  const ranges = _buildSectionRanges();
  const map = new Map();
  _sections.forEach(def => {
    (_budget[def.id]?.rows || []).forEach((row, i) => {
      const info = _lineNumForRow(ranges, def.id, i);
      map.set(info.display, {
        lineNum:     info.display,
        description: row.description || '',
        sectionName: _getSectionName(def),
        sectionId:   def.id,
      });
    });
    // Group-level fringe line for each section (e.g. "Group A", "Group B")
    const groupKey = `Group ${def.id}`;
    map.set(groupKey, {
      lineNum:     groupKey,
      description: 'Fringe Report',
      sectionName: _getSectionName(def),
      sectionId:   def.id,
      isFringeLine: true,
    });
  });
  return map;
}

/* ── Actual Contributions Popup ── */

function _showActualPopup(title, contributions, grandTotal, showLineNums = false) {
  _closeActualPopup(); // remove any existing one

  const esc2 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtAmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = contributions.map(c => `
    <tr class="ap-row">
      ${showLineNums ? `<td class="ap-td ap-td--line">${esc2(c.lineNum || '—')}</td>` : ''}
      <td class="ap-td ap-td--folder">${esc2(c.folder)}</td>
      <td class="ap-td ap-td--vendor">${esc2(c.vendor)}</td>
      <td class="ap-td ap-td--amt">${fmtAmt(c.amount)}</td>
    </tr>`).join('');

  const lineNumHeader = showLineNums ? `<th class="ap-th">Line</th>` : '';

  const overlay = document.createElement('div');
  overlay.id        = 'actual-popup-overlay';
  overlay.className = 'actual-popup-overlay';
  overlay.innerHTML = `
    <div class="actual-popup" role="dialog" aria-modal="true">
      <div class="actual-popup-header">
        <span class="actual-popup-title">${esc2(title)}</span>
        <button class="actual-popup-close" id="actual-popup-close" title="Close">✕</button>
      </div>
      <table class="actual-popup-table">
        <thead>
          <tr>
            ${lineNumHeader}
            <th class="ap-th">Folder</th>
            <th class="ap-th">Vendor</th>
            <th class="ap-th ap-th--amt">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="ap-total-row">
            ${showLineNums ? '<td class="ap-td"></td>' : ''}
            <td class="ap-td ap-td--total-label" colspan="2">Total</td>
            <td class="ap-td ap-td--amt ap-td--total">${fmtAmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#actual-popup-close').addEventListener('click', _closeActualPopup);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeActualPopup(); });
  document.addEventListener('keydown', _popupKeyHandler);
}

function _closeActualPopup() {
  document.getElementById('actual-popup-overlay')?.remove();
  document.removeEventListener('keydown', _popupKeyHandler);
}

function _popupKeyHandler(e) {
  if (e.key === 'Escape') _closeActualPopup();
}

/* ── Actuals from Purchase Log ── */
/**
 * Reads approved purchases from localStorage, accumulates amounts by budget
 * line number, and populates _actualsMap and _rowActuals for use during render.
 * Called once at the start of renderBudget() / renderBudgetOverview().
 */
function _buildActualsMap() {
  _actualsMap = new Map();
  _rowActuals = {};
  _fringeActuals = {};

  let purchases = [];
  try {
    // Use the same storage key as data.js (movie-ledger-v2)
    const raw = localStorage.getItem('movie-ledger-v2');
    purchases = raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ }

  purchases
    .filter(p => p.status === 'Approved' && Array.isArray(p.lineItems) && p.lineItems.length > 0)
    .forEach(p => {
      p.lineItems.forEach(li => {
        if (!li.lineItem) return;
        const liVal = String(li.lineItem).trim();

        // "Group X" fringe line codes → route to fringe actuals
        const groupMatch = liVal.match(/^Group\s+([A-Za-z]{1,2})$/i);
        if (groupMatch) {
          const secId  = groupMatch[1].toUpperCase();
          const amount = parseFloat(li.amount) || 0;
          if (!_fringeActuals[secId]) _fringeActuals[secId] = { total: 0, contributions: [] };
          _fringeActuals[secId].total += amount;
          _fringeActuals[secId].contributions.push({ folder: p.folder || '—', vendor: p.vendor || '—', amount });
          return;
        }

        const digits = liVal.replace(/\D/g, '');
        if (!digits) return;
        const padded = digits.padStart(4, '0');
        if (!_actualsMap.has(padded)) {
          _actualsMap.set(padded, { total: 0, contributions: [] });
        }
        const entry  = _actualsMap.get(padded);
        const amount = parseFloat(li.amount) || 0;
        entry.total += amount;
        entry.contributions.push({ folder: p.folder || '—', vendor: p.vendor || '—', amount });
      });
    });

  // Build a per-section, per-row lookup for O(1) access during rendering
  const ranges = _buildSectionRanges();
  _sections.forEach(def => {
    _rowActuals[def.id] = [];
    (_budget[def.id]?.rows || []).forEach((_row, i) => {
      const info   = _lineNumForRow(ranges, def.id, i);
      const padded = info.display;
      const entry  = _actualsMap.get(padded);
      _rowActuals[def.id].push(
        entry ? { padded, total: entry.total, contributions: entry.contributions }
              : { padded, total: 0, contributions: [] }
      );
    });
  });
}

/* ── Format helpers ── */
function _ceil2(n) { return Math.ceil(Math.abs(n) * 100) / 100; }

function _fmt(n) {
  if (n === 0 || n === '' || n == null) return '—';
  return '$' + _ceil2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _fmtVariance(n) {
  if (n === 0) return '—';
  const s = '$' + _ceil2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `<span class="bud-neg">(${s})</span>` : `<span class="bud-pos">${s}</span>`;
}

/* ── Render ── */
function _render() {
  const grandBid    = _grandBid();
  const grandActual = _grandActual();
  const grandVar    = grandActual - grandBid;
  const lineMap     = _buildGlobalLineMap();

  const summaryRows = _sections.map(def => {
    const bid    = _sectionEstimateTotal(def.id);
    const actual = _sectionActualEstimateTotal(def.id);
    return `<tr class="bud-summary-row" data-jump="${def.id}">
      <td class="bud-sum-id">${def.id}</td>
      <td class="bud-sum-name">${esc(_getSectionName(def))}</td>
      <td class="bud-sum-num">${_fmt(bid)}</td>
      <td class="bud-sum-num">${_fmt(actual)}</td>
      <td class="bud-sum-num">${_fmtSecVariance(def.id)}</td>
    </tr>`;
  }).join('');

  /* Q – Insurance and R – Contingency special rows */
  const qBid    = _qBid();
  const qActual = _qActual();
  const qHasAct = _budget.__q?.actual !== '';
  const rBid    = _rBid();
  const rActual = _rActual();
  const rHasAct = _budget.__r?.actual !== '';

  /* Fringe summary per section */
  const fringeSummaryRows = _sections.map(def => {
    const sec  = _budget[def.id];
    const sub  = _sectionSubTotal(def.id);
    const pw   = sub  * ((parseFloat(sec?.pwRate)     || 0) / 100);
    const fr   = sub  * ((parseFloat(sec?.fringeRate) || 0) / 100);
    // Actuals ONLY from approved "Group X" purchases
    const aFr  = _getFringeActual(def.id);
    const tot  = pw + fr;
    const aTot = aFr;
    const hasFringeAct = _hasFringeActual(def.id);
    if (tot === 0 && aTot === 0) return '';
    return `<tr class="bud-fringe-row">
      <td class="bud-sum-id bud-fringe-id">${def.id}</td>
      <td class="bud-sum-name bud-fringe-name">${esc(_getSectionName(def))}</td>
      <td class="bud-sum-num bud-fringe-num">${_fmt(tot)}</td>
      <td class="bud-sum-num bud-fringe-num">${hasFringeAct ? _fmt(aTot) : '—'}</td>
      <td class="bud-sum-num bud-fringe-num">—</td>
    </tr>`;
  }).filter(Boolean).join('');

  const pwfBid    = _totalPWFBid();
  const pwfActual = _totalPWFActual();

  const sectionsHTML = _sections.map(def => _buildSection(def, lineMap)).join('');

  _container.innerHTML = `
    <section class="bud-section">
      <div class="bud-toolbar">
        <button class="btn btn--ghost btn--sm" id="bud-back-overview" title="Back to Budget Overview">← Overview</button>
        <h2>Production Budget · Line Items</h2>
        <div class="bud-toolbar-actions">
          <button class="btn btn--ghost btn--sm${_isBidLocked() ? ' bud-lock-active' : ''}" id="bud-toggle-lock" title="${_isBidLocked() ? 'Unlock bid to allow editing' : 'Lock bid to protect values'}">${_isBidLocked() ? '🔒 Unlock Bid' : '🔓 Lock Bid'}</button>
          <button class="btn btn--ghost btn--sm${_showEst ? ' bud-est-active' : ''}" id="bud-toggle-est">${_showEst ? 'Hide Estimates' : 'Show Estimates'}</button>
          <button class="btn btn--ghost btn--sm" id="bud-act-fringes">Actualize Fringes</button>
          <button class="btn btn--ghost btn--sm" id="bud-expand-all">Expand All</button>
          <button class="btn btn--ghost btn--sm" id="bud-collapse-all">Collapse All</button>
        </div>
      </div>

      <div class="bud-scroll-wrap">

        <!-- Cost Summary -->
        <div class="bud-summary-card">
          <div class="bud-summary-header">
            <span class="bud-summary-title">PRODUCTION COST SUMMARY</span>
            <div class="bud-grand-totals">
              <span class="bud-grand-item">
                <span class="bud-grand-label">BID TOTAL</span>
                <span class="bud-grand-value" id="bud-grand-bid">${_fmt(grandBid)}</span>
              </span>
              <span class="bud-grand-item">
                <span class="bud-grand-label">ACTUAL</span>
                <span class="bud-grand-value" id="bud-grand-actual">${_fmt(grandActual)}</span>
              </span>
              <span class="bud-grand-item">
                <span class="bud-grand-label">VARIANCE</span>
                <span class="bud-grand-value" id="bud-grand-var">${_fmtVariance(grandVar)}</span>
              </span>
            </div>
          </div>
          <div class="bud-sum-table-wrap">
          <table class="bud-sum-table">
            <thead>
              <tr>
                <th class="bud-sum-th bud-sum-th--id"></th>
                <th class="bud-sum-th bud-sum-th--name">CATEGORY</th>
                <th class="bud-sum-th bud-sum-th--num">BID TOTAL</th>
                <th class="bud-sum-th bud-sum-th--num">ACTUAL</th>
                <th class="bud-sum-th bud-sum-th--num">VARIANCE</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows}
              <!-- Q – Insurance -->
              <tr class="bud-summary-row bud-qr-row" id="bud-sum-q-row">
                <td class="bud-sum-id bud-qr-id">Q</td>
                <td class="bud-sum-name bud-qr-name">Insurance</td>
                <td class="bud-sum-num bud-qr-cell">
                  <div class="bud-cell bud-qr-input${_isBidLocked() ? ' bud-cell--locked' : ''}" ${_isBidLocked() ? '' : 'contenteditable="plaintext-only"'} id="bud-q-amount" title="Enter insurance amount">${esc(_budget.__q?.amount || '')}</div>
                </td>
                <td class="bud-sum-num bud-qr-cell">
                  <div class="bud-cell bud-qr-input" contenteditable="plaintext-only" id="bud-q-actual" title="Enter actual insurance cost">${esc(_budget.__q?.actual || '')}</div>
                </td>
                <td class="bud-sum-num" id="bud-q-var">${qHasAct ? _fmtVariance(qActual - qBid) : '—'}</td>
              </tr>
              <!-- R – Contingency -->
              <tr class="bud-summary-row bud-qr-row" id="bud-sum-r-row">
                <td class="bud-sum-id bud-qr-id">R</td>
                <td class="bud-sum-name bud-qr-name">
                  Contingency
                  <span class="bud-qr-rate-wrap">
                    <input class="bud-qr-rate-input" type="number" min="0" max="100" step="0.1"
                      id="bud-r-rate" value="${esc(_budget.__r?.rate || '')}" placeholder="0" ${_isBidLocked() ? 'disabled' : ''}>%
                    <span class="bud-qr-rate-label">of A–${_sections[_sections.length - 1].id}</span>
                  </span>
                </td>
                <td class="bud-sum-num" id="bud-r-bid">${_fmt(rBid)}</td>
                <td class="bud-sum-num bud-qr-cell">
                  <div class="bud-cell bud-qr-input" contenteditable="plaintext-only" id="bud-r-actual" title="Enter actual contingency cost">${esc(_budget.__r?.actual || '')}</div>
                </td>
                <td class="bud-sum-num" id="bud-r-var">${rHasAct ? _fmtVariance(rActual - rBid) : '—'}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bud-sum-grand-row">
                <td class="bud-sum-id"></td>
                <td class="bud-sum-name" style="font-weight:800;letter-spacing:0.06em;">GRAND TOTAL</td>
                <td class="bud-sum-num" id="bud-grand-bid-tbl">${_fmt(grandBid)}</td>
                <td class="bud-sum-num" id="bud-grand-act-tbl">${_fmt(grandActual)}</td>
                <td class="bud-sum-num" id="bud-grand-var-tbl">${_hasAnyActual() ? _fmtVariance(grandActual - grandBid) : '—'}</td>
              </tr>
              <!-- Fringe Summary — informational only -->
              <tr class="bud-fringe-header-row">
                <td colspan="5" class="bud-fringe-header-cell">
                  P&amp;W &amp; FRINGES SUMMARY
                  <span class="bud-fringe-note">informational — already included in section totals</span>
                </td>
              </tr>
              ${fringeSummaryRows}
              <tr class="bud-fringe-total-row">
                <td class="bud-sum-id"></td>
                <td class="bud-sum-name" style="font-weight:700;">TOTAL P&amp;W &amp; FRINGES</td>
                <td class="bud-sum-num" id="bud-pwf-bid">${_fmt(pwfBid)}</td>
                <td class="bud-sum-num" id="bud-pwf-actual">${_hasAnyActual() ? _fmt(pwfActual) : '—'}</td>
                <td class="bud-sum-num">—</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        <!-- Detail Sections -->
        <div class="bud-detail">
          ${sectionsHTML}
        </div>
      </div>
    </section>
  `;

  _attachListeners(lineMap);
  // Always start at top
  requestAnimationFrame(() => {
    const wrap = _container.querySelector('.bud-scroll-wrap');
    if (wrap) wrap.scrollTop = 0;
  });
}

function _buildSection(def, lineMap) {
  const sec        = _budget[def.id];
  const collapsed  = sec.collapsed;
  const pwRate     = parseFloat(sec.pwRate)     || 0;
  const fringeRate = parseFloat(sec.fringeRate) || 0;
  const isLabor    = def.type === 'labor';
  const hasActual  = _sectionHasActual(def.id);

  // Column counts: # | btn | desc | no | days | rate | [ot15 | ot2 | ot25] | bid | actual | var
  // Labor: 12 cols  Expense: 9 cols
  const tfootSpan  = isLabor ? 9 : 6;
  // Frozen label spans first 3 cols (#, btn, desc); remaining middle cols get empty spacer cells
  const midSpacers = Array(tfootSpan - 3).fill('<td class="bud-tfoot-spacer"></td>').join('');

  const rowsHTML = sec.rows.map((row, ri) => {
    const lineInfo = lineMap[def.id][row.id];
    return _buildRow(def, row, ri, lineInfo);
  }).join('');

  const subTotal      = _sectionSubTotal(def.id);
  const pwAmount      = subTotal * (pwRate / 100);
  const fringeAmount  = subTotal * (fringeRate / 100);
  const ratesBid      = pwAmount + fringeAmount;
  const estimateTotal = subTotal + ratesBid;
  const actSub        = _sectionActualSubTotal(def.id);
  // P&W+Fringe actuals ONLY from approved "Group X" purchases — never percentage-based
  const ratesAct      = _getFringeActual(def.id);
  const actTotal      = actSub + ratesAct;
  const varSub        = actSub   - subTotal;
  const ratesVar      = ratesAct - ratesBid;
  const varTotal      = actTotal - estimateTotal;
  // Estimate scratch totals
  const estSub        = _sectionEstSubTotal(def.id);
  const estRates      = estSub * ((pwRate + fringeRate) / 100);
  const estTotal      = estSub + estRates;
  // Blank est cells for tfoot rows that only show totals in the EST. TOTAL column
  const _estBlanks    = isLabor ? 6 : 3;
  const estTfootBlanks= _showEst ? Array(_estBlanks).fill('<td class="bud-tfoot-num bud-est-col"></td>').join('') : '';
  const estTfootSubCell   = _showEst ? `<td class="bud-tfoot-num bud-est-col bud-sec-estsub"   data-sec="${def.id}">${_fmt(estSub)}</td>`   : '';
  const estTfootRatesCell = _showEst ? `<td class="bud-tfoot-num bud-est-col bud-sec-ratesest" data-sec="${def.id}">${_fmt(estRates)}</td>` : '';
  const estTfootTotalCell = _showEst ? `<td class="bud-tfoot-num bud-est-col bud-sec-esttotal" data-sec="${def.id}">${_fmt(estTotal)}</td>` : '';

  // Build thead — labor always 2-row (OVERTIME group); expense 1-row when est hidden, 2-row when shown
  const estLaborGroup  = _showEst ? `<th class="bud-th bud-th--est-group" colspan="7">ESTIMATE</th>` : '';
  const estExpenseGroup= _showEst ? `<th class="bud-th bud-th--est-group" colspan="4">ESTIMATE</th>` : '';
  const estLaborCols   = _showEst ? `
        <th class="bud-th bud-th--num bud-th--est">DAYS/WKS</th>
        <th class="bud-th bud-th--num bud-th--est">X</th>
        <th class="bud-th bud-th--num bud-th--est">RATE</th>
        <th class="bud-th bud-th--num bud-th--est bud-th--ot">1.5x</th>
        <th class="bud-th bud-th--num bud-th--est bud-th--ot">2x</th>
        <th class="bud-th bud-th--num bud-th--est bud-th--ot">2.5x</th>
        <th class="bud-th bud-th--num bud-th--est bud-th--est-total">EST. TOTAL</th>` : '';
  const estExpenseCols = _showEst ? `
        <th class="bud-th bud-th--num bud-th--est">DAYS/WKS</th>
        <th class="bud-th bud-th--num bud-th--est">X</th>
        <th class="bud-th bud-th--num bud-th--est">RATE</th>
        <th class="bud-th bud-th--num bud-th--est bud-th--est-total">EST. TOTAL</th>` : '';
  const rs = _showEst ? ' rowspan="2"' : ''; // rowspan needed when est cols add a 2nd header row

  const thead = isLabor ? `
    <thead>
      <tr>
        <th class="bud-th bud-th--linenum" rowspan="2">#</th>
        <th class="bud-th bud-th--detail"  rowspan="2"></th>
        <th class="bud-th bud-th--desc"    rowspan="2">DESCRIPTION</th>
        <th class="bud-th bud-th--num"     rowspan="2">DAYS/WKS</th>
        <th class="bud-th bud-th--num"     rowspan="2">X</th>
        <th class="bud-th bud-th--num"     rowspan="2">RATE</th>
        <th class="bud-th bud-th--ot-group" colspan="3">OVERTIME</th>
        <th class="bud-th bud-th--num"     rowspan="2">BID TOTAL</th>
        ${estLaborGroup}
        <th class="bud-th bud-th--num"     rowspan="2">ACTUAL</th>
        <th class="bud-th bud-th--num"     rowspan="2">VARIANCE</th>
      </tr>
      <tr>
        <th class="bud-th bud-th--num bud-th--ot">1.5x</th>
        <th class="bud-th bud-th--num bud-th--ot">2x</th>
        <th class="bud-th bud-th--num bud-th--ot">2.5x</th>
        ${estLaborCols}
      </tr>
    </thead>` : `
    <thead>
      <tr>
        <th class="bud-th bud-th--linenum"${rs}>#</th>
        <th class="bud-th bud-th--detail" ${rs}></th>
        <th class="bud-th bud-th--desc"   ${rs}>DESCRIPTION</th>
        <th class="bud-th bud-th--num"    ${rs}>DAYS/WKS</th>
        <th class="bud-th bud-th--num"    ${rs}>X</th>
        <th class="bud-th bud-th--num"    ${rs}>RATE</th>
        <th class="bud-th bud-th--num"    ${rs}>BID TOTAL</th>
        ${estExpenseGroup}
        <th class="bud-th bud-th--num"    ${rs}>ACTUAL</th>
        <th class="bud-th bud-th--num"    ${rs}>VARIANCE</th>
      </tr>
      ${_showEst ? `<tr>${estExpenseCols}</tr>` : ''}
    </thead>`;

  const tfoot = `
    <tfoot>
      <tr class="bud-tfoot-row">
        <td colspan="3" class="bud-tfoot-label">Subtotals</td>
        ${midSpacers}
        <td class="bud-tfoot-num bud-sec-subtotal-bid" data-sec="${def.id}">${_fmt(subTotal)}</td>
        ${estTfootBlanks}${estTfootSubCell}
        <td class="bud-tfoot-num bud-sec-subtotal-act${hasActual ? ' bud-td--actual-clickable' : ''}" data-sec="${def.id}" title="${hasActual ? 'Click to see contributing purchases' : ''}">${hasActual ? _fmt(actSub) : '—'}</td>
        <td class="bud-tfoot-num bud-sec-subtotal-var" data-sec="${def.id}">${hasActual ? _fmtVariance(varSub) : '—'}</td>
      </tr>
      <tr class="bud-tfoot-row bud-tfoot-rate-row">
        <td colspan="3" class="bud-tfoot-label">
          <div class="bud-rates-inner">
            <span class="bud-group-code">Group ${def.id}</span>
            <span class="bud-rate-label">P&amp;W</span><input class="bud-rate-input" type="number" min="0" max="100" step="0.5" data-sec="${def.id}" data-field="pwRate" value="${pwRate}" title="P&amp;W %" ${_isGroupLocked(def.id) ? 'disabled' : ''}><span class="bud-rate-pct">%</span>
            <span class="bud-rate-divider">·</span>
            <span class="bud-rate-label">Fringes</span><input class="bud-rate-input" type="number" min="0" max="100" step="0.5" data-sec="${def.id}" data-field="fringeRate" value="${fringeRate}" title="Fringes %" ${_isGroupLocked(def.id) ? 'disabled' : ''}><span class="bud-rate-pct">%</span>
          </div>
        </td>
        ${midSpacers}
        <td class="bud-tfoot-num bud-sec-rates-bid" data-sec="${def.id}">${_fmt(ratesBid)}</td>
        ${estTfootBlanks}${estTfootRatesCell}
        <td class="bud-tfoot-num bud-sec-rates-act" data-sec="${def.id}">${_hasFringeActual(def.id) ? _fmt(ratesAct) : '—'}</td>
        <td class="bud-tfoot-num bud-sec-rates-var" data-sec="${def.id}">${_hasFringeActual(def.id) ? _fmtVariance(ratesVar) : '—'}</td>
      </tr>
      <tr class="bud-tfoot-row bud-tfoot-estimate">
        <td colspan="3" class="bud-tfoot-label bud-tfoot-est-label">Subtotal ${def.id}</td>
        ${midSpacers}
        <td class="bud-tfoot-num bud-sec-est-bid" data-sec="${def.id}">${_fmt(estimateTotal)}</td>
        ${estTfootBlanks}${estTfootTotalCell}
        <td class="bud-tfoot-num bud-sec-est-act" data-sec="${def.id}">${_fmt(actTotal)}</td>
        <td class="bud-tfoot-num bud-sec-est-var" data-sec="${def.id}">${hasActual ? _fmtVariance(varTotal) : '—'}</td>
      </tr>
    </tfoot>`;

  return `
    <div class="bud-sec" id="bud-sec-${def.id}">
      <div class="bud-sec-header" data-sec="${def.id}">
        <span class="bud-sec-toggle">${collapsed ? '▶' : '▼'}</span>
        <span class="bud-sec-label"><strong>${def.id}</strong> · <span class="bud-sec-name${_isGroupLocked(def.id) ? ' bud-sec-name--locked' : ''}" ${_isGroupLocked(def.id) ? '' : 'contenteditable="plaintext-only"'} data-sec="${def.id}">${esc(_getSectionName(def))}</span></span>
        <span class="bud-sec-totals">
          <span class="bud-sec-total-item">BID <span class="bud-sec-bid" data-sec="${def.id}">${_fmt(estimateTotal)}</span></span>
          <span class="bud-sec-total-item">ACTUAL <span class="bud-sec-actual" data-sec="${def.id}">${_fmt(actTotal)}</span></span>
          <span class="bud-sec-total-item">VAR <span class="bud-sec-var" data-sec="${def.id}">${_fmtSecVariance(def.id)}</span></span>
        </span>
        <button class="btn btn--ghost btn--sm bud-add-row" data-sec="${def.id}" title="Add row">+ Row</button>
      </div>
      <div class="bud-sec-body${collapsed ? ' bud-hidden' : ''}">
        <table class="bud-table" data-sec="${def.id}" data-type="${def.type}">
          ${thead}
          <tbody data-sec="${def.id}">${rowsHTML}</tbody>
          ${tfoot}
        </table>
      </div>
    </div>
  `;
}

function _buildRow(def, row, ri, lineInfo) {
  const isLabor     = def.type === 'labor';
  const bid         = _calcRowBid(def, row);
  const hasSubLines = row.subLines && row.subLines.length > 0;
  const lineNumStr  = lineInfo?.display ?? _fmt4(ri + 1);
  const isAdded     = lineInfo?.isAdded ?? false;
  const detailIcon  = hasSubLines ? '●' : '⊕';
  const rowLocked   = _isRowLocked(row.id);
  const bidLocked   = _isBidLocked();
  const isPostLockRow = bidLocked && !rowLocked; // row added after lock
  const ce = rowLocked ? '' : 'contenteditable="plaintext-only"'; // conditional contenteditable for bid fields
  const ceDesc = rowLocked ? '' : 'contenteditable="plaintext-only"'; // description also locked for existing rows

  const noCell = hasSubLines
    ? `<td class="bud-td bud-td--num bud-td--readonly">${row.subLines.length} sub</td>`
    : `<td class="bud-td bud-td--num${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="no">${esc(row.no)}</div></td>`;

  const daysCell = hasSubLines
    ? `<td class="bud-td bud-td--num bud-td--readonly">—</td>`
    : `<td class="bud-td bud-td--num${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="days">${esc(row.days)}</div></td>`;

  const rateCell = hasSubLines
    ? `<td class="bud-td bud-td--num bud-td--readonly">—</td>`
    : `<td class="bud-td bud-td--num${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="rate">${esc(row.rate)}</div></td>`;

  // OT columns — labor sections only
  let otCells = '';
  if (isLabor) {
    if (hasSubLines) {
      otCells = `<td class="bud-td bud-td--num bud-td--readonly">—</td>
                 <td class="bud-td bud-td--num bud-td--readonly">—</td>
                 <td class="bud-td bud-td--num bud-td--readonly">—</td>`;
    } else {
      otCells = `
        <td class="bud-td bud-td--num bud-td--ot${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="ot15">${esc(row.ot15)}</div></td>
        <td class="bud-td bud-td--num bud-td--ot${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="ot2">${esc(row.ot2)}</div></td>
        <td class="bud-td bud-td--num bud-td--ot${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ce} data-sec="${def.id}" data-ri="${ri}" data-field="ot25">${esc(row.ot25)}</div></td>`;
    }
  }

  // Estimate scratch cells (only rendered when _showEst is true)
  let estCells = '';
  if (_showEst) {
    const est = _calcRowEst(def, row);
    if (isLabor) {
      estCells = `
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eDays">${esc(row.eDays)}</div></td>
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eNo">${esc(row.eNo)}</div></td>
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eRate">${esc(row.eRate)}</div></td>
        <td class="bud-td bud-td--num bud-est-col bud-td--ot"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eOt15">${esc(row.eOt15)}</div></td>
        <td class="bud-td bud-td--num bud-est-col bud-td--ot"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eOt2">${esc(row.eOt2)}</div></td>
        <td class="bud-td bud-td--num bud-est-col bud-td--ot"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eOt25">${esc(row.eOt25)}</div></td>
        <td class="bud-td bud-td--num bud-est-col bud-td--est-total" data-sec="${def.id}" data-ri="${ri}">${_fmt(est)}</td>`;
    } else {
      estCells = `
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eDays">${esc(row.eDays)}</div></td>
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eNo">${esc(row.eNo)}</div></td>
        <td class="bud-td bud-td--num bud-est-col"><div class="bud-cell bud-est-cell" contenteditable="plaintext-only" data-sec="${def.id}" data-ri="${ri}" data-field="eRate">${esc(row.eRate)}</div></td>
        <td class="bud-td bud-td--num bud-est-col bud-td--est-total" data-sec="${def.id}" data-ri="${ri}">${_fmt(est)}</td>`;
    }
  }

  // Computed actual from approved purchase log (read-only)
  const rowActualData = _rowActuals[def.id]?.[ri] || { padded: lineNumStr, total: 0, contributions: [] };
  const hasRowActual  = rowActualData.contributions.length > 0;
  const actualDisplay = hasRowActual ? _fmt(rowActualData.total) : '—';

  // Approved overage marker for post-lock rows
  const overageBtn = isPostLockRow
    ? `<button class="bud-overage-btn${row.approvedOverage ? ' bud-overage-btn--active' : ''}" data-sec="${def.id}" data-ri="${ri}" title="${row.approvedOverage ? 'Approved Overage (click to remove)' : 'Mark as Approved Overage'}">${row.approvedOverage ? '✓' : '○'}</button>`
    : '';
  // Hide delete button for locked rows; still show for added rows that are NOT locked
  const showDelete = isAdded && !rowLocked;

  const parentRow = `<tr class="bud-row${hasSubLines ? ' bud-row--has-subs' : ''}${isAdded ? ' bud-row--added' : ''}${rowLocked ? ' bud-row--locked' : ''}${row.approvedOverage ? ' bud-row--overage' : ''}" data-sec="${def.id}" data-ri="${ri}" data-row-id="${row.id}">
    <td class="bud-td bud-td--linenum">${lineNumStr}${showDelete ? `<button class="bud-del-row-btn" data-sec="${def.id}" data-ri="${ri}" title="Delete added row">✕</button>` : ''}${overageBtn}</td>
    <td class="bud-td bud-td--detail">
      <button class="bud-detail-btn${hasSubLines ? ' bud-detail-btn--filled' : ''}" data-sec="${def.id}" data-ri="${ri}" title="${hasSubLines ? 'Edit sub-lines' : 'Add detail'}">${detailIcon}</button>
    </td>
    <td class="bud-td bud-td--desc${rowLocked ? ' bud-td--bid-locked' : ''}"><div class="bud-cell${rowLocked ? ' bud-cell--locked' : ''}" ${ceDesc} data-sec="${def.id}" data-ri="${ri}" data-field="description">${esc(row.description)}</div></td>
    ${daysCell}${noCell}${rateCell}${otCells}
    <td class="bud-td bud-td--num bud-td--bid" data-sec="${def.id}" data-ri="${ri}">${_fmt(bid)}</td>
    ${estCells}
    <td class="bud-td bud-td--num bud-td--actual-locked${hasRowActual ? ' bud-td--actual-clickable' : ''}"
        data-sec="${def.id}" data-ri="${ri}" data-linenum="${rowActualData.padded}"
        title="${hasRowActual ? 'Click to see contributing purchases' : 'Populated from approved purchases'}">
      ${actualDisplay}
    </td>
    <td class="bud-td bud-td--num bud-td--var" data-sec="${def.id}" data-ri="${ri}">${_fmtRowVariance(bid, rowActualData.total, hasRowActual)}</td>
  </tr>`;

  // Inline sub-rows (shown when sub-lines exist)
  let subRowsHTML = '';
  if (hasSubLines) {
    subRowsHTML = row.subLines.map(sl => _buildInlineSubRow(sl, isLabor, row.baseHours)).join('');
  }

  return parentRow + subRowsHTML;
}

function _buildInlineSubRow(sl, isLabor, baseHours) {
  const amt     = _calcSubLineTotal(sl, isLabor, baseHours);
  const noVal   = sl.no   || '—';
  const daysVal = sl.days || '—';
  const rateVal = sl.rate ? '$' + parseFloat(sl.rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—';

  let otCells = '';
  if (isLabor) {
    otCells = `
      <td class="bud-td bud-td--num bud-subrow-cell">${sl.ot15 || '—'}</td>
      <td class="bud-td bud-td--num bud-subrow-cell">${sl.ot2  || '—'}</td>
      <td class="bud-td bud-td--num bud-subrow-cell">${sl.ot25 || '—'}</td>`;
  }

  const estBlankCount = _showEst ? (isLabor ? 7 : 4) : 0;
  const estSubBlanks  = Array(estBlankCount).fill('<td class="bud-td bud-est-col"></td>').join('');

  return `<tr class="bud-subrow">
    <td class="bud-td bud-td--linenum"></td>
    <td class="bud-td bud-td--detail"></td>
    <td class="bud-td bud-subrow-desc">↳ ${esc(sl.description || 'Sub-line')}</td>
    <td class="bud-td bud-td--num bud-subrow-cell">${daysVal}</td>
    <td class="bud-td bud-td--num bud-subrow-cell">${noVal}</td>
    <td class="bud-td bud-td--num bud-subrow-cell">${rateVal}</td>
    ${otCells}
    <td class="bud-td bud-td--num bud-subrow-bid">${_fmt(amt)}</td>
    ${estSubBlanks}
    <td class="bud-td"></td>
    <td class="bud-td"></td>
  </tr>`;
}

/* ── Modal ── */
function _openModal(secId, ri) {
  const def = _sections.find(d => d.id === secId);
  const sec = _budget[secId];
  if (!def || !sec) return;
  const row = sec.rows[ri];
  if (!row) return;

  _modalOpen = { secId, ri };
  const isLabor = def.type === 'labor';

  // Find global line number
  const lineMap = _buildGlobalLineMap();
  const globalNum = lineMap[secId]?.[row.id] ?? (ri + 1);

  const colHeaders = isLabor
    ? `<th class="bud-sub-th">DESCRIPTION</th>
       <th class="bud-sub-th bud-sub-th--num">DAYS/WKS</th>
       <th class="bud-sub-th bud-sub-th--num">X</th>
       <th class="bud-sub-th bud-sub-th--num">RATE</th>
       <th class="bud-sub-th bud-sub-th--num">1.5x (hrs)</th>
       <th class="bud-sub-th bud-sub-th--num">2x</th>
       <th class="bud-sub-th bud-sub-th--num">2.5x</th>
       <th class="bud-sub-th bud-sub-th--num">AMOUNT</th>
       <th class="bud-sub-th bud-sub-th--del"></th>`
    : `<th class="bud-sub-th">DESCRIPTION</th>
       <th class="bud-sub-th bud-sub-th--num">DAYS/WKS</th>
       <th class="bud-sub-th bud-sub-th--num">X</th>
       <th class="bud-sub-th bud-sub-th--num">RATE</th>
       <th class="bud-sub-th bud-sub-th--num">AMOUNT</th>
       <th class="bud-sub-th bud-sub-th--del"></th>`;

  if (!row.subLines) row.subLines = [];
  if (row.baseHours == null) row.baseHours = 8;

  const subRowsHTML = row.subLines.map((sl, sli) => _buildSubRow(sl, sli, isLabor, row.baseHours)).join('');
  const subTotal    = row.subLines.reduce((s, sl) => s + _calcSubLineTotal(sl, isLabor, row.baseHours), 0);

  const baseHrsSelect = isLabor ? `
    <label class="bud-base-hrs-label">Base Hours:
      <select class="bud-base-hrs-select" id="bud-base-hrs">
        <option value="8"  ${row.baseHours == 8  ? 'selected' : ''}>8 hrs</option>
        <option value="10" ${row.baseHours == 10 ? 'selected' : ''}>10 hrs</option>
        <option value="12" ${row.baseHours == 12 ? 'selected' : ''}>12 hrs</option>
        <option value="14" ${row.baseHours == 14 ? 'selected' : ''}>14 hrs</option>
      </select>
    </label>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'bud-modal-overlay';
  overlay.id        = 'bud-modal-overlay';
  overlay.innerHTML = `
    <div class="bud-modal" role="dialog" aria-modal="true">
      <div class="bud-modal-header">
        <span class="bud-modal-title">DETAIL — ${_fmt4(globalNum)}: ${esc(row.description)}</span>
        ${baseHrsSelect}
        <button class="bud-modal-close btn btn--ghost btn--sm" id="bud-modal-close">✕</button>
      </div>
      <div class="bud-modal-body">
        <table class="bud-subline-table">
          <thead><tr>${colHeaders}</tr></thead>
          <tbody id="bud-subline-tbody">${subRowsHTML}</tbody>
        </table>
        <button class="btn btn--ghost btn--sm bud-add-subline" id="bud-add-subline" style="margin-top:8px">+ Add Line</button>
      </div>
      <div class="bud-modal-footer">
        <div class="bud-modal-footer-info">
          <span class="bud-modal-subtotal-label">Sub-Line Total:</span>
          <span class="bud-modal-subtotal-val" id="bud-modal-subtotal">${_fmt(subTotal)}</span>
          <span class="bud-modal-footnote">This total will be used as the Bid Total for this line on the main budget.</span>
        </div>
        <button class="btn btn--primary" id="bud-modal-save">Save &amp; Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _attachModalListeners(overlay, secId, ri, isLabor);
}

function _buildSubRow(sl, sli, isLabor, baseHours) {
  const amt = _calcSubLineTotal(sl, isLabor, baseHours);
  if (isLabor) {
    return `<tr class="bud-subline-row" data-sli="${sli}">
      <td class="bud-sub-td"><div class="bud-sub-cell" contenteditable="plaintext-only" data-sli="${sli}" data-field="description">${esc(sl.description)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="days">${esc(sl.days)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="no">${esc(sl.no)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="rate">${esc(sl.rate)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="ot15">${esc(sl.ot15)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="ot2">${esc(sl.ot2)}</div></td>
      <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="ot25">${esc(sl.ot25)}</div></td>
      <td class="bud-sub-td bud-sub-td--num bud-sub-amt" data-sli="${sli}">${_fmt(amt)}</td>
      <td class="bud-sub-td bud-sub-td--del"><button class="bud-sub-del btn btn--ghost btn--sm" data-sli="${sli}" title="Remove">✕</button></td>
    </tr>`;
  }
  return `<tr class="bud-subline-row" data-sli="${sli}">
    <td class="bud-sub-td"><div class="bud-sub-cell" contenteditable="plaintext-only" data-sli="${sli}" data-field="description">${esc(sl.description)}</div></td>
    <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="days">${esc(sl.days)}</div></td>
    <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="no">${esc(sl.no)}</div></td>
    <td class="bud-sub-td bud-sub-td--num"><div class="bud-sub-cell bud-sub-num" contenteditable="plaintext-only" data-sli="${sli}" data-field="rate">${esc(sl.rate)}</div></td>
    <td class="bud-sub-td bud-sub-td--num bud-sub-amt" data-sli="${sli}">${_fmt(amt)}</td>
    <td class="bud-sub-td bud-sub-td--del"><button class="bud-sub-del btn btn--ghost btn--sm" data-sli="${sli}" title="Remove">✕</button></td>
  </tr>`;
}

function _attachModalListeners(overlay, secId, ri, isLabor) {
  const row = _budget[secId].rows[ri];

  function closeModal() {
    _save();
    overlay.remove();
    _modalOpen = null;
    // Rerender section to reflect subline changes
    _rerenderSection(secId);
    _updateSummaryRow(secId);
    _updateGrandTotals();
  }

  overlay.querySelector('#bud-modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#bud-modal-save').addEventListener('click', closeModal);
  // Click on backdrop closes
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  function refreshSublineTotal() {
    if (!row.subLines) row.subLines = [];
    const total = row.subLines.reduce((s, sl) => s + _calcSubLineTotal(sl, isLabor, row.baseHours), 0);
    const el = overlay.querySelector('#bud-modal-subtotal');
    if (el) el.textContent = _fmt(total);
  }

  // Base hours selector (labor only)
  if (isLabor) {
    const baseHrsEl = overlay.querySelector('#bud-base-hrs');
    if (baseHrsEl) {
      baseHrsEl.addEventListener('change', () => {
        row.baseHours = parseInt(baseHrsEl.value, 10);
        // Re-render all sub-line amounts with updated base hours
        const tbody = overlay.querySelector('#bud-subline-tbody');
        tbody.innerHTML = row.subLines.map((sl, i) => _buildSubRow(sl, i, isLabor, row.baseHours)).join('');
        _attachSubRowListeners(overlay, row, isLabor, refreshSublineTotal);
        refreshSublineTotal();
      });
    }
  }

  overlay.querySelector('#bud-add-subline').addEventListener('click', () => {
    if (!row.subLines) row.subLines = [];
    const newSl = _blankSubLine(isLabor);
    row.subLines.push(newSl);
    const sli   = row.subLines.length - 1;
    const tbody = overlay.querySelector('#bud-subline-tbody');
    tbody.insertAdjacentHTML('beforeend', _buildSubRow(newSl, sli, isLabor, row.baseHours));
    // Attach listeners for new row
    _attachSubRowListeners(overlay, row, isLabor, refreshSublineTotal);
  });

  _attachSubRowListeners(overlay, row, isLabor, refreshSublineTotal);
}

function _attachSubRowListeners(overlay, row, isLabor, refreshSublineTotal) {
  // Re-attach to all cells (idempotent — use replace-with-clone trick)
  overlay.querySelectorAll('.bud-sub-cell').forEach(cell => {
    const fresh = cell.cloneNode(true);
    cell.replaceWith(fresh);
  });
  overlay.querySelectorAll('.bud-sub-cell').forEach(cell => {
    cell.addEventListener('blur', e => {
      const sli   = parseInt(cell.dataset.sli, 10);
      const field = cell.dataset.field;
      if (!row.subLines?.[sli]) return;
      row.subLines[sli][field] = cell.textContent.trim();
      // Update that row's amount cell
      const amt = _calcSubLineTotal(row.subLines[sli], isLabor, row.baseHours);
      const amtEl = overlay.querySelector(`.bud-sub-amt[data-sli="${sli}"]`);
      if (amtEl) amtEl.textContent = _fmt(amt);
      refreshSublineTotal();
    });
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      if (e.key === 'Escape') cell.blur();
    });
    cell.addEventListener('focus', () => {
      const r = document.createRange(); r.selectNodeContents(cell);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });

  overlay.querySelectorAll('.bud-sub-del').forEach(btn => {
    const freshBtn = btn.cloneNode(true);
    btn.replaceWith(freshBtn);
  });
  overlay.querySelectorAll('.bud-sub-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const sli = parseInt(btn.dataset.sli, 10);
      if (!row.subLines) return;
      row.subLines.splice(sli, 1);
      // Re-render all subline rows
      const tbody = overlay.querySelector('#bud-subline-tbody');
      tbody.innerHTML = row.subLines.map((sl, i) => _buildSubRow(sl, i, isLabor, row.baseHours)).join('');
      _attachSubRowListeners(overlay, row, isLabor, refreshSublineTotal);
      refreshSublineTotal();
    });
  });
}

/* ── Listeners ── */
function _attachListeners(lineMap) {
  _container.querySelector('#bud-back-overview')?.addEventListener('click', () => {
    window.location.hash = '#budget';
  });

  /* ── Q/R special rows ── */
  const _wireQR = (id, storeKey, field) => {
    const el = _container.querySelector(id);
    if (!el) return;
    const isInput = el.tagName === 'INPUT';
    const evName  = isInput ? 'input' : 'blur';
    el.addEventListener(evName, () => {
      _budget[storeKey][field] = isInput ? el.value : el.textContent.trim();
      _save();
      _updateGrandTotals();
    });
    if (!isInput) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      el.addEventListener('focus', () => { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); });
    }
  };
  _wireQR('#bud-q-amount', '__q', 'amount');
  _wireQR('#bud-q-actual', '__q', 'actual');
  _wireQR('#bud-r-rate',   '__r', 'rate');
  _wireQR('#bud-r-actual', '__r', 'actual');

  _container.querySelector('#bud-toggle-lock')?.addEventListener('click', _toggleLock);
  _container.querySelector('#bud-toggle-est').addEventListener('click', () => {
    _showEst = !_showEst;
    _render();
  });
  _container.querySelector('#bud-act-fringes').addEventListener('click', _openFringePopup);
  _container.querySelector('#bud-expand-all').addEventListener('click', () => {
    _sections.forEach(d => { _budget[d.id].collapsed = false; });
    _save(); _render();
  });
  _container.querySelector('#bud-collapse-all').addEventListener('click', () => {
    _sections.forEach(d => { _budget[d.id].collapsed = true; });
    _save(); _render();
  });

  /* Section collapse toggles */
  _container.querySelectorAll('.bud-sec-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.bud-add-row')) return;
      if (e.target.closest('.bud-sec-name')) return; // don't collapse when editing name
      const sec = hdr.dataset.sec;
      _budget[sec].collapsed = !_budget[sec].collapsed;
      _save();
      const body   = _container.querySelector(`#bud-sec-${sec} .bud-sec-body`);
      const toggle = hdr.querySelector('.bud-sec-toggle');
      body.classList.toggle('bud-hidden', _budget[sec].collapsed);
      toggle.textContent = _budget[sec].collapsed ? '▶' : '▼';
    });
  });

  /* Editable section names */
  _container.querySelectorAll('.bud-sec-name').forEach(el => {
    el.addEventListener('blur', () => {
      const sec = el.dataset.sec;
      const newName = el.textContent.trim();
      if (newName) {
        _setSectionName(sec, newName);
        // Update summary row name
        const sumRow = _container.querySelector(`.bud-summary-row[data-jump="${sec}"] .bud-sum-name`);
        if (sumRow) sumRow.textContent = newName;
        // Update fringe summary name
        _container.querySelectorAll(`.bud-fringe-row .bud-fringe-id`).forEach(td => {
          if (td.textContent.trim() === sec) {
            const nameTd = td.nextElementSibling;
            if (nameTd) nameTd.textContent = newName;
          }
        });
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  });

  /* Jump to section from summary */
  _container.querySelectorAll('.bud-summary-row').forEach(row => {
    row.addEventListener('click', () => {
      const el = _container.querySelector(`#bud-sec-${row.dataset.jump}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* Jump from Budget Overview click */
  const jumpSec = sessionStorage.getItem('budget-jump-section');
  if (jumpSec) {
    sessionStorage.removeItem('budget-jump-section');
    // Expand if collapsed
    if (_budget[jumpSec]?.collapsed) {
      _budget[jumpSec].collapsed = false;
      _save();
      const body   = _container.querySelector(`#bud-sec-${jumpSec} .bud-sec-body`);
      const toggle = _container.querySelector(`#bud-sec-${jumpSec} .bud-sec-toggle`);
      if (body)   body.classList.remove('bud-hidden');
      if (toggle) toggle.textContent = '▼';
    }
    // Delay to let layout finish, then scroll the section header to the top
    setTimeout(() => {
      const secEl = _container.querySelector(`#bud-sec-${jumpSec}`);
      if (!secEl) return;
      const scrollWrap = _container.querySelector('.bud-scroll-wrap');
      if (scrollWrap) {
        const wrapRect = scrollWrap.getBoundingClientRect();
        const secRect  = secEl.getBoundingClientRect();
        scrollWrap.scrollTo({ top: scrollWrap.scrollTop + (secRect.top - wrapRect.top), behavior: 'smooth' });
      } else {
        secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  /* Add row */
  _container.querySelectorAll('.bud-add-row').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sec = btn.dataset.sec;
      _budget[sec].rows.push(_blankRow());
      _save(); _rerenderSection(sec);
    });
  });

  /* Delete added row */
  _container.querySelectorAll('.bud-del-row-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sec = btn.dataset.sec;
      const ri  = Number(btn.dataset.ri);
      const desc = _budget[sec].rows[ri]?.description || 'this row';
      if (!confirm(`Delete "${desc}"? This cannot be undone.`)) return;
      _budget[sec].rows.splice(ri, 1);
      _save(); _rerenderSection(sec);
      _updateSummaryRow(sec);
      _updateGrandTotals();
    });
  });

  /* P&W and Fringes rate inputs */
  _container.querySelectorAll('.bud-rate-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const { sec, field } = inp.dataset;
      _budget[sec][field] = parseFloat(inp.value) || 0;
      _save();
      _updateSectionTotals(sec);
      _updateSummaryRow(sec);
      _updateGrandTotals();
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });

  /* Detail (sub-line) buttons */
  _container.querySelectorAll('.bud-detail-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { sec, ri } = btn.dataset;
      _openModal(sec, Number(ri));
    });
  });

  /* Cell edit */
  _container.querySelectorAll('.bud-cell').forEach(cell => {
    cell.addEventListener('blur', _onCellBlur);
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      if (e.key === 'Escape') cell.blur();
    });
    cell.addEventListener('focus', () => {
      const r = document.createRange(); r.selectNodeContents(cell);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });

  /* Approved Overage toggle (event delegation) */
  _container.addEventListener('click', e => {
    const overageBtn = e.target.closest('.bud-overage-btn');
    if (overageBtn) {
      const sec = overageBtn.dataset.sec;
      const ri  = Number(overageBtn.dataset.ri);
      const row = _budget[sec]?.rows[ri];
      if (row) {
        row.approvedOverage = !row.approvedOverage;
        _save();
        _rerenderSection(sec);
      }
      return;
    }
  });

  /* Actual cell click → contribution popup (event delegation — cells are re-rendered) */
  _container.addEventListener('click', e => {
    // Row-level actual cell
    const rowCell = e.target.closest('.bud-td--actual-clickable');
    if (rowCell) {
      const sec = rowCell.dataset.sec;
      const ri  = Number(rowCell.dataset.ri);
      const rowActual = _rowActuals[sec]?.[ri];
      if (rowActual?.contributions.length) {
        _showActualPopup(
          `Line ${rowActual.padded}`,
          rowActual.contributions,
          rowActual.total
        );
      }
      return;
    }

    // Section subtotal actual cell
    const secCell = e.target.closest('.bud-sec-subtotal-act');
    if (secCell) {
      const sec  = secCell.dataset.sec;
      const def  = _sections.find(d => d.id === sec);
      const rows = _rowActuals[sec] || [];
      // Gather all contributions across the section
      const all   = rows.flatMap(r => r.contributions.map(c => ({ ...c, lineNum: r.padded })));
      const total = rows.reduce((s, r) => s + r.total, 0);
      if (all.length) {
        _showActualPopup(`Section ${sec} — ${def?.name || ''}`, all, total, true);
      }
    }
  });
}

/* ── Actualize Fringes Popup ── */

let _fringeFile = null; // temporary file upload

function _openFringePopup() {
  _closeFringePopup();
  _fringeFile = null;

  const fmtAmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today  = new Date().toISOString().slice(0, 10);

  // Gather ALL fringe submissions from the purchase log
  let purchases = [];
  try {
    purchases = JSON.parse(localStorage.getItem('movie-ledger-v2')) || [];
  } catch { /* ignore */ }

  const fringePOs = purchases.filter(p => p.isFringe || p.chargeType === 'Fringes');

  // Summary totals
  const totalBidFringe = _sections.reduce((s, def) => {
    const sec = _budget[def.id];
    return s + _sectionSubTotal(def.id) * ((parseFloat(sec?.fringeRate) || 0) / 100);
  }, 0);
  const totalActFringe = _sections.reduce((s, def) => s + _getFringeActual(def.id), 0);

  // Build log rows
  const logRows = fringePOs.length
    ? fringePOs.map(p => {
        const statusClass = p.status === 'Approved' ? 'af-status--approved'
          : p.status === 'Returned' ? 'af-status--returned'
          : 'af-status--pending';
        return `<tr class="af-entry-row">
          <td class="af-td af-td--date">${esc(p.date || '—')}</td>
          <td class="af-td af-td--vendor">${esc(p.vendor || '—')}</td>
          <td class="af-td af-td--desc">${esc(p.description || '—')}</td>
          <td class="af-td af-td--amt">${fmtAmt(p.amount)}</td>
          <td class="af-td af-td--status"><span class="af-status ${statusClass}">${esc(p.status)}</span></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="af-td af-empty">No fringe submissions yet</td></tr>`;

  const overlay = document.createElement('div');
  overlay.id        = 'af-overlay';
  overlay.className = 'af-overlay';
  overlay.innerHTML = `
    <div class="af-popup" role="dialog" aria-modal="true">
      <div class="af-popup-header">
        <span class="af-popup-title">Actualize Fringes — Audit Report Log</span>
        <button class="af-popup-close" id="af-popup-close" title="Close">✕</button>
      </div>
      <div class="af-popup-body">
        <table class="af-entries-table">
          <thead><tr>
            <th class="af-th">Date</th>
            <th class="af-th">Vendor</th>
            <th class="af-th">Description</th>
            <th class="af-th af-th--amt">Amount</th>
            <th class="af-th">Status</th>
          </tr></thead>
          <tbody>${logRows}</tbody>
        </table>

        <div class="af-add-section">
          <div class="af-add-heading">New Fringe Submission</div>
          <div class="af-add-row">
            <label class="af-upload-label" title="Attach payroll audit report PDF">
              <input type="file" accept=".pdf" class="af-file-input" id="af-file-input" hidden>
              <span class="af-upload-btn">📎</span>
            </label>
            <span class="af-file-name" id="af-file-name">No file</span>
            <input type="date" class="af-input af-input--date" id="af-add-date" value="${today}">
            <input type="text" class="af-input af-input--ref" id="af-add-ref" placeholder="Ref. #">
            <input type="number" class="af-input af-input--amt" id="af-add-amt" placeholder="Amount" step="0.01" min="0">
            <button class="btn btn--primary btn--sm af-add-btn" id="af-add-btn">+ Add</button>
          </div>
        </div>
      </div>
      <div class="af-popup-footer">
        <span class="af-footer-item"><span class="af-footer-label">Total Bid Fringes:</span> <span class="af-footer-val">${fmtAmt(totalBidFringe)}</span></span>
        <span class="af-footer-item"><span class="af-footer-label">Total Actual Fringes:</span> <span class="af-footer-val">${fmtAmt(totalActFringe)}</span></span>
        <span class="af-footer-note">Actuals update when fringe submissions are approved and coded to a Group in the Review window.</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _attachFringePopupListeners(overlay);
}

function _attachFringePopupListeners(overlay) {
  // Close
  overlay.querySelector('#af-popup-close').addEventListener('click', () => { _closeFringePopup(); _render(); });
  document.addEventListener('keydown', _fringePopupKeyHandler);

  // File upload
  overlay.querySelector('#af-file-input').addEventListener('change', function() {
    const file = this.files[0];
    const nameEl = overlay.querySelector('#af-file-name');
    if (file) {
      _fringeFile = file;
      if (nameEl) nameEl.textContent = file.name;
    } else {
      _fringeFile = null;
      if (nameEl) nameEl.textContent = 'No file';
    }
  });

  // Add entry
  overlay.querySelector('#af-add-btn').addEventListener('click', () => {
    const dateVal = overlay.querySelector('#af-add-date').value;
    const refVal  = overlay.querySelector('#af-add-ref').value.trim();
    const amtVal  = parseFloat(overlay.querySelector('#af-add-amt').value) || 0;
    if (amtVal <= 0) { overlay.querySelector('#af-add-amt').focus(); return; }

    // Description per naming convention (no group prefix — coded later in Review)
    const descName = `Fringe Report_${dateVal}_Ref${refVal}_${amtVal.toFixed(2)}`;

    const file = _fringeFile;
    const processAndSave = (receiptUrl) => {
      addPurchase({
        date:        dateVal,
        vendor:      'Payroll',
        description: descName,
        amount:      amtVal,
        method:      'PO',
        chargeType:  'Fringes',
        submittedBy: 'Fringe Actualization',
        status:      'In Review',
        lineItem:    '',
        receiptUrl:  receiptUrl,
        notes:       `Fringe audit report — Ref ${refVal}`,
        isFringe:    true,
      });

      // Re-open to refresh
      _closeFringePopup(true);
      _openFringePopup();
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = ev => processAndSave(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      processAndSave(null);
    }
  });
}

function _closeFringePopup(skipRender) {
  const el = document.getElementById('af-overlay');
  if (el) el.remove();
  document.removeEventListener('keydown', _fringePopupKeyHandler);
  if (!skipRender) _fringeFile = null;
}

function _fringePopupKeyHandler(e) {
  if (e.key === 'Escape') { _closeFringePopup(); _render(); }
}

function _onCellBlur(e) {
  const cell  = e.target;
  const { sec, ri, field } = cell.dataset;
  if (!_budget[sec]?.rows[ri]) return;

  // Actual cells are locked — populated only from approved purchase log entries
  if (field === 'actual') return;

  const val = cell.textContent.trim();
  _budget[sec].rows[Number(ri)][field] = val;
  _save();
  const EST_FIELDS = new Set(['eDays','eNo','eRate','eOt15','eOt2','eOt25']);
  if (EST_FIELDS.has(field)) {
    _updateRowEstCalcs(sec, Number(ri));
    _updateSectionEstTotals(sec);
  } else {
    _updateRowCalcs(sec, Number(ri));
    _updateSectionTotals(sec);
    _updateSummaryRow(sec);
    _updateGrandTotals();
  }
}

/* ── In-place update helpers ── */
function _updateRowCalcs(sec, ri) {
  const def = _sections.find(d => d.id === sec);
  const row = _budget[sec]?.rows[ri];
  if (!def || !row) return;
  const bid        = _calcRowBid(def, row);
  const rowActual  = _rowActuals[sec]?.[ri] || { total: 0, contributions: [] };
  const hasActual  = rowActual.contributions.length > 0;
  const bidEl = _container.querySelector(`.bud-td--bid[data-sec="${sec}"][data-ri="${ri}"]`);
  const varEl = _container.querySelector(`.bud-td--var[data-sec="${sec}"][data-ri="${ri}"]`);
  if (bidEl) bidEl.innerHTML = _fmt(bid);
  if (varEl) varEl.innerHTML = _fmtRowVariance(bid, rowActual.total, hasActual);
}

function _updateRowEstCalcs(sec, ri) {
  if (!_showEst) return;
  const def = _sections.find(d => d.id === sec);
  const row = _budget[sec]?.rows[ri];
  if (!def || !row) return;
  const el = _container.querySelector(`.bud-td--est-total[data-sec="${sec}"][data-ri="${ri}"]`);
  if (el) el.innerHTML = _fmt(_calcRowEst(def, row));
}

function _updateSectionEstTotals(sec) {
  if (!_showEst) return;
  const secData    = _budget[sec];
  const pwRate     = parseFloat(secData?.pwRate)     || 0;
  const fringeRate = parseFloat(secData?.fringeRate) || 0;
  const estSub     = _sectionEstSubTotal(sec);
  const estRates   = estSub * ((pwRate + fringeRate) / 100);
  const estTotal   = estSub + estRates;
  const upd = (sel, val) => { const el = _container.querySelector(sel); if (el) el.innerHTML = val; };
  upd(`.bud-sec-estsub[data-sec="${sec}"]`,    _fmt(estSub));
  upd(`.bud-sec-ratesest[data-sec="${sec}"]`,  _fmt(estRates));
  upd(`.bud-sec-esttotal[data-sec="${sec}"]`,  _fmt(estTotal));
}

function _updateSectionTotals(sec) {
  const subTotal      = _sectionSubTotal(sec);
  const estimateTotal = _sectionEstimateTotal(sec);
  const actSub        = _sectionActualSubTotal(sec);
  const actTotal      = _sectionActualEstimateTotal(sec);
  const secData       = _budget[sec];
  const pwRate        = parseFloat(secData?.pwRate)     || 0;
  const fringeRate    = parseFloat(secData?.fringeRate) || 0;
  const ratesBid     = subTotal * ((pwRate + fringeRate) / 100);
  // P&W+Fringe actuals ONLY from approved "Group X" purchases — never percentage-based
  const ratesAct     = _getFringeActual(sec);
  const hasFringe    = _hasFringeActual(sec);

  const hasActual = _sectionHasActual(sec);
  const varSub    = actSub   - subTotal;
  const ratesVar  = ratesAct - ratesBid;
  const varTotal  = actTotal - estimateTotal;

  const upd = (sel, val) => { const el = _container.querySelector(sel); if (el) el.innerHTML = val; };

  // Section header
  upd(`.bud-sec-bid[data-sec="${sec}"]`,    _fmt(estimateTotal));
  upd(`.bud-sec-actual[data-sec="${sec}"]`, _fmt(actTotal));
  upd(`.bud-sec-var[data-sec="${sec}"]`,    _fmtSecVariance(sec));

  // tfoot row 1 - subtotal
  upd(`.bud-sec-subtotal-bid[data-sec="${sec}"]`, _fmt(subTotal));
  upd(`.bud-sec-subtotal-act[data-sec="${sec}"]`, hasActual ? _fmt(actSub) : '—');
  upd(`.bud-sec-subtotal-var[data-sec="${sec}"]`, hasActual ? _fmtVariance(varSub) : '—');

  // tfoot row 2 - P&W + Fringes (actuals ONLY from approved "Group X" purchases)
  upd(`.bud-sec-rates-bid[data-sec="${sec}"]`, _fmt(ratesBid));
  upd(`.bud-sec-rates-act[data-sec="${sec}"]`, hasFringe ? _fmt(ratesAct) : '—');
  upd(`.bud-sec-rates-var[data-sec="${sec}"]`, hasFringe ? _fmtVariance(ratesVar) : '—');

  // tfoot row 3 - estimate total
  upd(`.bud-sec-est-bid[data-sec="${sec}"]`, _fmt(estimateTotal));
  upd(`.bud-sec-est-act[data-sec="${sec}"]`, _fmt(actTotal));
  upd(`.bud-sec-est-var[data-sec="${sec}"]`, hasActual ? _fmtVariance(varTotal) : '—');
}

function _updateSummaryRow(sec) {
  const bid    = _sectionEstimateTotal(sec);
  const actual = _sectionActualEstimateTotal(sec);
  const vari   = actual - bid;
  const row = _container.querySelector(`.bud-summary-row[data-jump="${sec}"]`);
  if (!row) return;
  // td structure: id | name | bid | actual | var → .bud-sum-num: bid[0] actual[1] var[2]
  const numCells = row.querySelectorAll('.bud-sum-num');
  if (numCells[0]) numCells[0].innerHTML = _fmt(bid);
  if (numCells[1]) numCells[1].innerHTML = _fmt(actual);
  if (numCells[2]) numCells[2].innerHTML = _fmtSecVariance(sec);
}

function _updateGrandTotals() {
  const bid       = _grandBid();
  const actual    = _grandActual();
  const vari      = actual - bid;
  const anyActual = _hasAnyActual();
  const g = id => _container.querySelector(id);
  // Header totals
  if (g('#bud-grand-bid'))    g('#bud-grand-bid').innerHTML    = _fmt(bid);
  if (g('#bud-grand-actual')) g('#bud-grand-actual').innerHTML = _fmt(actual);
  if (g('#bud-grand-var'))    g('#bud-grand-var').innerHTML    = anyActual ? _fmtVariance(vari) : '—';
  // Table grand total row
  if (g('#bud-grand-bid-tbl'))  g('#bud-grand-bid-tbl').innerHTML  = _fmt(bid);
  if (g('#bud-grand-act-tbl'))  g('#bud-grand-act-tbl').innerHTML  = _fmt(actual);
  if (g('#bud-grand-var-tbl'))  g('#bud-grand-var-tbl').innerHTML  = anyActual ? _fmtVariance(vari) : '—';
  // Q row
  const qBid = _qBid(); const qAct = _qActual(); const qHas = _budget.__q?.actual !== '';
  if (g('#bud-q-var')) g('#bud-q-var').innerHTML = qHas ? _fmtVariance(qAct - qBid) : '—';
  // R row (recalc bid since A-P may have changed)
  const rBid = _rBid(); const rAct = _rActual(); const rHas = _budget.__r?.actual !== '';
  if (g('#bud-r-bid')) g('#bud-r-bid').innerHTML = _fmt(rBid);
  if (g('#bud-r-var')) g('#bud-r-var').innerHTML = rHas ? _fmtVariance(rAct - rBid) : '—';
  // Fringe summary
  const pwfBid = _totalPWFBid(); const pwfAct = _totalPWFActual();
  if (g('#bud-pwf-bid'))    g('#bud-pwf-bid').innerHTML    = _fmt(pwfBid);
  if (g('#bud-pwf-actual')) g('#bud-pwf-actual').innerHTML = anyActual ? _fmt(pwfAct) : '—';
}

function _rerenderSection(sec) {
  const def   = _sections.find(d => d.id === sec);
  const secEl = _container.querySelector(`#bud-sec-${sec}`);
  if (!secEl || !def) return;

  const lineMap = _buildGlobalLineMap();
  const newEl   = document.createElement('div');
  newEl.innerHTML = _buildSection(def, lineMap);
  const built = newEl.firstElementChild;
  secEl.replaceWith(built);

  // Reattach listeners for rebuilt section
  built.querySelectorAll('.bud-sec-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.bud-add-row')) return;
      if (e.target.closest('.bud-sec-name')) return;
      const s = hdr.dataset.sec;
      _budget[s].collapsed = !_budget[s].collapsed;
      _save();
      built.querySelector('.bud-sec-body').classList.toggle('bud-hidden', _budget[s].collapsed);
      hdr.querySelector('.bud-sec-toggle').textContent = _budget[s].collapsed ? '▶' : '▼';
    });
  });
  built.querySelectorAll('.bud-sec-name').forEach(el => {
    el.addEventListener('blur', () => {
      const s = el.dataset.sec;
      const newName = el.textContent.trim();
      if (newName) {
        _setSectionName(s, newName);
        const sumRow = _container.querySelector(`.bud-summary-row[data-jump="${s}"] .bud-sum-name`);
        if (sumRow) sumRow.textContent = newName;
      }
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  });
  built.querySelectorAll('.bud-add-row').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = btn.dataset.sec;
      _budget[s].rows.push(_blankRow());
      _save(); _rerenderSection(s);
    });
  });
  built.querySelectorAll('.bud-rate-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const { sec: s, field } = inp.dataset;
      _budget[s][field] = parseFloat(inp.value) || 0;
      _save();
      _updateSectionTotals(s);
      _updateSummaryRow(s);
      _updateGrandTotals();
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });
  built.querySelectorAll('.bud-detail-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { sec: s, ri } = btn.dataset;
      _openModal(s, Number(ri));
    });
  });
  built.querySelectorAll('.bud-cell').forEach(cell => {
    cell.addEventListener('blur', _onCellBlur);
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      if (e.key === 'Escape') cell.blur();
    });
    cell.addEventListener('focus', () => {
      const r = document.createRange(); r.selectNodeContents(cell);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
  // Also need delete-row buttons (not in header but in rows — handled via event delegation on container)
  built.querySelectorAll('.bud-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sec;
      const ri = Number(btn.dataset.ri);
      _budget[s].rows.splice(ri, 1);
      if (_budget[s].rows.length === 0) _budget[s].rows.push(_blankRow());
      _save(); _rerenderSection(s);
    });
  });
  built.querySelectorAll('.bud-del-row-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = btn.dataset.sec;
      const ri = Number(btn.dataset.ri);
      const desc = _budget[s].rows[ri]?.description || 'this row';
      if (!confirm(`Delete "${desc}"? This cannot be undone.`)) return;
      _budget[s].rows.splice(ri, 1);
      _save(); _rerenderSection(s);
      _updateSummaryRow(s);
      _updateGrandTotals();
    });
  });

  _updateSectionTotals(sec);
  _updateSummaryRow(sec);
  _updateGrandTotals();
}

/* ── Utilities ── */
function _uid() { return crypto.randomUUID(); }
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ============================================================
   Budget Overview — Main Menu
   ============================================================ */
const OVERVIEW_KEY = 'movie-ledger-prod-info'; // same as PROD_INFO_KEY

/* ── Top Sheet Print Window ── */
function _openTopSheetPrint(info, sections, budget) {
  const na    = v => (v && String(v).trim()) ? String(v).trim() : 'N/A';
  const money = v => v ? '$' + Math.ceil(v * 100) / 100 .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

  // Format phone as (###) ###-####
  const fmtPhone = v => {
    if (!v) return 'N/A';
    const digits = String(v).replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    return String(v).trim() || 'N/A';
  };

  // Format address into 2 lines: Street / City, State Zip
  const fmtAddr = (street, cityStateZip) => {
    const s = (street || '').trim();
    const c = (cityStateZip || '').trim();
    if (!s && !c) return 'N/A';
    if (s && c) return `${s}<br>${c}`;
    return s || c;
  };
  const fmtMoney = n => {
    if (!n && n !== 0) return '';
    const abs = Math.ceil(Math.abs(n) * 100) / 100;
    return (n < 0 ? '(' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (n < 0 ? ')' : '');
  };

  const grandBid    = sections.reduce((s, d) => s + _sectionEstimateTotal(d.id), 0);
  const grandActual = sections.reduce((s, d) => s + _sectionActualEstimateTotal(d.id), 0);
  const hasAny      = sections.some(d => _sectionHasActual(d.id));

  const logoImg = (key, alt) => info[key]
    ? `<img src="${info[key]}" alt="${alt}" style="max-height:52px;max-width:120px;object-fit:contain;">`
    : '';

  const sectionRows = sections.map((def, i) => {
    const bid    = _sectionEstimateTotal(def.id);
    const actual = _sectionActualEstimateTotal(def.id);
    const hasAct = _sectionHasActual(def.id);
    const varAmt = actual - bid;
    return `<tr>
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">${def.id}</td>
      <td style="border:1px solid #999;padding:2px 8px;">${_getSectionName(def)}</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;">${i + 1}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${bid ? fmtMoney(bid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${hasAct ? fmtMoney(actual) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${hasAct ? fmtMoney(varAmt) : ''}</td>
    </tr>`;
  }).join('');

  /* Q and R rows */
  const pQBid = _qBid(); const pQAct = _qActual(); const pQHas = _budget.__q?.actual !== '';
  const pRBid = _rBid(); const pRAct = _rActual(); const pRHas = _budget.__r?.actual !== '';
  const rRateVal = _budget.__r?.rate || '';
  const lastId = sections[sections.length - 1]?.id || 'P';
  const qrRows = `
    <tr style="background:#f5f5f5;">
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">Q</td>
      <td style="border:1px solid #999;padding:2px 8px;">Insurance</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;"></td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQBid ? fmtMoney(pQBid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQHas ? fmtMoney(pQAct) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQHas ? fmtMoney(pQAct - pQBid) : ''}</td>
    </tr>
    <tr style="background:#f5f5f5;">
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">R</td>
      <td style="border:1px solid #999;padding:2px 8px;">Contingency${rRateVal ? ` (${rRateVal}% of A–${lastId})` : ''}</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;"></td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRBid ? fmtMoney(pRBid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRHas ? fmtMoney(pRAct) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRHas ? fmtMoney(pRAct - pRBid) : ''}</td>
    </tr>`;

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Production Cost Summary</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 24px 28px; position: relative; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
  .h1-subtitle { font-size: 22px; font-weight: 400; margin-bottom: 10px; }
  .top-right-block { position: absolute; top: 24px; right: 28px; text-align: right; font-size: 11px; }
  .top-right-block .tr-date { font-weight: 600; }
  .top-right-block .tr-project { margin-top: 2px; }
  .top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .details-strip { border: 1px solid #888; padding: 5px 8px; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px 20px; }
  .details-strip .info-row { flex: 0 0 auto; margin-bottom: 0; }
  .sub-header { margin-top: 8px; font-size: 9px; font-weight: 700; color: #666; border-top: 1px dashed #ccc; padding-top: 5px; margin-bottom: 3px; }
  .info-box { border: 1px solid #888; padding: 6px 8px; min-height: 130px; }
  .info-row { display: flex; align-items: baseline; margin-bottom: 3px; gap: 4px; }
  .info-row .lbl { min-width: 72px; text-align: right; padding-right: 5px; font-size: 9.5px; color: #444; flex-shrink: 0; }
  .info-row .val { flex: 1; min-height: 13px; font-size: 11px; padding-bottom: 1px; }
  .info-row.days-row { align-items: center; }
  .info-row .val-sm { width: 36px; text-align: center; font-size: 11px; padding: 0 2px; }
  .val--bold { font-weight: 700; }
  .logo-bar { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 6px; }
  .strip { border: 1px solid #888; padding: 5px 8px; margin-bottom: 8px; display: grid; grid-template-columns: auto auto 1fr; gap: 6px 20px; }
  .strip-row { display: flex; align-items: baseline; gap: 4px; }
  .strip-row .lbl { font-size: 10px; color: #444; white-space: nowrap; }
  .strip-row .val { min-width: 100px; min-height: 13px; font-size: 11px; padding: 0 2px; }
  .strip-row .val-sm { width: 36px; text-align: center; font-size: 11px; padding: 0 2px; }
  table.cs { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
  table.cs th { background: #d8d8d8; border: 1px solid #999; padding: 3px 6px; font-weight: 700; text-align: center; }
  table.cs th.left { text-align: left; }
  table.cs .total-row td { border: 1px solid #999; padding: 4px 6px; font-weight: 700; background: #efefef; text-align: right; }
  table.cs .total-row td:first-child { text-align: right; }
  .notes-label { font-size: 10px; font-weight: 700; margin-bottom: 3px; }
  .notes-box { border: 1px solid #888; min-height: 90px; padding: 4px; }
  @media print {
    @page { size: letter portrait; margin: 0.45in 0.4in; }
    body { padding: 0; font-size: 10px; }
    h1 { font-size: 18px; }
    .top-right-block { top: 0; right: 0; }
  }
</style>
</head><body>

<div class="top-right-block">
  <div class="tr-date">${today}</div>
  <div class="tr-project">${na(info.productionName)}</div>
</div>

<h1>Production Cost Summary</h1>
<div class="h1-subtitle">${na(info.productionName)}</div>

<div class="logo-bar">
  ${logoImg('logoProdCo','Production Co.')}
  ${logoImg('logoClient','Client')}
  ${logoImg('logoAgency','Agency')}
</div>

<div class="top-grid">
  <!-- LEFT BOX: Production Company + Shoot Days -->
  <div class="info-box">
    <div style="font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;color:#444;border-bottom:1px solid #ccc;padding-bottom:3px;">Production Company</div>
    <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${na(info.prodCoName)}</span></div>
    <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.prodCoAddr, info.prodCoCity)}</span></div>
    <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.prodCoPhone)}</span></div>
    <div class="info-row"><span class="lbl">Director:</span><span class="val">${na(info.director)}</span></div>
    <div class="info-row"><span class="lbl">Producer:</span><span class="val">${na(info.producer)}</span></div>
    <div class="info-row"><span class="lbl">Bid Title:</span><span class="val">${na(info.productionName)}</span></div>
    <div class="info-row"><span class="lbl">Job #:</span><span class="val">${na(info.jobNumber)}</span></div>
    <div class="sub-header">Shoot Days</div>
    <div class="info-row days-row"><span class="lbl">Build/Strike:</span><span class="val-sm">${info.buildStrikeDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.buildStrikeHours || 0}</span></div>
    <div class="info-row days-row"><span class="lbl">Prelight:</span><span class="val-sm">${info.prelightDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.prelightHours || 0}</span></div>
    <div class="info-row days-row"><span class="lbl">Studio:</span><span class="val-sm">${info.studioDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.studioHours || 0}</span></div>
    <div class="info-row days-row"><span class="lbl">Location:</span><span class="val-sm">${info.locationDays || 0}</span><span class="lbl" style="margin-left:6px;">Loc(s):</span><span class="val-sm">${info.locations || 0}</span></div>
  </div>
  <!-- RIGHT BOX: Client + Agency -->
  <div class="info-box">
    <div style="font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;color:#444;border-bottom:1px solid #ccc;padding-bottom:3px;">Client</div>
    <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${na(info.clientName)}</span></div>
    <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.clientAddr, info.clientCity)}</span></div>
    <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.clientPhone)}</span></div>
    <div class="sub-header">AGENCY</div>
    <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${na(info.agencyName)}</span></div>
    <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.agencyAddr, info.agencyCity)}</span></div>
    <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.otherPhone)}</span></div>
  </div>
</div>

<!-- Production Details strip -->
<div class="details-strip">
  <div class="info-row"><span class="lbl">Date Prepared:</span><span class="val">${today}</span></div>
  <div class="info-row"><span class="lbl">Shooting Format:</span><span class="val">${info.shootingFormat || 'N/A'}</span></div>
  <div class="info-row"><span class="lbl">Delivery Format:</span><span class="val">${info.deliveryFormat || 'N/A'}</span></div>
  <div class="info-row"><span class="lbl">Delivery Date:</span><span class="val">${info.deliveryDate || 'N/A'}</span></div>
  <div class="info-row"><span class="lbl">Shoot Dates:</span><span class="val">${info.shootDates || 'N/A'}</span></div>
  <div class="info-row"><span class="lbl">OT Based On:</span><span class="val">${info.otBasedOn || '1.5'}</span></div>
  <div class="info-row"><span class="lbl">Job Name:</span><span class="val">${info.jobName || ''}</span></div>
</div>

<!-- Cost Summary Table -->
<table class="cs">
  <thead>
    <tr>
      <th class="left" colspan="2" style="width:60%;">Estimated Cost Summary</th>
      <th style="width:38px;">Sheet:</th>
      <th>Bid Total:</th>
      <th>Bid Actual:</th>
      <th>Variance:</th>
    </tr>
  </thead>
  <tbody>
    ${sectionRows}
    ${qrRows}
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="3" style="text-align:right;padding-right:8px;">TOTAL:</td>
      <td>${fmtMoney(grandBid)}</td>
      <td>${hasAny ? fmtMoney(grandActual) : ''}</td>
      <td>${hasAny ? fmtMoney(grandActual - grandBid) : ''}</td>
    </tr>
  </tfoot>
</table>

<div class="notes-label">Notes:</div>
<div class="notes-box">${info.notes || ''}</div>

<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

/* ── Full Budget Print Window ── */
function _openFullBudgetPrint() {
  const info = _loadProdInfo();
  const na   = v => (v && String(v).trim()) ? String(v).trim() : '';
  const naTS = v => (v && String(v).trim()) ? String(v).trim() : 'N/A'; // Top Sheet uses N/A fallback
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const fmtM = n => {
    if (!n && n !== 0) return '—';
    const abs = Math.ceil(Math.abs(n) * 100) / 100;
    return (n < 0 ? '(' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (n < 0 ? ')' : '');
  };
  const fmtPhone = v => {
    if (!v) return 'N/A';
    const digits = String(v).replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    return String(v).trim() || 'N/A';
  };
  const fmtAddr = (street, cityStateZip) => {
    const s = (street || '').trim();
    const c = (cityStateZip || '').trim();
    if (!s && !c) return 'N/A';
    if (s && c) return `${s}<br>${c}`;
    return s || c;
  };
  const logoImg = (key, alt) => info[key]
    ? `<img src="${info[key]}" alt="${alt}" style="max-height:52px;max-width:120px;object-fit:contain;">`
    : '';

  /* ── Top Sheet data ── */
  const grandBid    = _sections.reduce((s, d) => s + _sectionEstimateTotal(d.id), 0);
  const grandActual = _sections.reduce((s, d) => s + _sectionActualEstimateTotal(d.id), 0);
  const hasAny      = _sections.some(d => _sectionHasActual(d.id));

  const sectionRows = _sections.map((def, i) => {
    const bid = _sectionEstimateTotal(def.id);
    const actual = _sectionActualEstimateTotal(def.id);
    const hasAct = _sectionHasActual(def.id);
    const varAmt = actual - bid;
    return `<tr>
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">${def.id}</td>
      <td style="border:1px solid #999;padding:2px 8px;">${_getSectionName(def)}</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;">${i + 1}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${bid ? fmtM(bid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${hasAct ? fmtM(actual) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${hasAct ? fmtM(varAmt) : ''}</td>
    </tr>`;
  }).join('');

  const pQBid = _qBid(); const pQAct = _qActual(); const pQHas = _budget.__q?.actual !== '';
  const pRBid = _rBid(); const pRAct = _rActual(); const pRHas = _budget.__r?.actual !== '';
  const rRateVal = _budget.__r?.rate || '';
  const lastId = _sections[_sections.length - 1]?.id || 'P';
  const qrRows = `
    <tr style="background:#f5f5f5;">
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">Q</td>
      <td style="border:1px solid #999;padding:2px 8px;">Insurance</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;"></td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQBid ? fmtM(pQBid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQHas ? fmtM(pQAct) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pQHas ? fmtM(pQAct - pQBid) : ''}</td>
    </tr>
    <tr style="background:#f5f5f5;">
      <td style="width:28px;text-align:center;border:1px solid #999;padding:2px 4px;font-weight:700;">R</td>
      <td style="border:1px solid #999;padding:2px 8px;">Contingency${rRateVal ? ` (${rRateVal}% of A\u2013${lastId})` : ''}</td>
      <td style="width:38px;text-align:center;border:1px solid #999;padding:2px 4px;"></td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRBid ? fmtM(pRBid) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRHas ? fmtM(pRAct) : ''}</td>
      <td style="width:120px;text-align:right;border:1px solid #999;padding:2px 6px;">${pRHas ? fmtM(pRAct - pRBid) : ''}</td>
    </tr>`;

  /* ── Line-item section blocks ── */
  let sectionsHTML = '';
  const ranges = _buildSectionRanges();

  _sections.forEach(def => {
    const isLabor = def.type === 'labor';
    const sec     = _budget[def.id];
    const rows    = sec?.rows || [];
    const pwRate     = parseFloat(sec?.pwRate)     || 0;
    const fringeRate = parseFloat(sec?.fringeRate)  || 0;
    const subTotal   = _sectionSubTotal(def.id);
    const pw         = subTotal * (pwRate / 100);
    const fringe     = subTotal * (fringeRate / 100);
    const estimateTotal = subTotal + pw + fringe;

    const otHeaders = isLabor ? `
      <th class="fb-th fb-th--ot">1.5x</th>
      <th class="fb-th fb-th--ot">2x</th>
      <th class="fb-th fb-th--ot">2.5x</th>` : '';
    const otColCount = isLabor ? 3 : 0;

    let rowsHTML = '';
    rows.forEach((row, ri) => {
      const bid = _calcRowBid(def, row);
      const hasSubs = row.subLines && row.subLines.length > 0;
      const desc = esc(row.description || '');
      if (!desc && bid === 0) return;

      const lineInfo   = _lineNumForRow(ranges, def.id, ri);
      const lineNumStr = lineInfo.display;
      const noVal   = hasSubs ? `${row.subLines.length} sub` : (row.no || '');
      const daysVal = hasSubs ? '—' : (row.days || '');
      const rateVal = hasSubs ? '—' : (row.rate ? '$' + parseFloat(row.rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '');

      let otCells = '';
      if (isLabor) {
        if (hasSubs) {
          otCells = '<td class="fb-td fb-td--num">—</td><td class="fb-td fb-td--num">—</td><td class="fb-td fb-td--num">—</td>';
        } else {
          otCells = `
            <td class="fb-td fb-td--num">${row.ot15 || ''}</td>
            <td class="fb-td fb-td--num">${row.ot2  || ''}</td>
            <td class="fb-td fb-td--num">${row.ot25 || ''}</td>`;
        }
      }

      rowsHTML += `<tr class="fb-row">
        <td class="fb-td fb-td--linenum">${lineNumStr}</td>
        <td class="fb-td fb-td--desc">${desc}</td>
        <td class="fb-td fb-td--num">${daysVal}</td>
        <td class="fb-td fb-td--num">${noVal}</td>
        <td class="fb-td fb-td--num">${rateVal}</td>
        ${otCells}
        <td class="fb-td fb-td--num fb-td--bid">${fmtM(bid)}</td>
      </tr>`;

      if (hasSubs) {
        row.subLines.forEach(sl => {
          const slAmt = _calcSubLineTotal(sl, isLabor, row.baseHours);
          let slOt = '';
          if (isLabor) {
            slOt = `
              <td class="fb-td fb-td--num fb-sub-cell">${sl.ot15 || ''}</td>
              <td class="fb-td fb-td--num fb-sub-cell">${sl.ot2  || ''}</td>
              <td class="fb-td fb-td--num fb-sub-cell">${sl.ot25 || ''}</td>`;
          }
          rowsHTML += `<tr class="fb-sub-row">
            <td class="fb-td"></td>
            <td class="fb-td fb-td--desc fb-sub-cell">\u21B3 ${esc(sl.description || '')}</td>
            <td class="fb-td fb-td--num fb-sub-cell">${sl.days || ''}</td>
            <td class="fb-td fb-td--num fb-sub-cell">${sl.no || ''}</td>
            <td class="fb-td fb-td--num fb-sub-cell">${sl.rate ? '$' + parseFloat(sl.rate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
            ${slOt}
            <td class="fb-td fb-td--num fb-sub-cell">${fmtM(slAmt)}</td>
          </tr>`;
        });
      }
    });

    const footerColSpan = 4 + otColCount;
    sectionsHTML += `
      <div class="fb-section">
        <div class="fb-sec-header">${def.id} — ${esc(_getSectionName(def))}</div>
        <table class="fb-table">
          <thead>
            <tr>
              <th class="fb-th fb-th--linenum">#</th>
              <th class="fb-th fb-th--desc">DESCRIPTION</th>
              <th class="fb-th fb-th--num">DAYS</th>
              <th class="fb-th fb-th--num">X</th>
              <th class="fb-th fb-th--num">RATE</th>
              ${otHeaders}
              <th class="fb-th fb-th--num">BID TOTAL</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
          <tfoot>
            <tr class="fb-foot-row">
              <td class="fb-td"></td>
              <td class="fb-td fb-foot-label" colspan="${footerColSpan}">Subtotal</td>
              <td class="fb-td fb-td--num fb-foot-num">${fmtM(subTotal)}</td>
            </tr>
            ${pwRate ? `<tr class="fb-foot-row fb-foot-row--rate">
              <td class="fb-td"></td>
              <td class="fb-td fb-foot-label" colspan="${footerColSpan}">P&amp;W (${pwRate}%)</td>
              <td class="fb-td fb-td--num fb-foot-num">${fmtM(pw)}</td>
            </tr>` : ''}
            ${fringeRate ? `<tr class="fb-foot-row fb-foot-row--rate">
              <td class="fb-td"></td>
              <td class="fb-td fb-foot-label" colspan="${footerColSpan}">Fringes (${fringeRate}%)</td>
              <td class="fb-td fb-td--num fb-foot-num">${fmtM(fringe)}</td>
            </tr>` : ''}
            <tr class="fb-foot-row fb-foot-total">
              <td class="fb-td"></td>
              <td class="fb-td fb-foot-label" colspan="${footerColSpan}">Total ${def.id}</td>
              <td class="fb-td fb-td--num fb-foot-num">${fmtM(estimateTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  });

  /* ── Assemble full document ── */
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Full Budget — ${na(info.productionName) || 'Budget'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; background: #fff; padding: 20px 24px; position: relative; }

  /* ── Top Sheet (Page 1) ── */
  .ts-page { position: relative; }
  .ts-page h1 { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
  .ts-page .h1-subtitle { font-size: 22px; font-weight: 400; margin-bottom: 10px; }
  .ts-page .top-right-block { position: absolute; top: 0; right: 0; text-align: right; font-size: 11px; }
  .ts-page .top-right-block .tr-date { font-weight: 600; }
  .ts-page .top-right-block .tr-project { margin-top: 2px; }
  .ts-page .top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .ts-page .details-strip { border: 1px solid #888; padding: 5px 8px; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px 20px; }
  .ts-page .details-strip .info-row { flex: 0 0 auto; margin-bottom: 0; }
  .ts-page .sub-header { margin-top: 8px; font-size: 9px; font-weight: 700; color: #666; border-top: 1px dashed #ccc; padding-top: 5px; margin-bottom: 3px; }
  .ts-page .info-box { border: 1px solid #888; padding: 6px 8px; min-height: 130px; }
  .ts-page .info-row { display: flex; align-items: baseline; margin-bottom: 3px; gap: 4px; }
  .ts-page .info-row .lbl { min-width: 72px; text-align: right; padding-right: 5px; font-size: 9.5px; color: #444; flex-shrink: 0; }
  .ts-page .info-row .val { flex: 1; min-height: 13px; font-size: 11px; padding-bottom: 1px; }
  .ts-page .info-row.days-row { align-items: center; }
  .ts-page .info-row .val-sm { width: 36px; text-align: center; font-size: 11px; padding: 0 2px; }
  .ts-page .val--bold { font-weight: 700; }
  .ts-page .logo-bar { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 6px; }
  .ts-page .box-title { font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;color:#444;border-bottom:1px solid #ccc;padding-bottom:3px; }
  .ts-page table.cs { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
  .ts-page table.cs th { background: #d8d8d8; border: 1px solid #999; padding: 3px 6px; font-weight: 700; text-align: center; }
  .ts-page table.cs th.left { text-align: left; }
  .ts-page table.cs .total-row td { border: 1px solid #999; padding: 4px 6px; font-weight: 700; background: #efefef; text-align: right; }
  .ts-page table.cs .total-row td:first-child { text-align: right; }
  .ts-page .notes-label { font-size: 10px; font-weight: 700; margin-bottom: 3px; }
  .ts-page .notes-box { border: 1px solid #888; min-height: 90px; padding: 4px; }

  /* ── Line-Item Pages ── */
  .fb-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .fb-header-left h1 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .fb-header-left .fb-subtitle { font-size: 12px; font-weight: 400; color: #333; }
  .fb-header-right { text-align: right; font-size: 10px; }
  .fb-header-right .fb-date { font-weight: 600; }
  .fb-header-right .fb-project { margin-top: 2px; }
  .fb-section { margin-bottom: 12px; page-break-inside: avoid; }
  .fb-sec-header { font-size: 11px; font-weight: 700; background: #e8e8e8; padding: 3px 6px; border: 1px solid #aaa; border-bottom: none; }
  .fb-table { width: 100%; border-collapse: collapse; font-size: 9px; }
  .fb-th { background: #f4f4f4; border: 1px solid #bbb; padding: 2px 4px; font-weight: 700; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.03em; }
  .fb-th--linenum { width: 24px; text-align: center; }
  .fb-th--desc { text-align: left; }
  .fb-th--num { text-align: right; width: 62px; }
  .fb-th--ot { width: 30px; text-align: center; }
  .fb-td { border: 1px solid #ddd; padding: 1px 4px; vertical-align: top; font-size: 9px; }
  .fb-td--linenum { text-align: center; color: #888; font-size: 8px; }
  .fb-td--desc { text-align: left; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fb-td--num { text-align: right; }
  .fb-td--bid { font-weight: 600; }
  .fb-row:nth-child(even) { background: #fafafa; }
  .fb-sub-row { background: #f7f7f0; }
  .fb-sub-cell { font-size: 8px; color: #555; }
  .fb-foot-row td { border: none; border-top: 1px solid #ccc; padding: 2px 4px; }
  .fb-foot-label { text-align: right; font-size: 8px; color: #555; padding-right: 8px; }
  .fb-foot-num { font-weight: 600; border-left: 1px solid #ccc; }
  .fb-foot-total td { border-top: 2px solid #888; }
  .fb-foot-total .fb-foot-label { font-weight: 700; color: #000; font-size: 9px; }
  .fb-foot-total .fb-foot-num { font-weight: 700; font-size: 9px; }
  .fb-grand { margin-top: 10px; text-align: right; font-size: 13px; font-weight: 700; border-top: 3px double #000; padding-top: 5px; }

  @media print {
    @page { size: letter portrait; margin: 0.45in 0.4in; }
    body { padding: 0; }
    .ts-page { page-break-after: always; }
    .fb-section { page-break-inside: avoid; }
  }
</style>
</head><body>

<!-- ════════ PAGE 1: TOP SHEET ════════ -->
<div class="ts-page">
  <div class="top-right-block">
    <div class="tr-date">${today}</div>
    <div class="tr-project">${naTS(info.productionName)}</div>
  </div>

  <h1>Production Cost Summary</h1>
  <div class="h1-subtitle">${naTS(info.productionName)}</div>

  <div class="logo-bar">
    ${logoImg('logoProdCo','Production Co.')}
    ${logoImg('logoClient','Client')}
    ${logoImg('logoAgency','Agency')}
  </div>

  <div class="top-grid">
    <div class="info-box">
      <div class="box-title">Production Company</div>
      <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${naTS(info.prodCoName)}</span></div>
      <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.prodCoAddr, info.prodCoCity)}</span></div>
      <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.prodCoPhone)}</span></div>
      <div class="info-row"><span class="lbl">Director:</span><span class="val">${naTS(info.director)}</span></div>
      <div class="info-row"><span class="lbl">Producer:</span><span class="val">${naTS(info.producer)}</span></div>
      <div class="info-row"><span class="lbl">Bid Title:</span><span class="val">${naTS(info.productionName)}</span></div>
      <div class="info-row"><span class="lbl">Job #:</span><span class="val">${naTS(info.jobNumber)}</span></div>
      <div class="sub-header">Shoot Days</div>
      <div class="info-row days-row"><span class="lbl">Build/Strike:</span><span class="val-sm">${info.buildStrikeDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.buildStrikeHours || 0}</span></div>
      <div class="info-row days-row"><span class="lbl">Prelight:</span><span class="val-sm">${info.prelightDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.prelightHours || 0}</span></div>
      <div class="info-row days-row"><span class="lbl">Studio:</span><span class="val-sm">${info.studioDays || 0}</span><span class="lbl" style="margin-left:6px;">Hrs:</span><span class="val-sm">${info.studioHours || 0}</span></div>
      <div class="info-row days-row"><span class="lbl">Location:</span><span class="val-sm">${info.locationDays || 0}</span><span class="lbl" style="margin-left:6px;">Loc(s):</span><span class="val-sm">${info.locations || 0}</span></div>
    </div>
    <div class="info-box">
      <div class="box-title">Client</div>
      <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${naTS(info.clientName)}</span></div>
      <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.clientAddr, info.clientCity)}</span></div>
      <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.clientPhone)}</span></div>
      <div class="sub-header">AGENCY</div>
      <div class="info-row"><span class="lbl">Name:</span><span class="val val--bold">${naTS(info.agencyName)}</span></div>
      <div class="info-row"><span class="lbl">Address:</span><span class="val">${fmtAddr(info.agencyAddr, info.agencyCity)}</span></div>
      <div class="info-row"><span class="lbl">Phone:</span><span class="val">${fmtPhone(info.otherPhone)}</span></div>
    </div>
  </div>

  <div class="details-strip">
    <div class="info-row"><span class="lbl">Date Prepared:</span><span class="val">${today}</span></div>
    <div class="info-row"><span class="lbl">Shooting Format:</span><span class="val">${info.shootingFormat || 'N/A'}</span></div>
    <div class="info-row"><span class="lbl">Delivery Format:</span><span class="val">${info.deliveryFormat || 'N/A'}</span></div>
    <div class="info-row"><span class="lbl">Delivery Date:</span><span class="val">${info.deliveryDate || 'N/A'}</span></div>
    <div class="info-row"><span class="lbl">Shoot Dates:</span><span class="val">${info.shootDates || 'N/A'}</span></div>
    <div class="info-row"><span class="lbl">OT Based On:</span><span class="val">${info.otBasedOn || '1.5'}</span></div>
    <div class="info-row"><span class="lbl">Job Name:</span><span class="val">${info.jobName || ''}</span></div>
  </div>

  <table class="cs">
    <thead>
      <tr>
        <th class="left" colspan="2" style="width:60%;">Estimated Cost Summary</th>
        <th style="width:38px;">Sheet:</th>
        <th>Bid Total:</th>
        <th>Bid Actual:</th>
        <th>Variance:</th>
      </tr>
    </thead>
    <tbody>
      ${sectionRows}
      ${qrRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right;padding-right:8px;">TOTAL:</td>
        <td>${fmtM(grandBid)}</td>
        <td>${hasAny ? fmtM(grandActual) : ''}</td>
        <td>${hasAny ? fmtM(grandActual - grandBid) : ''}</td>
      </tr>
    </tfoot>
  </table>

  <div class="notes-label">Notes:</div>
  <div class="notes-box">${info.notes || ''}</div>
</div>

<!-- ════════ LINE-ITEM PAGES ════════ -->
<div class="fb-header">
  <div class="fb-header-left">
    <h1>Production Budget — Line Items</h1>
    <div class="fb-subtitle">${na(info.productionName)}</div>
  </div>
  <div class="fb-header-right">
    <div class="fb-date">${today}</div>
    <div class="fb-project">${na(info.productionName)}</div>
  </div>
</div>

${sectionsHTML}

<div class="fb-grand">GRAND TOTAL: ${fmtM(grandBid)}</div>

<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

export function renderBudgetOverview(container) {
  _loadTemplate();
  _load();
  _initQR();
  _buildActualsMap();

  const info = _loadProdInfo();

  /* helpers */
  const esc2 = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* top sheet rows */
  const tsRows = _sections.map(def => {
    const bid    = _sectionEstimateTotal(def.id);
    const actual = _sectionActualEstimateTotal(def.id);
    const hasAct = _sectionHasActual(def.id);
    const varAmt = actual - bid;
    const varFmt = hasAct
      ? `<span class="${varAmt < 0 ? 'ts-amt--neg' : varAmt > 0 ? 'ts-amt--pos' : ''}">${_fmtVariance(varAmt)}</span>`
      : '—';
    return `<tr class="ts-row" data-jump="${def.id}">
      <td class="ts-td">${esc2(def.id)}</td>
      <td class="ts-td ts-td--name">${esc2(_getSectionName(def))}</td>
      <td class="ts-td">${_fmt(bid)}</td>
      <td class="ts-td">${hasAct ? _fmt(actual) : '—'}</td>
      <td class="ts-td">${varFmt}</td>
    </tr>`;
  }).join('');

  /* Q and R rows for top sheet */
  const qBid = _qBid(); const qAct = _qActual(); const qHas = _budget.__q?.actual !== '';
  const rBid = _rBid(); const rAct = _rActual(); const rHas = _budget.__r?.actual !== '';
  const rRate = _budget.__r?.rate || '';
  const lastSec = _sections[_sections.length - 1]?.id || 'P';
  const tsQRow = `<tr class="ts-row ts-qr-row">
    <td class="ts-td">Q</td>
    <td class="ts-td ts-td--name">Insurance</td>
    <td class="ts-td">${qBid ? _fmt(qBid) : '—'}</td>
    <td class="ts-td">${qHas ? _fmt(qAct) : '—'}</td>
    <td class="ts-td">${qHas ? _fmtVariance(qAct - qBid) : '—'}</td>
  </tr>`;
  const tsRRow = `<tr class="ts-row ts-qr-row">
    <td class="ts-td">R</td>
    <td class="ts-td ts-td--name">Contingency${rRate ? ` (${rRate}% of A–${lastSec})` : ''}</td>
    <td class="ts-td">${rBid ? _fmt(rBid) : '—'}</td>
    <td class="ts-td">${rHas ? _fmt(rAct) : '—'}</td>
    <td class="ts-td">${rHas ? _fmtVariance(rAct - rBid) : '—'}</td>
  </tr>`;

  const grandBid    = _grandBid();
  const grandActual = _grandActual();
  const hasAny      = _hasAnyActual();
  const grandVar    = grandActual - grandBid;
  const grandVarFmt = hasAny
    ? `<span class="${grandVar < 0 ? 'ts-amt--neg' : grandVar > 0 ? 'ts-amt--pos' : ''}">${_fmtVariance(grandVar)}</span>`
    : '—';

  /* Fringe summary rows for top sheet */
  const tsFringeRows = _sections.map(def => {
    const sec   = _budget[def.id];
    const sub   = _sectionSubTotal(def.id);
    const bidPw = sub  * ((parseFloat(sec?.pwRate) || 0) / 100);
    const bidFr = sub  * ((parseFloat(sec?.fringeRate) || 0) / 100);
    // Actuals ONLY from approved "Group X" purchases
    const actFr = _getFringeActual(def.id);
    const tot   = bidPw + bidFr;
    const aTot  = actFr;
    const hasFringeAct = _hasFringeActual(def.id);
    if (tot === 0 && aTot === 0) return '';
    return `<tr class="ts-fringe-row">
      <td class="ts-td">${esc2(def.id)}</td>
      <td class="ts-td ts-td--name">${esc2(_getSectionName(def))}</td>
      <td class="ts-td">${_fmt(tot)}</td>
      <td class="ts-td">${hasFringeAct ? _fmt(aTot) : '—'}</td>
      <td class="ts-td">—</td>
    </tr>`;
  }).filter(Boolean).join('');
  const tsPWFBid    = _totalPWFBid();
  const tsPWFActual = _totalPWFActual();

  const prodName = info.productionName || '';
  const today    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /* ── Compute sub-header summary values (mirrors Hot Costs logic) ── */
  let estRemaining = 0;
  _sections.forEach(def => {
    const rows    = _budget[def.id]?.rows || [];
    const actuals = _rowActuals[def.id] || [];
    rows.forEach((row, i) => {
      const bid    = _calcRowBid(def, row);
      const actual = actuals[i] ? actuals[i].total : 0;
      if (bid >= actual) estRemaining += (bid - actual);
    });
  });
  if (qBid >= qAct) estRemaining += (qBid - qAct);
  if (rBid >= rAct) estRemaining += (rBid - rAct);
  const efc       = grandActual + estRemaining;
  const overUnder = grandBid - grandActual;

  container.innerHTML = `
    <div class="bud-overview-shell">
      <!-- Toolbar -->
      <div class="bud-overview-toolbar">
        <h2>Production Budget</h2>
        <button class="btn btn--primary btn--sm" id="ov-to-lines">Open Line Items →</button>
        <button class="btn btn--ghost btn--sm" id="ov-print-top">🖨 Print Top Sheet</button>
        <button class="btn btn--ghost btn--sm" id="ov-print-full">🖨 Print Full Budget</button>
        <button class="btn btn--ghost btn--sm" id="ov-hot-costs" title="Hot Costs">🌡 Hot Costs</button>
      </div>

      <!-- Sub-header summary bar -->
      <div class="bud-overview-summary">
        <div class="bud-sum-block">
          <div class="bud-sum-label">Budget</div>
          <div class="bud-sum-val">${_fmt(grandBid)}</div>
        </div>
        <div class="bud-sum-block">
          <div class="bud-sum-label">(Over) / Under</div>
          <div class="bud-sum-val ${hasAny ? (overUnder < 0 ? 'bud-sum--neg' : overUnder > 0 ? 'bud-sum--pos' : '') : ''}">${hasAny ? (overUnder < 0 ? '(' + _fmt(Math.abs(overUnder)) + ')' : overUnder > 0 ? _fmt(overUnder) : '—') : '—'}</div>
        </div>
        <div class="bud-sum-block">
          <div class="bud-sum-label">Est. Remaining</div>
          <div class="bud-sum-val">${_fmt(estRemaining)}</div>
        </div>
        <div class="bud-sum-block">
          <div class="bud-sum-label">EFC</div>
          <div class="bud-sum-val ${hasAny && efc > grandBid ? 'bud-sum--neg' : ''}">${hasAny ? _fmt(efc) : _fmt(grandBid)}</div>
        </div>
      </div>

      <div class="bud-overview-body">

        <!-- Top Sheet (full width) -->
        <div class="bud-topsheet-panel">
          <div class="bud-topsheet-header">
            <div class="bud-topsheet-title">Production Cost Summary</div>
            <div class="bud-topsheet-sub">${prodName ? esc2(prodName) + ' · ' : ''}${today}</div>
          </div>
          <div class="bud-topsheet-scroll">
            <table class="ts-table">
              <thead>
                <tr>
                  <th class="ts-th">SEC</th>
                  <th class="ts-th ts-th--name">CATEGORY</th>
                  <th class="ts-th">BID TOTAL</th>
                  <th class="ts-th">ACTUAL</th>
                  <th class="ts-th">VARIANCE</th>
                </tr>
              </thead>
              <tbody>${tsRows}${tsQRow}${tsRRow}</tbody>
              <tfoot>
                <tr class="ts-grand-row">
                  <td colspan="2" class="ts-td ts-td--name">GRAND TOTAL</td>
                  <td class="ts-td">${_fmt(grandBid)}</td>
                  <td class="ts-td">${hasAny ? _fmt(grandActual) : '—'}</td>
                  <td class="ts-td">${grandVarFmt}</td>
                </tr>
                ${tsFringeRows.length ? `
                <tr class="ts-fringe-header-row">
                  <td colspan="5" class="ts-fringe-header-cell">
                    P&amp;W &amp; FRINGES SUMMARY
                    <span class="ts-fringe-note">informational</span>
                  </td>
                </tr>
                ${tsFringeRows}
                <tr class="ts-fringe-total-row">
                  <td colspan="2" class="ts-td ts-td--name">TOTAL P&amp;W &amp; FRINGES</td>
                  <td class="ts-td">${_fmt(tsPWFBid)}</td>
                  <td class="ts-td">${hasAny ? _fmt(tsPWFActual) : '—'}</td>
                  <td class="ts-td">—</td>
                </tr>` : ''}
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>`;

  /* ── Event listeners ── */

  // Navigate to lines
  const goLines = () => { window.location.hash = '#budget-lines'; };
  container.querySelector('#ov-to-lines').addEventListener('click', goLines);

  // Print top sheet — opens formatted new window
  container.querySelector('#ov-print-top').addEventListener('click', () => _openTopSheetPrint(info, _sections, _budget));
  container.querySelector('#ov-print-full').addEventListener('click', () => _openFullBudgetPrint());

  // Hot Costs
  container.querySelector('#ov-hot-costs').addEventListener('click', () => { window.location.hash = '#hot-costs'; });

  // Click a section row → navigate to Line Items and scroll to that section
  container.querySelectorAll('.ts-row[data-jump]').forEach(row => {
    row.addEventListener('click', () => {
      const sec = row.dataset.jump;
      // Store target section so the Line Items renderer can scroll to it
      sessionStorage.setItem('budget-jump-section', sec);
      window.location.hash = '#budget-lines';
    });
  });
}

/* ============================================================
   Hot Costs — Running Actuals + Daily Activity Log
   ============================================================ */
export function renderHotCosts(container) {
  _loadTemplate();
  _load();
  _initQR();
  _buildActualsMap();


  const today = new Date().toISOString().slice(0, 10);

  /* Status filter state — all checked by default */
  const _activityFilters = { approved: true, inReview: true, quotes: true };

  /* Map purchase statuses to our three filter buckets */
  function _statusBucket(status) {
    if (status === 'Approved') return 'approved';
    if (status === 'In Review' || status === 'Pending Approval' || status === 'Submitted' || status === 'Returned') return 'inReview';
    if (status === 'Quote') return 'quotes';
    return null; // Void, etc. — always excluded
  }

  function _buildActivityLog(date) {
    const purchases = getPurchases();
    const entries   = purchases.filter(p => {
      if (p.date !== date || p.status === 'Void') return false;
      const bucket = _statusBucket(p.status);
      return bucket && _activityFilters[bucket];
    });

    const colCount = 9; // TIME, FOLDER, VENDOR, LINE, STATUS, PAID, SUBMITTED BY, APPROVED BY, AMOUNT

    if (entries.length === 0) {
      return `<tr><td colspan="${colCount}" class="hc-empty">No activity logged for this date.</td></tr>`;
    }

    // Sort by createdAt descending (newest first)
    const sorted = entries.slice().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );

    // Running total for the day
    let dayTotal = 0;

    return sorted.map(p => {
      const time = p.createdAt
        ? new Date(p.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '—';

      const amt       = Number(p.amount) || 0;
      const signedAmt = p.isReturn ? -amt : amt;
      dayTotal += signedAmt;

      const amtFmt = p.isReturn
        ? `<span class="bud-neg">(${_fmt(amt)})</span>`
        : _fmt(amt);

      const statusCls = p.status === 'Returned' ? 'bud-neg' : '';
      const statusLabel = esc(p.status || '—');

      const paidLabel = p.paid ? 'Paid' : 'Unpaid';
      const paidCls   = p.paid ? 'hc-paid--yes' : 'hc-paid--no';

      // Extract just the number prefix from the line item (e.g. "5200" from "5200 – Camera Equipment")
      const lineNum = (p.lineItem || '—').split(/\s*[–—-]\s*/)[0];

      const submittedBy = esc(p.submittedBy || '—');
      const approvedBy = p.status === 'Approved' ? esc(p.approvedBy || '—') : 'TBD';

      return `<tr class="hc-log-row">
        <td class="hc-td hc-td--time">${esc(time)}</td>
        <td class="hc-td hc-td--id">${esc(p.folder ?? '—')}</td>
        <td class="hc-td hc-td--desc">${esc(p.vendor || '—')}: ${esc(p.description || '—')}</td>
        <td class="hc-td hc-td--id">${esc(lineNum)}</td>
        <td class="hc-td"><span class="${statusCls}">${statusLabel}</span></td>
        <td class="hc-td hc-td--paid"><span class="${paidCls}">${paidLabel}</span></td>
        <td class="hc-td">${submittedBy}</td>
        <td class="hc-td">${approvedBy}</td>
        <td class="hc-td hc-td--num">${amtFmt}</td>
      </tr>`;
    }).join('') + `<tr class="hc-log-row hc-day-total">
        <td class="hc-td" colspan="${colCount - 1}"><strong>Day Total</strong></td>
        <td class="hc-td hc-td--num"><strong>${_fmt(dayTotal)}</strong></td>
      </tr>`;
  }

  /* running actuals per section */
  const actualsRows = _sections.map(def => {
    const bid    = _sectionEstimateTotal(def.id);
    const actual = _sectionActualEstimateTotal(def.id);
    const hasAct = _sectionHasActual(def.id);
    const vari   = actual - bid;
    return `<tr class="hc-actuals-row">
      <td class="hc-td hc-td--id">${esc(def.id)}</td>
      <td class="hc-td hc-td--name">${esc(_getSectionName(def))}</td>
      <td class="hc-td hc-td--num">${_fmt(bid)}</td>
      <td class="hc-td hc-td--num">${hasAct ? _fmt(actual) : '—'}</td>
      <td class="hc-td hc-td--num">${hasAct ? _fmtVariance(vari) : '—'}</td>
    </tr>`;
  }).join('');

  const qBid = _qBid(); const qAct = _qActual(); const qHas = _budget.__q?.actual !== '';
  const rBid = _rBid(); const rAct = _rActual(); const rHas = _budget.__r?.actual !== '';
  const qrActualsRows = `
    <tr class="hc-actuals-row hc-qr-row">
      <td class="hc-td hc-td--id">Q</td>
      <td class="hc-td hc-td--name">Insurance</td>
      <td class="hc-td hc-td--num">${_fmt(qBid)}</td>
      <td class="hc-td hc-td--num">${qHas ? _fmt(qAct) : '—'}</td>
      <td class="hc-td hc-td--num">${qHas ? _fmtVariance(qAct - qBid) : '—'}</td>
    </tr>
    <tr class="hc-actuals-row hc-qr-row">
      <td class="hc-td hc-td--id">R</td>
      <td class="hc-td hc-td--name">Contingency</td>
      <td class="hc-td hc-td--num">${_fmt(rBid)}</td>
      <td class="hc-td hc-td--num">${rHas ? _fmt(rAct) : '—'}</td>
      <td class="hc-td hc-td--num">${rHas ? _fmtVariance(rAct - rBid) : '—'}</td>
    </tr>`;

  const grandBid    = _grandBid();
  const grandActual = _grandActual();
  const grandVar    = grandActual - grandBid;
  const hasAny      = _hasAnyActual();
  const pwfBid      = _totalPWFBid();
  const pwfActual   = _totalPWFActual();

  /* fringe rows in actuals panel */
  const fringeRows = _sections.map(def => {
    const sec  = _budget[def.id];
    const sub  = _sectionSubTotal(def.id);
    const bidPw = sub  * ((parseFloat(sec?.pwRate) || 0) / 100);
    const bidFr = sub  * ((parseFloat(sec?.fringeRate) || 0) / 100);
    // Actuals ONLY from approved "Group X" purchases
    const actFr = _getFringeActual(def.id);
    const tot   = bidPw + bidFr;
    const aTot  = actFr;
    const hasFringeAct = _hasFringeActual(def.id);
    if (tot === 0 && aTot === 0) return '';
    return `<tr class="hc-fringe-row">
      <td class="hc-td hc-td--id">${esc(def.id)}</td>
      <td class="hc-td hc-td--name">${esc(_getSectionName(def))}</td>
      <td class="hc-td hc-td--num">${_fmt(tot)}</td>
      <td class="hc-td hc-td--num">${hasFringeAct ? _fmt(aTot) : '—'}</td>
      <td class="hc-td hc-td--num">—</td>
    </tr>`;
  }).filter(Boolean).join('');

  container.innerHTML = `
    <div class="hc-shell">
      <div class="hc-toolbar">
        <button class="btn btn--ghost btn--sm" id="hc-back">← Budget Overview</button>
        <h2 class="hc-title">Hot Costs</h2>
        <button class="btn btn--primary btn--sm" id="hc-generate-summary">Generate Hot Cost Summary</button>
      </div>
      <div class="hc-body">

        <!-- LEFT: Running Actuals -->
        <div class="hc-totals-panel">
          <div class="hc-panel-title">Running Actuals</div>
          <div class="hc-totals-scroll">
            <table class="hc-table">
              <thead>
                <tr>
                  <th class="hc-th">SEC</th>
                  <th class="hc-th hc-th--name">CATEGORY</th>
                  <th class="hc-th hc-th--num">BID</th>
                  <th class="hc-th hc-th--num">ACTUAL</th>
                  <th class="hc-th hc-th--num">VARIANCE</th>
                </tr>
              </thead>
              <tbody>
                ${actualsRows}
                ${qrActualsRows}
              </tbody>
              <tfoot>
                <tr class="hc-grand-row">
                  <td colspan="2" class="hc-td hc-td--name">GRAND TOTAL</td>
                  <td class="hc-td hc-td--num">${_fmt(grandBid)}</td>
                  <td class="hc-td hc-td--num">${hasAny ? _fmt(grandActual) : '—'}</td>
                  <td class="hc-td hc-td--num">${hasAny ? _fmtVariance(grandVar) : '—'}</td>
                </tr>
                ${fringeRows ? `
                <tr class="hc-fringe-header">
                  <td colspan="5" class="hc-td hc-fringe-label">
                    P&amp;W &amp; FRINGES <span class="hc-fringe-note">informational</span>
                  </td>
                </tr>
                ${fringeRows}
                <tr class="hc-grand-row hc-fringe-total">
                  <td colspan="2" class="hc-td hc-td--name">TOTAL P&amp;W &amp; FRINGES</td>
                  <td class="hc-td hc-td--num">${_fmt(pwfBid)}</td>
                  <td class="hc-td hc-td--num">${hasAny ? _fmt(pwfActual) : '—'}</td>
                  <td class="hc-td hc-td--num">—</td>
                </tr>` : ''}
              </tfoot>
            </table>
          </div>
        </div>

        <!-- RIGHT: Activity Log -->
        <div class="hc-activity-panel">
          <div class="hc-panel-title">
            Daily Activity
            <div class="hc-activity-controls">
              <div class="hc-status-filter" id="hc-status-filter">
                <button type="button" class="btn btn--ghost btn--sm hc-filter-btn" id="hc-filter-toggle">Filter ▾</button>
                <div class="hc-filter-dropdown hidden" id="hc-filter-dropdown">
                  <label class="hc-filter-option">
                    <input type="checkbox" id="hc-f-approved" checked /> Approved
                  </label>
                  <label class="hc-filter-option">
                    <input type="checkbox" id="hc-f-inreview" checked /> In Review
                  </label>
                  <label class="hc-filter-option">
                    <input type="checkbox" id="hc-f-quotes" checked /> Quotes
                  </label>
                </div>
              </div>
              <input type="date" class="hc-date-picker" id="hc-date-picker" value="${today}">
            </div>
          </div>
          <div class="hc-activity-scroll">
            <table class="hc-table">
              <thead>
                <tr>
                  <th class="hc-th hc-th--time">TIME</th>
                  <th class="hc-th">FOLDER</th>
                  <th class="hc-th hc-th--name">VENDOR / DESCRIPTION</th>
                  <th class="hc-th">LINE</th>
                  <th class="hc-th">STATUS</th>
                  <th class="hc-th">PAID</th>
                  <th class="hc-th">SUBMITTED BY</th>
                  <th class="hc-th">APPROVED BY</th>
                  <th class="hc-th hc-th--num">AMOUNT</th>
                </tr>
              </thead>
              <tbody id="hc-log-tbody">
                ${_buildActivityLog(today)}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>`;

  container.querySelector('#hc-back').addEventListener('click', () => {
    window.location.hash = '#budget';
  });

  /* ── Refresh activity helper ── */
  function _refreshActivity() {
    const date  = container.querySelector('#hc-date-picker').value;
    const tbody = container.querySelector('#hc-log-tbody');
    if (tbody) tbody.innerHTML = _buildActivityLog(date);
  }

  container.querySelector('#hc-date-picker').addEventListener('change', _refreshActivity);

  /* ── Status filter dropdown ── */
  const filterToggle   = container.querySelector('#hc-filter-toggle');
  const filterDropdown = container.querySelector('#hc-filter-dropdown');

  filterToggle.addEventListener('click', e => {
    e.stopPropagation();
    filterDropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!filterDropdown.contains(e.target) && e.target !== filterToggle) {
      filterDropdown.classList.add('hidden');
    }
  });

  // Wire up each checkbox
  container.querySelector('#hc-f-approved').addEventListener('change', e => {
    _activityFilters.approved = e.target.checked;
    _refreshActivity();
  });
  container.querySelector('#hc-f-inreview').addEventListener('change', e => {
    _activityFilters.inReview = e.target.checked;
    _refreshActivity();
  });
  container.querySelector('#hc-f-quotes').addEventListener('change', e => {
    _activityFilters.quotes = e.target.checked;
    _refreshActivity();
  });

  /* ── Generate Hot Cost Summary ── */
  container.querySelector('#hc-generate-summary').addEventListener('click', () => {
    _openHotCostSummary({ ..._activityFilters });
  });
}

/* ════════════════════════════════════════════════════════════════
   HOT COST SUMMARY — Print-friendly one-sheet
   Replicates Movie Magic Budgeting layout for easy transition.
   ════════════════════════════════════════════════════════════════ */

function _openHotCostSummary(filters = { approved: true, inReview: true, quotes: true }) {
  // Ensure data is loaded
  _loadTemplate();
  _load();
  _initQR();
  _buildActualsMap();

  /* ── Gather project info ── */
  const proj = (() => {
    try { return JSON.parse(localStorage.getItem('movie-ledger-project')) || {}; } catch { return {}; }
  })();

  const now         = new Date();
  const reportDate  = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  const reportTime  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayOfWeek   = now.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate    = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const projectTitle = proj.title || 'Untitled Project';
  const prodNum      = proj.productionNumber || '';
  const tplLabel     = proj.budgetTemplate === 'feature' ? 'Feature/Episodic' : 'Commercial';
  const company      = proj.productionCompany || '';
  const director     = proj.director || '';
  const producer     = proj.producer || '';
  const prodAcct     = proj.defaultSubmitter || '';

  /* ── Budget totals ── */
  const grandBid    = _grandBid();
  const grandActual = _grandActual();
  const grandVar    = grandBid - grandActual;   // Bid - Actual (positive = under budget, negative = over)
  const hasAnyAct   = _hasAnyActual();

  // Q & R rows
  const qBid = _qBid(); const qAct = _qActual(); const qHas = _budget.__q?.actual !== '';
  const rBid = _rBid(); const rAct = _rActual(); const rHas = _budget.__r?.actual !== '';

  /* ── Build filter label for the report ── */
  const activeFilterLabels = [];
  if (filters.approved) activeFilterLabels.push('Approved');
  if (filters.inReview)  activeFilterLabels.push('In Review');
  if (filters.quotes)    activeFilterLabels.push('Quotes');
  const filterNote = activeFilterLabels.length ? activeFilterLabels.join(', ') : 'None';

  /* ── Status bucket matching (mirrors Daily Activity logic) ── */
  function _hcsStatusBucket(status) {
    if (status === 'Approved') return 'approved';
    if (status === 'In Review' || status === 'Pending Approval' || status === 'Submitted' || status === 'Returned') return 'inReview';
    if (status === 'Quote') return 'quotes';
    return null;
  }

  /* ── Build purchase activity rows ── */
  const purchases = getPurchases();

  // Filtered purchases = those matching the selected status filters (excludes Void)
  const filteredPurchases = purchases.filter(p => {
    if (p.status === 'Void') return false;
    const bucket = _hcsStatusBucket(p.status);
    return bucket && filters[bucket];
  });

  const approvedPaid = purchases.filter(p =>
    p.status === 'Approved' && p.paid && p.status !== 'Void'
  );
  const inReview = purchases.filter(p =>
    p.status === 'Pending' || p.status === 'In Review'
  );

  const activityCount = approvedPaid.length;
  const inReviewCount = inReview.length;

  /* ── Map filtered purchases to budget sections (for TODAY + TO DATE columns) ── */
  // Build section → line-number ranges
  const _secRanges = [];
  let _counter = 1;
  _sections.forEach(def => {
    const rowCount = (_budget[def.id]?.rows || []).length;
    _secRanges.push({ id: def.id, start: _counter, end: _counter + rowCount - 1 });
    _counter += rowCount;
  });

  function _mapPurchaseToSections(p) {
    const result = {};
    // Handle lineItems array (form submissions)
    if (Array.isArray(p.lineItems) && p.lineItems.length > 0) {
      p.lineItems.forEach(li => {
        if (!li.lineItem) return;
        const digits = String(li.lineItem).replace(/\D/g, '');
        if (!digits) return;
        const num = parseInt(digits, 10);
        const amount = parseFloat(li.amount) || 0;
        for (const range of _secRanges) {
          if (num >= range.start && num <= range.end) {
            result[range.id] = (result[range.id] || 0) + amount;
            break;
          }
        }
      });
    }
    // Handle singular lineItem string (seed data)
    else if (p.lineItem) {
      const digits = String(p.lineItem).replace(/\D/g, '');
      if (digits) {
        const num = parseInt(digits, 10);
        const amount = parseFloat(p.amount) || 0;
        for (const range of _secRanges) {
          if (num >= range.start && num <= range.end) {
            result[range.id] = (result[range.id] || 0) + amount;
            break;
          }
        }
      }
    }
    return result;
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const sectionFiltered      = {};   // all-time filtered purchases per section
  const sectionFilteredToday = {};   // today's filtered purchases per section
  let totalFiltered      = 0;
  let totalFilteredToday = 0;

  _sections.forEach(def => { sectionFiltered[def.id] = 0; sectionFilteredToday[def.id] = 0; });

  filteredPurchases.forEach(p => {
    const mapping = _mapPurchaseToSections(p);
    const isToday = p.date === todayStr;
    const mappedAny = Object.keys(mapping).length > 0;

    if (mappedAny) {
      for (const [secId, amount] of Object.entries(mapping)) {
        sectionFiltered[secId] += amount;
        totalFiltered += amount;
        if (isToday) { sectionFilteredToday[secId] += amount; totalFilteredToday += amount; }
      }
    } else {
      // Purchase not mapped to any section — still count toward totals
      const amt = parseFloat(p.amount) || 0;
      totalFiltered += amt;
      if (isToday) totalFilteredToday += amt;
    }
  });

  /* ── Est. Remaining = sum of (Bid - Actual) for each line item where Bid >= Actual ── */
  let estRemaining = 0;
  _sections.forEach(def => {
    const rows    = _budget[def.id]?.rows || [];
    const actuals = _rowActuals[def.id] || [];
    rows.forEach((row, i) => {
      const bid    = _calcRowBid(def, row);
      const actual = actuals[i] ? actuals[i].total : 0;
      if (bid >= actual) estRemaining += (bid - actual);
    });
  });
  // Include Q (Insurance) and R (Contingency) if not over budget
  if (qBid >= qAct) estRemaining += (qBid - qAct);
  if (rBid >= rAct) estRemaining += (rBid - rAct);

  /* ── EFC = Actual + Est. Remaining ── */
  const newEfc = grandActual + estRemaining;

  /* ── Delta Estimate = Bid - EFC ── */
  const deltaEst = grandBid - newEfc;

  /* ── Build PDF Activity Log rows ── */
  const _activityLogHTML = (() => {
    const todayOnly = filteredPurchases.filter(p => p.date === todayStr);
    const sorted = todayOnly.slice().sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '')
    );
    if (sorted.length === 0) {
      return '<tr><td colspan="12" style="text-align:center; color:#999; padding:8px;">No activity recorded for today.</td></tr>';
    }
    let runningTotal = 0;
    const rows = sorted.map(p => {
      const amt = Number(p.amount) || 0;
      const signed = p.isReturn ? -amt : amt;
      runningTotal += signed;
      const lineNum = (p.lineItem || '—').split(/\s*[–—-]\s*/)[0];
      const w9 = p.w9Attached ? '✔' : '✘';
      const ach = p.payMethodDocAttached ? '✔' : '✘';
      const approvedBy = p.status === 'Approved' ? _hesc(p.approvedBy || '—') : 'TBD';
      const amtStr = p.isReturn
        ? '(' + _hcsFmtLg(amt) + ')'
        : _hcsFmtLg(amt);
      return `<tr>
        <td>${_hesc(p.date || '—')}</td>
        <td>${_hesc(p.folder || '—')}</td>
        <td style="white-space:nowrap;">${_hesc(p.vendor || '—')}</td>
        <td>${_hesc(p.description || '—')}</td>
        <td>${_hesc(lineNum)}</td>
        <td>${_hesc(p.status || '—')}</td>
        <td>${p.paid ? 'Paid' : 'Unpaid'}</td>
        <td style="text-align:center;">${w9}</td>
        <td style="text-align:center;">${ach}</td>
        <td>${_hesc(p.submittedBy || '—')}</td>
        <td>${approvedBy}</td>
        <td class="hcs-num">${amtStr}</td>
      </tr>`;
    }).join('');
    return rows + `<tr class="hcs-total-row">
      <td colspan="11"><strong>TOTAL</strong></td>
      <td class="hcs-num"><strong>${_hcsFmtLg(runningTotal)}</strong></td>
    </tr>`;
  })();

  /* ── Build department rows (left column) ── */
  const deptRows = _sections.map(def => {
    const bid          = _sectionEstimateTotal(def.id);
    const filtered     = sectionFiltered[def.id] || 0;
    const filteredToday = sectionFilteredToday[def.id] || 0;
    return { id: def.id, name: _getSectionName(def), bid, filtered, filteredToday };
  });

  /* ── File name for reference ── */
  const fileTimestamp = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  const fileName = `HC_${projectTitle.replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_')}_${fileTimestamp}`;

  /* ── Build the summary HTML ── */
  const deptHTML = deptRows.map(r => `
    <tr>
      <td class="hcs-dept">${_hesc(r.name)}</td>
      <td class="hcs-num">${r.filteredToday ? _hcsFmt(r.filteredToday) : '$\u2003—'}</td>
      <td class="hcs-num">${r.filtered ? _hcsFmt(r.filtered) : '$\u2003—'}</td>
    </tr>
  `).join('');

  const summaryHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${_hesc(fileName)}</title>
<style>
  @page { size: letter landscape; margin: 0.4in 0.5in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9px;
    color: #1a1a1a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .hcs-page { width: 100%; max-width: 10in; margin: 0 auto; }

  /* ── HEADER ── */
  .hcs-header { border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; margin-bottom: 6px; }
  .hcs-header-row { display: flex; justify-content: space-between; align-items: baseline; }
  .hcs-show-title { font-size: 16px; font-weight: 700; }
  .hcs-report-stamp { font-size: 9px; color: #555; text-align: right; }
  .hcs-meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 20px; margin-top: 4px; }
  .hcs-meta { font-size: 8.5px; }
  .hcs-meta-label { font-weight: 700; color: #444; }
  .hcs-meta-val { color: #1a1a1a; }

  /* ── BUDGET SUMMARY BAR ── */
  .hcs-summary-bar {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin: 8px 0;
    padding: 6px 0;
    border-top: 1px solid #ccc;
    border-bottom: 1px solid #ccc;
  }
  .hcs-sum-block { text-align: center; }
  .hcs-sum-label { font-size: 8px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
  .hcs-sum-val { font-size: 13px; font-weight: 700; color: #1a1a1a; }
  .hcs-sum-val--neg { color: #c0392b; }
  .hcs-sum-val--pos { color: #1a7a3a; }
  .hcs-sum-sub { font-size: 8px; color: #777; margin-top: 1px; }

  /* ── MAIN BODY: 2-column ── */
  .hcs-body { display: flex; gap: 16px; margin-top: 6px; }
  .hcs-col-left { flex: 1; min-width: 0; }
  .hcs-col-right { flex: 1; min-width: 0; }

  /* ── TABLES ── */
  .hcs-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  .hcs-table th {
    text-align: left;
    font-size: 7.5px;
    font-weight: 700;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1.5px solid #1a1a1a;
    padding: 2px 4px;
  }
  .hcs-table th.hcs-num { text-align: right; }
  .hcs-table td { padding: 1.5px 4px; border-bottom: 0.5px solid #e0e0e0; }
  .hcs-dept { white-space: nowrap; }
  .hcs-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hcs-neg { color: #c0392b; }
  .hcs-pos { color: #1a7a3a; }

  .hcs-total-row td {
    font-weight: 700;
    border-top: 1.5px solid #1a1a1a;
    border-bottom: 2px double #1a1a1a;
    padding-top: 3px;
  }

  .hcs-section-label {
    font-size: 7.5px;
    font-weight: 700;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 0 2px;
    border-bottom: 1px solid #ccc;
    margin-top: 8px;
  }

  /* ── EFC RECONCILIATION ── */
  .hcs-efc-block {
    margin-top: 10px;
    border: 1px solid #ccc;
    padding: 6px 8px;
    font-size: 8.5px;
  }
  .hcs-efc-row { display: flex; justify-content: space-between; padding: 1px 0; }
  .hcs-efc-label { font-weight: 700; }
  .hcs-efc-val { font-variant-numeric: tabular-nums; }

  /* ── ACTIVITY SUMMARY ── */
  .hcs-activity-header { font-size: 8px; color: #555; margin-bottom: 4px; font-style: italic; }

  /* ── NOTES ── */
  .hcs-notes {
    margin-top: 10px;
    border-top: 1px solid #ccc;
    padding-top: 4px;
    font-size: 8px;
    color: #555;
  }
  .hcs-notes-label { font-weight: 700; font-size: 7.5px; text-transform: uppercase; }

  /* ── FOOTER ── */
  .hcs-footer {
    margin-top: 10px;
    padding-top: 4px;
    border-top: 1px solid #ccc;
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    color: #999;
  }

  /* ── ACTIVITY LOG TABLE (Page 2) ── */
  .hcs-activity-table td {
    font-size: 7.5px;
    padding: 1.5px 3px;
    line-height: 1.3;
  }
  .hcs-activity-table th {
    font-size: 6.5px;
    padding: 2px 3px;
  }

  @media print {
    body { background: #fff; }
    .hcs-no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="hcs-page">

  <!-- ── Print toolbar (hidden on print) ── -->
  <div class="hcs-no-print" style="padding:8px 0 12px; display:flex; gap:8px; align-items:center;">
    <button onclick="window.print()" style="padding:6px 16px; font-size:12px; font-weight:600; background:#c9a84c; color:#fff; border:none; border-radius:4px; cursor:pointer;">
      Print / Save as PDF
    </button>
    <button onclick="window.close()" style="padding:6px 16px; font-size:12px; background:#eee; border:1px solid #ccc; border-radius:4px; cursor:pointer;">
      Close
    </button>
    <span style="font-size:11px; color:#777; margin-left:auto;">File: ${_hesc(fileName)}.pdf</span>
  </div>

  <!-- ── ZONE 1: Header ── -->
  <div class="hcs-header">
    <div class="hcs-header-row">
      <span class="hcs-show-title">${_hesc(projectTitle)}${prodNum ? ' — ' + _hesc(prodNum) : ''}</span>
      <span class="hcs-report-stamp">Report Date: ${reportDate}<br>${reportTime}</span>
    </div>
    <div class="hcs-meta-grid">
      <span class="hcs-meta"><span class="hcs-meta-label">${fullDate}</span></span>
      <span class="hcs-meta"><span class="hcs-meta-label">Template: </span><span class="hcs-meta-val">${_hesc(tplLabel)}</span></span>
      <span class="hcs-meta"><span class="hcs-meta-label">Prod Acct: </span><span class="hcs-meta-val">${_hesc(prodAcct) || '—'}</span></span>

      ${company ? `<span class="hcs-meta"><span class="hcs-meta-label">Company: </span><span class="hcs-meta-val">${_hesc(company)}</span></span>` : ''}
      ${director ? `<span class="hcs-meta"><span class="hcs-meta-label">Director: </span><span class="hcs-meta-val">${_hesc(director)}</span></span>` : ''}
      ${producer ? `<span class="hcs-meta"><span class="hcs-meta-label">Producer: </span><span class="hcs-meta-val">${_hesc(producer)}</span></span>` : ''}
    </div>
  </div>

  <!-- ── Status Filter Note ── -->
  <div style="font-size:8px; color:#555; margin-bottom:4px; display:flex; align-items:center; gap:10px;">
    <span style="font-weight:700;">Filters applied:</span>
    <label style="display:inline-flex; align-items:center; gap:3px;">
      <input type="checkbox" ${filters.approved ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
      <span>Approved</span>
    </label>
    <label style="display:inline-flex; align-items:center; gap:3px;">
      <input type="checkbox" ${filters.inReview ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
      <span>In Review</span>
    </label>
    <label style="display:inline-flex; align-items:center; gap:3px;">
      <input type="checkbox" ${filters.quotes ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
      <span>Quotes</span>
    </label>
  </div>

  <!-- ── ZONE 2: Budget Summary Bar ── -->
  <div class="hcs-summary-bar" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
    <div class="hcs-sum-block">
      <div class="hcs-sum-label">Budget</div>
      <div class="hcs-sum-val">${_hcsFmtLg(grandBid)}</div>
    </div>
    <div class="hcs-sum-block">
      <div class="hcs-sum-label">(Over) / Under Budget</div>
      <div class="hcs-sum-val" style="color: ${hasAnyAct ? (grandVar < 0 ? '#8b1a1a' : grandVar > 0 ? '#1a5c2e' : '#1a1a1a') : '#1a1a1a'}">${hasAnyAct ? _hcsFmtLg(grandVar) : '—'}</div>
    </div>
    <div class="hcs-sum-block">
      <div class="hcs-sum-label">Est. Remaining</div>
      <div class="hcs-sum-val">${_hcsFmtLg(estRemaining)}</div>
    </div>
    <div class="hcs-sum-block">
      <div class="hcs-sum-label">Est. Final Cost</div>
      <div class="hcs-sum-val" style="color: ${hasAnyAct && newEfc > grandBid ? '#8b1a1a' : '#1a1a1a'}">${hasAnyAct ? _hcsFmtLg(newEfc) : _hcsFmtLg(grandBid)}</div>
    </div>
  </div>

  <!-- ── ZONE 3 & 4: Body (2-column) ── -->
  <div class="hcs-body">

    <!-- LEFT: Department Breakdown -->
    <div class="hcs-col-left">
      <div class="hcs-section-label">Department Breakdown — Estimated Remaining</div>
      <table class="hcs-table">
        <thead>
          <tr>
            <th>Item</th>
            <th class="hcs-num">Today</th>
            <th class="hcs-num">To Date</th>
          </tr>
        </thead>
        <tbody>
          ${deptHTML}
          <tr>
            <td class="hcs-dept">Insurance (Q)</td>
            <td class="hcs-num">$\u2003—</td>
            <td class="hcs-num">$\u2003—</td>
          </tr>
          <tr>
            <td class="hcs-dept">Contingency (R)</td>
            <td class="hcs-num">$\u2003—</td>
            <td class="hcs-num">$\u2003—</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="hcs-total-row">
            <td class="hcs-dept">TOTAL</td>
            <td class="hcs-num">${totalFilteredToday ? _hcsFmt(totalFilteredToday) : '$\u2003—'}</td>
            <td class="hcs-num">${totalFiltered ? _hcsFmt(totalFiltered) : '$\u2003—'}</td>
          </tr>
        </tfoot>
      </table>

      <!-- EFC Reconciliation -->
      <div class="hcs-efc-block">
        <div class="hcs-efc-row">
          <span class="hcs-efc-label">Budget (Bid)</span>
          <span class="hcs-efc-val">${_hcsFmtLg(grandBid)}</span>
        </div>
        <div class="hcs-efc-row">
          <span class="hcs-efc-label">Purchases (${_hesc(filterNote)})</span>
          <span class="hcs-efc-val">${_hcsFmtLg(totalFiltered)}</span>
        </div>
        <div class="hcs-efc-row" style="border-top:1px solid #ccc; margin-top:2px; padding-top:2px;">
          <span class="hcs-efc-label">Est. Remaining</span>
          <span class="hcs-efc-val">${_hcsFmtLg(estRemaining)}</span>
        </div>
        <div class="hcs-efc-row">
          <span class="hcs-efc-label">Est. Final Cost</span>
          <span class="hcs-efc-val" style="color: ${hasAnyAct && newEfc > grandBid ? '#8b1a1a' : '#1a1a1a'}">${hasAnyAct ? _hcsFmtLg(newEfc) : _hcsFmtLg(grandBid)}</span>
        </div>
        <div class="hcs-efc-row">
          <span class="hcs-efc-label">Δ Est.</span>
          <span class="hcs-efc-val" style="color: ${hasAnyAct ? (deltaEst >= 0 ? '#1a5c2e' : '#8b1a1a') : '#1a1a1a'}">${hasAnyAct ? _hcsFmtLg(deltaEst) : '—'}</span>
        </div>
      </div>
    </div>

    <!-- RIGHT: Activity + Actuals Summary -->
    <div class="hcs-col-right">
      <div class="hcs-section-label">Actuals by Section</div>
      <table class="hcs-table">
        <thead>
          <tr>
            <th>Sec</th>
            <th>Category</th>
            <th class="hcs-num">Bid</th>
            <th class="hcs-num">Actual</th>
            <th class="hcs-num">Variance</th>
          </tr>
        </thead>
        <tbody>
          ${_sections.map(def => {
            const bid = _sectionEstimateTotal(def.id);
            const actual = _sectionActualEstimateTotal(def.id);
            const hasAct = _sectionHasActual(def.id);
            const vari = bid - actual;
            return `<tr>
              <td>${_hesc(def.id)}</td>
              <td class="hcs-dept">${_hesc(_getSectionName(def))}</td>
              <td class="hcs-num">${_hcsFmt(bid)}</td>
              <td class="hcs-num">${hasAct ? _hcsFmt(actual) : '—'}</td>
              <td class="hcs-num">${hasAct ? _hcsFmt(vari) : '—'}</td>
            </tr>`;
          }).join('')}
          <tr>
            <td>Q</td><td class="hcs-dept">Insurance</td>
            <td class="hcs-num">${_hcsFmt(qBid)}</td>
            <td class="hcs-num">${qHas ? _hcsFmt(qAct) : '—'}</td>
            <td class="hcs-num">${qHas ? _hcsFmt(qBid - qAct) : '—'}</td>
          </tr>
          <tr>
            <td>R</td><td class="hcs-dept">Contingency</td>
            <td class="hcs-num">${_hcsFmt(rBid)}</td>
            <td class="hcs-num">${rHas ? _hcsFmt(rAct) : '—'}</td>
            <td class="hcs-num">${rHas ? _hcsFmt(rBid - rAct) : '—'}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="hcs-total-row">
            <td colspan="2" class="hcs-dept">GRAND TOTAL</td>
            <td class="hcs-num">${_hcsFmt(grandBid)}</td>
            <td class="hcs-num">${hasAnyAct ? _hcsFmt(grandActual) : '—'}</td>
            <td class="hcs-num">${hasAnyAct ? _hcsFmt(grandVar) : '—'}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Activity counts -->
      <div class="hcs-section-label" style="margin-top:10px">Activity Summary</div>
      <div class="hcs-activity-header">
        Data reflects all approved &amp; paid purchases from project inception through ${fullDate} at ${reportTime}.
      </div>
      <table class="hcs-table" style="margin-top:4px;">
        <tbody>
          <tr><td>Approved &amp; Paid Purchases</td><td class="hcs-num">${activityCount}</td></tr>
          <tr><td>Pending / In Review</td><td class="hcs-num">${inReviewCount}</td></tr>
          <tr style="font-weight:700;"><td>Total Purchases</td><td class="hcs-num">${purchases.filter(p => p.status !== 'Void').length}</td></tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ── ZONE 5: Notes ── -->
  <div class="hcs-notes">
    <span class="hcs-notes-label">Notes</span>
    <p style="margin-top:2px; min-height:30px; border-bottom: 0.5px solid #ddd; padding-bottom:20px;">&nbsp;</p>
  </div>

  <!-- ── Footer ── -->
  <div class="hcs-footer">
    <span>The Masterbook — Hot Cost Summary</span>
    <span>Generated ${fullDate} at ${reportTime}</span>
    <span>${_hesc(fileName)}</span>
  </div>

</div>

<!-- ════════════════════════════════════════════════════════
     PAGE 2: Daily Activity Log
     ════════════════════════════════════════════════════════ -->
<div class="hcs-page" style="page-break-before: always; margin-top: 20px;">

  <div class="hcs-header" style="margin-bottom:8px;">
    <div class="hcs-header-row">
      <span class="hcs-show-title">Daily Activity Log</span>
      <span class="hcs-report-stamp">${_hesc(projectTitle)}${prodNum ? ' — ' + _hesc(prodNum) : ''}<br>${reportDate} ${reportTime}</span>
    </div>
    <div style="font-size:8px; color:#555; margin-top:4px; display:flex; align-items:center; gap:10px;">
      <span style="font-weight:700;">Filters:</span>
      <label style="display:inline-flex; align-items:center; gap:3px;">
        <input type="checkbox" ${filters.approved ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
        <span>Approved</span>
      </label>
      <label style="display:inline-flex; align-items:center; gap:3px;">
        <input type="checkbox" ${filters.inReview ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
        <span>In Review</span>
      </label>
      <label style="display:inline-flex; align-items:center; gap:3px;">
        <input type="checkbox" ${filters.quotes ? 'checked' : ''} disabled style="accent-color:#555; pointer-events:none;">
        <span>Quotes</span>
      </label>
      <span style="margin-left:auto;">${filteredPurchases.length} entries</span>
    </div>
  </div>

  <table class="hcs-table hcs-activity-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Folder</th>
        <th>Vendor</th>
        <th>Description</th>
        <th>Line</th>
        <th>Status</th>
        <th>Paid</th>
        <th>W9</th>
        <th>ACH</th>
        <th>Submitted By</th>
        <th>Approved By</th>
        <th class="hcs-num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${_activityLogHTML}
    </tbody>
  </table>

  <div class="hcs-footer" style="margin-top:10px;">
    <span>The Masterbook — Daily Activity Log</span>
    <span>Generated ${fullDate} at ${reportTime}</span>
    <span>${_hesc(fileName)}</span>
  </div>
</div>

</body>
</html>`;

  // Open in new window for printing
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (win) {
    win.document.write(summaryHTML);
    win.document.close();
  }
}

/* ── Hot Cost Summary formatting helpers ── */
function _hcsFmt(n) {
  if (n === 0) return '$\u20030';
  const abs = Math.abs(n);
  const formatted = '$ ' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (n < 0) return `<span class="hcs-neg">(${formatted})</span>`;
  return formatted;
}
function _hcsFmtLg(n) {
  const abs = Math.abs(n);
  const formatted = '$ ' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (n < 0) return `(${formatted})`;
  return formatted;
}
function _hesc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
