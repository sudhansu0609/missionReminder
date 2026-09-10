import React, { useMemo, useState } from 'react';
import {
  formatMinuteOfDay, speciesTraits, weekReview, type WeekReview, type Weekday,
} from '@mission/core';
import { useStore } from '../store';
import { Bar, Button, Card, Empty } from '../components/ui';
import { Tree } from '../components/Tree';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The screen the Sunday nudge can finally open. It is a mirror, not a scorecard:
 * what you planned, what you kept, where the hours actually went, and the
 * blocks waiting for you next week.
 */
export function Review() {
  const { state } = useStore();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const week = useMemo(() => weekReview(state, new Date(), weeksAgo), [state, weeksAgo]);

  return (
    <>
      <div className="page-head">
        <h1>Week in review</h1>
        <span className="sub">{range(week)}</span>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <Button variant={weeksAgo === 0 ? 'primary' : 'ghost'} onClick={() => setWeeksAgo(0)}>
            This week
          </Button>
          <Button variant={weeksAgo === 1 ? 'primary' : 'ghost'} onClick={() => setWeeksAgo(1)}>
            Last week
          </Button>
        </div>
      </div>

      <div className="stack">
        <Card>
          <div className="row-between">
            <div>
              <h2>{week.blocks.kept} of {week.blocks.planned} blocks kept</h2>
              <p className="small muted">
                {week.blocks.missed === 0
                  ? 'Nothing went by unanswered.'
                  : `${week.blocks.missed} went by without a tree.`}
                {' '}{week.trees.alive} standing, {week.trees.dead} withered ·{' '}
                {week.streakDays} day streak
              </p>
            </div>
            <div style={{ width: 220 }}>
              <Bar value={week.blocks.planned === 0 ? 0 : week.blocks.kept / week.blocks.planned}
                   tone={keptTone(week)} />
            </div>
          </div>
        </Card>

        <Card>
          <h2>Where the hours went</h2>
          {week.minutesByGoal.length === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              No focused minutes this week. That is the whole review.
            </p>
          ) : (
            <div className="stack" style={{ marginTop: 10 }}>
              {week.minutesByGoal.map((row) => (
                <div key={row.goalId ?? 'none'}>
                  <div className="row-between">
                    <span>{row.title}</span>
                    <span className="small muted">{Math.round(row.minutes)} min</span>
                  </div>
                  <Bar value={row.minutes / Math.max(week.minutesByGoal[0].minutes, 1)} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2>What you planted</h2>
          {week.sessions.length === 0 ? (
            <Empty title="An empty week"
                   body="No trees at all. One kept block next week is a better answer than seven planned ones." />
          ) : (
            <div className="forest" style={{ marginTop: 10 }}>
              {week.sessions.map((s) => (
                <div key={s.id} className="forest-cell">
                  <Tree species={s.species} seed={s.seed} growth={s.growth} health={s.health}
                        height={110} dead={s.status === 'abandoned' && s.health <= 0.05} />
                  <div className="small" style={{ marginTop: 6 }}>{s.title}</div>
                  <div className="small muted">
                    {speciesTraits(s.species).name} · {Math.round(s.growth * 100)}%
                  </div>
                  {s.note && <div className="small muted">{s.note}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2>Next week</h2>
          {week.nextWeek.length === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              Nothing scheduled. A week with no blocks in it is a week you will improvise.
            </p>
          ) : (
            <div className="timeline" style={{ marginTop: 10 }}>
              {week.nextWeek.map(({ block, days }) => (
                <div key={block.id} className="tl-row">
                  <span className="tl-time">{formatMinuteOfDay(block.startMinute)}</span>
                  <div>
                    <div>{block.title}
                      <span className="muted small"> · {block.durationMinutes} min</span>
                    </div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {DAY_LABELS.map((d, i) => (
                        <span key={i} className="pill"
                              style={{
                                opacity: days.includes(i as Weekday) ? 1 : 0.28,
                                borderColor: days.includes(i as Weekday) ? 'var(--accent)' : undefined,
                              }}>
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const range = (week: WeekReview) =>
  `${pretty(week.weekStart)} to ${pretty(week.weekEnd)}`;

const pretty = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Green once most of the week was kept; red when almost none of it was. */
function keptTone(week: WeekReview): 'green' | 'amber' | 'red' {
  if (week.blocks.planned === 0) return 'green';
  const ratio = week.blocks.kept / week.blocks.planned;
  return ratio >= 0.7 ? 'green' : ratio >= 0.3 ? 'amber' : 'red';
}
