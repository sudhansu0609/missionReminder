import React, { useEffect, useState } from 'react';
import {
  sameMission, shouldReseed, uid, type Media, type Mission, type Why,
} from '@mission/core';
import { useStore } from '../store';
import { Button, Card, Field } from '../components/ui';
import { MediaBoard } from '../components/MediaBoard';

/**
 * The mission screen is deliberately plain and slow. It is the one place in the
 * app you are not meant to move through quickly.
 */
export function MissionScreen() {
  const { state, setMission } = useStore();
  const [draft, setDraft] = useState<Mission>(state.mission);
  /** The mission the draft was seeded from -- not necessarily the current one. */
  const [base, setBase] = useState<Mission>(state.mission);
  const dirty = !sameMission(draft, base);
  const movedElsewhere = state.mission.updatedAt !== base.updatedAt;

  // The mission now arrives from the other device while you are looking at it.
  // An untouched draft catches up silently; a half-written one is left alone
  // and offered the reload below, because losing typed reasons to stay in sync
  // is the wrong trade.
  useEffect(() => {
    if (!movedElsewhere) return;
    // Our own save coming back with a fresh stamp, or the same edit made twice.
    if (sameMission(state.mission, draft)) { setBase(state.mission); return; }
    if (shouldReseed(dirty, state.mission.updatedAt, base.updatedAt)) {
      setDraft(state.mission);
      setBase(state.mission);
    }
  }, [state.mission, base, draft, dirty, movedElsewhere]);

  const reload = () => { setDraft(state.mission); setBase(state.mission); };

  const setWhy = (id: string, patch: Partial<Why>) =>
    setDraft((d) => ({
      ...d,
      whys: d.whys.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));

  return (
    <>
      <div className="page-head">
        <h1>Mission</h1>
        <span className="sub">Read this before every block. That is the whole point.</span>
      </div>

      <div className="stack">
        <Card>
          <Field label="The one thing your days are supposed to add up to">
            <textarea value={draft.statement} rows={3}
                      onChange={(e) => setDraft({ ...draft, statement: e.target.value })} />
          </Field>
        </Card>

        <Card>
          <h2>Vision board</h2>
          <p className="small muted" style={{ margin: '8px 0 14px' }}>
            Photos, a video that gets you moving, a link to the thing you are aiming at.
            These show up on Today and in the few seconds before a session starts, because
            a picture of what you want survives a bad morning better than a sentence does.
          </p>
          <MediaBoard media={draft.media}
                      onChange={(media) => setDraft({ ...draft, media })} />
        </Card>

        <Card>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <h2>Why</h2>
            <Button onClick={() => setDraft({
              ...draft,
              whys: [...draft.whys, { id: uid('why'), text: '' }],
            })}>
              Add a reason
            </Button>
          </div>
          <p className="small muted" style={{ marginBottom: 14 }}>
            Write more than one. The app rotates through them so a single line
            does not go numb from repetition, and it shows one to you at the
            start of every session and inside every nudge. Give a reason a
            picture and the picture comes with it.
          </p>

          <div className="stack">
            {draft.whys.map((w, i) => (
              <Card key={w.id} className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <textarea value={w.text} rows={2} placeholder={`Reason ${i + 1}`}
                            onChange={(e) => setWhy(w.id, { text: e.target.value })} />
                  <Button variant="danger"
                          onClick={() => setDraft({
                            ...draft, whys: draft.whys.filter((x) => x.id !== w.id),
                          })}>
                    Remove
                  </Button>
                </div>
                <input value={w.cost ?? ''} placeholder="And what it costs if you do not (optional)"
                       onChange={(e) => setWhy(w.id, { cost: e.target.value || undefined })} />
                <MediaBoard
                  variant="strip"
                  media={w.media ? [w.media] : []}
                  onChange={(media: Media[]) => setWhy(w.id, { media: media[0] })}
                />
              </Card>
            ))}
          </div>
        </Card>

        {movedElsewhere && dirty && (
          <p className="small warn">
            Updated on another device.{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); reload(); }}>Reload draft?</a>{' '}
            Saving instead will overwrite what came in.
          </p>
        )}

        <div className="row">
          <Button variant="primary" disabled={!dirty} onClick={() => setMission(draft)}>
            Save mission
          </Button>
          <Button disabled={!dirty} onClick={reload}>Discard changes</Button>
          <span className="small muted" style={{ marginLeft: 'auto' }}>
            Last changed {new Date(state.mission.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </>
  );
}
