# Phase 1 report

Written against `IMPLEMENTATION_PLAN.md`, in its order. All eleven steps are
done. Deviations are called out under each step and collected at the end.

## Step 1 — Store method binding (P0 1)

`toggleMilestone` called `this.saveGoal(...)`, and both Goals screens
destructure the method off the store, so `this` was `undefined` and ticking a
milestone threw. Both stores are now built from `useCallback` closures over
local helpers and assembled with `useMemo`; `saveGoal` is a hoisted `const`
that `toggleMilestone` calls directly. `stateRef` remains the source of truth
inside callbacks so none of them close over a stale `state`.

Files: `apps/desktop/src/store.tsx`, `apps/mobile/src/store.tsx`.

```
$ grep -n "this\." apps/desktop/src/store.tsx apps/mobile/src/store.tsx
(no matches)
```

Both stores also gained a `mode` state rather than reading `repoRef.current.mode`
during render, which was stale until something else re-rendered after sign-in.

## Step 2 — Local day everywhere (P1 5)

`computeNudges` used `now.toISOString().slice(0, 10)` while `dayKey()` — which
pace, streaks and "today" all use — is local. A nudge's goal pace and the goal
card could disagree by a day, and ids rolled over at the wrong hour. Both the
nudge ids and the desktop's fired-set now use `dayKey(now)`.

Files: `packages/core/src/nudge.ts`, `apps/desktop/src/App.tsx`,
`packages/core/test/rules.test.mjs`.

New checks: *nudge ids use the local day* (every id from a 23:30 local clock
ends in that local date) and *a nudge pace matches the goal card* (the
`goal-behind` body equals `goalPace(goal, dayKey(now)).message`).

## Step 3 — Reminder loop hygiene (P1 6)

The interval effect depended on `state`, which changes every second during a
session, so the 60s interval was torn down and rebuilt once a second and the
nudges were recomputed on every render. `state` and `active` are now held in
refs and the effect depends only on `ready`. The badge's `useMemo` is keyed on
`[state.blocks, state.goals, state.sessions.length, state.mission, active?.id,
minute]`, where `minute` is a counter the same 60s tick bumps — one interval
drives both, and neither is rebuilt by a tick.

File: `apps/desktop/src/App.tsx`.

## Step 4 — Theme leaks and confirmations (P1 7, 8)

- `Ring`'s track was a hardcoded `rgba(255,255,255,0.1)`, invisible on the three
  light themes; it is now `var(--track)`.
- The Blocks day pills hardcoded the Forest green border; they now use
  `var(--accent)`, with the existing opacity carrying the on/off distinction and
  no literal colour left.
- Deleting a goal asks first, naming the goal, its milestone count and how many
  sessions lose their link to it. Deleting a block asks too. `window.confirm`,
  which is fine in Electron.

Files: `apps/desktop/src/components/ui.tsx`, `apps/desktop/src/screens/Blocks.tsx`,
`apps/desktop/src/screens/Goals.tsx`.

## Step 5 — Tray icon, app id, packaging icon (P0 4, P1 10)

`nativeImage.createFromDataURL` takes PNG and JPEG only, so the SVG data URL
produced an empty image: no tray icon on Windows or macOS, and "hide to tray
during a session" left no way back into the app.

- **`apps/desktop/electron/png.ts` (new)** — a PNG encoder: a CRC32 table
  computed once, `IHDR` / `IDAT` / `IEND` chunks, and `zlib.deflateSync` over
  rows each prefixed with filter byte 0. `leafPng(size)` draws the leaf
  procedurally — a filled disc `#2f7d5a`, a 2px stem `#123`, a smaller lighter
  disc `#7fd4a3`, the same shapes the SVG had — sampled 3x3 per pixel so a 32px
  disc does not read as a blob.
- **`main.ts`** — `new Tray(nativeImage.createFromBuffer(leafPng(32)))`, and
  `app.setAppUserModelId('media.buzzcaf.missionreminder')` before the first
  window, which is what Windows wants before it will show a toast reliably.
- **`scripts/make-icons.mjs` (new)** — the same routine in plain JS, writing
  `apps/desktop/build/icon.png` at 256x256. Wired as the desktop package's
  `prepackage`, alongside `build.directories.buildResources` and explicit
  `win.icon` / `mac.icon`.

