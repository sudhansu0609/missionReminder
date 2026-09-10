import { useEffect, useState } from 'react';

/**
 * One minute ticker for the whole app. Today's timeline has to notice the
 * clock moving even when nothing else changes, and one shared interval is
 * cheaper on a phone than one per screen.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeMinute(fn: () => void): () => void {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => listeners.forEach((f) => f()), 60_000);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** A counter that goes up once a minute. Read it as "something moved". */
export function useMinute(): number {
  const [minute, setMinute] = useState(0);
  useEffect(() => subscribeMinute(() => setMinute((m) => m + 1)), []);
  return minute;
}
