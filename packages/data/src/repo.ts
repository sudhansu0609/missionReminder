import type { AppState, Block, Goal, Mission, Session, Settings } from '@mission/core';

/**
 * The storage contract. Both apps talk to this and never to Supabase directly,
 * so the app runs identically with or without an account.
 */
export interface Repo {
  load(): Promise<AppState>;
  saveMission(mission: Mission): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  upsertGoal(goal: Goal): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  upsertBlock(block: Block): Promise<void>;
  deleteBlock(id: string): Promise<void>;
  upsertSession(session: Session): Promise<void>;
  /** Overwrite the whole cache in one write. Used by sync, not by the UI. */
  replaceAll(state: AppState): Promise<void>;
  /** Fires when another device changes something. Returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void;
  /**
   * Sends anything queued. The stores call it when the machine comes back
   * online or the phone comes to the foreground; a local repo has no queue.
   */
  flush?(): Promise<void>;
  readonly mode: 'local' | 'synced';
}

/** Minimal key-value surface: localStorage on desktop, AsyncStorage on mobile. */
export interface KV {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
}

export const STATE_KEY = 'mission-reminder:state:v1';
