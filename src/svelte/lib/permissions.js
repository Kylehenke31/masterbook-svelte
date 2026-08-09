/**
 * permissions.js — who may do what to a submission.
 *
 * Pure and dependency-free so it can be unit-tested, and so the UI and the
 * database can be checked against the same stated rule rather than each
 * inventing its own.
 *
 * The authoritative copy of this rule lives in the purchases RLS policies
 * (migration 20260806020000). What is here exists to make the interface tell
 * the truth — greying out a button the server would refuse anyway — not to
 * enforce anything. Any disagreement between the two is a bug in this file,
 * because the server is what actually decides.
 */

import { canEdit as hasEditGrant } from './features.js';

/**
 * Roles that review submissions rather than file them.
 *
 * Kept only as the legacy shorthand. Reviewing is really "holds edit on
 * Expenses", which is what the RLS policy tests — keying the interface on role
 * names instead meant a member granted Expenses: Edit could approve through
 * the API while the app hid the approve buttons from them.
 */
export const REVIEWER_ROLES = ['admin', 'accounting'];

/**
 * Statuses in which a submission still belongs to its author.
 *
 * 'Draft' is saved to their profile and not yet submitted; 'Rejected' is a
 * submission an approver kicked back. Everything else is either awaiting a
 * decision or already settled, and is out of the author's hands.
 *
 * 'Submitted' is the old name for a draft, kept so records created before the
 * rename stay editable by the person who wrote them.
 */
export const AUTHOR_EDITABLE_STATUSES = ['Draft', 'Submitted', 'Rejected'];

/** Statuses meaning "not finished, not sent to anyone yet". */
export const DRAFT_STATUSES = ['Draft', 'Submitted'];

/** Statuses that mean "an approver is looking at this". */
export const AWAITING_REVIEW_STATUSES = ['In Review', 'Pending Approval'];

/**
 * Roles that may commit — the only roles that can cause a file to be written
 * to the production's Dropbox, or money to land in the budget.
 *
 * This is a *role* check, and deliberately narrower than reviewing. Reviewing
 * is 'edit on Expenses', which a coordinator can hold; committing is the
 * decision that makes an expense real, and a production that hands out
 * Expenses: Edit for day-to-day review should not thereby hand out the ability
 * to file paperwork under its own name.
 *
 * Because it is narrower than the purchases RLS policy — which grants updates
 * on the Expenses grant — the database has to enforce this separately, or the
 * button is decoration. See the commit guard in the purchases update policy.
 */
export const COMMIT_ROLES = ['admin', 'accounting'];

/**
 * Does this member review expenses?
 *
 * Accepts the whole membership — { role, permissions } — rather than a role
 * string, because that is the question the database asks: edit on Expenses,
 * however it was granted. A plain crew member holding Expenses: Edit is a
 * reviewer; an admin is one implicitly.
 *
 * Tolerates a bare role string for callers not yet updated, so a stale caller
 * degrades to the old behaviour instead of silently treating everyone as
 * having no access.
 */
export function isReviewer(member) {
  if (!member) return false;
  if (typeof member === 'string') return REVIEWER_ROLES.includes(member);
  return hasEditGrant(member, 'expenses');
}

export function isAuthor(purchase, userId) {
  return !!userId && purchase?.submittedByUserId === userId;
}

/**
 * May this user change this purchase?
 *
 * Reviewers always may — correcting a submission is their job. The author may
 * only while it is still theirs to work on. Nobody else ever may, including
 * other crew on the same project.
 */
export function canEditPurchase(purchase, userId, member) {
  if (!purchase) return false;
  // A committed record is closed to everyone but the roles that could have
  // committed it. Its money is in the budget and its paperwork is filed, so
  // changing it means the books and the filed copy disagree. The RLS policy
  // enforces this; reviewers who are not admins or accountants would otherwise
  // be shown edit and delete buttons that fail on click.
  if (purchase.status === 'Committed') return hasCommitRole(member);
  if (isReviewer(member)) return true;
  return isAuthor(purchase, userId)
    && AUTHOR_EDITABLE_STATUSES.includes(purchase.status);
}

/** Deleting follows the same rule as editing. */
export const canDeletePurchase = canEditPurchase;

/** Only reviewers decide outcomes. */
export function canApprovePurchase(purchase, userId, member) {
  return !!purchase && isReviewer(member);
}

/**
 * May this member commit — turning a reviewed record into a real one?
 *
 * Role-based, not grant-based, and the one place in this file where that is
 * on purpose. Committing files paperwork to the production's Dropbox and puts
 * money in the budget; those are decisions for the people accountable for the
 * books, not for anyone who happens to hold Expenses: Edit so they can help
 * review.
 *
 * Nothing here checks how many approvals a record carries. A one-person show
 * commits its own work; a larger one waits for its accountants to sign off
 * first. Which of those is happening is a judgement for the committer, who can
 * see the approval bubbles, not a rule for this function.
 */
export function canCommitPurchase(purchase, member) {
  if (!purchase) return false;
  if (COMMITTABLE_STATUSES.indexOf(purchase.status) === -1) return false;
  return hasCommitRole(member);
}

/**
 * The role test on its own, without asking about a particular record.
 *
 * Committed records are locked to these roles for *any* change, not just for
 * committing — the RLS policy refuses to let anyone else write a row that is
 * in Committed. Marking one Paid is the case that matters in practice, and it
 * needs to ask the question without a status that canCommitPurchase would
 * reject.
 */
export function hasCommitRole(member) {
  if (!member) return false;
  const role = typeof member === 'string' ? member : member.role;
  return COMMIT_ROLES.includes(role);
}

/** A record has to have been looked at before it can be made real. */
export const COMMITTABLE_STATUSES = ['In Review', 'Pending Approval', 'Approved'];

/**
 * Why editing is blocked, phrased for the person who is blocked.
 * Returns null when editing is allowed.
 */
export function explainEditBlock(purchase, userId, member) {
  if (!purchase) return null;
  if (canEditPurchase(purchase, userId, member)) return null;
  if (isAuthor(purchase, userId)) {
    if (AWAITING_REVIEW_STATUSES.includes(purchase.status)) {
      return 'Submitted for approval — locked until an approver reviews it or sends it back.';
    }
    if (purchase.status === 'Approved')  return 'Approved — waiting to be committed, and locked until it is.';
    if (purchase.status === 'Committed') return 'Committed — it is in the budget and its paperwork is filed.';
    if (purchase.status === 'Void')      return 'Voided records cannot be changed.';
    return `${purchase.status} records cannot be changed by the submitter.`;
  }
  return 'Only the person who submitted this, or an approver, can change it.';
}
