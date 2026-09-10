import type { AppState, Block, DayKey, ID, Session, Weekday } from './types.js';
import { focusedMinutes, streakDays } from './goals.js';
import { occursOn, windowFor } from './schedule.js';
import { dayKey } from './util.js';

/**
 * The Sunday look-back, as data. The nudge has always existed; this is the
 * thing it can now open. Pure, like every other rule: hand it the state and a
 * clock and it says what the week actually was.
 */
export interface WeekReview {
  weekStart: DayKey; // Monday
  weekEnd: DayKey; // Sunday
  /** Sessions that ended inside the week, newest first. */
  sessions: Session[];
  trees: { alive: number; dead: number };
  minutesByGoal: { goalId?: ID; title: string; minutes: number }[];
  blocks: { planned: number; kept: number; missed: number };
  /** Consecutive days with a completed session, ending at now or the week end. */
  streakDays: number;
  nextWeek: { block: Block; days: Weekday[] }[];
}

/** How early a session may start and still count as keeping the block. */
const EARLY_GRACE_MINUTES = 5;

/**
 * Local Monday, 00:00, of the week containing `d`. The domain counts weekdays
 * from Sunday because that is what `Date.getDay` does; a *week*, to a person
 * planning one, starts on Monday.
 */
export function weekStartOf(d: Date = new Date()): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Monday = 0 .. Sunday = 6, for ordering a week the way it is lived. */
const mondayFirst = (day: Weekday): number => (day + 6) % 7;

export function weekReview(state: AppState, now: Date = new Date(), weeksAgo = 0): WeekReview {
  const start = weekStartOf(now);
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const after = new Date(start);
  after.setDate(after.getDate() + 7);

  const within = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t < after.getTime();
  };
  // A session belongs to the week it finished in. Started Sunday night and
  // finished after midnight, it is next week's tree, which is where the forest
  // already files it.
  const at = (s: Session) => s.endedAt ?? s.startedAt;

  const sessions = state.sessions
    .filter((s) => s.status !== 'running' && within(at(s)))
    .sort((a, b) => (at(a) < at(b) ? 1 : -1));

  // Grouped by goal, and abandoned sessions count: the minutes were served
  // whatever became of the tree.
  const groups = new Map<string, Session[]>();
  for (const s of sessions) groups.set(s.goalId ?? '', [...(groups.get(s.goalId ?? '') ?? []), s]);
  const minutesByGoal = [...groups.entries()]
    .map(([goalId, group]) => ({
      goalId: goalId || undefined,
      title: state.goals.find((g) => g.id === goalId)?.title ?? 'No goal',
      minutes: focusedMinutes(group),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  let planned = 0;
  let kept = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    if (day.getTime() > now.getTime()) break;
    for (const block of state.blocks) {
      if (!occursOn(block, day)) continue;
      // A block on Thursday is not missed on Wednesday, and this morning's
      // block is not missed at breakfast. An instance is planned once the
      // moment it could still have been kept has passed -- the same line
      // `missedBlocksToday` draws -- so the count never runs ahead of you.
      const due = windowFor(block, day).start.getTime() + block.graceMinutes * 60000;
      if (due > now.getTime()) continue;
      planned++;
      if (wasKept(block, day, state.sessions)) kept++;
    }
  }

  return {
    weekStart: dayKey(start),
    weekEnd: dayKey(end),
    sessions,
    trees: {
      alive: sessions.filter((s) => s.status === 'completed').length,
      dead: sessions.filter((s) => s.status === 'abandoned').length,
    },
    minutesByGoal,
    blocks: { planned, kept, missed: planned - kept },
    // A past week's streak is read at its end, not from today.
    streakDays: streakDays(state.sessions, weeksAgo === 0 ? now : new Date(after.getTime() - 1)),
    nextWeek: state.blocks
      .filter((b) => b.active)
      .map((b) => ({ block: b, days: [...b.days].sort((x, y) => mondayFirst(x) - mondayFirst(y)) }))
      .sort((a, b) => firstDay(a.days) - firstDay(b.days) || a.block.startMinute - b.block.startMinute),
  };
}

const firstDay = (days: Weekday[]): number => {
  const first = days[0];
  return first === undefined ? 7 : mondayFirst(first);
};

/**
 * One scheduled instance of a block, honoured. The window is generous at the
 * front (five minutes early is still keeping the promise) and runs to the end
 * of the grace period plus the block itself, so a late start still counts as
 * long as the session finished.
 */
function wasKept(block: Block, day: Date, sessions: Session[]): boolean {
  const { start } = windowFor(block, day);
  const from = start.getTime() - EARLY_GRACE_MINUTES * 60000;
  const to = start.getTime() + (block.graceMinutes + block.durationMinutes) * 60000;
  return sessions.some((s) => {
    if (s.blockId !== block.id || s.status !== 'completed') return false;
    const began = new Date(s.startedAt).getTime();
    return began >= from && began <= to;
  });
}
