import {
  seedState, type AppState, type Block, type Goal, type Mission, type Session, type Settings,
} from '@mission/core';
import { STATE_KEY, type KV, type Repo } from './repo.js';

/**
 * Whole-state-as-JSON storage. The dataset is a few hundred rows at most over
 * years of use, so there is nothing to gain from anything cleverer, and a
 * single blob makes the offline cache trivially consistent.
 */
export function createLocalRepo(kv: KV): Repo {
  let cache: AppState | null = null;
  const listeners = new Set<() => void>();

  const persist = async (state: AppState) => {
    cache = state;
    await kv.setItem(STATE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn());
  };

  const read = async (): Promise<AppState> => {
    if (cache) return cache;
    const raw = await kv.getItem(STATE_KEY);
    if (!raw) {
      const fresh = seedState();
      await persist(fresh);
      return fresh;
    }
    try {
      cache = migrate(JSON.parse(raw) as AppState);
      return cache;
    } catch {
      // Corrupt cache should cost you your history, not your ability to start.
      const fresh = seedState();
      await persist(fresh);
      return fresh;
    }
  };

  const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i === -1) return [...list, item];
    const next = [...list];
    next[i] = item;
    return next;
  };

  return {
    mode: 'local',
    async load() { return read(); },
    async saveMission(mission: Mission) {
      const s = await read();
      await persist({ ...s, mission });
    },
    async saveSettings(settings: Settings) {
      const s = await read();
      await persist({ ...s, settings });
    },
    async upsertGoal(goal: Goal) {
      const s = await read();
      await persist({ ...s, goals: upsert(s.goals, goal) });
    },
    async deleteGoal(id: string) {
      const s = await read();
      await persist({ ...s, goals: s.goals.filter((g) => g.id !== id) });
    },
    async upsertBlock(block: Block) {
      const s = await read();
      await persist({ ...s, blocks: upsert(s.blocks, block) });
    },
    async deleteBlock(id: string) {
      const s = await read();
      await persist({ ...s, blocks: s.blocks.filter((b) => b.id !== id) });
    },
    async upsertSession(session: Session) {
      const s = await read();
      await persist({ ...s, sessions: upsert(s.sessions, session) });
    },
    async replaceAll(state: AppState) {
      await persist(state);
    },
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

/** Fills in anything a state written by an older build is missing. */
export function migrate(state: AppState): AppState {
  return {
    ...state,
    mission: { ...state.mission, media: state.mission.media ?? [], whys: state.mission.whys ?? [] },
    goals: state.goals ?? [],
    blocks: state.blocks ?? [],
    // Sessions written before lost time existed were all watched throughout,
    // because there was no other way to run one.
    sessions: (state.sessions ?? []).map((x) => ({ ...x, lostSeconds: x.lostSeconds ?? 0 })),
    settings: state.settings ?? seedState().settings,
  };
}

/** Memory-only KV, for tests and for the brief window before storage is ready. */
export function memoryKV(): KV {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}
