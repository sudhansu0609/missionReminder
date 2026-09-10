# Technical and architectural plan

How Phase 1 is built. Read `IMPROVEMENT_PLAN.md` for the why and
`IMPLEMENTATION_PLAN.md` for the order of work.

## 0. Current architecture (unchanged in shape)

```
apps/desktop (Electron + React)        apps/mobile (Expo + React Native)
   store.tsx  screens/  components/       store.tsx  screens/  components/
        \                                      /
         \      both import only these        /
          v                                  v
   @mission/data  ---- Repo interface ---- createLocalRepo(kv) | createSyncRepo(local, supabase)
          |
          v
   @mission/core  ---- pure rules: tree, session, goals, schedule, nudge, media, themes, seed
```

Rules of the house:

- `@mission/core` is pure. Every function is `(input, clock) -> output`.
  This is why one test file can prove the mechanic for both apps.
- `@mission/data` owns persistence. The UI never talks to Supabase directly.
- Both stores are thin: React state + a `Repo` + a one-second ticker.
- Whole-state-as-one-JSON-blob locally. The dataset is small; simplicity wins.

Phase 1 adds two concerns to `@mission/data` (an outbox and a heartbeat) and
three changes to `@mission/core` (`updateDrift`, `reconcileSession`, and a
raised `driftPenalty` cap). Everything else is UI.

## 1. Store shape (desktop and mobile)

Problem: methods on the store object use `this`, and consumers destructure.

Design:

```ts
const saveGoal = useCallback((goal: Goal) => { put(...); void repoRef.current.upsertGoal(goal); }, [put]);
const toggleMilestone = useCallback((goalId, msId) => { ...; saveGoal(next); }, [saveGoal]);
const store = useMemo<Store>(() => ({ state, ready, ..., saveGoal, toggleMilestone, ... }),
  [state, ready, mode, email, active, theme, userId, ended, /* every callback */]);
```

No `this` anywhere. `stateRef` remains the source of truth inside callbacks so
they never close over a stale `state`.

## 2. Sync: outbox and tombstones

### 2.1 Why the current design fails

`createSyncRepo` writes locally, then fires a remote write behind `guard`. If
the write fails it is forgotten. On `load()` the server is treated as
authoritative for every id it has, and `pushMissing` uploads every id it does
not. Two consequences:

- an offline *update* to an existing row is overwritten on reconnect;
- a *delete* on one device is undone by the other device's cache.

### 2.2 The outbox

```ts
// packages/data/src/outbox.ts
export type OutboxTable = 'missions' | 'goals' | 'blocks' | 'sessions';
export interface OutboxEntry {
  id: string;                     // uid('ob')
  table: OutboxTable;
  op: 'upsert' | 'delete';        // delete = soft delete (see 2.3)
  rowId: string;                  // primary key of the row
  row: Record<string, unknown>;   // mapped row, includes user_id and updated_at
  onConflict?: string;            // 'user_id' for missions
  at: string;                     // ISO, for ordering and debugging
}
export const OUTBOX_KEY = 'mission-reminder:outbox:v1';

export interface Outbox {
  enqueue(entry: Omit<OutboxEntry, 'id' | 'at'>): Promise<void>;
  /** Sends entries in order. Stops at the first failure and keeps the rest. */
  flush(client: SupabaseClient, userId: string): Promise<{ sent: number; remaining: number }>;
  pendingIds(table: OutboxTable): Promise<Set<string>>;
  size(): Promise<number>;
}
export function createOutbox(kv: KV): Outbox;
```

Coalescing on `enqueue`: an `upsert` for `(table, rowId)` replaces any pending
`upsert` for the same key (the newest row wins, position kept). A `delete`
replaces a pending `upsert`. An `upsert` after a pending `delete` is appended
(a rare undelete; order preserves it).

`flush` is serialised with a simple in-memory promise lock so two triggers do
not interleave. Each entry maps to exactly one Postgrest call:

| op | call |
|---|---|
| upsert | `from(table).upsert(row, onConflict ? { onConflict } : undefined)` |
| delete | `from(table).update({ deleted_at: at }).eq('id', rowId).eq('user_id', userId)` |

### 2.3 Tombstones

`goals` and `blocks` gain `deleted_at timestamptz`. Sessions and the mission
row are never deleted. Schema migration is appended to `schema.sql` in the
existing "re-running on an existing database" section:

```sql
alter table public.goals  add column if not exists deleted_at timestamptz;
alter table public.blocks add column if not exists deleted_at timestamptz;
```

Rows are *fetched* with tombstones included (so the merge knows the id exists)
and *filtered* after the merge.

### 2.4 `load()` algorithm

