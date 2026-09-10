/** Domain model shared by the desktop and mobile apps. */

export type ID = string;
export type ISODate = string; // full ISO timestamp
export type DayKey = string; // 'YYYY-MM-DD'

export type MediaKind = 'image' | 'video' | 'link';

/**
 * A photo, a video link, or a plain link kept alongside a reason or a goal.
 * Words go stale faster than pictures do -- the point of this is that the
 * thing you are actually after can be looked at, not just read.
 */
export interface Media {
  id: ID;
  kind: MediaKind;
  /**
   * Either an http(s) URL (syncs everywhere) or a device-local file URI from
   * the photo picker (stays on the device that added it, unless sync is on and
   * the file was uploaded).
   */
  url: string;
  caption?: string;
  order: number;
}

/** Cross-device preferences. Kept with the mission, one row per person. */
export interface Settings {
  themeId: string;
  /** Show the mission and a reason for a few seconds before the timer starts. */
  showVisionOnStart: boolean;
}

/**
 * The thing everything else hangs off. One statement, and the reasons behind
 * it. The reasons matter more than the statement -- they are what gets shown
 * back to you when you are about to drift.
 */
export interface Mission {
  id: ID;
  statement: string;
  /** Ordered. Shown one at a time on session start and in nudges. */
  whys: Why[];
  /** The vision board: what the mission looks like from the outside. */
  media: Media[];
  updatedAt: ISODate;
}

export interface Why {
  id: ID;
  text: string;
  /** Optional gut-punch framing: what happens if you don't. */
  cost?: string;
  /** One image or video shown with this reason, wherever the reason appears. */
  media?: Media;
}

export type GoalStatus = 'active' | 'paused' | 'done' | 'dropped';

/** A concrete outcome that serves the mission, with a date and milestones. */
export interface Goal {
  id: ID;
  title: string;
  /** Why this goal serves the mission. One line. */
  rationale?: string;
  status: GoalStatus;
  createdAt: ISODate;
  /** When you said you'd have this. Drives pace / "am I behind" maths. */
  targetDate?: DayKey;
  startDate?: DayKey;
  milestones: Milestone[];
  /** Hours you believe this goal needs. Used for the effort progress bar. */
  estimatedHours?: number;
  /** Stable per-goal seed -> every goal grows a visually distinct species. */
  species: number;
  /** What this goal looks like done. Optional. */
  media?: Media[];
}

export interface Milestone {
  id: ID;
  title: string;
  /** Relative size. A milestone of weight 3 is 3x a milestone of weight 1. */
  weight: number;
  doneAt?: ISODate;
  order: number;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

/**
 * A recurring commitment: "Mon-Fri 06:30, 50 minutes, on the book."
 * Blocks are the promise; sessions are what actually happened.
 */
export interface Block {
  id: ID;
  title: string;
  goalId?: ID;
  /** Minutes from local midnight. 390 = 06:30. */
  startMinute: number;
  durationMinutes: number;
  days: Weekday[];
  active: boolean;
  /** Minutes after start before the app decides you've forgotten. */
  graceMinutes: number;
}

export type SessionStatus = 'running' | 'completed' | 'abandoned';

/** One attempt at a block. Produces exactly one tree, alive or dead. */
export interface Session {
  id: ID;
  blockId?: ID;
  goalId?: ID;
  title: string;
  plannedMinutes: number;
  startedAt: ISODate;
  endedAt?: ISODate;
  status: SessionStatus;
  /** 0..1, how far the tree got. Frozen at the moment the session ended. */
  growth: number;
  /** 0..1. Drops on every drift. At 0 the tree is dead. */
  health: number;
  /** Times you left the app / went idle during the session. */
  drifts: Drift[];
  /**
   * Wall-clock seconds inside the block that did not count, because the app
   * was not watching them. Growth is elapsed time *minus* this, so closing the
   * app cannot be a way of serving time you did not serve.
   */
  lostSeconds?: number;
  species: number;
  /** Per-session randomness so two trees of one species still differ. */
  seed: number;
  note?: string;
}

export interface Drift {
  /**
   * Stable per-episode id. One continuous absence is one entry, charged
   * progressively while it lasts -- see `updateDrift`. Absent on rows written
   * by builds before that existed.
   */
  id?: ID;
  at: ISODate;
  /** How long you were gone, in seconds. */
  seconds: number;
  reason: 'left-app' | 'idle' | 'manual-pause';
}

/** Everything the UI needs, in one bag. */
export interface AppState {
  mission: Mission;
  goals: Goal[];
  blocks: Block[];
  sessions: Session[];
  settings: Settings;
}