*Deviation:* the encoder exists twice, once in TS for the Electron main bundle
and once in JS for the script. `TECHNICAL_ARCHITECTURE.md` says the script
"reuses the same routine in plain JS"; the alternative — importing an `.mjs`
from a TS file that `tsc --noEmit` also has to check — needs `allowJs` or a
hand-written `.d.ts` for no real gain. Both files carry a comment pointing at
the other.

`scripts/make-icons.test.mjs` runs the script and checks the PNG signature, the
IHDR dimensions and colour type, the IEND terminator, that the IDAT stream
inflates back to exactly one filter byte per row plus RGBA, and that the pixels
are opaque in the middle, clear in the corner and lighter where the highlight is.

## Step 6 — Session integrity in core (P0 3)

Per `TECHNICAL_ARCHITECTURE.md` §3:

- `Session.lostSeconds?: number` and `Drift.id?: string` in `types.ts`.
- `elapsedSeconds` subtracts `lostSeconds`, so `growthAt` and `remainingSeconds`
  both follow. Time the app did not witness stops being growth, and the timer
  extends by the same amount — it still has to be served.
- `driftPenalty`'s cap is raised from 0.6 to 1.0. About four and a half minutes
  away is now fatal from full health.
- `updateDrift(session, driftId, totalSeconds, reason, now)` charges only the
  delta since the last call for that id and rewrites the entry in place, so a
  continuous absence stays one lapse and costs the same whether it is charged
  once or in twenty instalments.
- `reconcileSession(session, lastSeen, now, driftId?)`: not running → as is;
  gap ≤ `RECONCILE_GRACE_SECONDS` (30) → as is; otherwise freeze growth by
  adding the gap to `lostSeconds`, charge the gap as a lapse, and if the block's
  wall-clock window has passed, end it `abandoned`.
- Mappers and schema gain `lost_seconds integer not null default 0`; `migrate`
  fills `lostSeconds: 0` when absent, and now also defends the `goals`,
  `blocks`, `sessions` and `whys` arrays.

*Detail the plan left open:* the 30s grace lives in core as
`RECONCILE_GRACE_SECONDS`, because `HEARTBEAT_SECONDS` is in `@mission/data` and
core must not import it. A data test asserts the two stay in the 2:1 relation
the architecture describes.

*Addition:* `reconcileSession` takes an optional `driftId`. Without it, mobile
would charge one absence twice — once precisely, from its own `AppState`
measurement, and again from the heartbeat gap. Passing the same episode id
routes the second charge through `updateDrift`'s delta rule, so one absence
stays one lapse. Covered by *an absence already charged is not billed twice*.

New core checks: progressive drift charges only the delta; one absence is one
lapse; a glance inside the grace records nothing; five minutes away kills the
tree; a penalty is never more than a whole tree; reconcile is a no-op inside the
grace, measures from the start with no heartbeat, freezes growth at the last
heartbeat, banks the gap as lost time and charges it as one lapse; growth never
rises through a reconcile; time served ignores lost time; reconcile abandons a
session the app did not watch to the end and keeps only the growth it earned;
lost time is monotonic; a finished session is left alone.

The existing *long absence costs*, *enough drift kills the tree* and *giving up
keeps partial growth* checks still pass unchanged.

Files: `packages/core/src/types.ts`, `packages/core/src/session.ts`,
`packages/core/test/rules.test.mjs`, `packages/data/src/mappers.ts`,
`packages/data/src/local.ts`, `packages/data/schema.sql`.

## Step 7 — Session integrity in the apps

- **`packages/data/src/heartbeat.ts` (new)** — `writeHeartbeat` /
  `readHeartbeat` / `clearHeartbeat` under `mission-reminder:heartbeat:v1`, with
  `HEARTBEAT_SECONDS = 15`. A corrupt value reads as `null` rather than throwing.
  `KV` has no `removeItem`, so clearing writes an empty string, which reads back
  as nothing.
- **Both stores** — the existing 1s ticker writes a heartbeat every 15s, and one
  is written at `begin()`. `wire()` reconciles any running session after load,
  persists the result, clears the heartbeat and raises the end screen if the
  session ended. A `commitSession` helper is the single place a changed session
  reaches memory, storage and the end screen.
- **Desktop `Focus`** — blur opens an episode (`uid('drift')` plus `since`), a 5s
  interval calls `updateDrift(id, secondsAway, 'left-app')`, and focus makes a
  final call and closes it. Idle uses the same mechanism from the 150s threshold,
  closing below 20s. The 20s "your tree is wilting" notification stays and now
  escalates once, with a second flash, when health falls under 0.4 — which it
  can, because health now falls while you are away.
