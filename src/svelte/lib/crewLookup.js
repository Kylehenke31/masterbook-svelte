/**
 * crewLookup.js — read a named position out of the Crew List.
 *
 * Director and Producer used to be typed into Project Settings, next to a Crew
 * List that already had a row for each of them. Two places to put the same
 * name, and nothing keeping them in step: rename the director on the crew list
 * and every document still printed whoever was typed into settings months ago.
 * The crew list is the roster, so it is the answer.
 *
 * Read straight from localStorage rather than through a store, because the
 * callers are a plain module (budget.js, which builds print documents outside
 * the component tree) and a couple of Svelte routes. There is nothing to
 * subscribe to here — every caller is answering "who is it right now" while
 * rendering something.
 */

const CREW_KEY = 'movie-ledger-crew';

function _sections() {
  try {
    const data = JSON.parse(localStorage.getItem(CREW_KEY));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/**
 * The name against an exact position title, or '' if nobody holds it.
 *
 * Exact, deliberately. "Director" matching on a prefix would find Director of
 * Photography — usually first, since Camera sorts above Production — and print
 * the DP as the director on every top sheet. The same trap waits for Producer
 * against Line Producer and Associate Producer, which are different people
 * doing different jobs.
 *
 * The first filled match wins. A crew list can carry blank rows and duplicates,
 * and a row with a position but no name yet should not shadow the real one
 * further down.
 */
export function crewNameForPosition(position) {
  const want = String(position || '').trim().toLowerCase();
  if (!want) return '';
  for (const section of _sections()) {
    for (const row of section?.rows ?? []) {
      if (String(row?.position || '').trim().toLowerCase() !== want) continue;
      const name = String(row?.name || '').trim();
      if (name) return name;
    }
  }
  return '';
}

/** Convenience wrappers — these two are the reason this file exists. */
export function crewDirector() { return crewNameForPosition('Director'); }
export function crewProducer() { return crewNameForPosition('Producer'); }
