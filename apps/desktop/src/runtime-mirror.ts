import { useEffect, useRef } from 'react';
import { buildRuntimeMirror, type AppState, type Session } from '@mission/core';

/** At most one write per second, however fast the state churns. */
const DEBOUNCE_MS = 1000;
/** And one anyway every minute, so `updated_at` proves the app is still alive. */
const HEARTBEAT_MS = 60_000;

/**
 * Publish "what is going on right now" to the Electron main process, which puts
 * it on disk for Dexter to read (GUARDIAN_PLAN.md MR1).
 *
 * Two timings, for two different reasons. The debounced write is what makes the
 * file *correct*: a block starting or a session pausing shows up within a
 * second. The 60-second one is what makes it *trustworthy*: `updated_at` going
 * stale is how a reader tells "nothing is happening" from "this app died at
 * 3am", and there is no other signal for that.
 *
 * The dependency list is deliberately narrow. A running session is rewritten
 * every second by the growth ticker, and none of that changes what this file
 * says — writing once a second for the length of a 50-minute block would be a
 * lot of disk for no new information.
 */
export function useRuntimeMirror(state: AppState, active: Session | null, ready: boolean): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeRef = useRef(active);
  activeRef.current = active;

  const publish = useRef(() => {
    window.mission?.mirrorRuntime(
      buildRuntimeMirror(stateRef.current, new Date(), { activeSession: activeRef.current }),
    );
  });

  // On change, coalesced.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => publish.current(), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [
    ready,
    state.mission,
    state.blocks,
    state.sessions.length,
    active?.id,
    active?.pausedAt,
    active?.status,
  ]);

  // And on a heartbeat, regardless.
  useEffect(() => {
    if (!ready) return;
    publish.current();
    const t = window.setInterval(() => publish.current(), HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [ready]);
}
