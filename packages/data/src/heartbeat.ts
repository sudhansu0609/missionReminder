import type { KV } from './repo.js';

/**
 * The mark that says "the app was watching this session at this moment".
 *
 * Growth is time served, and the only honest way to know whether time was
 * served is for something to have been running while it passed. This is that
 * something: a tiny local write, never synced, that a relaunch can read to
 * work out how long nobody was looking. See `reconcileSession` in core.
 */

export const HEARTBEAT_KEY = 'mission-reminder:heartbeat:v1';
/** How often the stores rewrite it while a session runs. */
export const HEARTBEAT_SECONDS = 15;

export interface Heartbeat {
  sessionId: string;
  at: string;
}

export async function writeHeartbeat(
  kv: KV, sessionId: string, now: Date = new Date(),
): Promise<void> {
  await kv.setItem(HEARTBEAT_KEY, JSON.stringify({ sessionId, at: now.toISOString() }));
}

export async function readHeartbeat(kv: KV): Promise<Heartbeat | null> {
  try {
    const raw = await kv.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const beat = JSON.parse(raw) as Heartbeat;
    return typeof beat?.sessionId === 'string' && typeof beat?.at === 'string' ? beat : null;
  } catch {
    return null;
  }
}

export async function clearHeartbeat(kv: KV): Promise<void> {
  await kv.setItem(HEARTBEAT_KEY, '');
}
