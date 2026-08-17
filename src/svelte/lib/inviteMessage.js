/**
 * inviteMessage.js — composes the message an admin sends to invite someone.
 *
 * The app does not send mail. It composes, and a person sends — the same shape
 * as the call sheet's email template, which resolves tokens and hands the text
 * to the clipboard. Keeping invites on that pattern means no sending domain,
 * no API key, and no new way for the invite to fail after the row is written.
 *
 * The link carries no secret and does not need to. accept_project_invites()
 * matches an invite to the signed-in user's own email address, so controlling
 * the invited mailbox *is* the credential — a stranger opening the link gets
 * nothing, because they cannot authenticate as that address. The ?invite=
 * parameter is a convenience that prefills the sign-up form, not a token.
 */

import { FEATURES, levelFor } from './features.js';
import { APP_ORIGIN } from './appOrigin.js';

/**
 * The link is for somebody else, so it points at the app's real address rather
 * than at whatever host it was composed from. It used to default to
 * window.location.origin, which meant an invite written from a dev server went
 * out pointing at http://localhost:5173 — an address that resolves, on the
 * recipient's machine, to nothing at all.
 *
 * The origin is still an argument so a caller can override it, but no caller
 * should need to.
 */
export function inviteLink(email, origin = APP_ORIGIN) {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/?invite=${encodeURIComponent(String(email || '').trim().toLowerCase())}`;
}

/**
 * Plain-English summary of what an invite grants, for the message body.
 * An admin gets everything; otherwise name the sections rather than counting
 * them, because "5 sections" tells the recipient nothing about what they can do.
 */
export function describeAccess(role, permissions) {
  if (role === 'admin') return 'Full access, including project settings and member management.';
  // levelFor wants the member shape, not a bare permissions map, and answers
  // 'edit' | 'read' | null. View-only sections are called out, since being
  // able to open Budget and being able to change it are different jobs.
  const member = { role, permissions: permissions || {} };
  const named = FEATURES
    .map(f => ({ label: f.label, level: levelFor(member, f.key) }))
    .filter(f => f.level)
    .map(f => (f.level === 'read' ? `${f.label} (view only)` : f.label));
  if (!named.length) return 'No sections yet — whoever invited you can add them.';
  return named.join(', ');
}

/**
 * The message body.
 *
 * The warning about the address is not boilerplate: acceptance matches on the
 * authenticated email, so signing up with a different one lands the person in
 * an app with no project and no explanation of why. It is the single thing
 * this message exists to prevent, so it gets its own line rather than a
 * parenthetical.
 */
export function composeInvite({ email, projectName, invitedBy, role, permissions, origin }) {
  const who  = invitedBy ? `${invitedBy} has invited you` : 'You have been invited';
  const proj = projectName || 'a project';
  const addr = String(email || '').trim().toLowerCase();

  return [
    `${who} to join ${proj} on The Masterbook.`,
    '',
    `Your access: ${describeAccess(role, permissions)}`,
    '',
    'To accept, sign up here:',
    inviteLink(addr, origin),
    '',
    `Please sign up using ${addr}. The invite is tied to that address — if you`,
    'sign up with a different one, it will not be found.',
  ].join('\n');
}

/** Subject line, for when the admin is pasting into a mail client. */
export function inviteSubject(projectName) {
  return `You have been added to ${projectName || 'a project'} on The Masterbook`;
}

/**
 * A mailto: URL, so "open in my mail client" is one click.
 *
 * Long bodies can exceed what some clients accept in a URL, so the copy button
 * stays the reliable path and this is the convenience on top of it.
 */
export function inviteMailto(args) {
  // The address goes in raw. Percent-encoding the @ produces
  // "mailto:someone%40example.com", which several mail clients hand back as a
  // malformed recipient — only the query part wants encoding.
  const to = String(args.email || '').trim().toLowerCase();
  const subject = encodeURIComponent(inviteSubject(args.projectName));
  const body = encodeURIComponent(composeInvite(args));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
