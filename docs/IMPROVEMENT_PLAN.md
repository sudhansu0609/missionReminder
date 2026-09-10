# Mission Reminder: improvement plan

Written 2026-09-10 against the codebase as it stands (no git history yet).

## Where the app stands

Verified today:

| Gate | Result |
|---|---|
| `npm test` | 57 behaviour checks, all pass |
| `npm run typecheck` | core, data, desktop, mobile all clean |
| `vite build` (desktop) | renderer + main + preload build |
| git | **not a repository** |

The architecture is sound: one pure rules package (`@mission/core`), one storage
package (`@mission/data`), two thin UIs. Both apps share the tree geometry, the
drift maths, the pace maths and the reminder brain. That is the right shape and
nothing below changes it.

What is weak is (a) a handful of real defects in the glue, (b) sync that is
correct only while online, (c) a session mechanic that can be gamed by closing
the app, and (d) no tooling to stop regressions.

## Defects found (ranked)

### P0: breaks the product

1. **Ticking a milestone crashes.** `toggleMilestone` in both stores calls
   `this.saveGoal(...)`. Both Goals screens destructure the method off the
   store, so `this` is `undefined` at runtime and the click throws.
   (`apps/desktop/src/store.tsx`, `apps/mobile/src/store.tsx`)
2. **Sync loses offline edits and resurrects deletes.**
   - Every remote write is fire-and-forget behind `guard`. If it fails, the
     change stays local only. On the next `load()`, "server wins for any row it
     has", so an offline edit to an *existing* row (finishing a session, ticking
     a milestone) is overwritten by the stale server copy. A session finished
     offline comes back as `running`, and the ticker then completes it at 100%
     growth with its drifts erased.
   - `pushMissing` pushes every local row the server lacks. Delete a goal on the
     phone, and the laptop's cached copy pushes it straight back on its next load.
   (`packages/data/src/supabase.ts`)
3. **Closing or backgrounding the app dodges the penalty.** Growth is derived
   from wall-clock `startedAt`, and nothing records when the app was last
   actually watching. Kill the desktop app mid-block, reopen tomorrow, and the
   tree completes at 100% with no lapses. On the phone, background it for the
   whole block: a single capped penalty (max 0.6) lands on return, the tree
   survives, and the ticker completes it.
4. **The tray icon is invisible.** `nativeImage.createFromDataURL` accepts PNG
   and JPEG only; the SVG data URL yields an empty image, so on Windows and
   macOS the tray has no icon and "hide to tray during a session" leaves no way
   back except the notification. (`apps/desktop/electron/main.ts`)

### P1: wrong, but survivable

5. **Nudge "day" is UTC, everything else is local.** `computeNudges` and the
   desktop's fired-set use `toISOString().slice(0, 10)`; `dayKey()` is local.
   Goal pace in a nudge and on the goal card can disagree by a day, and ids
   roll over at the wrong hour. (`packages/core/src/nudge.ts`, `apps/desktop/src/App.tsx`)
6. **Reminder loop is rebuilt every second.** The desktop `useEffect` depends on
   `state`, which changes every tick during a session, so the 60s interval is
   torn down and recreated once a second and nudges are recomputed each render.
7. **Theme leaks.** `Ring` hardcodes a white track; the Blocks day pills
   hardcode the Forest green. Both are wrong on the three light themes.
8. **Destructive actions have no confirmation.** Deleting a goal drops its
   milestones and the link from every session, with one click.
9. **Export without import.** Settings can write a backup nobody can restore.
10. **Windows notifications.** No `app.setAppUserModelId`, so a packaged build
    will not show toasts reliably. No app icon for `electron-builder` either.
11. **Mission draft goes stale.** `MissionScreen` seeds its draft once; a change
    synced in from the other device is never reflected until remount.
12. **Today does not tick.** `now` is captured at render, so "kept/missed/now"
    on the timeline only refreshes when something else changes state.

### P2: quality and safety net

13. Not under git. No CI. No lint. Root `typecheck` covered packages only
    (fixed today: now covers both apps).
14. `@mission/data` has zero tests; the merge logic that owns your history is
    unverified.
15. `Session.note` exists in the model and the schema and is reachable from no
    screen. `Drift.reason = 'manual-pause'` exists and there is no pause.
16. A session ends by simply vanishing. No end screen, no summary, no note.

## Improvements, by phase

### Phase 1 (this iteration): make it trustworthy

Goal: nothing the app promises can be silently broken, and the two loopholes
are closed. Every item is verifiable from the command line.

- Fix P0 1, 4 and P1 5, 6, 7, 8, 10 outright.
- **Sync outbox + tombstones** (P0 2): every remote write is queued durably and
  replayed in order; deletes are soft. Server wins only after the outbox has
  been flushed. See `TECHNICAL_ARCHITECTURE.md`.
- **Session integrity** (P0 3): a local heartbeat records when the app last
  watched the session. On launch or foreground, time the app was not watching
  is *lost time*, not growth, and is charged as a lapse. Drift is charged
  progressively while you are away on desktop, and the penalty is no longer
  capped, so a long absence kills the tree while you are gone rather than
  being forgiven on return.
- **Session end screen with a note** (P2 16, 15): completion or death shows
  the final tree, the numbers, and a one-line "what did you get done" that
  lands in `Session.note`.
- **Import a backup** (P1 9) with validation and a confirmation.
- **Tests for `@mission/data`** using an in-memory fake of the Supabase client,
  plus new core tests for reconciliation and progressive drift.
- README updated where behaviour changed.

### Phase 2: make the phone a peer

- Block editing on mobile (the biggest stated limitation).
- Pause (uses `manual-pause` and the lost-time mechanism from Phase 1).
- A Weekly Review screen the Sunday nudge can actually open: last week's
  trees, hours per goal, blocks kept vs planned, and next week's blocks.
- Today auto-refreshes each minute; mission draft re-seeds on remote change.
- Desktop keyboard shortcuts (start next block, give up, switch tab) and tray
  quick actions ("Start next block").
- Git init, GitHub Actions running `typecheck` + `test` on push, ESLint with a
  minimal config.

### Phase 3: make it insightful

- Insights: focused hours per goal per week, best hour of day, lapse rate by
  block, streak history.
- A daily minutes target with a ring on Today.
- Optional signed URLs for media (privacy) behind a setting.
- Packaged releases (NSIS + DMG) with icons, auto-update, and an EAS profile
  for iOS.

## Non-goals

- Multi-user or shared forests. Last-write-wins per row remains the model.
- Background timers on iOS. The platform does not allow it; the honest answer
  is the lost-time rule.
- Replacing the framework-free tests with a test runner. They are fast, they
  read well, and they cover the domain.
