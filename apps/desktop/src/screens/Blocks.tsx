import React, { useState } from 'react';
import { formatMinuteOfDay, uid, type Block, type Weekday } from '@mission/core';
import { useStore } from '../store';
import { Button, Card, Empty, Field } from '../components/ui';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function blankBlock(): Block {
  return {
    id: uid('blk'), title: '', startMinute: 9 * 60, durationMinutes: 50,
    days: [1, 2, 3, 4, 5], active: true, graceMinutes: 10,
  };
}

/** 'HH:MM' <-> minutes past midnight, for the native time input. */
const toTimeValue = (minute: number) => formatMinuteOfDay(minute);
const fromTimeValue = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function Blocks() {
  const { state, saveBlock, removeBlock } = useStore();
  const [editing, setEditing] = useState<Block | null>(null);

  return (
    <>
      <div className="page-head">
        <h1>Time blocks</h1>
        <span className="sub">The promises. Sessions are what you actually did.</span>
        <Button variant="primary" style={{ marginLeft: 'auto' }}
                onClick={() => setEditing(blankBlock())}>
          New block
        </Button>
      </div>

      {editing && (
        <BlockEditor
          block={editing}
          onCancel={() => setEditing(null)}
          onSave={(b) => { saveBlock(b); setEditing(null); }}
        />
      )}

      {state.blocks.length === 0 && !editing && (
        <Empty title="No blocks yet"
               body="Pick one time you will show up, every weekday. One kept block beats five ambitious ones." />
      )}

      <div className="stack">
        {state.blocks.map((b) => {
          const goal = state.goals.find((g) => g.id === b.goalId);
          return (
            <Card key={b.id}>
              <div className="row-between">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <h2>{b.title}</h2>
                    {!b.active && <span className="pill">paused</span>}
                  </div>
                  <p className="small muted">
                    {formatMinuteOfDay(b.startMinute)} for {b.durationMinutes} min
                    {goal ? ` toward ${goal.title}` : ''} · nudges after {b.graceMinutes} min
                  </p>
                  <div className="row" style={{ gap: 4, marginTop: 8 }}>
                    {DAY_LABELS.map((d, i) => (
                      <span key={i} className="pill"
                            style={{
                              // Themed, not the Forest green: three of the
                              // seven themes are light and this read as a
                              // smear on all of them.
                              opacity: b.days.includes(i as Weekday) ? 1 : 0.28,
                              borderColor: b.days.includes(i as Weekday)
                                ? 'var(--accent)' : undefined,
                            }}>
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row">
                  <Button onClick={() => saveBlock({ ...b, active: !b.active })}>
                    {b.active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button onClick={() => setEditing(b)}>Edit</Button>
                  <Button variant="danger" onClick={() => {
                    if (window.confirm(
                      `Delete "${b.title}"? The block goes; the trees you already grew for it stay.`,
                    )) removeBlock(b.id);
                  }}>Delete</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function BlockEditor({ block, onSave, onCancel }: {
  block: Block; onSave: (b: Block) => void; onCancel: () => void;
}) {
  const { state } = useStore();
  const [draft, setDraft] = useState<Block>(block);
  const set = (patch: Partial<Block>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleDay = (day: Weekday) =>
    set({
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort((a, b) => a - b),
    });

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="grid grid-2">
        <Field label="Name">
          <input autoFocus value={draft.title} placeholder="Deep work"
                 onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Toward which goal">
          <select value={draft.goalId ?? ''}
                  onChange={(e) => set({ goalId: e.target.value || undefined })}>
            <option value="">No goal</option>
            {state.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
        <Field label="Starts at">
          <input type="time" value={toTimeValue(draft.startMinute)}
                 onChange={(e) => set({ startMinute: fromTimeValue(e.target.value) })} />
        </Field>
        <Field label="Minutes">
          <input type="number" min={5} max={240} value={draft.durationMinutes}
                 onChange={(e) => set({ durationMinutes: Number(e.target.value) || 25 })} />
        </Field>
        <Field label="Nudge me if I have not started within (minutes)">
          <input type="number" min={0} max={120} value={draft.graceMinutes}
                 onChange={(e) => set({ graceMinutes: Number(e.target.value) || 0 })} />
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <span className="field-label">Days</span>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {DAY_LABELS.map((d, i) => (
            <Button key={i}
                    variant={draft.days.includes(i as Weekday) ? 'primary' : 'ghost'}
                    onClick={() => toggleDay(i as Weekday)}>
              {d}
            </Button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <Button variant="primary" disabled={!draft.title.trim() || draft.days.length === 0}
                onClick={() => onSave(draft)}>
          Save block
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
