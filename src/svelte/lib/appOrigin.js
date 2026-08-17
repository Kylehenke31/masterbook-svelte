/**
 * appOrigin.js — where this app actually lives, as far as the outside world
 * is concerned.
 *
 * Distinct from window.location.origin, which is wherever the person happens
 * to have the app open: localhost during development, a per-deployment
 * *.vercel.app URL when someone opens a preview build, the real domain in
 * normal use. That distinction matters for anything handed to a third party,
 * because those two other answers are addresses nobody else can reach.
 *
 * One constant because it has to agree with things outside this codebase —
 * the DNS record, and the redirect URI registered in the Dropbox app console.
 * When it was written down in more than one file, changing the domain meant
 * finding them all.
 */
export const APP_ORIGIN = 'https://masterbook.net';

/** Is the app being used from its real address, rather than a dev or preview host? */
export function onCanonicalOrigin() {
  return typeof window !== 'undefined' && window.location.origin === APP_ORIGIN;
}
