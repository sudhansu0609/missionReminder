import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppState, Block, Goal, Mission, Session, Settings } from '@mission/core';
import type { KV, Repo } from './repo.js';
import { createOutbox, type OutboxTable } from './outbox.js';
import {
  blockToRow, goalToRow, missionToRow, rowToBlock, rowToGoal, rowToMission,
  rowToSession, rowToSettings, sessionToRow, settingsToRow,
} from './mappers.js';

export interface SupabaseConfig { url: string; anonKey: string }

/** Marks that this device has already offered its local rows to this account. */
const ADOPTED_PREFIX = 'mission-reminder:adopted:v1:';

export function createSupabaseClient(cfg: SupabaseConfig, storage?: any): SupabaseClient {
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // React Native has no URL to read a session out of.
      detectSessionInUrl: false,
      ...(storage ? { storage } : {}),
    },
  });
}

/**
 * Local-first sync with a durable outbox.
 *
 * Every write lands in the local cache immediately, so the UI never waits on a
 * network round trip, and is then *queued* rather than fired and forgotten. On
 * load the queue is flushed first; only after that is the server treated as
 * authoritative, and only for rows this device is not still holding a newer
 * version of. That ordering is what makes an edit made offline survive, and
 * what lets a delete on one device stay deleted on the other -- deletes are
 * soft, so "the server has never heard of this row" now means "the other
 * device removed it" rather than "it has not been uploaded yet".
 */