- **Desktop store** — flushes the sync outbox on the window's `online` event.
- **Mobile store** — owns the `AppState` transitions: a heartbeat is written on
  the way to `background` while JS may still run, and on `active` the absence is
  charged and reconciled as one episode, then the outbox is flushed.

*Deviation:* mobile's `AppState` listener moved out of `Focus.tsx` and into the
store. The charge, the growth freeze and the abandonment check have to be one
decision against one heartbeat read, and the store is what owns the repo and the
heartbeat. `Focus.tsx` is now purely presentational, and shows minutes not
served when there are any.

Files: `packages/data/src/heartbeat.ts`, `packages/data/test/heartbeat.test.mjs`,
`apps/desktop/src/store.tsx`, `apps/desktop/src/screens/Focus.tsx`,
`apps/mobile/src/store.tsx`, `apps/mobile/src/screens/Focus.tsx`.

## Step 8 — Session end screen with a note (P2 15, 16)

Both stores expose `ended: Session | null`, `dismissEnded()` and
`setNote(sessionId, note)`. `ended` is set by the ticker on completion, by
`updateDrift` when the tree dies, by `finish` when you give up, and by the
load-time reconcile — so a block the app failed to witness tells you what
happened to it rather than silently appearing withered in the Forest.

The screen shows the final tree, the stage label and species, growth %,
health %, lapse count, minutes served, a warning when lost time is over a
minute, a one-line note input and Save / Skip. The desktop Forest detail view
now shows the note and any lost time. `Session.note` and the `note` column were
in the model and the schema and reachable from nothing; they are reachable now.
(`Drift.reason = 'manual-pause'` is still unused — pause is Phase 2.)

Files: `apps/desktop/src/screens/SessionEnd.tsx` (new),
`apps/mobile/src/screens/SessionEnd.tsx` (new), `apps/desktop/src/App.tsx`,
`apps/mobile/App.tsx`, both stores, `apps/desktop/src/screens/Forest.tsx`,
`apps/desktop/src/theme.css`.

## Step 9 — Sync outbox and tombstones (P0 2)

**`packages/data/src/outbox.ts` (new).** Entries live under
`mission-reminder:outbox:v1`. `enqueue` coalesces per `(table, rowId)`: a new
entry replaces a pending *upsert* in place (newest row wins, position kept) and
is appended behind a pending *delete*, so an undelete stays ordered after it.
`flush` is serialised by an in-memory promise lock, sends in order, stops at the
first failure and keeps the rest. Postgrest reports failure in the payload
rather than by throwing, so `send` checks `result.error`.

**`supabase.ts` rewritten.** Every remote write is now `local.x();
outbox.enqueue(); void outbox.flush()`. `load()` adopts once, flushes, fetches
(tombstones included), then merges: a server row wins unless this device still
has that id pending or the row is tombstoned; a cached row appears only if it is
pending. A cached row the server does not know and nobody queued is **dropped** —
the only way to be in that state is that the other device deleted it. Deletes
become `update({ deleted_at })`, and `goalToRow` / `blockToRow` write
`deleted_at: null` so an undelete clears the tombstone. Adoption is marked per
user under `mission-reminder:adopted:v1:<userId>`, and is not marked if the
check itself failed. `replaceAll` — which only the importer calls, since `load`
writes through to the local repo directly — queues every row. Realtime
`subscribe` is unchanged. `Repo` gained an optional `flush?()` for the stores'
`online` and foreground triggers.

*Deviation from the architecture's pseudocode:* it says merge, then drop
tombstoned rows. That order would also drop a *pending undelete*. The
implementation checks pending first, so a queued upsert survives the tombstone
it is about to clear. For every other case the two are identical.

*Signature change:* `createSyncRepo(local, client, userId, kv, onError?)` — the
outbox and the adoption marker need a `KV`. Both call sites pass the same store
the local repo uses.

Schema: `deleted_at timestamptz` on `goals` and `blocks`, `lost_seconds` on
`sessions`, in both the `create table` statements and the "re-running on an
existing database" section.

Tests (`packages/data/test/sync.test.mjs` plus `fake-supabase.mjs`, a chainable
in-memory postgrest that can be told to fail): the outbox coalesces two upserts
of one row; an undelete queues behind the delete; a failed flush leaves the entry
queued and `load()` returns the local row; the entry goes up on the next load; an
offline edit to an *existing* row is not overwritten by the stale server copy and
reaches the server on reconnect; lost time round-trips through the mapper; a
delete on device A is soft on the server and is not resurrected by device B;
adoption pushes local rows exactly once and a second device does not push its
seeded state over the account; a cached row nobody queued is dropped.

