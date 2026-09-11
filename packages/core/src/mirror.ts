import type { AppState, Session } from './types.js';
import { computeNudges, type NudgeKind } from './nudge.js';
import { blocksForDay, nextBlockToday, wasHonouredToday, windowFor } from './schedule.js';
import { formatMinuteOfDay } from './util.js';

/**
 * The read-only picture of "right now" that Mission Reminder leaves on disk for
 * the rest of the machine (`GUARDIAN_PLAN.md` §6, MR1).
 *
 * Dexter is the owner's coworker and does its own nudging; Mission Reminder
 * owns the blocks and the tree. Two systems reminding one person about the same
 * hour is worse than either alone, so this file exists to let Dexter *see* a
 * running block and stay quiet through it. It is a mirror, never an input:
 * nothing outside this app writes it, and nothing here reads it back. The two
 * mission models stay separate — the bridge only goes one way.
 *
 * Times are full ISO instants, not wall-clock strings, so a reader in another
 * process cannot mistake the timezone.
 */
export interface RuntimeMirror {
  mission: { statement: string; whys: string[] };
  today_blocks: MirrorBlock[];
  session: MirrorSession | null;
  next_nudge: MirrorNudge | null;
  updated_at: string;
}

export type MirrorBlockStatus = 'running' | 'done' | 'missed' | 'upcoming';

export interface MirrorBlock {
  id: string;
  name: string;
  /** ISO instant of the block's start today. */
  start: string;
  /** ISO instant of its end. */
  end: string;
  status: MirrorBlockStatus;
}

export interface MirrorSession {
  /** Null for a free session that is not tied to a recurring block. */
  block_id: string | null;
  name: string;
  started_at: string;
  paused: boolean;
}

export interface MirrorNudge {
  /** ISO instant: when this is (or was) due. */
  at: string;
  kind: NudgeKind;
  text: string;
}

export interface MirrorOptions {
  /** The running session, if the caller already has it to hand. */
  activeSession?: Session | null;
}

/**
 * Build the mirror. Pure — hand it the state and a clock, get back the object
 * that goes on disk. Everything about *when* and *where* it is written lives in
 * the Electron main process; this is the part worth testing.
 */
export function buildRuntimeMirror(
  state: AppState,
  now: Date = new Date(),
  opts: MirrorOptions = {},
): RuntimeMirror {
  const active =
    opts.activeSession ?? state.sessions.find((s) => s.status === 'running') ?? null;

  const today_blocks: MirrorBlock[] = blocksForDay(state.blocks, now).map((block) => {
    const { start, end } = windowFor(block, now);
    // `missedBlocksToday` stops calling a block missed 90 minutes after it ends,
    // because past that there is no point nudging about it. A *status* has no
    // such cut-off: a block whose grace ran out with nothing to show was missed
    // at breakfast and is still missed at bedtime.
    const pastGrace = now.getTime() >= start.getTime() + block.graceMinutes * 60_000;
    let status: MirrorBlockStatus = 'upcoming';
    if (active?.blockId === block.id) status = 'running';
    else if (wasHonouredToday(block, state.sessions, now)) status = 'done';
    else if (pastGrace) status = 'missed';
    return {
      id: block.id,
      name: block.title,
      start: start.toISOString(),
      end: end.toISOString(),
      status,
    };
  });

  return {
    mission: {
      statement: state.mission.statement,
      whys: state.mission.whys.map((w) => w.text),
    },
    today_blocks,
    session: active
      ? {
        block_id: active.blockId ?? null,
        name: active.title,
        started_at: active.startedAt,
        paused: Boolean(active.pausedAt),
      }
      : null,
    next_nudge: nextNudge(state, now, active),
    updated_at: now.toISOString(),
  };
}

/**
 * The one thing this app would say next, or nothing.
 *
 * While a session runs `computeNudges` deliberately returns nothing — the
 * person is already doing the work — so the answer is the *next* block instead,
 * dated five minutes before it starts, which is when the "block soon" reminder
 * would fire. That is what makes the field useful to Dexter: it can see both
 * "say nothing, they are working" and "something is coming at 18:25".
 */
function nextNudge(state: AppState, now: Date, active: Session | null): MirrorNudge | null {
  const due = computeNudges(state, now, { activeSession: active });
  const first = due[0];
  if (first) {
    return { at: now.toISOString(), kind: first.kind, text: first.title };
  }
  const upcoming = nextBlockToday(state.blocks, now);
  if (!upcoming) return null;
  const at = new Date(upcoming.start.getTime() - 5 * 60_000);
  return {
    at: at.toISOString(),
    kind: 'block-soon',
    text: `${upcoming.block.title} at ${formatMinuteOfDay(upcoming.block.startMinute)}`,
  };
}
