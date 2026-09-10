import React, { useMemo, useState } from 'react';
import { dayKey, forestSummary, speciesTraits, stageOf, type Session } from '@mission/core';
import { useStore } from '../store';
import { Card, Empty } from '../components/ui';
import { Tree } from '../components/Tree';

/**
 * The record. Every session you ever ran, alive or dead, grouped by day. The
 * withered ones are kept on purpose -- a forest with no gaps in it would be a
 * worse mirror.
 */
export function Forest() {
  const { state } = useStore();
  const [selected, setSelected] = useState<Session | null>(null);
  const summary = forestSummary(state.sessions);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of state.sessions.filter((x) => x.status !== 'running')) {
      const key = dayKey(new Date(s.startedAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state.sessions]);

  if (byDay.length === 0) {
    return (
      <>
        <div className="page-head"><h1>Forest</h1></div>
        <Empty title="Nothing planted yet"
               body="Finish one block and the first tree lands here. It stays for good." />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Forest</h1>
        <span className="sub">
          {summary.alive} standing · {summary.withered} withered · {summary.hours} hours ·{' '}
          {summary.streak} day streak
        </span>
      </div>

      <div className="stack">
        {byDay.map(([day, sessions]) => (
          <Card key={day}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h2>{new Date(day).toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'short',
              })}</h2>
              <span className="small muted">
                {Math.round(sessions.reduce((n, s) => n + s.plannedMinutes * s.growth, 0))} min
              </span>
            </div>
            <div className="forest">
              {sessions.map((s) => {
                const goal = state.goals.find((g) => g.id === s.goalId);
                return (
                  <div key={s.id} className="forest-cell" onClick={() => setSelected(s)}>
                    <Tree species={s.species} seed={s.seed} growth={s.growth}
                          health={s.health} height={110}
                          dead={s.status === 'abandoned' && s.health <= 0.05} />
                    <div className="small" style={{ marginTop: 6 }}>{s.title}</div>
                    <div className="small muted">
                      {speciesTraits(s.species).name} · {Math.round(s.growth * 100)}%
                    </div>
                    {goal && <div className="small muted">{goal.title}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {selected && (
        <div className="focus" onClick={() => setSelected(null)}>
          <div className="focus-inner">
            <Tree species={selected.species} seed={selected.seed} growth={selected.growth}
                  health={selected.health} height={300}
                  dead={selected.status === 'abandoned' && selected.health <= 0.05} />
            <h2>{selected.title}</h2>
            <p className="muted">
              {new Date(selected.startedAt).toLocaleString()} · planned{' '}
              {selected.plannedMinutes} min
            </p>
            <p className={selected.status === 'completed' ? '' : 'warn'}>
              {stageOf(selected.growth).label} · {selected.status}
              {selected.drifts.length > 0 && ` · ${selected.drifts.length} lapses`}
            </p>
            {selected.note && <p className="why">{selected.note}</p>}
            {(selected.lostSeconds ?? 0) > 60 && (
              <p className="small warn">
                {Math.round(selected.lostSeconds! / 60)} minutes passed with the app
                not watching.
              </p>
            )}
            <p className="small muted">Click anywhere to close</p>
          </div>
        </div>
      )}
    </>
  );
}