## Step 10 — Import a backup (P1 9)

**`packages/data/src/validate.ts` (new).** `validateState(input)` returns
`{ ok: true, state }` or `{ ok: false, reason }`, checking the top-level object,
`mission.statement`, the three arrays, string ids, goal and session statuses
against their enums, `startMinute` 0..1439, `durationMinutes` > 0, `growth` and
`health` in 0..1, and `days` a subset of 0..6. Unknown fields are kept, and
`migrate` — the same one the local repo uses, now exported — runs at the end so
an older backup imports cleanly.

Desktop Settings gained "Import a backup": a hidden `<input type="file"
accept=".json">`, then validation, then a confirm showing "N goals, N blocks,
N sessions. Replace what is on this device?", then `importState` →
`repo.replaceAll`, which when synced also queues every row. A refusal shows the
reason. Mobile has no importer, matching the plan's file list.

Files: `packages/data/src/validate.ts`, `packages/data/test/validate.test.mjs`,
`apps/desktop/src/screens/Settings.tsx`, `packages/data/src/local.ts`.

## Step 11 — README and report

README: the running section now mentions `start.ps1` / `start.sh` / `start.cmd`
/ `npm start`; the mechanic section states the uncapped penalty curve (about
four and a half minutes) and the lost-time rule, with a new "closed the app" row
in the drift table and a paragraph on the end screen; the sync section describes
the queue and soft deletes and points at import/export; the schema step notes
that re-running is how you pick up the new columns; the known limits note that
tombstones are never purged and that backgrounded time on iOS is lost time;
"Verified" is 129 checks with the new ground listed.

## What a user would notice

1. Ticking a milestone works. It used to throw.
2. Closing the app mid-block no longer completes the tree. The unwatched time is
   not growth, it is charged as a lapse, and if the block's window ran out while
   nobody was looking the session is withered. A laptop that sleeps at minute 45
   of 50 loses that block — deliberate, per the architecture's stated risk.
3. Leaving the app costs while you are gone rather than on your return, and there
   is no cap, so a long enough absence kills the tree before you get back. A
   second flash warns when health drops under 40%.
4. Sessions end on a screen: the final tree, the numbers, and "what did you get
   done" — which then shows in the Forest.
5. The tray icon is visible, and Windows toasts should work in a packaged build.
6. Deleting a goal or a block asks first, and says what goes with it.
7. Backups can be imported, validated, with the counts shown before anything is
   replaced.
8. Offline edits survive a reconnect. Deletes stay deleted on the other device.
9. Rings and day pills are readable on the light themes.
10. Nudges roll over at local midnight and agree with the goal cards.

## Skipped, and why

Nothing from the eleven steps was skipped. Everything in `IMPROVEMENT_PLAN.md`
that is not Phase 1 was left alone: mobile block editing, pause
(`Drift.reason = 'manual-pause'` is still unused), the weekly review screen,
Today's per-minute refresh and the mission draft re-seed (P1 11, 12), keyboard
shortcuts, git, CI and lint.

No runtime dependency was added and no version changed. `node_modules`,
`apps/desktop/dist` and `apps/desktop/dist-electron` were not touched by hand.
The folder is still not a git repository. Neither GUI was run.

## Gates

All three green, run from the repo root.

### `npm run typecheck`

```
> mission-reminder@0.1.0 typecheck
> tsc -b packages/core packages/data && npm run typecheck -w @mission/desktop -w @mission/mobile


> @mission/desktop@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json


> @mission/mobile@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json
```

### `npm test`

129 checks, zero failures (57 before this phase).

