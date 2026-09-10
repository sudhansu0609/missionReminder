import type { DayKey, Goal, Session } from './types.js';
import { clamp, dayKey, daysBetween, parseDayKey } from './util.js';

/** Weighted milestone completion. This is "how far in am I", by substance. */
export function milestoneProgress(goal: Goal): number {
  const total = goal.milestones.reduce((n, m) => n + Math.max(m.weight, 0), 0);
  if (total === 0) return 0;
  const done = goal.milestones
    .filter((m) => m.doneAt)
    .reduce((n, m) => n + Math.max(m.weight, 0), 0);
  return clamp(done / total);
}

export function sessionsForGoal(goal: Goal, sessions: Session[]): Session[] {
  return sessions.filter((s) => s.goalId === goal.id);
}

/** Only time actually served counts -- an abandoned session still banks its growth. */
export function focusedMinutes(sessions: Session[]): number {
  return sessions
    .filter((s) => s.status !== 'running')
    .reduce((n, s) => n + s.plannedMinutes * s.growth, 0);
}

/** "How far in am I", by effort. Complements milestone progress. */
export function effortProgress(goal: Goal, sessions: Session[]): number | null {
  if (!goal.estimatedHours || goal.estimatedHours <= 0) return null;
  const hours = focusedMinutes(sessionsForGoal(goal, sessions)) / 60;
  return clamp(hours / goal.estimatedHours);
}

export type Pace = 'ahead' | 'on-track' | 'behind' | 'at-risk' | 'no-deadline';

export interface GoalPace {
  pace: Pace;
  /** Where you should be by now, 0..1. */
  expected: number;
  actual: number;
  daysLeft: number | null;
  /** Human line for the card and for nudges. */
  message: string;
}

export function goalPace(goal: Goal, today: DayKey = dayKey()): GoalPace {
  const actual = milestoneProgress(goal);
  if (!goal.targetDate) {
    return {
      pace: 'no-deadline', expected: actual, actual, daysLeft: null,
      message: 'No date set. A goal without a date is a wish.',
    };
  }
  const start = parseDayKey(goal.startDate ?? goal.createdAt.slice(0, 10));
  const target = parseDayKey(goal.targetDate);
  const now = parseDayKey(today);
  const total = Math.max(daysBetween(start, target), 1);
  const gone = daysBetween(start, now);
  const expected = clamp(gone / total);
  const daysLeft = daysBetween(now, target);
  const delta = actual - expected;

  let pace: Pace;
  if (daysLeft < 0 && actual < 1) pace = 'at-risk';
  else if (delta >= 0.08) pace = 'ahead';
  else if (delta >= -0.08) pace = 'on-track';
  else if (delta >= -0.25) pace = 'behind';
  else pace = 'at-risk';

  const pct = Math.round(actual * 100);
  const message =
    pace === 'at-risk' && daysLeft < 0
      ? `Target date passed with ${pct}% done. Move the date or move.`
      : pace === 'at-risk'
        ? `${pct}% done, ${daysLeft} days left. This one is slipping away.`
        : pace === 'behind'
          ? `${pct}% done, should be near ${Math.round(expected * 100)}%. ${daysLeft} days left.`
          : pace === 'ahead'
            ? `${pct}% done and ahead of schedule. ${daysLeft} days left.`
            : `${pct}% done, on pace. ${daysLeft} days left.`;

  return { pace, expected, actual, daysLeft, message };
}

/** Days since you last put a session into this goal. null = never. */
export function daysSinceTouched(goal: Goal, sessions: Session[], today = new Date()): number | null {
  const mine = sessionsForGoal(goal, sessions).filter((s) => s.status !== 'running');
  if (mine.length === 0) return null;
  const last = mine.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
  return daysBetween(new Date(last.startedAt), today);
}

/** Consecutive days, counting back from today, with at least one completed session. */
export function streakDays(sessions: Session[], today = new Date()): number {
  const days = new Set(
    sessions.filter((s) => s.status === 'completed').map((s) => dayKey(new Date(s.startedAt))),
  );
  let n = 0;
  const cursor = new Date(today);
  // Today not being done yet should not break a streak built yesterday.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function minutesOnDay(sessions: Session[], key: DayKey = dayKey()): number {
  return focusedMinutes(sessions.filter((s) => dayKey(new Date(s.startedAt)) === key));
}

export interface ForestSummary {
  alive: number;
  withered: number;
  hours: number;
  streak: number;
}

export function forestSummary(sessions: Session[]): ForestSummary {
  const done = sessions.filter((s) => s.status !== 'running');
  return {
    alive: done.filter((s) => s.status === 'completed').length,
    withered: done.filter((s) => s.status === 'abandoned').length,
    hours: Math.round((focusedMinutes(done) / 60) * 10) / 10,
    streak: streakDays(sessions),
  };
}