```
cached  = local.load()
adopt-once: if no marker for userId and the server has no mission row for the user
            -> enqueue every local row as upsert; set marker
flush()                                   // best effort; offline is normal
fetch mission, goals, blocks, sessions (limit 500 by started_at desc)
if fetch failed -> return cached
pending = outbox.pendingIds(table) for each table
merged.goals    = remote.goals    + { cached.goals    where id in pending.goals    }
merged.blocks   = remote.blocks   + { cached.blocks   where id in pending.blocks   }
merged.sessions = remote.sessions + { cached.sessions where id in pending.sessions }
mission/settings: remote if present, else cached
drop rows where deleted_at is set
local.replaceAll(merged); return merged
```

Note the change from today: a cached row the server does not know about and
that is not pending is **dropped**, because the only way to be in that state is
that another device deleted it.

Writes: `local.x(); outbox.enqueue(...); void outbox.flush(client, userId)`.
Realtime `subscribe` is unchanged (any event -> `load()`), and `flush` is also
triggered on the window's `online` event on desktop and on `AppState`
becoming active on mobile. Those triggers live in the stores, because
`@mission/data` must stay platform-free.

### 2.5 Tests

`packages/data/test/sync.test.mjs` uses a fake client:

```js
function fakeClient() {
  const tables = { missions: [], goals: [], blocks: [], sessions: [] };
  let failing = false;
  return {
    tables, setFailing: (v) => { failing = v; },
    from(table) { /* a thenable builder supporting select().eq().order().limit().maybeSingle(),
                     upsert(row, opts), update(patch).eq().eq(), delete().eq(); rejects when failing */ },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
  };
}
```

The data package gets a `test` script and root `npm test` runs it after core.

## 3. Session integrity

### 3.1 Vocabulary

- **Growth** is time served. Unchanged.
- **Lost time** (`Session.lostSeconds`) is wall-clock time inside the block
  that did not count: the app was not watching. `elapsedSeconds` becomes
  `(end - startedAt) / 1000 - lostSeconds`, floored at zero.
- A **drift episode** is one continuous absence. Today a `Drift` is appended on
  return with the whole duration; Phase 1 lets an episode be charged
  progressively.

### 3.2 Core additions (`packages/core/src/session.ts`)

```ts
/** Penalty for one continuous absence. No longer capped at 0.6: about four
 *  minutes away is fatal, which is the point. */
export function driftPenalty(seconds: number): number   // clamp(0.1 + over/60 * 0.22, 0, 1)

/** Progressive charging. Call repeatedly during one absence with the running
 *  total; only the delta since the last call is taken off health. The drift
 *  entry with this id is updated in place, so the record still shows one
 *  lapse of N seconds. */
export function updateDrift(
  session: Session, driftId: string, totalSeconds: number,
  reason: Drift['reason'], now: Date,
): Session

/** Corrects a session the app stopped watching. `lastSeen` is the heartbeat
 *  (or null if none was ever written, in which case `startedAt` is used). */
export function reconcileSession(
  session: Session, lastSeen: ISODate | null, now: Date,
): Session
```

`reconcileSession` rules, in order:

1. Not running -> return as is.
2. `gap = now - max(lastSeen ?? startedAt, startedAt)` in seconds. If
   `gap <= HEARTBEAT_SECONDS * 2` (30s) -> return as is; the app was watching.
3. Freeze growth: `lostSeconds += gap`. (`growthAt` now excludes the gap.)
4. Charge the gap as a lapse with reason `'left-app'`, via `applyDrift`. If
   that kills the tree, it is abandoned at the frozen growth.
