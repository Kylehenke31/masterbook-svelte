/**
 * features.js — the canonical list of things a project member can be granted
 * access to, and what the presets expand to.
 *
 * One list, used by the permission editor, by the route guard, and by the RLS
 * helper's expectations. If the UI and the database disagreed about what
 * "expenses" means, a grant would appear to work and quietly not.
 *
 * Access levels are: absent (no access at all), 'read', or 'edit'.
 */

/** Every grantable feature, grouped the way the sidebar presents them. */
export const FEATURES = [
  { group: 'Production', key: 'schedules',   label: 'Schedules',       routes: ['schedules','breakdowns','one-liner','script-order','shooting-schedule','day-out-of-days','elements-report'] },
  { group: 'Production', key: 'call_sheet',  label: 'Call Sheet',      routes: ['call-sheet'] },
  { group: 'Production', key: 'calendar',    label: 'Calendar',        routes: ['calendar'] },
  { group: 'Production', key: 'personnel',   label: 'Personnel',       routes: ['crew'] },

  { group: 'Accounting', key: 'budget',          label: 'Budget',          routes: ['budget','budget-lines','hot-costs','budget-drafts'], financial: true },
  { group: 'Accounting', key: 'expenses',        label: 'All Expenses',    routes: ['log'],           financial: true },
  { group: 'Accounting', key: 'purchase_orders', label: 'Purchase Orders', routes: ['po-log'],        financial: true },
  { group: 'Accounting', key: 'credit_cards',    label: 'Credit Cards',    routes: ['credit-cards'],  financial: true },
  { group: 'Accounting', key: 'petty_cash',      label: 'Petty Cash',      routes: ['petty-cash'],    financial: true },
  { group: 'Accounting', key: 'vendors',         label: 'Vendors',         routes: ['vendors'] },
  { group: 'Accounting', key: 'insurance',       label: 'Insurance',       routes: ['insurance'] },
  { group: 'Accounting', key: 'files',           label: 'Files',           routes: ['files'] },

  // Creative is granted per department: a designer contributes to their own
  // and reads the others, which a single Creative grant cannot express.
  { group: 'Creative', key: 'creative_prod_design',  label: 'Production Design', routes: ['creative-prod-design'] },
  { group: 'Creative', key: 'creative_camera',       label: 'Camera',            routes: ['creative-camera'] },
  { group: 'Creative', key: 'creative_locations',    label: 'Locations',         routes: ['creative-locations'] },
  { group: 'Creative', key: 'creative_costume',      label: 'Costume',           routes: ['creative-costume'] },
  { group: 'Creative', key: 'creative_property',     label: 'Property',          routes: ['creative-property'] },
  { group: 'Creative', key: 'creative_hair_makeup',  label: 'Hair & Makeup',     routes: ['creative-hair-makeup'] },
  { group: 'Creative', key: 'creative_stunts',       label: 'Stunts',            routes: ['creative-stunts'] },
  { group: 'Creative', key: 'creative_continuity',   label: 'Continuity',        routes: ['creative-continuity'] },
];

export const FEATURE_KEYS = FEATURES.map(f => f.key);

/**
 * Routes every member reaches regardless of grants.
 *
 * My Book and the submission form are the reason most people are invited at
 * all — someone who can file an expense but cannot see their own submissions
 * has been given a write-only hole to shout into. The Creative hub is a
 * landing page listing departments; the departments themselves are gated.
 */
export const ALWAYS_ALLOWED_ROUTES = ['home', 'my-book', 'submit', 'creative'];

/**
 * Admin-only screens: otherwise a member could grant themselves anything.
 *
 * 'members' belongs here as much as 'settings' does. It was missed at first,
 * and the Project Access screen's own admin check caught it — a crew member
 * reached the route and saw a refusal rather than being redirected like every
 * other section they cannot open. Nothing leaked, but "you may not be here"
 * should look the same wherever it happens.
 */
export const ADMIN_ONLY_ROUTES = ['settings', 'setup', 'members'];

/**
 * The Accounting preset: Budget, Insurance, Files, every Ledger, Calendars,
 * Personnel and Vendors — not Schedules, Call Sheet or Creative.
 */
export const ACCOUNTING_PRESET = Object.fromEntries(
  ['budget','insurance','files','calendar','personnel','vendors',
   'expenses','purchase_orders','credit_cards','petty_cash'].map(k => [k, 'edit']));

/** Look up which feature owns a route, or null if it is ungated. */
const ROUTE_TO_FEATURE = (() => {
  const m = {};
  for (const f of FEATURES) for (const r of f.routes) m[r] = f.key;
  return m;
})();

export function featureForRoute(route) {
  return ROUTE_TO_FEATURE[route] ?? null;
}

/**
 * What level does this member have on a feature?
 * Admins have 'edit' on everything, including features added after they were
 * granted access — which is the point of being an admin.
 */
export function levelFor(member, featureKey) {
  if (!member) return null;
  if (member.role === 'admin') return 'edit';
  // 'accounting' predates per-feature grants; treat it as the preset it named.
  if (member.role === 'accounting' && ACCOUNTING_PRESET[featureKey]) return 'edit';
  const level = member.permissions?.[featureKey];
  return level === 'edit' || level === 'read' ? level : null;
}

export function canRead(member, featureKey) {
  return levelFor(member, featureKey) !== null;
}

export function canEdit(member, featureKey) {
  return levelFor(member, featureKey) === 'edit';
}

/**
 * Which feature owns a sync section, for enforcing read-only on writes.
 *
 * Sections are the unit the sync layer deals in; features are the unit people
 * are granted. Where a section has no entry here it is ungoverned and writes
 * pass — better than inventing a mapping and silently blocking something.
 *
 * `files` and `creative` share the creative table but are different features,
 * which is why this is keyed by section name rather than table.
 */
export const SECTION_FEATURE = {
  budget:      'budget',
  personnel:   'personnel',
  calendars:   'calendar',
  schedules:   'schedules',
  call_sheets: 'call_sheet',
  vendors:     'vendors',
  insurance:   'insurance',
  files:       'files',
  creditCards: 'credit_cards',
  pettyCash:   'petty_cash',
  // 'creative' is deliberately absent: it is granted per department, and the
  // whole-section blob cannot tell which department a change belongs to.
  // Enforcing it needs the per-department split the data does not have yet.
};

/** May this member open this route at all? */
export function canAccessRoute(member, route) {
  if (!member) return false;
  if (member.role === 'admin') return true;
  if (ADMIN_ONLY_ROUTES.includes(route)) return false;
  if (ALWAYS_ALLOWED_ROUTES.includes(route)) return true;
  const feature = featureForRoute(route);
  if (!feature) return true;          // ungated screens stay reachable
  return canRead(member, feature);
}
