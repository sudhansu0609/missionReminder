# Phase 2 work order: make the phone a peer

Written 2026-09-10 by Claude Fable 5.1 against the Phase 1 codebase
(`PHASE1_REPORT.md`, `PHASE1_REVIEW.md`). Scope is the Phase 2 list in
`IMPROVEMENT_PLAN.md`. Implementer: an Opus agent. Reviewer: Fable.

Ground rules, unchanged from Phase 1:

- Rules live in `@mission/core` and are pure. Storage lives in `@mission/data`.
  The two UIs stay thin. Nothing new goes into a UI that could be a core
  function with a test.
- Every step names a check. The three gates must be green at the end:
  `npm run typecheck`, `npm test`, `npm run build -w @mission/desktop`.
  A fourth gate is added by step 7: `npm run lint`.
- Do not widen scope. Phase 3 items (insights, daily target, packaging,
  signed URLs) are out.
- Keep the existing framework-free test style (`.mjs` files under
  `packages/*/test`). Add tests next to the ones that exist.
- Update `README.md` wherever behaviour changes, and remove the "block
  editing is desktop-only" limitation when step 1 is done.
- Write `docs/PHASE2_REPORT.md` in the same shape as `PHASE1_REPORT.md`:
  one section per step, in this order, with the check output, deviations
  called out, and a file list at the end.

## Step 0 - Git baseline (do this first, before any edit)

The folder is not a repository. Initialise one and commit the current tree
*before touching anything*, so the Phase 2 diff is reviewable.

- `git init -b main`. The existing `.gitignore` already excludes
  `node_modules`, `dist`, `build`, `.env`, `*.tsbuildinfo`. Confirm
  `apps/desktop/dist-electron/` is ignored too and add it if not.
- If `git config user.name` / `user.email` are unset globally, set them for
  this repo only: name `multisonu`, email `multisonu@gmail.com`.
- Commit everything as `Phase 1 baseline` with the trailers below.
- At the very end of Phase 2, commit again as `Phase 2: make the phone a
  peer` with the same trailers. Do not squash, amend or rebase.

