import { useEffect, useRef, useState } from 'react';
import { shortcutFor, type ShortcutAction } from '@mission/core';

/**
 * One minute ticker for the whole renderer. Several screens need to notice
 * that the clock moved -- the reminder loop, Today's timeline, the nav badge --
 * and each of them opening its own interval is how you end up with four
 * timers waking a machine that is meant to be sitting still.
 */
const listeners = new Set<() => void>();
let timer = 0;

function subscribeMinute(fn: () => void): () => void {
  listeners.add(fn);
  if (!timer) timer = window.setInterval(() => listeners.forEach((f) => f()), 60_000);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = 0;
    }
  };
}

/** A counter that goes up once a minute. Read it as "something moved". */
export function useMinute(): number {
  const [minute, setMinute] = useState(0);
  useEffect(() => subscribeMinute(() => setMinute((m) => m + 1)), []);
  return minute;
}

/** Is the keystroke the user's, rather than the app's? */
function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/**
 * Window-level key handling. The mapping itself is a pure function in core with
 * its own tests; this only decides whether the keystroke was aimed at the app.
 */
export function useShortcuts(run: (action: ShortcutAction) => void): void {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const mac = navigator.userAgent.includes('Mac');
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e, { mac, editing: isEditing(e.target) });
      if (!action) return;
      e.preventDefault();
      runRef.current(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
