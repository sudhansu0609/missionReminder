import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  endSession, hashToSeed, nowISO, pauseSession, reconcileSession, resumeSession,
  seedState, startSession, tick, uid, updateDrift as chargeDrift,
  type AppState, type Block, type Drift, type Goal, type Mission, type Session, type Settings,
} from '@mission/core';
import {
  clearHeartbeat, createLocalRepo, createSupabaseClient, createSyncRepo, guessType,
  readHeartbeat, uploadMedia, writeHeartbeat, HEARTBEAT_SECONDS,
  type Repo,
} from '@mission/data';
import { keepLocally, readBytes } from './media-files';
import type { SupabaseClient } from '@supabase/supabase-js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY_ = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(URL_ && KEY_);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createSupabaseClient({ url: URL_!, anonKey: KEY_! }, AsyncStorage)
  : null;

interface Store {
  state: AppState;
  ready: boolean;
  mode: 'local' | 'synced';
  email: string | null;
  active: Session | null;
  /** The session that finished in this process, until the end screen is dismissed. */
  ended: Session | null;
  setMission(m: Mission): void;
  setSettings(patch: Partial<Settings>): void;
  /** Uploads picked photos when sync is on; keeps a permanent copy either way. */
  ingestMedia(uris: string[]): Promise<string[]>;
  saveGoal(g: Goal): void;
  toggleMilestone(goalId: string, milestoneId: string): void;
  saveBlock(b: Block): void;
  removeBlock(id: string): void;
  begin(input: { title: string; minutes: number; goalId?: string; blockId?: string }): void;
  updateDrift(driftId: string, totalSeconds: number, reason: Drift['reason']): void;
  /** Stops the clock. Growth freezes; leaving during a pause costs nothing. */
  pause(): void;
  /** Starts it again, and charges the stop -- see `resumeSession` in core. */
  resume(): void;
  finish(status: 'completed' | 'abandoned'): void;
  setNote(sessionId: string, note: string): void;
  dismissEnded(): void;
  refreshAuth(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
};

export function StoreProvider({
  children,
  onEvent,
}: {
  children: React.ReactNode;
  /** Lets the app layer fire a local notification without importing expo here. */
  onEvent?: (kind: 'completed' | 'died', session: Session) => void;
}) {
  const [state, setState] = useState<AppState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'local' | 'synced'>('local');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ended, setEnded] = useState<Session | null>(null);
  const repoRef = useRef<Repo>(createLocalRepo(AsyncStorage));
  const stateRef = useRef(state);
  stateRef.current = state;
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  const put = useCallback((updater: (s: AppState) => AppState) => {
    setState((s) => { const next = updater(s); stateRef.current = next; return next; });
  }, []);

