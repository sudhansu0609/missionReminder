# Phase 3 — MR1: the runtime mirror

**Date:** 2026-09-10 · Cross-repo context:
`B:\youtubeProjects\Buzzcaf_Media\GUARDIAN_PLAN.md` §6 (MR1) and §3 D6.

## Why

There are two systems on this machine that remind the owner of things. Dexter
is the coworker — it knows the mission, the day's plan, and it nudges. Mission
Reminder owns the blocks, the sessions and the tree. Until now neither could see
the other, and the failure mode was obvious: two toasts about the same 06:30
block, from two apps, thirty seconds apart.

Nothing about the two mission models should merge. Dexter's mission is a north
star and today's win; ours is blocks, whys and a forest. Merging them would give
each app a way to corrupt the other's data. So the bridge is one file, written
one way, read-only at the far end: Dexter can *see* that a block is running and
keep quiet through it, and that is all.

## What was built

### `packages/core/src/mirror.ts` — the payload, as a pure function

`buildRuntimeMirror(state, now, { activeSession })` → the object that goes on
disk:

```json
{
  "mission":     { "statement": "…", "whys": ["…", "…"] },
  "today_blocks": [ { "id": "blk_…", "name": "Deep work",
                      "start": "2026-09-10T01:00:00.000Z",
                      "end":   "2026-09-10T01:50:00.000Z",
                      "status": "running" } ],
  "session":     { "block_id": "blk_…", "name": "Deep work",
                   "started_at": "…", "paused": false },
  "next_nudge":  { "at": "…", "kind": "block-soon", "text": "Writing at 10:00" },
  "updated_at":  "2026-09-10T10:52:11.496Z"
}
```

Three decisions worth writing down:

- **Times are ISO instants, not `HH:MM`.** A reader in another process, possibly
  another language, must not have to guess a timezone. Dexter formats them.
- **`status` is not `computeNudges`' idea of "missed".** The nudge rules stop
  calling a block missed 90 minutes after it ends, because past that there is no
  point nagging. A *status* has no such cut-off: a block whose grace ran out
  with nothing to show was missed at breakfast and is still missed at bedtime.
  So the mirror derives it directly — `running` → `done` → past grace and
  unkept → `missed` → otherwise `upcoming`.
- **`next_nudge` falls forward.** While a session runs `computeNudges` returns
  nothing on purpose — the person is already doing the work. If the field simply
  went empty there, Dexter could not tell "nothing to say" from "nothing
  coming". So when nothing is due, the field shows the next block instead, dated
  five minutes before it starts, which is when the reminder would fire.

`null` for `session` and `next_nudge` are meaningful values, not placeholders:
"no session is running" and "this app has nothing to say".

### The write path

| Piece | Where |
|---|---|
| `useRuntimeMirror(state, active, ready)` | `apps/desktop/src/runtime-mirror.ts`, called from `App.tsx` |
| `mirrorRuntime(mirror)` bridge | `apps/desktop/electron/preload.ts` |
| `runtime-mirror` handler + `will-quit` cleanup | `apps/desktop/electron/main.ts` |

The renderer owns the state, so it builds the payload; main only writes it. Two
timings, for two different reasons. The **debounced 1 s** write is what makes
the file *correct* — a block starting or a session pausing shows up within a
second. The **60 s** write is what makes it *trustworthy*: `updated_at` going
stale is the only way a reader can tell "nothing is happening" from "this app
died at 3am".

The hook's dependency list is deliberately narrow (mission, blocks, session
count, and the active session's id / paused / status). A running session is
rewritten every second by the growth ticker and none of that changes what the
file says; keying on the whole state would have meant a disk write per second
for the length of a 50-minute block, for no new information.

**Path.** `%LOCALAPPDATA%\MissionReminder\runtime.json`, with the platform
equivalent elsewhere and `MISSION_REMINDER_RUNTIME` overriding it outright.
Deliberately *not* `app.getPath('userData')`: on Windows that is Roaming, and a
file that says "a block is running right now" has no business following the user
to another machine.

**Atomicity.** A sibling `.tmp` and a rename, so a reader never sees half a
document. Write failures are logged and swallowed — a locked folder must not
take the app down over a courtesy file.

**On quit.** `will-quit` removes the file synchronously (promises are not
awaited there). The file describes *now*; leaving it behind would tell Dexter a
block was running long after the app closed.

### Optional: hand a nudge to Dexter too

**Off by default.** With `DEXTER_URL` set, each nudge is also POSTed to
`${DEXTER_URL}/api/dexter/nudge`, carrying `X-Dexter-Token` read from
`B:\youtubeProjects\Buzzcaf_Media\dexter\data\.session_token` when that file
exists (`DEXTER_TOKEN_FILE` overrides the path, so this is not a hard-coded
`B:` drive on someone else's machine). The point is one reminder in the place
the owner is already looking, rather than a second toast beside the first.

The system notification fires **first**, then the forward; the forward has a
1.5 s timeout, is never retried, and reports nothing. A Dexter that is down,
slow or absent costs the owner nothing, and a nudge that arrives late is worse
than one that never arrives.

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | clean — core, data, desktop, mobile |
| `npm test` | **255 PASS, 0 FAIL** (219 before this work, + 36 new in `packages/core/test/mirror.test.mjs`) |
| `npm run lint` | clean |

The 36 new checks cover: the mission travelling whole; today's blocks in start
order with ISO instants; all four statuses including a kept block, a block past
its grace, and a day with no blocks at all; a session with and without a block
behind it; a paused session; `next_nudge` due-now vs. falling forward vs. an
honestly empty one on a day fully kept; and the payload's exact key set and JSON
round trip.

**Live.** The desktop app was running throughout (it was not killed and no
second instance was started). `vite-plugin-electron` watches `electron/main.ts`
and restarted the Electron process itself when that file changed — after which
the running app wrote a real
`C:\Users\singh\AppData\Local\MissionReminder\runtime.json`, with the seeded
mission, one `today_blocks` row correctly marked `missed`, `session: null` and
`next_nudge: null`. That is the write path proven end to end on this machine.

**Not verified:** the `will-quit` deletion — proving it means quitting the
running app, which was out of scope. The Dexter forward was not exercised
either: `DEXTER_URL` is unset (its default), and no request was made to Dexter's
`/api/dexter/nudge`, which does not exist yet on that side.

The mobile app was not touched.
