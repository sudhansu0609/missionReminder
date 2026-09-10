import type { ISODate, Mission } from './types.js';

/**
 * The mission screen keeps a local draft, and the mission itself now arrives
 * from the other device while you are looking at it. Two rules, both here so
 * the two apps cannot drift into disagreeing about them.
 */

/**
 * Should the local draft be replaced by what just arrived?
 *
 * Only when there is nothing to lose. An untouched draft silently catches up;
 * a touched one is left alone and the screen offers the reload instead --
 * clobbering half-written reasons to stay in sync is the wrong trade.
 */
export function shouldReseed(
  draftDirty: boolean,
  remoteUpdatedAt: ISODate,
  seededAt: ISODate,
): boolean {
  return remoteUpdatedAt !== seededAt && !draftDirty;
}

/**
 * Same mission, ignoring the stamp. Saving rewrites `updatedAt`, so comparing
 * timestamps alone would read your own save coming back as somebody else's
 * edit.
 */
export function sameMission(a: Mission, b: Mission): boolean {
  return JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });
}
