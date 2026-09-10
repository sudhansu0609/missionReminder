import type { Block, Session } from './types.js';
import { dayKey, minuteOfDay, weekdayOf } from './util.js';

export function occursOn(block: Block, date: Date): boolean {
  return block.active && block.days.includes(weekdayOf(date));
}

export function blocksForDay(blocks: Block[], date: Date = new Date()): Block[] {
  return blocks.filter((b) => occursOn(b, date)).sort((a, b) => a.startMinute - b.startMinute);
}

export interface BlockWindow { start: Date; end: Date }

export function windowFor(block: Block, date: Date = new Date()): BlockWindow {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(block.startMinute);
  const end = new Date(start.getTime() + block.durationMinutes * 60000);
  return { start, end };
}

/** Next time this block comes round, searching up to a fortnight out. */
export function nextOccurrence(block: Block, from: Date = new Date()): Date | null {
  if (!block.active || block.days.length === 0) return null;
  for (let i = 0; i < 14; i++) {
    const day = new Date(from);
    day.setDate(day.getDate() + i);
    if (!occursOn(block, day)) continue;
    const { start } = windowFor(block, day);
    if (start.getTime() > from.getTime()) return start;
  }
  return null;
}

export function blockInProgress(blocks: Block[], now: Date = new Date()): Block | null {
  const minute = minuteOfDay(now);
  return (
    blocksForDay(blocks, now).find(
      (b) => minute >= b.startMinute && minute < b.startMinute + b.durationMinutes,
    ) ?? null
  );
}

export interface UpcomingBlock { block: Block; start: Date; minutesAway: number }

export function nextBlockToday(blocks: Block[], now: Date = new Date()): UpcomingBlock | null {
  const minute = minuteOfDay(now);
  const block = blocksForDay(blocks, now).find((b) => b.startMinute > minute);
  if (!block) return null;
  return { block, start: windowFor(block, now).start, minutesAway: block.startMinute - minute };
}

/** Did this block already get honoured today? */
export function wasHonouredToday(
  block: Block, sessions: Session[], now: Date = new Date(),
): boolean {
  const today = dayKey(now);
  return sessions.some(
    (s) => s.blockId === block.id && dayKey(new Date(s.startedAt)) === today && s.status !== 'abandoned',
  );
}

/** Blocks whose start (plus grace) has passed today with nothing to show. */
export function missedBlocksToday(
  blocks: Block[], sessions: Session[], now: Date = new Date(),
): Block[] {
  const minute = minuteOfDay(now);
  return blocksForDay(blocks, now).filter(
    (b) =>
      minute >= b.startMinute + b.graceMinutes &&
      minute < b.startMinute + b.durationMinutes + 90 &&
      !wasHonouredToday(b, sessions, now),
  );
}