export function createSyncRepo(
  local: Repo,
  client: SupabaseClient,
  userId: string,
  kv: KV,
  onError?: (e: unknown) => void,
): Repo {
  const outbox = createOutbox(kv);

  const queue = async (
    table: OutboxTable, op: 'upsert' | 'delete', rowId: string,
    row: Record<string, unknown> = {}, onConflict?: string,
  ) => {
    await outbox.enqueue({ table, op, rowId, row, onConflict });
    void outbox.flush(client, userId).catch(onError);
  };

  /**
   * The first sign-in on a device that already has a forest. If the account is
   * empty, everything local is offered up once; after that the "the server has
   * never heard of this row" rule can be trusted, because from then on every
   * local row has been through the outbox.
   */
  const adoptOnce = async (cached: AppState) => {
    const key = ADOPTED_PREFIX + userId;
    if (await kv.getItem(key)) return;
    try {
      const { data, error } = await client
        .from('missions').select('id').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!data) {
        await outbox.enqueue({
          table: 'missions', op: 'upsert', rowId: cached.mission.id,
          row: missionToRow(cached.mission, userId, cached.settings), onConflict: 'user_id',
        });
        for (const g of cached.goals) {
          await outbox.enqueue({ table: 'goals', op: 'upsert', rowId: g.id, row: goalToRow(g, userId) });
        }
        for (const b of cached.blocks) {
          await outbox.enqueue({ table: 'blocks', op: 'upsert', rowId: b.id, row: blockToRow(b, userId) });
        }
        for (const s of cached.sessions) {
          await outbox.enqueue({ table: 'sessions', op: 'upsert', rowId: s.id, row: sessionToRow(s, userId) });
        }
      }
      await kv.setItem(key, new Date().toISOString());
    } catch (e) {
      // Could not ask. Try again next load rather than adopting blindly.
      onError?.(e);
    }
  };

  const repo: Repo = {
    mode: 'synced',

    async flush() {
      await outbox.flush(client, userId).catch(onError);
    },

    async load(): Promise<AppState> {
      const cached = await local.load();
      await adoptOnce(cached);
      await outbox.flush(client, userId).catch(onError);

      let rows;
      try {
        rows = await fetchAll(client, userId);
      } catch (e) {
        // Offline is a normal state, not a failure. Work from the cache.
        onError?.(e);
        return cached;
      }

      const [pendingGoals, pendingBlocks, pendingSessions, pendingMission] = await Promise.all([
        outbox.pendingIds('goals'), outbox.pendingIds('blocks'),
        outbox.pendingIds('sessions'), outbox.pendingIds('missions'),
      ]);

      const mine = pendingMission.has(cached.mission.id) || !rows.mission;
      const merged: AppState = {
        mission: mine ? cached.mission : rowToMission(rows.mission),
        settings: mine ? cached.settings : rowToSettings(rows.mission),
        goals: merge(rows.goals, cached.goals, pendingGoals, rowToGoal),
        blocks: merge(rows.blocks, cached.blocks, pendingBlocks, rowToBlock),
        // Sessions are never deleted, and the fetch stops at the newest 500,
        // so a cached session the server did not return is old, not gone.
        sessions: merge(rows.sessions, cached.sessions, pendingSessions, rowToSession, true),
      };

      await local.replaceAll(merged);
      return merged;
    },

    async saveMission(mission: Mission) {
      await local.saveMission(mission);
      const settings = (await local.load()).settings;
      await queue('missions', 'upsert', mission.id,
                  missionToRow(mission, userId, settings), 'user_id');
    },

    async saveSettings(settings: Settings) {
      await local.saveSettings(settings);
      const missionId = (await local.load()).mission.id;
      await queue('missions', 'upsert', missionId,
                  settingsToRow(settings, userId, missionId), 'user_id');
    },

    async upsertGoal(goal: Goal) {
      await local.upsertGoal(goal);
      await queue('goals', 'upsert', goal.id, goalToRow(goal, userId));
    },
    async deleteGoal(id: string) {
      await local.deleteGoal(id);
      await queue('goals', 'delete', id);
    },
    async upsertBlock(block: Block) {
      await local.upsertBlock(block);
      await queue('blocks', 'upsert', block.id, blockToRow(block, userId));
    },
    async deleteBlock(id: string) {
      await local.deleteBlock(id);
      await queue('blocks', 'delete', id);
    },
    async upsertSession(session: Session) {
      await local.upsertSession(session);
      await queue('sessions', 'upsert', session.id, sessionToRow(session, userId));
    },

    /**
     * Only the UI calls this, and only to import a backup -- `load` writes
     * through to the local repo directly. So it means "make the account look
     * like this", and every row is queued.
     */
    async replaceAll(state: AppState) {
      await local.replaceAll(state);
      await outbox.enqueue({
        table: 'missions', op: 'upsert', rowId: state.mission.id,
        row: missionToRow(state.mission, userId, state.settings), onConflict: 'user_id',
      });
      for (const g of state.goals) {
        await outbox.enqueue({ table: 'goals', op: 'upsert', rowId: g.id, row: goalToRow(g, userId) });
      }
      for (const b of state.blocks) {
        await outbox.enqueue({ table: 'blocks', op: 'upsert', rowId: b.id, row: blockToRow(b, userId) });
      }
      for (const s of state.sessions) {
        await outbox.enqueue({ table: 'sessions', op: 'upsert', rowId: s.id, row: sessionToRow(s, userId) });
      }
      void outbox.flush(client, userId).catch(onError);
    },

    /**
     * Remote changes only. The local cache is deliberately not forwarded: the
     * UI already knows about its own writes, and because `load()` ends by
     * writing the merged state back into that cache, forwarding it would turn
     * every load into another load -- a fetch loop that never settled.
     */
    subscribe(onChange: () => void) {
      const channel = client
        .channel(`mission:${userId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${userId}` }, onChange)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'blocks', filter: `user_id=eq.${userId}` }, onChange)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${userId}` }, onChange)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'missions', filter: `user_id=eq.${userId}` }, onChange)
        .subscribe();
      return () => { client.removeChannel(channel); };
    },
  };

  return repo;
}

interface Rows {
  mission: any;
  goals: any[];
  blocks: any[];
  sessions: any[];
}

/** Tombstones are fetched, not filtered out: the merge needs to see them. */
async function fetchAll(client: SupabaseClient, userId: string): Promise<Rows> {
  const [mission, goals, blocks, sessions] = await Promise.all([
    client.from('missions').select('*').eq('user_id', userId).maybeSingle(),
    client.from('goals').select('*').eq('user_id', userId),
    client.from('blocks').select('*').eq('user_id', userId),
    client.from('sessions').select('*').eq('user_id', userId)
      .order('started_at', { ascending: false }).limit(500),
  ]);
  for (const r of [mission, goals, blocks, sessions]) {
    if (r.error) throw r.error;
  }
  return {
    mission: mission.data,
    goals: goals.data ?? [],
    blocks: blocks.data ?? [],
    sessions: sessions.data ?? [],
  };
}

/**
 * Server wins, except for rows this device has not finished sending. A cached
 * row the server does not have and that is not pending is *dropped*: the only
 * way to be in that state is that the other device deleted it -- unless the
 * table is one nothing ever deletes from, in which case `keepUnknown` keeps it.
 */
function merge<T extends { id: string }>(
  remote: any[], cached: T[], pending: Set<string>, toDomain: (row: any) => T,
  keepUnknown = false,
): T[] {
  const out: T[] = [];
  const known = new Set<string>(remote.map((r) => r.id as string));
  for (const row of remote) {
    if (pending.has(row.id)) continue;   // our own newer write is still queued
    if (row.deleted_at) continue;        // deleted on another device
    out.push(toDomain(row));
  }
  for (const row of cached) {
    if (pending.has(row.id) || (keepUnknown && !known.has(row.id))) out.push(row);
  }
  return out;
}
