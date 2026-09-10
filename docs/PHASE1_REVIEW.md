# Phase 1 review

Reviewer: Claude Fable 5.1, 2026-09-10. Subject: the Phase 1 implementation
described in `PHASE1_REPORT.md`, written by an Opus agent against
`IMPLEMENTATION_PLAN.md` and `TECHNICAL_ARCHITECTURE.md`.

## Verdict

Accepted with fixes. The implementation followed the plan closely and its
three gates were genuinely green on an independent re-run. Reading the code
found six defects the gates could not see, one of them pre-existing. All six
are fixed below, each with a regression check, and the gates are green again.

| Gate | Before review | After review |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm test` | 129 pass, 0 fail | 136 pass, 0 fail |
| `npm run build -w @mission/desktop` | builds | builds |

## Findings and fixes

### 1. Outbox flush could drop a write that landed mid-flight

`flush` took a snapshot of the queue, sent it, then wrote back
`snapshot.slice(sent)`. Any entry enqueued while the network was busy lived in
the store but not in the snapshot, so the write-back erased it. A second edit
made within a second of the first was lost for good.

Fix (`packages/data/src/outbox.ts`): sent entries are removed by id from a
fresh read of the store, and coalescing an upsert now issues a new id so a
stale in-flight send cannot be mistaken for the newer version.
Test: "a row queued while a flush was in flight survives it".

### 2. Sync merge dropped sessions older than the newest 500

The new merge rule ("a cached row the server did not return was deleted
elsewhere") was applied to sessions, but the fetch is capped at 500 and
sessions are never deleted. Heavy users would have watched their older forest
vanish from the device on every load.

Fix (`packages/data/src/supabase.ts`): sessions merge with `keepUnknown`, so a
cached session the fetch did not return is kept.
Test: "a cached session the fetch did not return is kept, not dropped".

### 3. Launching one device could kill a session running on the other

Both stores reconciled any running session on load, treating "no heartbeat
for it" as "measure from the session start". A session started on the phone
and pulled down by the desktop has no desktop heartbeat, so opening the laptop
mid-block froze the phone's session, charged the whole elapsed time as a
lapse, and after four and a half minutes marked it dead, then pushed that
upstream.

Fix (`apps/desktop/src/store.tsx`, `apps/mobile/src/store.tsx`): a session is
only reconciled when this device's own heartbeat names it. The mobile
foreground path has the same guard. Core keeps its general contract; the
architecture doc now states the caller rule.

### 4. The "window passed" rule in `reconcileSession` could never fire

The finish line was computed as planned length plus lost time *including the
gap just added*, which moves the line by exactly the amount missed. The
README, the report and a test all promised that a block whose window runs out
unwatched is withered; the test passed only because an 80-minute gap kills
the tree through the penalty instead.

Fix (`packages/core/src/session.ts`): the comparison uses lost time before
this gap. Behaviour now matches the documentation: a laptop that sleeps at
minute 48 of 50 and wakes at 51 withers the block at 96%; the same three
minutes mid-block leave it running with the time still owed.
Tests: "a short gap that crosses the finish line withers the block", "the
same gap mid-block leaves it running with the time still owed".

### 5. Realtime never attached after sign-in (pre-existing)

The subscription effect depended on `ready` only. `refreshAuth` swaps the repo
after sign-in but `ready` does not change, so the channel to Supabase was
never opened and "changes appear on the other device in a second" only held
after a restart.

Fix: the effect also depends on `mode` and `userId` in both stores.

### 6. Every local write in synced mode triggered a full server reload (pre-existing)

`createSyncRepo.subscribe` forwarded the local cache's change events to the
UI. The UI answers a change event with `load()`, and `load()` ends by writing
the merged state into that same cache, which fires the event again. In synced
mode the app was in a permanent fetch loop, four requests per iteration.

Fix (`packages/data/src/supabase.ts`): only remote channel events are
forwarded. The UI already knows about its own writes.
Test: "local writes and loads do not fire the change subscription".

## Things checked and left alone

- Store binding, local-day nudges, reminder loop refs, theme tokens, delete
  confirmations: correct as written.
- PNG encoder: chunk layout, CRC, filter bytes and alpha coverage are right;
  the test inflates the IDAT back out.
- Outbox coalescing semantics (delete after upsert, upsert after delete) match
  the design.
- `updateDrift` delta maths and the "one absence is one lapse" rule hold,
  including when mobile's measured absence and the heartbeat gap describe the
  same episode.
- Import validation refuses the failure modes that matter (NaN growth, bad
  day arrays, unknown statuses) and keeps unknown fields.

## Known follow-ups (not blocking)

- Desktop idle and blur episodes can overlap and charge the same minutes
  twice. Pre-existing; a shared episode id would fix it.
- Two devices both ticking the same running session write competing
  heartbeats and drift charges. Concurrent multi-device sessions were never a
  supported scenario; the guard in finding 3 stops the destructive case.
- Tombstoned goals and blocks accumulate on the server. A periodic purge is a
  one-line cron when it matters.
