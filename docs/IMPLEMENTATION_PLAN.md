# Phase 1 implementation plan

Companion to `IMPROVEMENT_PLAN.md` (what and why) and
`TECHNICAL_ARCHITECTURE.md` (how). This file is the work order: steps, files,
acceptance criteria, and the gates that decide whether it is done.

## Ground rules for the implementer

- Keep `@mission/core` pure: no I/O, no platform imports, every rule a
  function of `(state, clock)`.
- Keep the tests framework-free (`node test/*.mjs`, `ok(label, cond)`).
- Do not add runtime dependencies. Node's `zlib` and `crypto` are available
  in the Electron main process; that is enough for the icon work.
- Do not change dependency versions.
- Do not initialise git or run the Electron GUI; the gates below are enough.
- Every behaviour change gets a test in core or data, and a README edit if
  the README described the old behaviour.
- Match the existing code style: short files, doc comments that explain the
  *why*, no lint churn.

## Gates (run from the repo root)

```
npm run typecheck                    # core, data, desktop, mobile: zero errors
npm test                             # every existing check still passes, plus the new ones
npm run build -w @mission/desktop    # renderer + main + preload build
```

All three must be green before the phase is called done.

## Steps, in order

### Step 1. Store method binding (P0 1)

Files: `apps/desktop/src/store.tsx`, `apps/mobile/src/store.tsx`

- Define store methods as closures over local helpers, never via `this`.
  Hoist `saveGoal` into a `const` and call it from `toggleMilestone`.
- Memoise the store object (`useMemo`) keyed on the values it closes over so
  consumers do not re-render on every provider render.

Accept: ticking a milestone on either app updates the goal and persists it.
`grep -n "this\." apps/desktop/src/store.tsx apps/mobile/src/store.tsx`
returns nothing.

### Step 2. Local day everywhere (P1 5)

Files: `packages/core/src/nudge.ts`, `apps/desktop/src/App.tsx`, tests

- Replace `now.toISOString().slice(0, 10)` with `dayKey(now)` in
  `computeNudges`; same in `loadFired` / `saveFired`.
- Test: with `now = 2026-09-07T23:30` local, every nudge id ends in
  `2026-09-07`, and the pace inside a `goal-behind` nudge equals
  `goalPace(goal, dayKey(now))`.

### Step 3. Reminder loop hygiene (P1 6)

File: `apps/desktop/src/App.tsx`

- Keep `state` and `active` in refs; the interval effect depends only on
  `ready`. Recompute nudges for the badge with `useMemo` keyed on
  `[state.blocks, state.goals, state.sessions.length, state.mission, active?.id]`
  plus a minute counter, not on every tick.

Accept: no interval churn during a running session (reason from the code;
no test required).

### Step 4. Theme leaks + confirmations (P1 7, 8)

Files: `apps/desktop/src/components/ui.tsx`, `apps/desktop/src/screens/Blocks.tsx`,
`apps/desktop/src/screens/Goals.tsx`

- `Ring` track uses `var(--track)`. Blocks day pills use `var(--accent)` at
  reduced opacity, no literal colour.
- Deleting a goal or a block asks first (`window.confirm` is fine in Electron;
  include the goal title and the count of sessions linked to it).

### Step 5. Tray icon, app id, packaging icon (P0 4, P1 10)

Files: `apps/desktop/electron/png.ts` (new), `apps/desktop/electron/main.ts`,
`scripts/make-icons.mjs` (new), `apps/desktop/package.json`

- `png.ts`: encode an RGBA buffer to PNG with `zlib.deflateSync` and a CRC32
  table. About forty lines. Draw the leaf procedurally (disc + stem + lighter
  disc, same shapes as the current SVG) into a 32x32 buffer.
- `main.ts`: `Tray` from `nativeImage.createFromBuffer(png)`. Call
  `app.setAppUserModelId('media.buzzcaf.missionreminder')` before
  `whenReady`.
- `scripts/make-icons.mjs`: same encoder (plain JS), writes
  `apps/desktop/build/icon.png` at 256x256. Wire it as `"prepackage"` in the
  desktop package so `electron-builder` picks the icon up from `build/`.

Accept: `node scripts/make-icons.mjs` writes a PNG whose first eight bytes are
the PNG signature; add that as a check in `scripts/make-icons.test.mjs` and
run it from root `npm test`.

### Step 6. Session integrity in core (P0 3)

Files: `packages/core/src/types.ts`, `packages/core/src/session.ts`,
`packages/core/test/rules.test.mjs`, `packages/data/src/mappers.ts`,
`packages/data/src/local.ts`, `packages/data/schema.sql`

Per `TECHNICAL_ARCHITECTURE.md` section 3:

- `Session.lostSeconds?: number` (time not served). `elapsedSeconds` subtracts it.
- `Drift.id?: string` and `updateDrift(session, driftId, totalSeconds, reason, now)`
  which charges only the delta since the last call for that id.
- `driftPenalty` cap raised from 0.6 to 1.0.
- `reconcileSession(session, lastSeenISO | null, now)` returning the corrected
  session (possibly abandoned).