Trailers for both commits (verbatim, last lines of the message):

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YYr6V8ovADCopVXw3a2Exk
```

Check: `git log --oneline` shows two commits at the end; `git status` is
clean.

## Step 1 - Block editing on mobile

The biggest stated limitation. Mobile gets a Blocks screen equivalent to
`apps/desktop/src/screens/Blocks.tsx`: list, add, edit (title, goal, start
time, duration, days, grace, active toggle), delete with the same
confirmation wording as desktop (use `Alert.alert`, not `window.confirm`).

- New file `apps/mobile/src/screens/Blocks.tsx`. Add a `Blocks` tab to
  `apps/mobile/App.tsx` between Goals and Forest (six tabs: Today, Mission,
  Goals, Blocks, Forest, You).
- Reuse the store's existing block methods; if mobile's store lacks one that
  desktop has, add it with the same name and signature.
- Time entry: a simple hour/minute entry is fine (two numeric inputs or a
  stepper on `startMinute`). Do not add a native date-picker dependency.
- Remove the "desktop-only" note from mobile Today and from the README.

Check: `npm run typecheck`. No test runner covers RN screens; the report
must include a short manual walkthrough (add, edit, delete a block) run in
Expo, or state plainly that it was not run.

## Step 2 - Pause (core rule + both apps)

Uses `Drift.reason = 'manual-pause'` and the lost-time mechanism.

Design, implemented in `packages/core/src/session.ts`:

- `Session.pausedAt?: ISODate`. Set by `pauseSession(session, now)`,
  cleared by `resumeSession(session, now)`. Add the column to
  `packages/data/schema.sql`, to `packages/data/src/mappers.ts` (nullable,
  both directions) and to the import validator.
- While paused, growth is frozen: `elapsedSeconds` uses `pausedAt` as the
  end instead of `now` when the session is paused. `tick` is a no-op while
  paused (returns the session unchanged; never completes a paused session).
- `resumeSession` charges the pause: the paused wall-clock seconds are added
  to `lostSeconds` (so the time is still owed; the finish line moves), and
  one `manual-pause` drift entry is recorded with those seconds.
- Pause is honest, not free. Each session has a pause budget:
  `PAUSE_BUDGET_SECONDS = 300`. Pause time inside the budget (cumulative
  across the session) costs no health. Beyond it, the excess is charged with
  `driftPenalty(excess)` like any other absence, and can kill the tree.
- A pause is bounded: `MAX_PAUSE_SECONDS = 20 * 60`. `resumeSession` (and
  `reconcileSession`) called after that treat the whole pause as an
  abandonment: the session ends `abandoned` at the frozen growth.
- `reconcileSession` on a paused session: the app was watching a paused
  session, so the heartbeat gap rule applies only to the time *after* the
  last heartbeat; the paused stretch before it is not "unwatched". Keep it
  simple: if `pausedAt` is set, first apply the pause rules up to
  `lastSeen ?? now` (resume-at-lastSeen semantics, leaving it paused if
  under the cap), then run the existing gap logic. Document the resulting
  behaviour in the function comment.
- `moodOf` returns `'watching'` for a paused session.
- Any existing drift/idle/blur charging in the two stores must be suppressed
  while paused (you are allowed to leave during a pause; that is the point).
  Heartbeats keep being written while paused.

UI:

- Desktop Focus: a Pause / Resume button next to Give up, and a visible
  "Paused. N:NN of budget left" line. Mobile Focus: the same.
- Both stores: `pause()` and `resume()` methods, persisted through the repo
  like every other session write, so the paused state syncs.

Tests in `packages/core/test/rules.test.mjs` (or a new `pause.test.mjs`):
growth is frozen while paused; a 2-minute pause costs no health and adds
120 s to lostSeconds; a 7-minute pause costs `driftPenalty(120)`; two pauses
of 3 minutes share one budget; a 25-minute pause abandons the session at the
frozen growth; `tick` does not complete a paused session whose wall clock
passed the planned length; reconcile of a paused session after a quit keeps
the frozen growth.

## Step 3 - Weekly Review

A screen the Sunday nudge can actually open.

Core: new `packages/core/src/review.ts`, exported from the index.

```ts
export interface WeekReview {
  weekStart: DayKey;            // Monday
  weekEnd: DayKey;              // Sunday
  sessions: Session[];          // ended in the week, newest first
  trees: { alive: number; dead: number };
  minutesByGoal: { goalId?: ID; title: string; minutes: number }[]; // sorted desc
  blocks: { planned: number; kept: number; missed: number };
  streakDays: number;           // consecutive days with >= 1 completed session, ending at now or the week end
  nextWeek: { block: Block; days: Weekday[] }[]; // active blocks, by first day
}
export function weekReview(state: AppState, now: Date, weeksAgo = 0): WeekReview
```

"Planned" is the number of block instances scheduled in the week (a block on
Mon-Fri counts 5), only for days at or before `now` in the current week.
"Kept" is a planned instance with a session that started within the block's
window (start minus 5 min to start plus grace plus duration) and completed.
"Missed" is planned minus kept. Reuse `minutesOnDay`, `dayKey`, and the
`schedule.ts` helpers; do not duplicate their maths.

Tests in `packages/core/test/review.test.mjs`: week boundaries are local
Monday to Sunday; `weeksAgo = 1` is last week; kept/missed counts on a
fixture with a Mon-Fri block and three sessions; minutesByGoal sums
completed and abandoned sessions and sorts desc; a session at 23:59 Sunday
belongs to that week, at 00:01 Monday to the next.

UI: desktop `screens/Review.tsx` as a new tab `Review` after Forest; mobile
`screens/Review.tsx` reachable from a "Week in review" card at the top of
Today on Sundays and from a button on Forest at all times (no seventh tab).
Both show this week and a "last week" toggle.

Nudge routing: add `screen?: 'review' | 'today' | 'goals' | 'blocks'` to
`Nudge`; set it on every existing nudge. Desktop: when a notification is
clicked, main sends `open-screen` to the renderer (new preload method
`onOpenScreen`) and `App.tsx` switches tab. Mobile: the notification's
`data.screen` is read in a response listener and the tab switches. The
weekly nudge id must stay `review:${day}`.

## Step 4 - Today ticks, mission draft re-seeds

- Both Today screens: `now` comes from a one-minute ticker so
  kept/missed/now on the timeline refreshes without another state change.
  On desktop, reuse the existing `minute` counter in `App.tsx` by moving the
  ticker into a tiny `useMinute()` hook in `apps/desktop/src/hooks.ts`; do
  not add a second interval.
- Both `MissionScreen`s: when `state.mission.updatedAt` changes and the
  local draft is not dirty, re-seed the draft. If the draft is dirty, show
  a one-line "Updated on another device. Reload draft?" affordance instead
  of clobbering it.

Check: typecheck, plus a test for any helper you extract (for example a
pure `shouldReseed(draftDirty, remoteUpdatedAt, seededAt)` in core).

## Step 5 - Desktop keyboard shortcuts

In the renderer (`App.tsx` or a `useShortcuts` hook). `Mod` is `Ctrl`, or
`Cmd` on macOS:

| Keys | Action |
|---|---|
| `Mod+1` .. `Mod+7` | Switch tab (Today, Mission, Goals, Blocks, Forest, Review, Settings) |
| `Mod+Enter` | Start the next block today (same code path as Today's button); no-op if none |
| `Mod+P` | Pause / resume the running session |
| `Mod+Shift+G` | Give up the running session (with the existing confirmation) |
| `Escape` | Close the session-end screen |

Shortcuts are ignored while focus is in an input, textarea or
contenteditable. List them in Settings under a "Shortcuts" heading and in
the README.

Check: typecheck, and a unit test for the pure key-to-action mapper. Put the
mapper in `apps/desktop/src/shortcuts.ts` as dependency-free TypeScript and
test it through the compiled desktop build or a small `node --test` file
wired into the root `npm test`; if that is awkward, keep the mapper in
`packages/core/src/shortcuts.ts` (it is pure and platform-free) and test it
there.

## Step 6 - Tray quick actions

`apps/desktop/electron/main.ts`: the tray context menu gains
"Start next block: <title> at <time>" (disabled when none), "Pause" /
"Resume" while a session runs, and "Give up". The renderer keeps main
informed with a new preload method `setTrayState({ nextBlock?: { title,
startMinute }, session?: 'running' | 'paused' | null })`, called from an
effect in the store whenever those change. Main sends `tray-action`
(`start-next` | `pause` | `resume` | `give-up`) back; the renderer performs
it through the same store methods as the UI. Give up from the tray still
asks for confirmation in the renderer (show the window first).

Check: typecheck and desktop build. Manual: report what was clicked, or
state that it was not run.

## Step 7 - ESLint

Flat config at the root (`eslint.config.js`), `typescript-eslint`
recommended without type-checked rules (keep it fast), `react-hooks`
plugin for both apps, and no stylistic rules. Add `npm run lint` at the
root that lints `packages/*/src`, `apps/desktop/src`, `apps/desktop/electron`,
`apps/mobile/src`, `apps/mobile/App.tsx`, `scripts/*.mjs`. Fix what it finds
or disable a rule with a one-line reason in the config; do not sprinkle
`eslint-disable` comments through the code.

Check: `npm run lint` exits 0.

## Step 8 - GitHub Actions

`.github/workflows/ci.yml`: on push and pull_request, Node 20 on
ubuntu-latest, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build -w @mission/desktop`. Cache npm. No secrets needed; the
desktop build must not require `.env`.

Check: the workflow file is valid YAML and every script it calls exists at
the root. It cannot be run here; say so.

## Gates at the end

```
npm run typecheck
npm run lint
npm test
npm run build -w @mission/desktop
git status        # clean
git log --oneline # two commits
```

Record the test count before and after in the report.
