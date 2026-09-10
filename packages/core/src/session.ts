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

/** Time actually served: wall clock inside the block, minus what was lost. */
export function elapsedSeconds(session: Session, now: Date = new Date()): number {
  const end = session.endedAt ? new Date(session.endedAt) : now;
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

/**
 * Corrects a session the app stopped watching -- it was quit, the machine
 * slept, the phone froze the JS. `lastSeen` is the heartbeat, or null when
 * none was ever written, in which case the session's own start is used.
 *
 * The gap is not growth: the app cannot certify time it did not see. It is
 * charged as a lapse, and if the block's wall-clock window ran out while
 * nobody was looking, the session is abandoned at the growth it had reached.
 * Strict on purpose -- the alternative is that closing the app completes it.
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
  const gap = (now.getTime() - seen) / 1000;
  if (gap <= RECONCILE_GRACE_SECONDS) return session;

  // Freeze growth first: from here on, `growthAt` reads the value it had at
  // the last heartbeat rather than the value wall clock would suggest.
  const frozen: Session = { ...session, lostSeconds: (session.lostSeconds ?? 0) + gap };
  // A caller that already charged this absence passes its own episode id, so
  // the delta rule keeps it as one lapse instead of billing it twice.
  const charged = updateDrift(frozen, driftId ?? `gap:${new Date(seen).toISOString()}`,
                              gap, 'left-app', now);
  if (charged.status !== 'running') return charged;

  // The block's window is its planned length plus any time already lost
  // *before* this gap. Measured against the pre-gap figure on purpose: adding
  // this gap too would move the finish line by exactly the amount just missed,
  // and the check could never fire.
  const windowEnd = started + session.plannedMinutes * 60000 + (session.lostSeconds ?? 0) * 1000;
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