- Mappers and schema gain `lost_seconds integer not null default 0`;
  `migrate` fills `lostSeconds` when absent.

Tests to add (names are suggestions):

- "progressive drift charges only the delta": three `updateDrift` calls with
  30, 60, 90 seconds leave the same health as one `applyDrift` of 90, and
  exactly one drift entry.
- "five minutes away kills the tree".
- "reconcile freezes growth at last heartbeat", "reconcile abandons a session
  the app did not watch to the end", "reconcile is a no-op when the gap is
  inside the grace".
- Existing "long absence costs" and "giving up keeps partial growth" still pass.

### Step 7. Session integrity in the apps

Files: `apps/desktop/src/store.tsx`, `apps/desktop/src/screens/Focus.tsx`,
`apps/mobile/src/store.tsx`, `apps/mobile/src/screens/Focus.tsx`,
`packages/data/src/heartbeat.ts` (new), `packages/data/test/heartbeat.test.mjs` (new)

- `heartbeat.ts`: `writeHeartbeat(kv, sessionId, now)`, `readHeartbeat(kv)`,
  `clearHeartbeat(kv)`. Key `mission-reminder:heartbeat:v1`.
- Both stores: write the heartbeat every 15s inside the existing ticker; clear
  it on end. On `wire()` (after load) and, on mobile, on `AppState` becoming
  `active`, run `reconcileSession` on any running session and persist the result.
- Desktop `Focus`: on blur, start a drift episode (`uid('drift')`) and call
  the store's `updateDrift(id, secondsAway, 'left-app')` every 5s until focus
  returns; final call on focus. Idle uses the same episode mechanism from the
  150s threshold.
- Mobile `Focus`: single `updateDrift` on return (JS is frozen while
  backgrounded), then reconcile.

Accept: typecheck; the core tests cover the maths. Document in the README
that a block the app did not witness to the end is withered, not completed.

### Step 8. Session end screen with note (P2 15, 16)

Files: `apps/desktop/src/screens/SessionEnd.tsx` (new), `apps/desktop/src/App.tsx`,
`apps/desktop/src/store.tsx`, `apps/mobile/src/screens/SessionEnd.tsx` (new),
`apps/mobile/App.tsx`, `apps/mobile/src/store.tsx`, `apps/desktop/src/theme.css`

- Store exposes `ended: Session | null` (set when a running session
  transitions to completed/abandoned in this process) and `dismissEnded()`,
  plus `setNote(sessionId, note)`.
- Screen: the final tree, `stage.label`, growth %, health %, lapse count, a
  single-line note input, "Save" and "Skip". Both buttons dismiss.
- Forest detail view shows the note when present (desktop; mobile if cheap).

### Step 9. Sync outbox and tombstones (P0 2)

Files: `packages/data/src/outbox.ts` (new), `packages/data/src/supabase.ts`,
`packages/data/src/mappers.ts`, `packages/data/schema.sql`,
`packages/data/test/sync.test.mjs` (new), `packages/data/package.json` (test script),
root `package.json` (`test` runs data tests too)

Per `TECHNICAL_ARCHITECTURE.md` section 2. In brief:

- Outbox in KV under `mission-reminder:outbox:v1`; entries coalesce per
  `(table, rowId)`; flush in order, stop at first failure, keep the rest.
- All remote writes go through the outbox. `load()` flushes first, then
  fetches, then merges: server rows minus tombstones, plus local rows whose id
  is still pending in the outbox.
- `goals` and `blocks` gain `deleted_at`; delete becomes an update.
- First sign-in adoption: if the server has no mission row for this user,
  enqueue everything local once (marker key per user).
- Fake client in the test: an object with `from(table)` returning a chainable
  that records `upsert` / `update` / `delete` / `select` and can be told to fail.

Tests (minimum):

- an offline edit to an existing row survives reconnect;
- a delete on device A is not resurrected by device B's load;
- the outbox coalesces two upserts of the same id into one;
- a failed flush leaves the entry queued and `load()` returns the local row;
- adoption pushes local rows exactly once.

### Step 10. Import a backup (P1 9)

Files: `packages/data/src/validate.ts` (new), `apps/desktop/src/screens/Settings.tsx`,
`packages/data/test/validate.test.mjs` (new)

- `validateState(json): { ok: true, state } | { ok: false, reason }` with
  structural checks (arrays present, ids are strings, numbers in range,
  statuses in the enum). Runs the same `migrate` used by the local repo.
- Settings: "Import a backup" opens a file input, validates, shows counts,
  confirms, then `replaceAll` and (when synced) enqueues everything.

### Step 11. README and report

- README: running section mentions `start.ps1` / `start.sh` / `npm start`;
  mechanic section reflects the new penalty curve and the lost-time rule;
  sync section mentions the outbox and soft deletes; "Verified" counts updated.
- Write `docs/PHASE1_REPORT.md`: what was done per step, what was skipped
  and why, and the exact output of the three gates.

## Out of scope for Phase 1

Mobile block editing, pause, weekly review screen, keyboard shortcuts, CI,
lint, insights. These are Phase 2 and 3 in `IMPROVEMENT_PLAN.md`.
