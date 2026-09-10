import React, { useState } from 'react';
import {
  daysSinceTouched, effortProgress, focusedMinutes, goalPace, hashToSeed,
  milestoneProgress, nowISO, sessionsForGoal, uid, type Goal,
} from '@mission/core';
import { useStore } from '../store';
import { Bar, Button, Card, Empty, Field, Ring } from '../components/ui';
import { MediaBoard } from '../components/MediaBoard';

function blankGoal(): Goal {
  const id = uid('goal');
  return {
    id, title: '', status: 'active', createdAt: nowISO(),
    startDate: nowISO().slice(0, 10), species: hashToSeed(id), milestones: [],
  };
}

export function Goals() {
  const { state, saveGoal, removeGoal, toggleMilestone } = useStore();
  const [editing, setEditing] = useState<Goal | null>(null);

  return (
    <>
      <div className="page-head">
        <h1>Goals</h1>
        <span className="sub">What the mission actually cashes out as</span>
        <Button variant="primary" style={{ marginLeft: 'auto' }}
                onClick={() => setEditing(blankGoal())}>
          New goal
        </Button>
      </div>

      {editing && (
        <GoalEditor
          goal={editing}
          onCancel={() => setEditing(null)}
          onSave={(g) => { saveGoal(g); setEditing(null); }}
        />
      )}

      {state.goals.length === 0 && !editing && (
        <Empty title="No goals yet"
               body="A mission with no goals under it is a slogan. Add the first outcome you want." />
      )}

      <div className="stack">
        {state.goals.map((goal) => {
          const pace = goalPace(goal);
          const progress = milestoneProgress(goal);
          const effort = effortProgress(goal, state.sessions);
          const hours = focusedMinutes(sessionsForGoal(goal, state.sessions)) / 60;
          const silence = daysSinceTouched(goal, state.sessions);

          return (
            <Card key={goal.id}>
              <div className="row-between">
                <div className="row" style={{ gap: 16 }}>
                  <Ring value={progress} />
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <h2>{goal.title}</h2>
                      <span className={`pill pill-${pace.pace}`}>{pace.pace.replace('-', ' ')}</span>
                      {goal.status !== 'active' && <span className="pill">{goal.status}</span>}
                    </div>
                    {goal.rationale && <p className="why small">{goal.rationale}</p>}
                    <p className="small muted" style={{ marginTop: 4 }}>{pace.message}</p>
                  </div>
                </div>
                <div className="row">
                  <Button onClick={() => setEditing(goal)}>Edit</Button>
                  <Button variant="danger" onClick={() => {
                    // Deleting drops the milestones and unlinks every session
                    // that pointed at it, which is not obvious from one click.
                    const linked = sessionsForGoal(goal, state.sessions).length;
                    if (window.confirm(
                      `Delete "${goal.title}"?

` +
                      `${goal.milestones.length} milestone${goal.milestones.length === 1 ? '' : 's'} ` +
                      `go with it, and ${linked} session${linked === 1 ? '' : 's'} lose their link ` +
                      'to it. The trees themselves stay in the forest.',
                    )) removeGoal(goal.id);
                  }}>Delete</Button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                {goal.milestones
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((m) => (
                    <label key={m.id} className="ms-item">
                      <input type="checkbox" checked={Boolean(m.doneAt)}
                             onChange={() => toggleMilestone(goal.id, m.id)} />
                      <span className={m.doneAt ? 'ms-done' : ''}>{m.title}</span>
                      {m.weight !== 1 && (
                        <span className="pill" style={{ marginLeft: 'auto' }}>x{m.weight}</span>
                      )}
                    </label>
                  ))}
              </div>

              {goal.media && goal.media.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <MediaBoard variant="strip" media={goal.media} />
                </div>
              )}

              <div className="small muted" style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                <div className="row-between">
                  <span>Where you should be by now</span>
                  <span>{Math.round(pace.expected * 100)}%</span>
                </div>
                <Bar value={pace.expected} tone="amber" />
                {effort !== null && (
                  <>
                    <div className="row-between">
                      <span>Hours in ({hours.toFixed(1)} of {goal.estimatedHours})</span>
                      <span>{Math.round(effort * 100)}%</span>
                    </div>
                    <Bar value={effort} />
                  </>
                )}
                <div>{silenceLine(silence)}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function silenceLine(days: number | null): string {
  if (days === null) return 'No focus time logged against this yet.';
  if (days === 0) return 'Worked on today.';
  return `Last touched ${days} day${days === 1 ? '' : 's'} ago.`;
}

function GoalEditor({ goal, onSave, onCancel }: {
  goal: Goal; onSave: (g: Goal) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Goal>(goal);
  const set = (patch: Partial<Goal>) => setDraft((d) => ({ ...d, ...patch }));

  const addMilestone = () =>
    set({
      milestones: [
        ...draft.milestones,
        { id: uid('ms'), title: '', weight: 1, order: draft.milestones.length },
      ],
    });

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="grid grid-2">
        <Field label="Goal">
          <input autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })}
                 placeholder="Ship the first real version" />
        </Field>
        <Field label="Why this serves the mission">
          <input value={draft.rationale ?? ''} onChange={(e) => set({ rationale: e.target.value })} />
        </Field>
        <Field label="Target date">
          <input type="date" value={draft.targetDate ?? ''}
                 onChange={(e) => set({ targetDate: e.target.value || undefined })} />
        </Field>
        <Field label="Estimated hours (optional)">
          <input type="number" min={0} value={draft.estimatedHours ?? ''}
                 onChange={(e) => set({
                   estimatedHours: e.target.value ? Number(e.target.value) : undefined,
                 })} />
        </Field>
        <Field label="Status">
          <select value={draft.status}
                  onChange={(e) => set({ status: e.target.value as Goal['status'] })}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="done">done</option>
            <option value="dropped">dropped</option>
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <h3>Milestones</h3>
          <Button onClick={addMilestone}>Add milestone</Button>
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Weight is relative size. A milestone worth 3 moves the ring three times
          as far as one worth 1.
        </p>
        {draft.milestones.map((m, i) => (
          <div key={m.id} className="row" style={{ marginBottom: 6 }}>
            <input value={m.title} placeholder={`Milestone ${i + 1}`}
                   onChange={(e) => set({
                     milestones: draft.milestones.map((x) =>
                       x.id === m.id ? { ...x, title: e.target.value } : x),
                   })} />
            <input type="number" min={1} style={{ width: 80 }} value={m.weight}
                   onChange={(e) => set({
                     milestones: draft.milestones.map((x) =>
                       x.id === m.id ? { ...x, weight: Number(e.target.value) || 1 } : x),
                   })} />
            <Button variant="danger"
                    onClick={() => set({
                      milestones: draft.milestones.filter((x) => x.id !== m.id),
                    })}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>What it looks like done</h3>
        <p className="small muted" style={{ margin: '6px 0 10px' }}>
          Optional. A picture of the finished thing, or a link to the standard you are
          chasing. It shows on the goal card.
        </p>
        <MediaBoard media={draft.media} onChange={(media) => set({ media })} />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <Button variant="primary" disabled={!draft.title.trim()}
                onClick={() => onSave(draft)}>Save goal</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