5. If still alive and `now >= startedAt + plannedMinutes*60 + lostSecondsBeforeThisGap`
   (the block's wall-clock window has passed), end it as `'abandoned'`: the app
   cannot vouch for time it did not see. Otherwise return it running. The
   comparison uses the lost time *before* this gap: including the gap itself
   would move the finish line by exactly the amount just missed.

Callers only reconcile a session their own heartbeat names. A running session
with no local heartbeat is live on the other device and must be left alone.

Properties to keep honest in tests: growth never increases through a
reconcile; `lostSeconds` is monotonic; a gap under 30s is a no-op.

### 3.3 Heartbeat (`packages/data/src/heartbeat.ts`)

```ts
export const HEARTBEAT_KEY = 'mission-reminder:heartbeat:v1';
export const HEARTBEAT_SECONDS = 15;
export interface Heartbeat { sessionId: string; at: string }
export async function writeHeartbeat(kv: KV, sessionId: string, now?: Date): Promise<void>
export async function readHeartbeat(kv: KV): Promise<Heartbeat | null>
export async function clearHeartbeat(kv: KV): Promise<void>
```

Written every 15s from the store ticker (a tiny local write, never synced),
cleared on end. On load, the store reads it, runs `reconcileSession` on any
running session, persists the result through the repo, and clears the
heartbeat if the session ended.

### 3.4 Desktop drift episodes (`Focus.tsx`)

```
blur:   episode = { id: uid('drift'), since: Date.now() }
        every 5s -> updateDrift(id, (now - since) / 1000, 'left-app')
focus:  final updateDrift(...); episode = null
idle:   when idleSeconds crosses 150 start an episode with since = now - idleSeconds * 1000,
        reason 'idle'; update on each idle-tick; close when idleSeconds < 20
```

The 20s "your tree is wilting" notification stays. Because health now falls
while you are away, the flash can escalate: at health < 0.4, flash again.

### 3.5 Mobile

JS is frozen while backgrounded, so charging is single-shot on return via
`updateDrift` with the full duration, followed by `reconcileSession` (a no-op
when the heartbeat is fresh; freezes growth and abandons when the phone was
away for the rest of the block). `AppState` `active` triggers both.

### 3.6 Schema and mappers

`sessions.lost_seconds integer not null default 0`; `sessionToRow` /
`rowToSession` map it; `local.ts` `migrate` fills `lostSeconds: 0` when
absent. `drifts[].id` may be absent on older rows, which is fine.

## 4. Session end screen

Store gains:

```ts
ended: Session | null;          // the session that finished in this process, until dismissed
dismissEnded(): void;
setNote(sessionId: string, note: string): void;   // upsertSession with the note
```

`ended` is set in the ticker (completed), in `updateDrift` / `drift` (died),
in `finish` (gave up), and by reconcile on load (abandoned, so the user learns
what happened). The `Focus` overlay renders when `active`; `SessionEnd`
renders when `ended && !active`. Content: `Tree` at final growth/health,
`stageOf(growth).label`, growth %, health %, lapses, note input, Save / Skip.

## 5. Tray icon and packaging

`apps/desktop/electron/png.ts` encodes RGBA to PNG:

```
signature 89 50 4E 47 0D 0A 1A 0A
IHDR (width, height, bit depth 8, colour type 6 = RGBA)
IDAT (zlib.deflateSync of rows, each prefixed with filter byte 0)
IEND
```

with a CRC32 table computed once. The leaf is drawn procedurally: a filled
disc (#2f7d5a), a 2px stem (#123), a smaller lighter disc (#7fd4a3), matching
the current SVG. `scripts/make-icons.mjs` reuses the same routine in plain JS
at 256x256 for `apps/desktop/build/icon.png`. `app.setAppUserModelId` is
called before `whenReady`.

## 6. Import and validation

`packages/data/src/validate.ts`:

```ts
export type Validation = { ok: true; state: AppState } | { ok: false; reason: string };
export function validateState(input: unknown): Validation;
```

Checks: top-level object; `mission.statement` string; `whys`, `goals`,
`blocks`, `sessions` arrays; every row has a string `id`; `status` fields in
their enums; `startMinute` 0..1439; `durationMinutes` > 0; `growth` / `health`
in 0..1; `days` a subset of 0..6. Unknown extra fields are kept. Runs `migrate`
at the end so an older backup imports cleanly.

Desktop Settings imports via a hidden `<input type="file" accept=".json">`,
shows "N goals, N blocks, N sessions. Replace what is on this device?", then
`repo.replaceAll(state)`; if synced, also enqueues every row.

## 7. Verification matrix

| Change | Proven by |
|---|---|
| store binding | typecheck + `grep -n "this\." apps/*/src/store.tsx` returns nothing |
| local day | core test |
| outbox / tombstones / adoption | data tests with the fake client |
| progressive drift, reconcile, penalty curve | core tests |
| heartbeat | data test (write / read / clear round-trip on `memoryKV`) |
| validate | data test (accepts a seed state, rejects a mangled one) |
| PNG encoder | signature check in `scripts/make-icons.test.mjs` |
| UI | typecheck + `vite build` |

## 8. Risks and decisions

- **Penalty curve change is a product decision.** The old cap meant no single
  absence could kill a tree. The new rule (about four minutes) is chosen because
  the mechanic's promise is "leave and it wilts"; a cap made that promise false.
  README states the number.
- **Abandoning an unwatched block is strict.** A laptop that sleeps at minute
  45 of 50 loses the block. Accepted: the alternative is the loophole. Phase 2
  can add "resume within 2 minutes" leniency if it hurts in practice.
- **Dropping unknown cached rows on load** is the correct reading of "the
  other device deleted it" only because every local write goes through the
  outbox first. The adopt-once marker guards the first sign-in.
- **Tombstones grow forever.** Fine at this scale; a server-side purge of
  tombstones older than 90 days is a one-line cron for later.
