import type { Block, Drift, Goal, ISODate, Session } from './types.js';
import { clamp, hashToSeed, nowISO, uid } from './util.js';

/** Seconds you can glance away before it counts against the tree. */
export const DRIFT_GRACE_SECONDS = 12;
/** Below this, the tree is dead and the session ends itself. */
export const DEATH_HEALTH = 0.001;
/**
 * How stale the app's "I am watching this" mark may be before a gap counts as
 * time the app cannot vouch for. Twice the heartbeat interval, so one missed
 * write is not an accusation.
 */
export const RECONCILE_GRACE_SECONDS = 30;
/**
 * Pause you get for nothing, summed over the whole session. A block you cannot
 * step out of for five minutes is a block you will start lying to.
 */
export const PAUSE_BUDGET_SECONDS = 300;
/**
 * The longest a single pause can be before it stops being a pause. Past this
 * you did not step out, you left, and the session ends where the growth froze.
 */
export const MAX_PAUSE_SECONDS = 20 * 60;

export interface StartSessionInput {
  title: string;
  plannedMinutes: number;
  goal?: Goal;
  block?: Block;
}

export function startSession(input: StartSessionInput): Session {
  const id = uid('ses');
  return {
    id,
    blockId: input.block?.id,
    goalId: input.goal?.id,
    title: input.title,
    plannedMinutes: input.plannedMinutes,
    startedAt: nowISO(),
    status: 'running',
    growth: 0,
    health: 1,
    drifts: [],
    species: input.goal?.species ?? hashToSeed(input.title),
    seed: hashToSeed(id),
  };
}

/**
 * Time actually served: wall clock inside the block, minus what was lost.
 * A paused session's clock stops at `pausedAt`, so growth freezes there; the
 * paused stretch becomes lost time on resume, which is what keeps the two
 * readings continuous across the pause.
 */
export function elapsedSeconds(session: Session, now: Date = new Date()): number {
  const end = session.endedAt
    ? new Date(session.endedAt)
    : session.pausedAt ? new Date(session.pausedAt) : now;
  const wall = (end.getTime() - new Date(session.startedAt).getTime()) / 1000;
  return Math.max(0, wall - (session.lostSeconds ?? 0));
}

export function remainingSeconds(session: Session, now: Date = new Date()): number {
  return Math.max(0, session.plannedMinutes * 60 - elapsedSeconds(session, now));
}

/** Growth is simply time served. Health is the part you can lose. */
export function growthAt(session: Session, now: Date = new Date()): number {
  if (session.status !== 'running') return session.growth;
  return clamp(elapsedSeconds(session, now) / (session.plannedMinutes * 60));
}

/**
 * What a lapse costs. Short glances are free; the price climbs fast, because
 * the whole point is that the cost of "just checking something" is visible.
 *
 * Uncapped on purpose. A cap meant no single absence could ever kill a tree,
 * which made the app's one promise -- leave and it wilts -- false. About four
 * and a half minutes away is now fatal from full health.
 */
export function driftPenalty(seconds: number): number {
  const over = seconds - DRIFT_GRACE_SECONDS;
  if (over <= 0) return 0;
  return clamp(0.1 + (over / 60) * 0.22, 0, 1);
}

export function applyDrift(
  session: Session,
  seconds: number,
  reason: Drift['reason'] = 'left-app',
  now: Date = new Date(),
): Session {
  const penalty = driftPenalty(seconds);
  if (penalty === 0) return session;
  const drifts: Drift[] = [...session.drifts, { at: now.toISOString(), seconds, reason }];
  const health = clamp(session.health - penalty);
  const next: Session = { ...session, drifts, health, growth: growthAt(session, now) };
  if (health <= DEATH_HEALTH) return endSession(next, 'abandoned', now);
  return next;
}

/**
 * Charges one absence progressively. Call it repeatedly during a single
 * episode with the running total and only the delta since the last call comes
 * off health, so the tree wilts *while* you are away rather than all at once
 * on your return. The entry with this id is rewritten in place, so the record
 * still reads as one lapse of N seconds.
 */
