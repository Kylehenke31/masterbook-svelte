/**
 * filingPlan.js — where a project's generated paperwork goes, and whether it
 * goes there on its own.
 *
 * Committing an expense produces documents: a PO packet, a credit card log, a
 * petty cash reconciliation. Until now those went to Dropbox or nowhere. Not
 * every production runs on Dropbox — some keep the job folder on a drive, and
 * some would rather hand the file to a person than have software file it — so
 * the destination is a decision the project makes once, here.
 *
 * Two axes, deliberately kept apart:
 *   destination — dropbox | local | manual
 *   mode        — automatic | prompt
 *
 * A production that files automatically to Dropbox and one that wants to be
 * asked first are running the same workflow with different levels of trust in
 * it, which is a different question from where the file lands.
 */

const DESTINATIONS = ['dropbox', 'local', 'manual'];
const MODES = ['automatic', 'prompt'];

/**
 * A project that has never been asked has `destination: null`, not 'manual'.
 *
 * The difference matters. Every project predates this setting, and they were
 * all filing automatically to Dropbox; defaulting them to 'manual' would have
 * switched filing off on live productions without anyone touching a control.
 * An unset plan resolves against what the project can actually do — Dropbox if
 * it is connected, manual if it is not — which is the rule for a project with
 * no Dropbox anyway, so both cases land where they should.
 */
export const DEFAULT_MODE = 'automatic';

/** The plan as the project stored it. `destination: null` means "never set". */
export function storedPlan(project) {
  const raw = project?.filingPlan || {};
  return {
    destination: DESTINATIONS.includes(raw.destination) ? raw.destination : null,
    mode:        MODES.includes(raw.mode)               ? raw.mode        : DEFAULT_MODE,
    localFolderName: raw.localFolderName || null,
  };
}

/**
 * The plan as it can actually be carried out right now.
 *
 * A project set to file to Dropbox with no Dropbox connected cannot file to
 * Dropbox, and pretending otherwise means paperwork that silently goes
 * nowhere. It falls back to manual — the user keeps the file themselves.
 *
 * The stored plan is left alone rather than rewritten. Overwriting it on
 * disconnect would mean reconnecting Dropbox left the project sitting on
 * manual, with nothing to say that was ever an accident. Intent is stored;
 * what is possible is computed.
 *
 * @param project        the project record
 * @param capabilities   { dropboxConnected, localFolderReady }
 */
export function effectivePlan(project, capabilities = {}) {
  const plan = storedPlan(project);
  const { dropboxConnected = false, localFolderReady = false } = capabilities;

  // Never set: follow the connection. This is both the sensible default and
  // exactly the rule for a project with no Dropbox — files are kept manually.
  if (plan.destination === null) {
    return dropboxConnected
      ? { ...plan, destination: 'dropbox', inferred: true }
      : { ...plan, destination: 'manual', inferred: true,
          reason: 'No Dropbox is connected, so files are kept manually until you choose otherwise.' };
  }

  if (plan.destination === 'dropbox' && !dropboxConnected) {
    return { ...plan, destination: 'manual', degradedFrom: 'dropbox',
             reason: 'Dropbox is not connected, so files are being kept manually.' };
  }
  if (plan.destination === 'local' && !localFolderReady) {
    return { ...plan, destination: 'manual', degradedFrom: 'local',
             reason: 'No project folder has been chosen on this computer, so files are being kept manually.' };
  }
  return plan;
}

/** Does this plan file anywhere on its own, or does a person handle it? */
export function filesAutomatically(plan) {
  return plan.destination !== 'manual' && plan.mode === 'automatic';
}

/** Human summary for the Files window and for confirmation prompts. */
export function describePlan(plan) {
  if (plan.destination === 'manual') {
    return 'Documents are downloaded for you to file yourself. Nothing is stored automatically.';
  }
  const where = plan.destination === 'dropbox' ? 'the project Dropbox' : 'the project folder on this computer';
  return plan.mode === 'automatic'
    ? `Documents are filed to ${where} as soon as something is committed.`
    : `You are asked before anything is filed to ${where}.`;
}

/** Merge a change into the project's stored plan, leaving the rest intact. */
export function withPlan(project, changes) {
  return { ...(project || {}), filingPlan: { ...storedPlan(project), ...changes } };
}