  /** One place where a changed session lands: memory, storage, and the end screen. */
  const commitSession = useCallback((next: Session) => {
    put((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
    void repoRef.current.upsertSession(next);
    if (next.status !== 'running') {
      void clearHeartbeat(AsyncStorage);
      setEnded(next);
    }
  }, [put]);

  /**
   * Corrects a session the app was not there for. iOS freezes the JS while the
   * app is backgrounded, so `awaySeconds` is what the app measured itself and
   * the heartbeat is the fallback for the case where it was killed outright.
   * Both charge the *same* episode, so one absence stays one lapse.
   */
  const cameBack = useCallback(async (awaySeconds: number) => {
    const running = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!running) return;
    const beat = await readHeartbeat(AsyncStorage);
    const lastSeen = beat?.sessionId === running.id ? beat.at : null;
    const episode = uid('drift');
    const now = new Date();
    // Leaving during a pause is the point of a pause. `reconcileSession` still
    // runs: it is what settles the paused stretch against the budget.
    const charged = awaySeconds > 0 && !running.pausedAt
      ? chargeDrift(running, episode, awaySeconds, 'left-app', now)
      : running;
    // No heartbeat of ours means this phone was never watching it: it is the
    // desktop's live session, and it is not this side's to freeze or end.
    const next = charged.status === 'running' && lastSeen
      ? reconcileSession(charged, lastSeen, now, episode)
      : charged;
    if (next === running) return;
    commitSession(next);
    if (next.status === 'abandoned') eventRef.current?.('died', next);
  }, [commitSession]);

  const wire = useCallback(async () => {
    const local = createLocalRepo(AsyncStorage);
    let repo: Repo = local;
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        repo = createSyncRepo(local, supabase, data.user.id, AsyncStorage,
                              (e) => console.warn('[sync]', e));
        setEmail(data.user.email ?? null);
        setUserId(data.user.id);
      } else { setEmail(null); setUserId(null); }
    }
    repoRef.current = repo;
    setMode(repo.mode);

    // Anything still running was left mid-block by a kill or a long freeze.
    // Time the app did not witness is not growth -- see reconcileSession.
    // Only a session this phone was watching is corrected; the heartbeat is
    // the proof. One with no heartbeat here is live on the desktop.
    const loaded = await repo.load();
    const running = loaded.sessions.find((s) => s.status === 'running');
    const beat = running ? await readHeartbeat(AsyncStorage) : null;
    if (running && beat?.sessionId === running.id) {
      const fixed = reconcileSession(running, beat.at, new Date());
      if (fixed !== running) {
        setState({ ...loaded, sessions: loaded.sessions.map((s) => (s.id === fixed.id ? fixed : s)) });
        void repo.upsertSession(fixed);
        if (fixed.status !== 'running') {
          await clearHeartbeat(AsyncStorage);
          setEnded(fixed);
        }
        setReady(true);
        return;
      }
    }
    setState(loaded);
    setReady(true);
  }, []);

  useEffect(() => { void wire(); }, [wire]);

  useEffect(() => {
    if (!ready) return;
    return repoRef.current.subscribe(() => {
      void repoRef.current.load().then(setState);
    });
    // Re-subscribes after sign-in or sign-out, when `wire` swaps the repo out.
  }, [ready, mode, userId]);

  const active = useMemo(
    () => state.sessions.find((s) => s.status === 'running') ?? null,
    [state.sessions],
  );

  /**
   * Leaving the app is the phone's version of leaving the desk. The heartbeat
   * is written on the way out, while JS is still allowed to run, so the gap on
   * return is the real absence rather than however stale the last tick was.
   */
  useEffect(() => {
    if (!active) return;
    let leftAt: number | null = null;
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        leftAt = Date.now();
        void writeHeartbeat(AsyncStorage, active.id);
      } else if (next === 'active') {
        const away = leftAt ? (Date.now() - leftAt) / 1000 : 0;
        leftAt = null;
        void cameBack(away);
        void repoRef.current.flush?.();   // back in the foreground, back online
      }
    });
    return () => sub.remove();
  }, [active?.id, cameBack]);

  // One ticker drives the timer, the tree, the heartbeat and auto-completion.
  useEffect(() => {
    if (!active) return;
    let lastBeat = 0;
    const id = setInterval(() => {
      const current = stateRef.current.sessions.find((s) => s.id === active.id);
      if (!current || current.status !== 'running') return;
      const now = Date.now();
      if (now - lastBeat >= HEARTBEAT_SECONDS * 1000) {
        lastBeat = now;
        void writeHeartbeat(AsyncStorage, current.id);
      }
      const next = tick(current);
      // Unchanged means paused: the clock is stopped, so there is nothing to
      // repaint and nothing to write. The heartbeat above still goes out.
      if (next === current) return;
      if (next.status === 'completed') {
        commitSession(next);
        eventRef.current?.('completed', next);
      } else {
        put((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active?.id, commitSession, put]);

  const setMission = useCallback((mission: Mission) => {
    const m = { ...mission, updatedAt: nowISO() };
    put((s) => ({ ...s, mission: m }));
    void repoRef.current.saveMission(m);
  }, [put]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...stateRef.current.settings, ...patch };
    put((s) => ({ ...s, settings: next }));
    void repoRef.current.saveSettings(next);
  }, [put]);

  const ingestMedia = useCallback(async (uris: string[]) => {
    const out: string[] = [];
    for (const uri of uris) {
      if (/^https?:/i.test(uri)) { out.push(uri); continue; }
      try {
        if (supabase && userId) {
          const bytes = await readBytes(uri);
          const { ext, contentType } = guessType(uri);
          out.push(await uploadMedia(supabase, userId, bytes, ext, contentType));
        } else {
          // No account yet: keep it on the phone, out of the OS cache.
          out.push(await keepLocally(uri));
        }
      } catch (e) {
        console.warn('[media] could not store', e);
        out.push(uri);
      }
    }
    return out;
  }, [userId]);

  const saveGoal = useCallback((goal: Goal) => {
    put((s) => ({
      ...s,
      goals: s.goals.some((g) => g.id === goal.id)
        ? s.goals.map((g) => (g.id === goal.id ? goal : g))
        : [...s.goals, goal],
    }));
    void repoRef.current.upsertGoal(goal);
  }, [put]);

  // Hoisted rather than reached through the store object: the Goals screen
  // destructures this off, so `this` would be undefined by the time it ran.
  const toggleMilestone = useCallback((goalId: string, milestoneId: string) => {
    const goal = stateRef.current.goals.find((g) => g.id === goalId);
    if (!goal) return;
    saveGoal({
      ...goal,
      milestones: goal.milestones.map((m) =>
        m.id === milestoneId ? { ...m, doneAt: m.doneAt ? undefined : nowISO() } : m,
      ),
    });
  }, [saveGoal]);

  const saveBlock = useCallback((block: Block) => {
    put((s) => ({
      ...s,
      blocks: s.blocks.some((b) => b.id === block.id)
        ? s.blocks.map((b) => (b.id === block.id ? block : b))
        : [...s.blocks, block],
    }));
    void repoRef.current.upsertBlock(block);
  }, [put]);

  const removeBlock = useCallback((id: string) => {
    put((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }));
    void repoRef.current.deleteBlock(id);
  }, [put]);

  const begin = useCallback((input: {
    title: string; minutes: number; goalId?: string; blockId?: string;
  }) => {
    const goal = stateRef.current.goals.find((g) => g.id === input.goalId);
    const session: Session = {
      ...startSession({ title: input.title, plannedMinutes: input.minutes, goal }),
      blockId: input.blockId,
      goalId: input.goalId,
      species: goal?.species ?? hashToSeed(input.title || uid()),
      lostSeconds: 0,
    };
    setEnded(null);
    put((s) => ({ ...s, sessions: [...s.sessions, session] }));
    void repoRef.current.upsertSession(session);
    void writeHeartbeat(AsyncStorage, session.id);
  }, [put]);

  const updateDrift = useCallback((
    driftId: string, totalSeconds: number, reason: Drift['reason'],
  ) => {
    const current = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!current) return;
    // Nothing is charged while the clock is stopped; the pause pays on resume.
    if (current.pausedAt) return;
    const next = chargeDrift(current, driftId, totalSeconds, reason);
    if (next === current) return;
    commitSession(next);
    if (next.status === 'abandoned') eventRef.current?.('died', next);
  }, [commitSession]);

  const pause = useCallback(() => {
    const current = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!current || current.pausedAt) return;
    commitSession(pauseSession(current));
  }, [commitSession]);

  const resume = useCallback(() => {
    const current = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!current?.pausedAt) return;
    const next = resumeSession(current);
    commitSession(next);
    if (next.status === 'abandoned') eventRef.current?.('died', next);
  }, [commitSession]);

  const finish = useCallback((status: 'completed' | 'abandoned') => {
    const current = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!current) return;
    commitSession(endSession(current, status));
  }, [commitSession]);

  const setNote = useCallback((sessionId: string, note: string) => {
    const session = stateRef.current.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const next = { ...session, note: note.trim() || undefined };
    put((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
    void repoRef.current.upsertSession(next);
  }, [put]);

  const dismissEnded = useCallback(() => setEnded(null), []);

  const store = useMemo<Store>(() => ({
    state, ready, mode, email, active, ended,
    setMission, setSettings, ingestMedia, saveGoal, toggleMilestone, saveBlock, removeBlock,
    begin, updateDrift, pause, resume, finish, setNote, dismissEnded,
    refreshAuth: wire,
  }), [
    state, ready, mode, email, active, ended,
    setMission, setSettings, ingestMedia, saveGoal, toggleMilestone, saveBlock, removeBlock,
    begin, updateDrift, pause, resume, finish, setNote, dismissEnded, wire,
  ]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
