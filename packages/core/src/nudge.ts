import type { AppState, Session } from './types.js';
import { daysSinceTouched, goalPace, minutesOnDay } from './goals.js';
import { missedBlocksToday, nextBlockToday } from './schedule.js';
import { dayKey, formatMinuteOfDay, hashToSeed } from './util.js';

export type NudgeKind =
  | 'block-soon' | 'block-missed' | 'idle-day' | 'goal-stalled' | 'goal-behind' | 'weekly-review';

export interface Nudge {
  /** Stable per-day key, so the same nudge is not fired twice. */
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high';
  /** The reason this matters, pulled from the mission. */
  why?: string;
  goalId?: string;
  blockId?: string;
}

/** Rotates through your reasons so one never goes stale from repetition. */
export function pickWhy(state: AppState, salt: string): string | undefined {
  const whys = state.mission.whys;
  if (whys.length === 0) return undefined;
  return whys[hashToSeed(salt) % whys.length]?.text;
}

export interface NudgeOptions {
  /** Suppress everything while a session is running -- it is already working. */
  activeSession?: Session | null;
  /** Hour after which "you have done nothing today" is fair to say. */
  idleDayHour?: number;
  /** Days of silence before a goal counts as stalled. */
  stalledAfterDays?: number;
}

/**
 * The reminder brain. Pure: hand it the state and a clock, get back what is
 * worth saying right now. Both apps call this on a timer and hand the results
 * to their own notification system.
 */
export function computeNudges(
  state: AppState,
  now: Date = new Date(),
  opts: NudgeOptions = {},
): Nudge[] {
  const { activeSession = null, idleDayHour = 19, stalledAfterDays = 4 } = opts;
  if (activeSession?.status === 'running') return [];

  const out: Nudge[] = [];
  // Local, not UTC. Everything else in the app -- pace, streaks, "today" --
  // reads the wall calendar, and a nudge that disagreed with the goal card by
  // a day was the result of the one place that did not.
  const day = dayKey(now);

  const upcoming = nextBlockToday(state.blocks, now);
  if (upcoming && upcoming.minutesAway <= 5) {
    out.push({
      id: `soon:${upcoming.block.id}:${day}`,
      kind: 'block-soon',
      urgency: 'normal',
      title: `${upcoming.block.title} in ${upcoming.minutesAway} min`,
      body: `Starts ${formatMinuteOfDay(upcoming.block.startMinute)}. Close what you are doing and plant the tree.`,
      why: pickWhy(state, upcoming.block.id + day),
      blockId: upcoming.block.id,
    });
  }

  for (const block of missedBlocksToday(state.blocks, state.sessions, now)) {
    out.push({
      id: `missed:${block.id}:${day}`,
      kind: 'block-missed',
      urgency: 'high',
      title: `You said ${formatMinuteOfDay(block.startMinute)} — ${block.title}`,
      body: 'The block is running without you. Start now and you still get most of the tree.',
      why: pickWhy(state, block.id + day + 'miss'),
      blockId: block.id,
    });
  }

  if (now.getHours() >= idleDayHour && minutesOnDay(state.sessions) < 1) {
    out.push({
      id: `idle:${day}`,
      kind: 'idle-day',
      urgency: 'high',
      title: 'Nothing planted today',
      body: 'A day with no tree in it. There is still time for one short block.',
      why: pickWhy(state, day),
    });
  }

  for (const goal of state.goals.filter((g) => g.status === 'active')) {
    const silence = daysSinceTouched(goal, state.sessions, now);
    if (silence !== null && silence >= stalledAfterDays) {
      out.push({
        id: `stalled:${goal.id}:${day}`,
        kind: 'goal-stalled',
        urgency: 'normal',
        title: `${goal.title} — untouched ${silence} days`,
        body: goal.rationale ?? 'This is one of your goals. It has gone quiet.',
        why: pickWhy(state, goal.id + day),
        goalId: goal.id,
      });
    }
    const pace = goalPace(goal, day);
    if (pace.pace === 'at-risk' || pace.pace === 'behind') {
      out.push({
        id: `pace:${goal.id}:${day}`,
        kind: 'goal-behind',
        urgency: pace.pace === 'at-risk' ? 'high' : 'low',
        title: `${goal.title} is ${pace.pace === 'at-risk' ? 'at risk' : 'behind'}`,
        body: pace.message,
        why: pickWhy(state, goal.id + 'pace'),
        goalId: goal.id,
      });
    }
  }

  // Sunday evening: look back before looking forward.
  if (now.getDay() === 0 && now.getHours() >= 18) {
    out.push({
      id: `review:${day}`,
      kind: 'weekly-review',
      urgency: 'low',
      title: 'Week in review',
      body: 'Check your goals against where you said you would be, and set next week\u2019s blocks.',
    });
  }

  const rank = { high: 0, normal: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
