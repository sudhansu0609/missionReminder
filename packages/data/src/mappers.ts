import { DEFAULT_THEME_ID, type Block, type Goal, type Mission, type Session, type Settings, type Weekday } from '@mission/core';

/**
 * Rows keep the queryable fields as real columns and the nested lists as jsonb.
 * Full normalisation would buy nothing here -- the client always loads the whole
 * dataset -- but flat columns still let you sort and filter in the dashboard.
 */

export const missionToRow = (m: Mission, userId: string, settings?: Settings) => ({
  id: m.id, user_id: userId, statement: m.statement,
  whys: m.whys, media: m.media ?? [],
  ...(settings ? { settings } : {}),
  updated_at: m.updatedAt,
});

export const rowToMission = (r: any): Mission => ({
  id: r.id, statement: r.statement, whys: r.whys ?? [], media: r.media ?? [],
  updatedAt: r.updated_at,
});

/** The mission row doubles as the person's root record, so preferences ride along. */
export const rowToSettings = (r: any): Settings => ({
  themeId: r?.settings?.themeId ?? DEFAULT_THEME_ID,
  showVisionOnStart: r?.settings?.showVisionOnStart ?? true,
});

export const settingsToRow = (settings: Settings, userId: string, missionId: string) => ({
  id: missionId, user_id: userId, settings, updated_at: new Date().toISOString(),
});

export const goalToRow = (g: Goal, userId: string) => ({
  id: g.id, user_id: userId, title: g.title, rationale: g.rationale ?? null,
  status: g.status, created_at: g.createdAt, target_date: g.targetDate ?? null,
  start_date: g.startDate ?? null, estimated_hours: g.estimatedHours ?? null,
  species: g.species, milestones: g.milestones, media: g.media ?? [],
  // Writing a row clears any tombstone on it: an upsert queued after a delete
  // is the user putting it back.
  deleted_at: null,
  updated_at: new Date().toISOString(),
});

export const rowToGoal = (r: any): Goal => ({
  id: r.id, title: r.title, rationale: r.rationale ?? undefined, status: r.status,
  createdAt: r.created_at, targetDate: r.target_date ?? undefined,
  startDate: r.start_date ?? undefined,
  estimatedHours: r.estimated_hours ?? undefined,
  species: r.species, milestones: r.milestones ?? [], media: r.media ?? [],
});

export const blockToRow = (b: Block, userId: string) => ({
  id: b.id, user_id: userId, title: b.title, goal_id: b.goalId ?? null,
  start_minute: b.startMinute, duration_minutes: b.durationMinutes,
  days: b.days, active: b.active, grace_minutes: b.graceMinutes,
  deleted_at: null,
  updated_at: new Date().toISOString(),
});

export const rowToBlock = (r: any): Block => ({
  id: r.id, title: r.title, goalId: r.goal_id ?? undefined,
  startMinute: r.start_minute, durationMinutes: r.duration_minutes,
  days: (r.days ?? []) as Weekday[], active: r.active, graceMinutes: r.grace_minutes,
});

export const sessionToRow = (s: Session, userId: string) => ({
  id: s.id, user_id: userId, block_id: s.blockId ?? null, goal_id: s.goalId ?? null,
  title: s.title, planned_minutes: s.plannedMinutes, started_at: s.startedAt,
  ended_at: s.endedAt ?? null, status: s.status, growth: s.growth, health: s.health,
  drifts: s.drifts, species: s.species, seed: s.seed, note: s.note ?? null,
  lost_seconds: Math.round(s.lostSeconds ?? 0),
  updated_at: new Date().toISOString(),
});

export const rowToSession = (r: any): Session => ({
  id: r.id, blockId: r.block_id ?? undefined, goalId: r.goal_id ?? undefined,
  title: r.title, plannedMinutes: r.planned_minutes, startedAt: r.started_at,
  endedAt: r.ended_at ?? undefined, status: r.status, growth: Number(r.growth),
  health: Number(r.health), drifts: r.drifts ?? [], species: r.species,
  seed: r.seed, note: r.note ?? undefined,
  lostSeconds: Number(r.lost_seconds ?? 0),
});
