import type { AppState } from '@mission/core';
import { migrate } from './local.js';

/**
 * Structural checks on a backup file before it is allowed to replace what is
 * on the device. Import is the one place a user can hand the app a state it
 * did not write, and the failure mode of a bad one is silent: a NaN growth
 * draws an invisible tree, a missing `days` array crashes the scheduler on
 * every render. Better to refuse the file and say which field was wrong.
 */

export type Validation = { ok: true; state: AppState } | { ok: false; reason: string };

const STATUSES = new Set(['active', 'paused', 'done', 'dropped']);
const SESSION_STATUSES = new Set(['running', 'completed', 'abandoned']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const inRange = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function validateState(input: unknown): Validation {
  if (!isObject(input)) return fail('That file is not a Mission Reminder backup.');

  const mission = input.mission;
  if (!isObject(mission) || typeof mission.statement !== 'string') {
    return fail('No mission statement in that file.');
  }
  if (mission.whys !== undefined && !Array.isArray(mission.whys)) {
    return fail('The mission’s reasons are not a list.');
  }

  for (const key of ['goals', 'blocks', 'sessions'] as const) {
    if (!Array.isArray(input[key])) return fail(`Missing the ${key} list.`);
    for (const row of input[key] as unknown[]) {
      if (!isObject(row) || typeof row.id !== 'string' || row.id === '') {
        return fail(`A ${key.slice(0, -1)} has no id.`);
      }
    }
  }

  for (const g of input.goals as Record<string, unknown>[]) {
    if (typeof g.title !== 'string') return fail('A goal has no title.');
    if (!STATUSES.has(String(g.status))) return fail(`Unknown goal status "${g.status}".`);
    if (g.milestones !== undefined && !Array.isArray(g.milestones)) {
      return fail(`Goal "${g.title}" has milestones that are not a list.`);
    }
  }

  for (const b of input.blocks as Record<string, unknown>[]) {
    if (!inRange(b.startMinute, 0, 1439)) return fail('A block starts outside the day.');
    if (!inRange(b.durationMinutes, 1, 24 * 60)) return fail('A block has no length.');
    if (!Array.isArray(b.days) || b.days.some((d) => !inRange(d, 0, 6))) {
      return fail('A block has days that are not 0 to 6.');
    }
  }

  for (const s of input.sessions as Record<string, unknown>[]) {
    if (!SESSION_STATUSES.has(String(s.status))) return fail(`Unknown session status "${s.status}".`);
    if (!inRange(s.growth, 0, 1)) return fail('A session has growth outside 0 to 1.');
    if (!inRange(s.health, 0, 1)) return fail('A session has health outside 0 to 1.');
    if (typeof s.startedAt !== 'string') return fail('A session has no start time.');
  }

  // Unknown extra fields are kept: a backup from a newer build should not lose
  // anything on its way through an older one.
  return { ok: true, state: migrate(input as unknown as AppState) };
}

const fail = (reason: string): Validation => ({ ok: false, reason });