export function updateDrift(
  session: Session,
  driftId: string,
  totalSeconds: number,
  reason: Drift['reason'] = 'left-app',
  now: Date = new Date(),
): Session {
  const existing = session.drifts.find((d) => d.id === driftId);
  if (existing && existing.seconds >= totalSeconds) return session;
  const delta = driftPenalty(totalSeconds) - (existing ? driftPenalty(existing.seconds) : 0);
  // Still inside the free glance: nothing to record yet.
  if (!existing && delta <= 0) return session;

  const entry: Drift = {
    id: driftId,
    at: existing?.at ?? now.toISOString(),
    seconds: totalSeconds,
    reason,
  };
  const drifts = existing
    ? session.drifts.map((d) => (d.id === driftId ? entry : d))
    : [...session.drifts, entry];
  const health = clamp(session.health - Math.max(delta, 0));
  const next: Session = { ...session, drifts, health, growth: growthAt(session, now) };
  if (health <= DEATH_HEALTH) return endSession(next, 'abandoned', now);
  return next;
}

/** Seconds of pause already taken and settled, over the whole session. */
export function pauseSecondsUsed(session: Session): number {
  return session.drifts
    .filter((d) => d.reason === 'manual-pause')
    .reduce((n, d) => n + d.seconds, 0);
}

/** Seconds the pause in progress has been running. 0 when not paused. */
export function pauseSecondsRunning(session: Session, now: Date = new Date()): number {
  if (!session.pausedAt) return 0;
  return Math.max(0, (now.getTime() - new Date(session.pausedAt).getTime()) / 1000);
}

/** What is left of the free pause budget, counting the pause in progress. */
export function pauseBudgetLeft(session: Session, now: Date = new Date()): number {
  const used = pauseSecondsUsed(session) + pauseSecondsRunning(session, now);
  return Math.max(0, PAUSE_BUDGET_SECONDS - used);
}

/** Stops the clock. Growth freezes here until `resumeSession`. */
export function pauseSession(session: Session, now: Date = new Date()): Session {
  if (session.status !== 'running' || session.pausedAt) return session;
  return { ...session, pausedAt: now.toISOString(), growth: growthAt(session, now) };
}

/**
 * Starts the clock again, and charges for the stop.
 *
 * The paused wall clock is added to `lostSeconds`, so the time is still owed --
 * the finish line moves rather than the block getting shorter. Pause inside
 * `PAUSE_BUDGET_SECONDS`, summed over the session, costs no health; the excess
 * beyond it is charged like any other absence and can kill the tree. A single
 * pause longer than `MAX_PAUSE_SECONDS` was not a pause: the session ends
 * abandoned at the growth it had when the clock stopped.
 */
export function resumeSession(session: Session, now: Date = new Date()): Session {
  if (session.status !== 'running' || !session.pausedAt) return session;
  const paused = pauseSecondsRunning(session, now);
  // Tapped twice. Nothing happened, so nothing is recorded.
  if (paused <= 0) return { ...session, pausedAt: undefined };

  const entry: Drift = {
    id: `pause:${session.pausedAt}`,
    at: session.pausedAt,
    seconds: paused,
    reason: 'manual-pause',
  };
  const drifts = [...session.drifts, entry];

  if (paused > MAX_PAUSE_SECONDS) {
    // `pausedAt` is still set here on purpose: it is what makes `endSession`
    // read the frozen growth rather than the wall clock it never served.
    const ended = endSession({ ...session, drifts }, 'abandoned', now);
    return { ...ended, pausedAt: undefined };
  }

  // Only the part of the pause past the budget costs health, and the budget is
  // cumulative -- two three-minute stops share it with one six-minute one.
  const before = Math.max(0, pauseSecondsUsed(session) - PAUSE_BUDGET_SECONDS);
  const after = Math.max(0, pauseSecondsUsed(session) + paused - PAUSE_BUDGET_SECONDS);
  const penalty = Math.max(0, driftPenalty(after) - driftPenalty(before));

  const resumed: Session = {
    ...session,
    pausedAt: undefined,
    lostSeconds: (session.lostSeconds ?? 0) + paused,
    drifts,
    health: clamp(session.health - penalty),
  };
  const next: Session = { ...resumed, growth: growthAt(resumed, now) };
  if (next.health <= DEATH_HEALTH) return endSession(next, 'abandoned', now);
  return next;
}

