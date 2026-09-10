import React, { useState } from 'react';
import { speciesTraits, stageOf } from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { Button } from '../components/ui';

/**
 * What a session leaves behind.
 *
 * Sessions used to simply vanish -- the overlay closed and you were back on
 * Today with no idea what had just been added to the forest. This is the one
 * moment where the record is worth a sentence, so it is also where
 * `Session.note` finally gets written from.
 */
export function SessionEnd() {
  const { ended, dismissEnded, setNote, state } = useStore();
  const [note, setDraft] = useState(ended?.note ?? '');
  if (!ended) return null;

  const stage = stageOf(ended.growth);
  const dead = ended.status === 'abandoned' && ended.health <= 0.05;
  const goal = state.goals.find((g) => g.id === ended.goalId);
  const lostMinutes = Math.round((ended.lostSeconds ?? 0) / 60);

  const save = () => {
    if (note.trim() !== (ended.note ?? '')) setNote(ended.id, note);
    dismissEnded();
  };

  return (
    <div className="focus">
      <div className="focus-inner">
        <div className="stage">
          {ended.status === 'completed' ? 'Rooted for good' : 'This one did not make it'}
        </div>

        <Tree species={ended.species} seed={ended.seed} growth={ended.growth}
              health={ended.health} height={260} dead={dead} />

        <h2>{ended.title}{goal ? ` · ${goal.title}` : ''}</h2>
        <p className={ended.status === 'completed' ? 'muted' : 'warn'}>
          {stage.label} · {speciesTraits(ended.species).name}
        </p>

        <div className="end-stats">
          <div className="end-stat">
            <strong>{Math.round(ended.growth * 100)}%</strong>
            <span className="stage">grown</span>
          </div>
          <div className="end-stat">
            <strong>{Math.round(ended.health * 100)}%</strong>
            <span className="stage">health</span>
          </div>
          <div className="end-stat">
            <strong>{ended.drifts.length}</strong>
            <span className="stage">lapse{ended.drifts.length === 1 ? '' : 's'}</span>
          </div>
          <div className="end-stat">
            <strong>{Math.round(ended.plannedMinutes * ended.growth)}</strong>
            <span className="stage">minutes served</span>
          </div>
        </div>

        {lostMinutes > 0 && (
          <p className="small warn">
            {lostMinutes} minute{lostMinutes === 1 ? '' : 's'} passed with the app not
            watching. That time is not growth.
          </p>
        )}

        <div className="field" style={{ width: '100%', textAlign: 'left' }}>
          <span className="field-label">What did you get done?</span>
          <input autoFocus value={note} placeholder="One line, for when you look back"
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </div>

        <div className="row">
          <Button variant="primary" onClick={save}>Save</Button>
          <Button onClick={dismissEnded}>Skip</Button>
        </div>
      </div>
    </div>
  );
}
