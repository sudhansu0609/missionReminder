import React, { useMemo, useState } from 'react';
import {
  blocksForDay, computeNudges, forestSummary, formatMinuteOfDay, minuteOfDay,
  minutesOnDay, missedBlocksToday, nextBlockToday, wasHonouredToday,
} from '@mission/core';
import { useStore } from '../store';
import { Button, Card, Field } from '../components/ui';
import { MediaBoard } from '../components/MediaBoard';

const DURATIONS = [15, 25, 50, 90];

export function Today({ go }: { go: (tab: string) => void }) {
  const { state, begin } = useStore();
  const now = new Date();
  const [minutes, setMinutes] = useState(50);
  const [goalId, setGoalId] = useState(state.goals[0]?.id ?? '');
  const [title, setTitle] = useState('');

  const blocks = blocksForDay(state.blocks, now);
  const missed = missedBlocksToday(state.blocks, state.sessions, now);
  const upcoming = nextBlockToday(state.blocks, now);
  const nudges = useMemo(() => computeNudges(state, now).slice(0, 3), [state]);
  const summary = forestSummary(state.sessions);
  const todayMinutes = Math.round(minutesOnDay(state.sessions));
  const nowMinute = minuteOfDay(now);

  const start = (t: string, m: number, g?: string, blockId?: string) =>
    begin({ title: t || 'Focus', minutes: m, goalId: g || undefined, blockId });

  return (
    <>
      <div className="page-head">
        <h1>Today</h1>
        <span className="sub">
          {summary.streak} day streak · {todayMinutes} min today · {summary.alive} trees standing
        </span>
      </div>

      <div className="stack">
        <Card>
          <p className="mission-banner">{state.mission.statement}</p>
          {state.mission.whys[0] && (
            <p className="why small" style={{ marginTop: 10 }}>{state.mission.whys[0].text}</p>
          )}
          {state.mission.media.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <MediaBoard variant="strip" media={state.mission.media} />
            </div>
          )}
        </Card>

        {nudges.map((n) => (
          <Card key={n.id} className={`nudge ${n.urgency === 'high' ? 'nudge-high' : ''}`}>
            <div className="row-between">
              <div>
                <h3>{n.title}</h3>
                <p className="small muted">{n.body}</p>
                {n.why && <p className="why small" style={{ marginTop: 6 }}>{n.why}</p>}
              </div>
              {n.blockId && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const b = state.blocks.find((x) => x.id === n.blockId);
                    if (b) start(b.title, b.durationMinutes, b.goalId, b.id);
                  }}
                >
                  Start now
                </Button>
              )}
              {n.goalId && !n.blockId && (
                <Button onClick={() => go('goals')}>Open goal</Button>
              )}
            </div>
          </Card>
        ))}

        <Card>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2>Plant a tree</h2>
            {upcoming && (
              <span className="small muted">
                Next block: {upcoming.block.title} at {formatMinuteOfDay(upcoming.block.startMinute)}
              </span>
            )}
          </div>
          <div className="grid grid-2">
            <Field label="What are you working on">
              <input value={title} placeholder="Focus" onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Toward which goal">
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">No goal</option>
                {state.goals.filter((g) => g.status === 'active').map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            {DURATIONS.map((d) => (
              <Button key={d} variant={d === minutes ? 'primary' : 'ghost'} onClick={() => setMinutes(d)}>
                {d} min
              </Button>
            ))}
            <Button variant="primary" style={{ marginLeft: 'auto' }}
                    onClick={() => start(title, minutes, goalId)}>
              Start {minutes} minutes
            </Button>
          </div>
        </Card>

        <Card>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2>Your blocks today</h2>
            <Button onClick={() => go('blocks')}>Edit blocks</Button>
          </div>
          {blocks.length === 0 ? (
            <p className="muted small">Nothing scheduled today. A commitment you keep beats one you set well.</p>
          ) : (
            <div className="timeline">
              {blocks.map((b) => {
                const done = wasHonouredToday(b, state.sessions, now);
                const isMissed = missed.some((m) => m.id === b.id);
                const isNow = nowMinute >= b.startMinute && nowMinute < b.startMinute + b.durationMinutes;
                const goal = state.goals.find((g) => g.id === b.goalId);
                return (
                  <div key={b.id}
                       className={`tl-row ${isNow ? 'tl-now' : ''} ${isMissed ? 'tl-missed' : ''}`}>
                    <span className="tl-time">{formatMinuteOfDay(b.startMinute)}</span>
                    <div>
                      <div>{b.title} <span className="muted small">· {b.durationMinutes} min</span></div>
                      {goal && <div className="muted small">{goal.title}</div>}
                    </div>
                    {done ? (
                      <span className="pill pill-on-track">kept</span>
                    ) : (
                      <Button variant={isNow || isMissed ? 'primary' : 'ghost'}
                              onClick={() => start(b.title, b.durationMinutes, b.goalId, b.id)}>
                        Start
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
