/**
 * The desktop's keyboard map, as a pure function. It lives in core rather than
 * in the renderer for one reason: it is the kind of thing that quietly breaks
 * (a shortcut firing inside a text box, `Mod` meaning the wrong key on a Mac)
 * and a table lookup with a test is cheaper than finding that out in use.
 */

/** Tabs in the order `Mod+1` .. `Mod+7` selects them. */
export const SHORTCUT_TABS = [
  'today', 'mission', 'goals', 'blocks', 'forest', 'review', 'settings',
] as const;

export type ShortcutTab = (typeof SHORTCUT_TABS)[number];

export type ShortcutAction =
  | { kind: 'tab'; tab: ShortcutTab }
  /** Start the next block today, through the same path as Today's button. */
  | { kind: 'start-next' }
  | { kind: 'toggle-pause' }
  | { kind: 'give-up' }
  | { kind: 'close-ended' };

/** The parts of a KeyboardEvent this needs. Keeps core free of the DOM. */
export interface KeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ShortcutContext {
  /** Cmd is the modifier on macOS, Ctrl everywhere else. */
  mac?: boolean;
  /** Focus is in an input, a textarea or a contenteditable: hands off. */
  editing?: boolean;
}

export function shortcutFor(e: KeyChord, ctx: ShortcutContext = {}): ShortcutAction | null {
  // Typing is typing. Every shortcut here is dead while the caret is in a box,
  // Escape included -- closing a screen out from under a half-written note is
  // worse than making the user reach for the mouse.
  if (ctx.editing) return null;
  if (e.altKey) return null;

  const mod = ctx.mac ? e.metaKey : e.ctrlKey;
  // The other modifier held too means this is somebody else's shortcut.
  if (mod && (ctx.mac ? e.ctrlKey : e.metaKey)) return null;

  if (e.key === 'Escape' && !mod && !e.shiftKey) return { kind: 'close-ended' };
  if (!mod) return null;

  if (e.shiftKey) {
    return e.key.toLowerCase() === 'g' ? { kind: 'give-up' } : null;
  }

  if (e.key === 'Enter') return { kind: 'start-next' };
  if (e.key.toLowerCase() === 'p') return { kind: 'toggle-pause' };

  const index = Number(e.key) - 1;
  const tab = Number.isInteger(index) ? SHORTCUT_TABS[index] : undefined;
  return tab ? { kind: 'tab', tab } : null;
}

/** What Settings and the README list, in the order they are shown. */
export const SHORTCUT_HELP: { keys: string; action: string }[] = [
  { keys: 'Mod+1 .. Mod+7', action: 'Today, Mission, Goals, Blocks, Forest, Review, Settings' },
  { keys: 'Mod+Enter', action: 'Start the next block today' },
  { keys: 'Mod+P', action: 'Pause or resume the running session' },
  { keys: 'Mod+Shift+G', action: 'Give up the running session' },
  { keys: 'Escape', action: 'Close the session-end screen' },
];
