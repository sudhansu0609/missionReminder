import React, { useEffect, useMemo, useRef, useState } from 'react';
import { blockToStartNow, computeNudges, dayKey, type ShortcutAction } from '@mission/core';
import { useStore } from './store';
import { useMinute, useShortcuts } from './hooks';
import { useRuntimeMirror } from './runtime-mirror';
import { Today } from './screens/Today';
import { Goals } from './screens/Goals';
import { Blocks } from './screens/Blocks';
import { Forest } from './screens/Forest';
import { Review } from './screens/Review';
import { MissionScreen } from './screens/MissionScreen';
import { Settings } from './screens/Settings';
import { Focus } from './screens/Focus';
import { SessionEnd } from './screens/SessionEnd';

// Same order as SHORTCUT_TABS in core, which is what Mod+1..7 counts through.
const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'mission', label: 'Mission' },
  { id: 'goals', label: 'Goals' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'forest', label: 'Forest' },
  { id: 'review', label: 'Review' },
  { id: 'settings', label: 'Settings' },
];

const FIRED_KEY = 'mission-reminder:fired-nudges';

export function App() {
  const { state, ready, active, ended, mode, begin, pause, resume, finish, dismissEnded } =
    useStore();
  const [tab, setTab] = useState('today');
  const fired = useRef<Set<string>>(new Set(loadFired()));

  // The state changes every second during a session. Reading it through refs
  // is what keeps the reminder interval from being torn down and rebuilt once
  // a second, and the nudges from being recomputed on every tick.
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef(active);
  activeRef.current = active;
  const minute = useMinute();

  const nudges = useMemo(
    () => computeNudges(state, new Date(), { activeSession: active }),
    // Deliberately not [state]: the ticker rewrites the running session every
    // second, and none of that changes what is worth saying.
    [state.blocks, state.goals, state.sessions.length, state.mission, active?.id, minute],
  );

  // The reminder loop, driven by the one shared minute ticker. Nudge ids are
  // stable per local day, so a given nudge fires as a system notification
  // exactly once no matter how often this runs.
  useEffect(() => {
    if (!ready) return;
    const due = computeNudges(stateRef.current, new Date(), { activeSession: activeRef.current });
    for (const n of due) {
      if (fired.current.has(n.id)) continue;
      fired.current.add(n.id);
      const body = n.why ? `${n.body}\n\n${n.why}` : n.body;
      window.mission?.notify(n.title, body, n.urgency === 'high', n.screen);
      if (n.urgency === 'high') window.mission?.flash();
      // Second, and only if DEXTER_URL is set: the same reminder in Dexter's
      // pop-up rather than a second toast beside this one. Fire and forget --
      // the notification above has already gone out.
      window.mission?.forwardNudge({
        kind: n.kind, title: n.title, body: n.body, urgency: n.urgency,
        screen: n.screen, why: n.why, at: new Date().toISOString(),
      });
    }
    saveFired(fired.current);
  }, [ready, minute]);

  // Leave "what is going on right now" on disk for Dexter, so it can see a
  // block running and keep quiet through it instead of nagging in parallel.
  useRuntimeMirror(state, active, ready);

  // A clicked notification knows what it was about, so it lands there.
  useEffect(() => window.mission?.onOpenScreen((screen) => {
    if (TABS.some((t) => t.id === screen)) setTab(screen);
  }), []);

  /** One place both the keyboard and the tray menu go through. */
  const run = (action: ShortcutAction) => {
    switch (action.kind) {
      case 'tab':
        setTab(action.tab);
        break;
      case 'start-next': {
        if (activeRef.current) break;
        const block = blockToStartNow(stateRef.current.blocks, stateRef.current.sessions);
        if (block) {
          begin({
            title: block.title, minutes: block.durationMinutes,
            goalId: block.goalId, blockId: block.id,
          });
        }
        break;
      }
      case 'toggle-pause':
        if (activeRef.current?.pausedAt) resume();
        else if (activeRef.current) pause();
        break;
      case 'give-up': {
        const current = activeRef.current;
        if (!current) break;
        window.mission?.showWindow();
        if (window.confirm(
          `Kill the tree at ${Math.round(current.growth * 100)}%? The growth is kept; the tree is not.`,
        )) finish('abandoned');
        break;
      }
      case 'close-ended':
        dismissEnded();
        break;
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  useShortcuts((action) => runRef.current(action));

  // The tray sends back the same actions under its own names.
  useEffect(() => window.mission?.onTrayAction((action) => {
    if (action === 'start-next') runRef.current({ kind: 'start-next' });
    else if (action === 'give-up') runRef.current({ kind: 'give-up' });
    else runRef.current({ kind: 'toggle-pause' });
  }), []);

  if (!ready) {
    return <div className="focus"><div className="focus-inner muted">Waking up...</div></div>;
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">Mission</div>
        {TABS.map((t) => (
          <button key={t.id}
                  className={`nav-item ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'today' && nudges.length > 0 && (
              <span className="nav-badge">{nudges.length}</span>
            )}
          </button>
        ))}
        <div className="sidebar-foot">
          {mode === 'synced' ? 'Synced' : 'On this device'}
        </div>
      </nav>

      <main className="main">
        {tab === 'today' && <Today go={setTab} />}
        {tab === 'mission' && <MissionScreen />}
        {tab === 'goals' && <Goals />}
        {tab === 'blocks' && <Blocks />}
        {tab === 'forest' && <Forest />}
        {tab === 'review' && <Review />}
        {tab === 'settings' && <Settings />}
      </main>

      {active && <Focus />}
      {ended && !active && <SessionEnd />}
    </div>
  );
}

/** Fired ids are pruned to today's, so the set cannot grow without bound. */
function loadFired(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[];
    const today = dayKey(new Date());
    return raw.filter((id) => id.endsWith(today));
  } catch {
    return [];
  }
}

function saveFired(set: Set<string>) {
  const today = dayKey(new Date());
  localStorage.setItem(FIRED_KEY, JSON.stringify([...set].filter((id) => id.endsWith(today))));
}
