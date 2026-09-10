import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeNudges, dayKey } from '@mission/core';
import { useStore } from './store';
import { Today } from './screens/Today';
import { Goals } from './screens/Goals';
import { Blocks } from './screens/Blocks';
import { Forest } from './screens/Forest';
import { MissionScreen } from './screens/MissionScreen';
import { Settings } from './screens/Settings';
import { Focus } from './screens/Focus';
import { SessionEnd } from './screens/SessionEnd';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'mission', label: 'Mission' },
  { id: 'goals', label: 'Goals' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'forest', label: 'Forest' },
  { id: 'settings', label: 'Settings' },
];

const FIRED_KEY = 'mission-reminder:fired-nudges';

export function App() {
  const { state, ready, active, ended, mode } = useStore();
  const [tab, setTab] = useState('today');
  const fired = useRef<Set<string>>(new Set(loadFired()));

  // The state changes every second during a session. Reading it through refs
  // is what keeps the reminder interval from being torn down and rebuilt once
  // a second, and the nudges from being recomputed on every tick.
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef(active);
  activeRef.current = active;
  const [minute, setMinute] = useState(0);

  const nudges = useMemo(
    () => computeNudges(state, new Date(), { activeSession: active }),
    // Deliberately not [state]: the ticker rewrites the running session every
    // second, and none of that changes what is worth saying.
    [state.blocks, state.goals, state.sessions.length, state.mission, active?.id, minute],
  );

  // The reminder loop. Nudge ids are stable per local day, so a given nudge
  // fires as a system notification exactly once no matter how often this runs.
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const due = computeNudges(stateRef.current, new Date(), { activeSession: activeRef.current });
      for (const n of due) {
        if (fired.current.has(n.id)) continue;
        fired.current.add(n.id);
        const body = n.why ? `${n.body}\n\n${n.why}` : n.body;
        window.mission?.notify(n.title, body, n.urgency === 'high');
        if (n.urgency === 'high') window.mission?.flash();
      }
      saveFired(fired.current);
      setMinute((m) => m + 1);   // wakes the badge, once a minute
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [ready]);

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
