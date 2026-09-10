import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  blockToStartNow, endSession, getTheme, hashToSeed, nowISO, pauseSession,
  reconcileSession, resumeSession, seedState, startSession, tick, uid,
  updateDrift as chargeDrift,
  type AppState, type Block, type Drift, type Goal, type Mission, type Session,
  type Settings, type Theme,
} from '@mission/core';
import {
  clearHeartbeat, createLocalRepo, createSupabaseClient, createSyncRepo, guessType,
  readHeartbeat, uploadMedia, writeHeartbeat, HEARTBEAT_SECONDS,
  type Repo,
} from '@mission/data';
import type { SupabaseClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(URL_ && KEY_);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createSupabaseClient({ url: URL_!, anonKey: KEY_! })
  : null;

interface Store {
  state: AppState;
  ready: boolean;
  mode: 'local' | 'synced';
  email: string | null;
  active: Session | null;
  theme: Theme;
  userId: string | null;
  /** The session that finished in this process, until the end screen is dismissed. */
  ended: Session | null;
  setMission(m: Mission): void;
  setSettings(patch: Partial<Settings>): void;
  /**
   * Turns picked or pasted URLs into ones worth storing: local files are
   * uploaded when sync is on, so a photo added here shows up on the phone.
   */
  ingestMedia(urls: string[]): Promise<string[]>;
  saveGoal(g: Goal): void;
  removeGoal(id: string): void;
  toggleMilestone(goalId: string, milestoneId: string): void;
  saveBlock(b: Block): void;
  removeBlock(id: string): void;
  begin(input: { title: string; minutes: number; goalId?: string; blockId?: string }): void;
  /**
   * Charges one absence. Called repeatedly with the running total for the same
   * `driftId`, so the tree wilts while you are away rather than all at once on
   * your return -- and a long enough absence kills it before you get back.
   */
  updateDrift(driftId: string, totalSeconds: number, reason: Drift['reason']): void;
  /** Stops the clock. Growth freezes; leaving during a pause costs nothing. */
  pause(): void;
  /** Starts it again, and charges the stop -- see `resumeSession` in core. */
  resume(): void;
  finish(status: 'completed' | 'abandoned'): void;
  setNote(sessionId: string, note: string): void;
  dismissEnded(): void;
  /** Replaces everything on this device, from a validated backup. */
  importState(next: AppState): Promise<void>;
  refreshAuth(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'local' | 'synced'>('local');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ended, setEnded] = useState<Session | null>(null);
  const repoRef = useRef<Repo>(createLocalRepo(window.localStorage));
  const stateRef = useRef(state);
  stateRef.current = state;

  const put = useCallback((updater: (s: AppState) => AppState) => {
    setState((s) => { const next = updater(s); stateRef.current = next; return next; });
  }, []);

  /** One place where a changed session lands: memory, storage, and the end screen. */
  const commitSession = useCallback((next: Session) => {
    put((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
    void repoRef.current.upsertSession(next);
    if (next.status !== 'running') {
      void clearHeartbeat(window.localStorage);
      window.mission?.setSessionActive(false);
      setEnded(next);
    }
  }, [put]);

  /** Rebuilds the repo whenever the auth state changes, then reloads. */
  const wire = useCallback(async () => {
    const local = createLocalRepo(window.localStorage);
    let repo: Repo = local;
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        repo = createSyncRepo(local, supabase, data.user.id, window.localStorage,
                              (e) => console.warn('[sync]', e));
        setEmail(data.user.email ?? null);
        setUserId(data.user.id);
      } else { setEmail(null); setUserId(null); }
    }
    repoRef.current = repo;
    setMode(repo.mode);

    // Anything still marked running was left mid-block by a quit, a crash or a
    // machine that went to sleep. Time the app did not witness is not growth.
    // Only a session *this device* was watching is corrected -- the heartbeat
    // is the proof. One with no heartbeat here is live on the other device,
    // and reconciling it from this side would kill it out from under them.
    const loaded = await repo.load();
    const running = loaded.sessions.find((s) => s.status === 'running');
    const beat = running ? await readHeartbeat(window.localStorage) : null;
    if (running && beat?.sessionId === running.id) {
      const fixed = reconcileSession(running, beat.at, new Date());
      if (fixed !== running) {
        setState({ ...loaded, sessions: loaded.sessions.map((s) => (s.id === fixed.id ? fixed : s)) });
        void repo.upsertSession(fixed);
        if (fixed.status !== 'running') {
          await clearHeartbeat(window.localStorage);
          setEnded(fixed);   // so the user learns what happened to it
        }
        setReady(true);
        return;
      }
    }
    setState(loaded);
    setReady(true);
  }, []);

  useEffect(() => { void wire(); }, [wire]);

  // Another device changed something -- pull the whole state again. The dataset
  // is small enough that a refetch is cheaper than reconciling row by row.
  useEffect(() => {
    if (!ready) return;
    return repoRef.current.subscribe(() => {
      void repoRef.current.load().then(setState);
    });
    // Re-subscribes after sign-in or sign-out, when `wire` swaps the repo out;
    // keyed on `ready` alone, the realtime channel was never opened at all.
  }, [ready, mode, userId]);

  // Back on the network: send whatever the outbox is still holding.
  useEffect(() => {
    const onLine = () => { void repoRef.current.flush?.(); };
    window.addEventListener('online', onLine);
    return () => window.removeEventListener('online', onLine);
  }, []);

  const theme = useMemo(() => getTheme(state.settings?.themeId), [state.settings?.themeId]);

  // The theme is a set of CSS variables on :root, so a switch repaints the whole
  // app -- including the tree, which reads the same palette through props.
  useEffect(() => {
    const root = document.documentElement.style;
    const c = theme.colors;
    root.setProperty('--bg', c.bg);
    root.setProperty('--bg-2', c.bg2);
    root.setProperty('--panel', c.panel);
    root.setProperty('--line', c.line);
    root.setProperty('--text', c.text);
    root.setProperty('--muted', c.muted);
    root.setProperty('--accent', c.accent);
    root.setProperty('--accent-text', c.accentText);
    root.setProperty('--accent-soft', c.accentSoft);
    root.setProperty('--amber', c.amber);
    root.setProperty('--red', c.red);
    root.setProperty('--hover', c.hover);
    root.setProperty('--input-bg', c.inputBg);
    root.setProperty('--track', c.track);
    root.setProperty('color-scheme', theme.mode);
  }, [theme]);

  const active = useMemo(
    () => state.sessions.find((s) => s.status === 'running') ?? null,
    [state.sessions],
  );

  // One ticker drives the timer, the tree, the heartbeat and auto-completion.
  useEffect(() => {
    if (!active) return;
    window.mission?.setSessionActive(true);
    let lastBeat = 0;
    const id = window.setInterval(() => {
      const current = stateRef.current.sessions.find((s) => s.id === active.id);
      if (!current || current.status !== 'running') return;
      const now = Date.now();
      if (now - lastBeat >= HEARTBEAT_SECONDS * 1000) {
        lastBeat = now;
        void writeHeartbeat(window.localStorage, current.id);
      }
      const next = tick(current);
      // Unchanged means paused: the clock is stopped, so there is nothing to
      // repaint and nothing to write. The heartbeat above still goes out.
      if (next === current) return;
      if (next.status === 'completed') {
        commitSession(next);
        window.mission?.notify('Tree is rooted', `${next.title} — done. That one counts.`);
      } else {
        put((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === next.id ? next : x)) }));
      }
    }, 1000);
    return () => { window.clearInterval(id); window.mission?.setSessionActive(false); };
  }, [active?.id, commitSession, put]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...stateRef.current.settings, ...patch };
    put((s) => ({ ...s, settings: next }));
    void repoRef.current.saveSettings(next);
  }, [put]);

  const setMission = useCallback((mission: Mission) => {
    const m = { ...mission, updatedAt: nowISO() };
    put((s) => ({ ...s, mission: m }));
    void repoRef.current.saveMission(m);
  }, [put]);

  const ingestMedia = useCallback(async (urls: string[]) => {
    // Without sync there is nowhere to upload to, and a local copy is still
    // perfectly good on the machine that made it.
    if (!supabase || !userId) return urls;
    const out: string[] = [];
    for (const url of urls) {
      if (!url.startsWith('mission-media://')) { out.push(url); continue; }
      try {
        const file = await window.mission?.readMedia(url);
        if (!file) { out.push(url); continue; }
        const { ext, contentType } = guessType(file.name);
        out.push(await uploadMedia(supabase, userId, file.bytes, ext, contentType));
      } catch (e) {
        console.warn('[media] upload failed, keeping the local copy', e);
        out.push(url);
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

  const removeGoal = useCallback((id: string) => {
    put((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
    void repoRef.current.deleteGoal(id);
  }, [put]);

  // Hoisted rather than reached through the store object: every screen
  // destructures these off, so `this` would be undefined by the time it ran.
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
    void writeHeartbeat(window.localStorage, session.id);
  }, [put]);

  const updateDrift = useCallback((
    driftId: string, totalSeconds: number, reason: Drift['reason'],
  ) => {
    const current = stateRef.current.sessions.find((s) => s.status === 'running');
    if (!current) return;
    // Walking away during a pause is the entire point of a pause. Nothing is
    // charged until the clock starts again.
    if (current.pausedAt) return;
    const next = chargeDrift(current, driftId, totalSeconds, reason);
    if (next === current) return;
    commitSession(next);
    if (next.status === 'abandoned') {
      window.mission?.notify('The tree died',
                             'Too much time away. Start another when you are ready.', true);
    }
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
    if (next.status === 'abandoned') {
      window.mission?.notify('The tree died',
                             'That was longer than a pause. Start another when you are ready.',
                             true);
    }
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

  const importState = useCallback(async (next: AppState) => {
    await repoRef.current.replaceAll(next);
    put(() => next);
  }, [put]);

  // Everything the tray menu offers, pushed to main whenever it changes. The
  // menu is only a view of this: main never works out what the next block is.
  const trayNext = useMemo(
    () => blockToStartNow(state.blocks, state.sessions, new Date()),
    [state.blocks, state.sessions],
  );
  useEffect(() => {
    window.mission?.setTrayState({
      nextBlock: trayNext
        ? { title: trayNext.title, startMinute: trayNext.startMinute }
        : undefined,
      session: active ? (active.pausedAt ? 'paused' : 'running') : null,
    });
  }, [trayNext?.id, trayNext?.title, trayNext?.startMinute, active?.id, active?.pausedAt]);

  const store = useMemo<Store>(() => ({
    state, ready, mode, email, active, theme, userId, ended,
    setMission, setSettings, ingestMedia,
    saveGoal, removeGoal, toggleMilestone, saveBlock, removeBlock,
    begin, updateDrift, pause, resume, finish, setNote, dismissEnded, importState,
    refreshAuth: wire,
  }), [
    state, ready, mode, email, active, theme, userId, ended,
    setMission, setSettings, ingestMedia,
    saveGoal, removeGoal, toggleMilestone, saveBlock, removeBlock,
    begin, updateDrift, pause, resume, finish, setNote, dismissEnded, importState, wire,
  ]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
