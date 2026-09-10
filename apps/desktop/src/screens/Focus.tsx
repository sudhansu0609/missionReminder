import React, { useEffect, useRef, useState } from 'react';
import {
  elapsedSeconds, formatDuration, growthAt, hashToSeed, MOOD_LINE, moodOf,
  parseMediaUrl, pauseBudgetLeft, pickWhy, remainingSeconds, sortMedia, stageOf,
  uid, type Media,
} from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { Companion } from '../components/Companion';
import { MediaBoard } from '../components/MediaBoard';
import { Button } from '../components/ui';

/** Machine idle beyond this, mid-session, is treated as walking away. */
const IDLE_LIMIT_SECONDS = 150;
/** How often an absence still in progress is re-charged. */
const EPISODE_TICK_MS = 5000;

/** How long the mission sits on screen before the timer takes over. */
const VISION_SECONDS = 7;

export function Focus() {
  const { active, state, updateDrift, pause, resume, finish } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const [visionDismissed, setVisionDismissed] = useState(false);
  /** The absence in progress: one continuous episode, charged as it runs. */
  const episode = useRef<{ id: string; since: number; escalated: boolean } | null>(null);
  const idleEpisode = useRef<string | null>(null);
  /** Read inside the away-timer, which must not close over a stale session. */
  const healthRef = useRef(1);
  healthRef.current = active?.health ?? 1;
  /** Same reason: leaving during a pause is free, and must stay free. */
  const pausedRef = useRef(false);
  pausedRef.current = Boolean(active?.pausedAt);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Resumed from the tray with the window blurred, the episode that began
  // during the pause would otherwise be charged from the moment you left. The
  // clock starts here, so the absence does too.
  useEffect(() => {
    if (active?.pausedAt || !episode.current) return;
    episode.current = { id: uid('drift'), since: Date.now(), escalated: false };
  }, [active?.pausedAt]);

  // Away from the window is away from the work, and the cost is charged while
  // you are gone rather than waiting politely for you to come back -- so a long
  // enough absence kills the tree before you return to see it.
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const charge = () => {
      const ep = episode.current;
      if (!ep) return;
      // You are allowed to walk away from a paused session. That is the point
      // of pausing, and the price was taken out of the budget on resume.
      if (pausedRef.current) return;
      const away = (Date.now() - ep.since) / 1000;
      updateDrift(ep.id, away, 'left-app');
      if (away > 20 && away < 20 + EPISODE_TICK_MS / 1000) {
        window.mission?.notify('Your tree is wilting', 'Come back to the block.', true);
        window.mission?.flash();
      }
      // Health now falls while you are away, so the warning can escalate:
      // one more flash when the tree is closer to dead than alive.
      if (!ep.escalated && healthRef.current < 0.4) {
        ep.escalated = true;
        window.mission?.notify('The tree is nearly gone',
                               'A minute more away and it dies.', true);
        window.mission?.flash();
      }
    };
    const off = window.mission?.onFocusChange((focused) => {
      if (!focused) {
        window.clearInterval(timer);
        episode.current = { id: uid('drift'), since: Date.now(), escalated: false };
        timer = window.setInterval(charge, EPISODE_TICK_MS);
      } else {
        window.clearInterval(timer);
        charge();
        episode.current = null;
      }
    });
    return () => { window.clearInterval(timer); off?.(); };
  }, [active?.id, updateDrift]);

  // Sitting at the desk doing nothing is its own kind of drifting. The idle
  // clock is the machine's, so the episode starts where the idleness did.
  useEffect(() => {
    if (!active) return;
    return window.mission?.onIdleTick((idleSeconds) => {
      if (pausedRef.current) return;
      if (idleSeconds > IDLE_LIMIT_SECONDS) {
        if (!idleEpisode.current) idleEpisode.current = uid('drift');
        updateDrift(idleEpisode.current, idleSeconds, 'idle');
      } else if (idleSeconds < 20) {
        idleEpisode.current = null;
      }
    });
  }, [active?.id, updateDrift]);

  if (!active) return null;

  const growth = growthAt(active, now);
  const left = remainingSeconds(active, now);
  const stage = stageOf(growth);
  const mood = moodOf(active, now);
  const why = pickWhy(state, active.id);
  const lost = Math.round((active.lostSeconds ?? 0) / 60);
  const goal = state.goals.find((g) => g.id === active.goalId);

  // The reason's own picture if it has one, otherwise something off the board.
  const whyEntry = state.mission.whys.find((w) => w.text === why);
  const board = sortMedia(state.mission.media);
  const visionMedia: Media | undefined =
    whyEntry?.media ?? board[hashToSeed(active.id) % Math.max(board.length, 1)];

  // A few seconds of what this is for, before anything starts counting.
  const showVision =
    state.settings.showVisionOnStart &&
    !visionDismissed &&
    elapsedSeconds(active, now) < VISION_SECONDS &&
    (Boolean(why) || Boolean(visionMedia));

  if (showVision) {
    const parsed = visionMedia ? parseMediaUrl(visionMedia.url) : null;
    return (
      <div className="vision" onClick={() => setVisionDismissed(true)}>
        <div className="vision-inner">
          {parsed?.thumbnailUrl && (
            <img className="vision-media" src={parsed.thumbnailUrl}
                 alt={visionMedia?.caption ?? ''} />
          )}
          <p className="vision-statement">{state.mission.statement}</p>
          {why && <p className="why" style={{ fontSize: 16 }}>{why}</p>}
          {whyEntry?.cost && <p className="small warn">{whyEntry.cost}</p>}
          <p className="stage">
            {active.title} · {active.plannedMinutes} minutes · click to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="focus">
      <div className="focus-inner">
        <div className="stage">{active.title}{goal ? ` · ${goal.title}` : ''}</div>

        <div className="tree-stage">
          <Tree species={active.species} seed={active.seed} growth={growth} health={active.health} height={300} />
          <Companion mood={mood} />
        </div>

        <div className="timer">{formatDuration(left)}</div>
        <div className="stage">{stage.label} · {Math.round(growth * 100)}%</div>

        <p className={active.health < 0.5 ? 'warn' : 'muted'}>{MOOD_LINE[mood]}</p>

        {why && (
          <p className="mission-banner why" style={{ textAlign: 'left' }}>
            {why}
          </p>
        )}

        {whyEntry?.media && (
          <div style={{ width: '100%' }}>
            <MediaBoard variant="strip" media={[whyEntry.media]} />
          </div>
        )}

        {active.pausedAt && (
          <p className="small warn">
            Paused. {formatDuration(pauseBudgetLeft(active, now))} of budget left —
            past that it costs the tree, and twenty minutes ends it.
          </p>
        )}

        {active.drifts.length > 0 && (
          <p className="small warn">
            {active.drifts.length} lapse{active.drifts.length > 1 ? 's' : ''} · health{' '}
            {Math.round(active.health * 100)}%
            {lost > 0 && ` · ${lost} min not served`}
          </p>
        )}

        {!confirming ? (
          <div className="row">
            <Button onClick={() => (active.pausedAt ? resume() : pause())}>
              {active.pausedAt ? 'Resume' : 'Pause'}
            </Button>
            <Button onClick={() => setConfirming(true)} className="btn-danger">Give up</Button>
          </div>
        ) : (
          <div className="row">
            <span className="small muted">Kill the tree at {Math.round(growth * 100)}%?</span>
            <Button variant="danger" onClick={() => { finish('abandoned'); setConfirming(false); }}>
              Yes, end it
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep going</Button>
          </div>
        )}
      </div>
    </div>
  );
}
