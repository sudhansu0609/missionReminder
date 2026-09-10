import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@mission/core';
import type { KV } from './repo.js';

/**
 * A durable queue of remote writes.
 *
 * Before this, every write went up behind a try/catch that swallowed failures,
 * so an edit made on a train was lost the moment the server -- which still had
 * the old row -- was treated as authoritative on the next load. Queueing the
 * write instead means "offline" and "not saved" stop being the same thing: the
 * entry survives a restart and is replayed, in order, when the network returns.
 */

export type OutboxTable = 'missions' | 'goals' | 'blocks' | 'sessions';

export interface OutboxEntry {
  id: string;
  table: OutboxTable;
  /** A delete is soft -- it stamps `deleted_at`, so the other device learns. */
  op: 'upsert' | 'delete';
  rowId: string;
  row: Record<string, unknown>;
  onConflict?: string;
  at: string;
}

export const OUTBOX_KEY = 'mission-reminder:outbox:v1';

export interface Outbox {
  enqueue(entry: Omit<OutboxEntry, 'id' | 'at'>): Promise<void>;
  /** Sends entries in order. Stops at the first failure and keeps the rest. */
  flush(client: SupabaseClient, userId: string): Promise<{ sent: number; remaining: number }>;
  /** Row ids this device has not managed to send yet, so the local copy wins. */
  pendingIds(table: OutboxTable): Promise<Set<string>>;
  size(): Promise<number>;
}

export function createOutbox(kv: KV): Outbox {
  // Serialises flushes: two triggers (a write and the `online` event, say)
  // must not interleave, or entries would be sent twice or dropped.
  let inFlight: Promise<{ sent: number; remaining: number }> | null = null;

  const read = async (): Promise<OutboxEntry[]> => {
    try {
      const raw = await kv.getItem(OUTBOX_KEY);
      const list = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  const write = async (list: OutboxEntry[]) => {
    await kv.setItem(OUTBOX_KEY, JSON.stringify(list));
  };

  return {
    async enqueue(input) {
      const list = await read();
      const entry: OutboxEntry = { ...input, id: uid('ob'), at: new Date().toISOString() };
      // Coalesce: only the newest state of a row is worth sending, so a pending
      // upsert is overwritten in place -- under a *new* id, so a flush that is
      // mid-way through sending the old version cannot mistake this one for
      // it and drop it. A pending *delete* is left alone and the new entry
      // appended, because undeleting has to happen after it.
      let last = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]!;
        if (e.table === entry.table && e.rowId === entry.rowId) { last = i; break; }
      }
      if (last !== -1 && list[last]!.op === 'upsert') list[last] = entry;
      else list.push(entry);
      await write(list);
    },

    flush(client, userId) {
      if (inFlight) return inFlight;
      const run = (async () => {
        const list = await read();
        const sent = new Set<string>();
        for (const entry of list) {
          try {
            await send(client, userId, entry);
          } catch {
            break; // Keep this one and everything behind it, in order.
          }
          sent.add(entry.id);
        }
        // Re-read rather than trusting the snapshot: a write that landed while
        // the network was busy is in the store, not in `list`, and slicing the
        // snapshot would have thrown it away.
        if (sent.size > 0) await write((await read()).filter((e) => !sent.has(e.id)));
        return { sent: sent.size, remaining: list.length - sent.size };
      })();
      inFlight = run.finally(() => { inFlight = null; });
      return inFlight;
    },

    async pendingIds(table) {
      return new Set((await read()).filter((e) => e.table === table).map((e) => e.rowId));
    },

    async size() {
      return (await read()).length;
    },
  };
}

async function send(client: SupabaseClient, userId: string, entry: OutboxEntry): Promise<void> {
  const table = client.from(entry.table);
  const result = entry.op === 'upsert'
    ? await (entry.onConflict
      ? table.upsert(entry.row, { onConflict: entry.onConflict })
      : table.upsert(entry.row))
    : await table.update({ deleted_at: entry.at }).eq('id', entry.rowId).eq('user_id', userId);
  // Postgrest reports failure in the payload rather than by throwing.
  const error = (result as { error?: unknown } | null)?.error;
  if (error) throw error;
}