```
> mission-reminder@0.1.0 test
> npm run build:core && npm test -w @mission/core && npm test -w @mission/data && node scripts/make-icons.test.mjs


> mission-reminder@0.1.0 build:core
> npm run build -w @mission/core && npm run build -w @mission/data


> @mission/core@0.1.0 build
> tsc -p tsconfig.json


> @mission/data@0.1.0 build
> tsc -p tsconfig.json


> @mission/core@0.1.0 test
> node test/rules.test.mjs && node test/media-themes.test.mjs

PASS  tree is deterministic
PASS  tree has structure  127 segments, 262 leaves
PASS  growth reveals progressively  1 -> 7 -> 63 -> 127
PASS  canopy fills over the final stretch  0 -> 161 -> 262
PASS  all segments visible at full growth
PASS  species differ
PASS  stages advance
PASS  growth is time served  0.500
PASS  short glance is free
PASS  long absence costs  0.50
PASS  drift lowers health  0.61
PASS  drift is recorded
PASS  drift does not undo growth
PASS  enough drift kills the tree
PASS  timer completes the session
PASS  giving up keeps partial growth  growth 0.50 health 0.65
PASS  mood tracks health
PASS  progressive drift charges only the delta  0.6140 vs 0.6140
PASS  one absence is one lapse
PASS  a glance inside the grace records nothing
PASS  five minutes away kills the tree  penalty 1.00
PASS  a penalty is never more than a whole tree
PASS  reconcile is a no-op inside the grace
PASS  reconcile with no heartbeat measures from the start
PASS  reconcile freezes growth at the last heartbeat  0.200
PASS  reconcile banks the gap as lost time
PASS  reconcile charges the gap as one lapse
PASS  growth never rises through a reconcile
PASS  time served ignores lost time
PASS  reconcile abandons a session the app did not watch to the end  growth 0.20
PASS  an unwatched session keeps only the growth it earned  0.200
PASS  lost time is monotonic
PASS  reconcile leaves a finished session alone
PASS  an absence already charged is not billed twice
PASS  weighted milestones  0.125
PASS  pace knows you are behind  at-risk — 13% done, 4 days left. This one is slipping away.
PASS  expected progress from dates  0.60
PASS  weekday blocks appear  2
PASS  day filtering works
PASS  weekend is clear
PASS  a passed block is flagged missed
PASS  nudge ids use the local day  2026-09-07
PASS  a nudge pace matches the goal card
PASS  missed block produces a high-urgency nudge
PASS  nudges carry a reason from the mission
PASS  nudge ids are stable per day
PASS  a running session silences everything
PASS  streak counts back from today  3
PASS  forest summary  {"alive":3,"withered":1,"hours":3.3,"streak":0}

Sample nudges:
 - [high] You said 06:30 — Deep work :: The block is running without you. Start now and you still get most of the tree.
 - [high] Ship the first real version is at risk :: 13% done, 4 days left. This one is slipping away.
PASS  youtube watch links resolve to a thumbnail  https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg
PASS  youtu.be short links resolve the same
PASS  youtube shorts resolve
PASS  vimeo resolves
PASS  image urls are images, case and query ignored
PASS  a direct mp4 is a video
PASS  phone photos are images
PASS  desktop copies are images
PASS  anything else is a plain link
PASS  makeMedia classifies on the way in
PASS  only http urls travel between devices
PASS  link labels are readable
PASS  captions win over urls
PASS  media sorts by order
PASS  missing media is not a crash
PASS  there are several themes  7 themes
PASS  theme ids are unique
PASS  both light and dark are offered
PASS  every theme defines every colour
PASS  an unknown id falls back
PASS  the seeded state picks a real theme
PASS  each theme recolours the canopy  hsl(120 57% 44%) hsl(212 47% 49%) hsl(325 51% 52%) hsl(62 63% 48%) hsl(120 60% 36%) hsl(162 57% 38%) hsl(352 54% 42%)
PASS  bark and blossom follow the theme too
PASS  a dying tree goes brown in every theme  28 28 28 28 28 28 28
PASS  wilting never sweeps the long way round the wheel
PASS  colours stay inside legal hsl ranges
PASS  bark stays visible on light themes

> @mission/data@0.1.0 test
> node test/heartbeat.test.mjs && node test/validate.test.mjs && node test/sync.test.mjs

PASS  nothing written yet reads as nothing
PASS  a heartbeat round-trips  {"sessionId":"ses_1","at":"2026-09-07T09:15:00.000Z"}
PASS  the newest write wins
PASS  clearing leaves nothing behind
PASS  the interval is short enough that the grace is two of them  15
PASS  a corrupt heartbeat is not a crash
PASS  a seeded state is a valid backup
PASS  validation runs the migration
PASS  a string is not a backup
PASS  null is not a backup
PASS  no mission is refused  No mission statement in that file.
PASS  a mission with no statement is refused  No mission statement in that file.
PASS  goals that are not a list are refused  Missing the goals list.
PASS  a goal with no id is refused  A goal has no id.
PASS  an unknown goal status is refused  Unknown goal status "maybe".
PASS  a block outside the day is refused  A block starts outside the day.
PASS  a block with no length is refused  A block has no length.
PASS  a block with an impossible weekday is refused  A block has days that are not 0 to 6.
PASS  a state with sessions passes
PASS  lost time is filled in for an older backup
PASS  growth outside 0..1 is refused  A session has growth outside 0 to 1.
PASS  a NaN health is refused  A session has health outside 0 to 1.
PASS  an unknown session status is refused  Unknown session status "paused".
PASS  unknown fields survive the trip
PASS  the outbox coalesces two upserts of the same row
PASS  pending ids are reported per table
PASS  flush sends everything queued
PASS  only the newest version of a row is sent  two 
PASS  an undelete is queued behind the delete, not folded into it
PASS  a failed flush leaves the entry queued
PASS  load returns the local row while the server is unreachable
PASS  the entry goes up on the next load
PASS  and the queue is empty afterwards
PASS  the running session is on the server
PASS  an offline edit to an existing row is not overwritten by the stale server copy  completed
PASS  and it reaches the server on reconnect
PASS  lost time round-trips through the row mapper
PASS  the second device pulls the goal down
PASS  a delete is soft on the server
PASS  a delete on device A is not resurrected by device B
PASS  and it stays gone on the device that deleted it
PASS  the first sign-in pushes the local forest up  1 goals
PASS  adoption happens exactly once  0 extra writes
PASS  a second device does not push its seeded state over the account
PASS  a cached row the server does not know and nobody queued is dropped
PASS  make-icons writes the packaging icon  2993 bytes
PASS  it starts with the PNG signature
PASS  the header says 256x256 RGBA
PASS  it ends with IEND
PASS  the pixel data inflates to one filter byte per row plus RGBA  262400
PASS  the leaf is opaque in the middle and clear in the corner
PASS  the highlight sits above the body  127,212,163,255 vs 17,34,51,255
PASS  the tray size encodes too
```

