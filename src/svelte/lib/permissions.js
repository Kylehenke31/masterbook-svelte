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

/** Roles that review submissions rather than file them. */
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

export function isReviewer(role) {
  return REVIEWER_ROLES.includes(role);
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
export function canEditPurchase(purchase, userId, role) {
  if (!purchase) return false;
  if (isReviewer(role)) return true;
  return isAuthor(purchase, userId)
    && AUTHOR_EDITABLE_STATUSES.includes(purchase.status);
}

/** Deleting follows the same rule as editing. */
export const canDeletePurchase = canEditPurchase;

/** Only reviewers decide outcomes. */
export function canApprovePurchase(purchase, userId, role) {
  return !!purchase && isReviewer(role);
}

/**
 * Why editing is blocked, phrased for the person who is blocked.
 * Returns null when editing is allowed.
 */
export function explainEditBlock(purchase, userId, role) {
  if (!purchase) return null;
  if (canEditPurchase(purchase, userId, role)) return null;
  if (isAuthor(purchase, userId)) {
    if (AWAITING_REVIEW_STATUSES.includes(purchase.status)) {
      return 'Submitted for approval — locked until an approver reviews it or sends it back.';
    }
    if (purchase.status === 'Approved') return 'Approved — approved records cannot be changed.';
    if (purchase.status === 'Void')     return 'Voided records cannot be changed.';
    return `${purchase.status} records cannot be changed by the submitter.`;
  }
  return 'Only the person who submitted this, or an approver, can change it.';
}