/**
 * Corrects a session the app stopped watching -- it was quit, the machine
 * slept, the phone froze the JS. `lastSeen` is the heartbeat, or null when
 * none was ever written, in which case the session's own start is used.
 *
 * The gap is not growth: the app cannot certify time it did not see. It is
 * charged as a lapse, and if the block's wall-clock window ran out while
 * nobody was looking, the session is abandoned at the growth it had reached.
 * Strict on purpose -- the alternative is that closing the app completes it.
 *
 * A paused session is two stretches, not one. Heartbeats keep being written
 * while paused, so everything up to `lastSeen` was a pause the app watched:
 * it is settled under the ordinary pause rules, budget and cap included, and
 * a pause that ran past `MAX_PAUSE_SECONDS` ends the session here just as it
 * would on a resume. Only what came *after* the last heartbeat is unwatched,
 * and that is charged as a lapse like any other gap. The session stays paused
 * across the correction, with the marker moved to `now` so the frozen growth
 * stays frozen rather than shrinking by the time the app was away.
 */
export function reconcileSession(
  session: Session,
  lastSeen: ISODate | null,
  now: Date = new Date(),
  driftId?: string,
): Session {
  if (session.status !== 'running') return session;
  const started = new Date(session.startedAt).getTime();
  const seen = Math.max(lastSeen ? new Date(lastSeen).getTime() : started, started);

  let current = session;
  if (session.pausedAt) {
    // Never earlier than the pause itself: a heartbeat older than `pausedAt`
    // would otherwise wind the frozen clock backwards.
    const until = Math.max(seen, new Date(session.pausedAt).getTime());
    const settled = resumeSession(session, new Date(until));
    if (settled.status !== 'running') return settled;
    current = { ...settled, pausedAt: new Date(until).toISOString() };
  }

  const gap = (now.getTime() - seen) / 1000;
  if (gap <= RECONCILE_GRACE_SECONDS) return current;

  // Freeze growth first: from here on, `growthAt` reads the value it had at
  // the last heartbeat rather than the value wall clock would suggest.
  const frozen: Session = {
    ...current,
    lostSeconds: (current.lostSeconds ?? 0) + gap,
    ...(current.pausedAt ? { pausedAt: now.toISOString() } : {}),
  };
  // A caller that already charged this absence passes its own episode id, so
  // the delta rule keeps it as one lapse instead of billing it twice.
  const charged = updateDrift(frozen, driftId ?? `gap:${new Date(seen).toISOString()}`,
                              gap, 'left-app', now);
  if (charged.status !== 'running') return charged;

  // The block's window is its planned length plus any time already lost
  // *before* this gap -- the settled pause included. Measured against the
  // pre-gap figure on purpose: adding this gap too would move the finish line
  // by exactly the amount just missed, and the check could never fire.
  const windowEnd = started + session.plannedMinutes * 60000 + (current.lostSeconds ?? 0) * 1000;
  return now.getTime() >= windowEnd ? endSession(charged, 'abandoned', now) : charged;
}

export function endSession(
  session: Session,
  status: 'completed' | 'abandoned',
  now: Date = new Date(),
): Session {
  const growth = growthAt(session, now);
  return {
    ...session,
    status,
    growth,
    // Giving up early leaves a mark, but you keep what you actually grew.
    health: status === 'abandoned' ? clamp(session.health - 0.35) : session.health,
    endedAt: now.toISOString(),
  };
}

/** Call on every tick; completes the session the moment the timer runs out. */
export function tick(session: Session, now: Date = new Date()): Session {
  if (session.status !== 'running') return session;
  // The clock is stopped. Letting the wall clock finish a paused session is
  // exactly the loophole a pause would otherwise open.
  if (session.pausedAt) return session;
  const growth = growthAt(session, now);
  if (growth >= 1) return endSession({ ...session, growth: 1 }, 'completed', now);
  return { ...session, growth };
}

export type Mood = 'thriving' | 'watching' | 'worried' | 'grieving';

/**
 * The companion's state. It is the fast feedback channel -- you read the mood
 * before you read any number.
 */
export function moodOf(session: Session | null, now: Date = new Date()): Mood {
  if (!session) return 'watching';
  if (session.status === 'abandoned') return 'grieving';
  // A pause is permitted. The companion should not read it as drifting off.
  if (session.pausedAt) return 'watching';
  if (session.health < 0.4) return 'worried';
  const last = session.drifts[session.drifts.length - 1];
  if (last && now.getTime() - new Date(last.at).getTime() < 45000) return 'worried';
  if (session.health > 0.85) return 'thriving';
  return 'watching';
}

export const MOOD_LINE: Record<Mood, string> = {
  thriving: 'Growing well. Stay here.',
  watching: 'Still going. Eyes forward.',
  worried: 'It is wilting. Come back to the work.',
  grieving: 'This one did not make it.',
};