### `npm run build -w @mission/desktop`

```
> @mission/desktop@0.1.0 build
> vite build

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
vite v5.4.21 building for production...
transforming...
✓ 107 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:   0.27 kB
dist/assets/index-5Ig_IH6d.css    7.61 kB │ gzip:   2.28 kB
dist/assets/index-C5DxTpFj.js   435.90 kB │ gzip: 126.56 kB
✓ built in 908ms
vite v5.4.21 building for production...
transforming...
✓ 2 modules transformed.
rendering chunks...
computing gzip size...
dist-electron/main.js  4.82 kB │ gzip: 2.46 kB
✓ built in 25ms
vite v5.4.21 building for production...
transforming...
✓ 1 modules transformed.
rendering chunks...
computing gzip size...
dist-electron/preload.js  0.72 kB │ gzip: 0.34 kB
✓ built in 8ms
```

## Files

Created:

```
apps/desktop/electron/png.ts
apps/desktop/src/screens/SessionEnd.tsx
apps/mobile/src/screens/SessionEnd.tsx
packages/data/src/heartbeat.ts
packages/data/src/outbox.ts
packages/data/src/validate.ts
packages/data/test/fake-supabase.mjs
packages/data/test/heartbeat.test.mjs
packages/data/test/sync.test.mjs
packages/data/test/validate.test.mjs
scripts/make-icons.mjs
scripts/make-icons.test.mjs
docs/PHASE1_REPORT.md
```

Modified:

```
README.md
package.json
apps/desktop/package.json
apps/desktop/electron/main.ts
apps/desktop/src/App.tsx
apps/desktop/src/store.tsx
apps/desktop/src/theme.css
apps/desktop/src/components/ui.tsx
apps/desktop/src/screens/Blocks.tsx
apps/desktop/src/screens/Focus.tsx
apps/desktop/src/screens/Forest.tsx
apps/desktop/src/screens/Goals.tsx
apps/desktop/src/screens/Settings.tsx
apps/mobile/App.tsx
apps/mobile/src/store.tsx
apps/mobile/src/screens/Focus.tsx
packages/core/src/nudge.ts
packages/core/src/session.ts
packages/core/src/types.ts
packages/core/test/rules.test.mjs
packages/data/package.json
packages/data/schema.sql
packages/data/src/index.ts
packages/data/src/local.ts
packages/data/src/mappers.ts
packages/data/src/repo.ts
packages/data/src/supabase.ts
```

Generated, not hand-written: `apps/desktop/build/icon.png` (by
`scripts/make-icons.mjs`, which the test suite runs).

---

*Reviewed 2026-09-10. Six defects found and fixed after this report was
written; see `PHASE1_REVIEW.md`. The check count is now 136.*
