# Phase 2 report

Written against `PHASE2_PLAN.md`, in its order. All nine steps are done.
Deviations are called out under each step and collected at the end.

Test count: **136 before, 217 after.** The four gates were run before any edit
to record the baseline and again at the end; both runs are below.

## Step 0 — Git baseline

The folder was not a repository. `git init -b main`, then the whole tree
committed as `Phase 1 baseline` before a single file was touched.

`.gitignore` already excluded `node_modules`, `dist`, `build`, `release`,
`.expo`, `.env`, `*.log` and `*.tsbuildinfo`. It did **not** exclude
`apps/desktop/dist-electron/`, which the desktop build writes, so that line was
added — the one edit that belongs to the baseline commit rather than to Phase 2.

*Deviation:* the plan says to set `user.name` / `user.email` on the repo only if
they are unset globally. They are set globally, but the global email is the
literal string `singhsonusingh.singh**@gmail.com` — asterisks and all, which is
not an address. Rather than stamp two commits with it, `multisonu` /
`multisonu@gmail.com` were set on this repository only, as the plan's fallback
describes.

```
$ git log --oneline
3b5766f Phase 1 baseline

$ git status --porcelain
(nothing)
```

Baseline gates, run on that commit before anything changed: `npm run typecheck`
clean, `npm test` **136 checks, 0 failures**, `npm run build -w @mission/desktop`
built, working tree still clean afterwards.

## Step 1 — Block editing on mobile

`apps/mobile/src/screens/Blocks.tsx` (new) is the desktop Blocks screen: the
list with its day pills and paused badge, a New block button, an editor for
title, goal, start time, duration, grace, days and the active toggle, and
delete.

- Delete uses `Alert.alert` with the desktop's exact wording — *Delete "X"? The
  block goes; the trees you already grew for it stay.* — and a destructive
  confirm rather than `window.confirm`, which does not exist in React Native.
- Time entry is two numeric inputs, hour and minute, clamped to 0..23 and 0..59,
  with the formatted time shown above them. No date-picker dependency was added;
  no dependency of any kind was added to mobile.
- The store gained `removeBlock(id)` with the same name and signature as the
  desktop's. `saveBlock` already existed.
- `Blocks` is a tab in `apps/mobile/App.tsx` between Goals and Forest, six tabs:
  Today, Mission, Goals, Blocks, Forest, You.
- Mobile Today's "Blocks are set up on the desktop app" line is replaced by the
  desktop's "A commitment you keep beats one you set well", and the
  "Block editing is desktop-only" bullet is gone from the README's known limits.

Check: `npm run typecheck` clean (below).

**Manual walkthrough: not run.** Expo was not started and no simulator or phone
was available in this environment, so add / edit / delete were not exercised in
a running app. What is verified is that it typechecks against the RN types, that
every store method it calls exists with the signature it uses, and that its
list, editor and confirm mirror screens that do run.

## Step 2 — Pause

Core, in `packages/core/src/session.ts`:

- `Session.pausedAt?: ISODate` (`types.ts`), set by `pauseSession(session, now)`
  and cleared by `resumeSession(session, now)`.
- `elapsedSeconds` ends the clock at `pausedAt` instead of `now` while paused,
  so `growthAt` and `remainingSeconds` both freeze with it. `tick` returns the
  session unchanged while paused and can never complete it.
- `resumeSession` adds the paused wall clock to `lostSeconds` — the time is
  still owed, the finish line moves — and records one `manual-pause` drift with
  those seconds.
- `PAUSE_BUDGET_SECONDS = 300`, cumulative over the session and derived from the
  `manual-pause` entries rather than a second field. Pause inside it is free;
  the excess is charged `driftPenalty(excess)`, as a delta so two short pauses
  cost exactly what one long one would, and it can kill the tree.
- `MAX_PAUSE_SECONDS = 20 * 60`. A single pause past that ends the session
  `abandoned` at the frozen growth, on resume or on reconcile.
- `pauseSecondsUsed`, `pauseSecondsRunning` and `pauseBudgetLeft` are exported
  for the two Focus screens' "N:NN of budget left" line.
- `moodOf` returns `watching` for a paused session.

`reconcileSession` treats a paused session as two stretches. Heartbeats keep
being written while paused, so everything up to `lastSeen` was a pause the app
watched: it is settled under the ordinary pause rules, cap included. Only the
stretch *after* the last heartbeat is unwatched, and that is charged as a lapse
like any other gap. The session stays paused across the correction with the
marker moved to `now`, which is what keeps the frozen growth frozen instead of
shrinking it by the size of the gap. The function comment says all of this.

*Detail the plan left open:* the plan says "leave it paused if under the cap"
but does not say where the marker lands. Moving it to `lastSeen` and then adding
the gap to `lostSeconds` would have subtracted the gap from a growth figure the
gap is not part of, and the promised "keeps the frozen growth" check would have
failed. Moving it to `now` makes the two cancel exactly.

Storage: `paused_at timestamptz` on `sessions` in `schema.sql`, in the create
table and in the re-run section; `sessionToRow` / `rowToSession` map it
nullable both ways; the import validator refuses a `pausedAt` that is not a
string.

Both stores gained `pause()` and `resume()`, persisted through `commitSession`
like every other session write, so the stopped clock syncs. Both stores'
`updateDrift` returns early while paused, and mobile's foreground handler skips
its own measured-absence charge while paused (it still reconciles, which is what
settles the paused stretch against the budget). Desktop's `Focus` skips the blur
and idle episodes while paused, so the wilting notifications stay quiet too.
Heartbeats keep being written in both apps.

UI: a Pause / Resume button beside Give up on both Focus screens, and a
"Paused. N:NN of budget left — past that it costs the tree, and twenty minutes
ends it." line.

Checks — `packages/core/test/pause.test.mjs`, 27 new:

```
PASS  pausing stamps the moment the clock stopped
PASS  growth is frozen while paused  0.200
PASS  a paused session is watching, not drifting
PASS  pausing twice changes nothing
PASS  a two-minute pause costs no health  1
PASS  and adds 120 s to lost time  120
PASS  and is recorded as one manual pause
PASS  growth carries on from where it froze  0.200
PASS  the finish line moved by the pause  1.000
PASS  the budget is spent down, not reset  180
PASS  a seven-minute pause costs driftPenalty(excess)  0.504 vs 0.504
PASS  and the whole pause is still owed as lost time
PASS  the first three-minute pause is free
PASS  two pauses of three minutes share one budget  0.724 vs 0.724
PASS  pause used is cumulative  360
PASS  a 25-minute pause abandons the session
PASS  at the growth it had when the clock stopped  0.200
PASS  and the pause is left in the record
PASS  tick does not complete a paused session past its planned length
PASS  tick completes it once resumed and the time is served
PASS  reconcile of a paused session keeps the frozen growth  0.200
PASS  it is still paused afterwards
PASS  the pause is banked and so is the gap  240
PASS  the unwatched stretch is charged as a lapse  0.504
PASS  the pause itself was free
PASS  a pause past the cap is an abandonment even without a resume  0.200
PASS  reconcile still no-ops inside the grace on a normal session
```

Plus, in `packages/data`:

```
PASS  a pause marker that is not a time is refused  A session has a pause marker that is not a time.
PASS  a paused session carries its stopped clock to the server
PASS  and reads back as paused
PASS  while an unpaused one reads back with no marker
```

## Step 3 — Weekly Review

`packages/core/src/review.ts` (new), exported from the index, with the
`WeekReview` interface and `weekReview(state, now, weeksAgo = 0)` exactly as the
plan specifies, plus `weekStartOf(date)` — local Monday 00:00 — which the screens
also use for their date range.

- Planned counts every `(block, day)` the week holds, stopping at today in the
  current week: a Thursday block is not missed on Wednesday. Past weeks count
  all seven days.
- Kept is a planned instance with a **completed** session that started between
  five minutes before the block and the end of grace plus duration.
- `minutesByGoal` groups by goal and sums with `focusedMinutes`, so abandoned
  sessions bank the minutes they served; a session with no goal is labelled
  "No goal" rather than dropped. Sorted descending.
- `streakDays` reuses `goals.ts`, anchored at `now` for this week and at the end
  of the Sunday for a past one.
- `nextWeek` lists active blocks ordered by their first day, Monday first.
- `occursOn`, `windowFor`, `focusedMinutes`, `streakDays` and `dayKey` do the
  arithmetic; none of it is re-implemented.

UI: desktop `screens/Review.tsx` as a **Review** tab after Forest; mobile
`screens/Review.tsx` opened from a "Week in review" card at the top of Today on
Sundays and from a button on Forest at all times — no seventh tab, it takes over
the screen and closes back to where you were. Both have a this week / last week
toggle.

Nudge routing: `Nudge.screen?: NudgeScreen` (`'review' | 'today' | 'goals' |
'blocks'`) is set on all six existing nudges. Desktop's `notify` carries it to
main, which sends `open-screen` to the renderer on notification click through
the new preload method `onOpenScreen`; `App.tsx` switches tab. Mobile attaches
the screen to every scheduled notification's `data` and reads it back in
`onNotificationTap`, a response listener wired in `App.tsx`. The weekly nudge id
is still `review:${day}`.

Checks — `packages/core/test/review.test.mjs`, 19 new:

```
PASS  the week runs local Monday to Sunday  2026-09-07 .. 2026-09-13
PASS  weekStartOf finds the Monday from any day of the week
PASS  weeksAgo = 1 is last week  2026-08-31 .. 2026-09-06
PASS  and it holds last week’s session
PASS  this week holds five sessions, newest first  s5 s4 s3 s2 s1
PASS  trees are counted alive and dead  {"alive":4,"dead":1}
PASS  planned counts only the days the week has reached  5
PASS  kept is a session started inside the block window  2
PASS  missed is the rest  3
PASS  a block later in the week is not missed yet
PASS  minutes are summed per goal and sorted desc  [{"goalId":"g1","title":"Book","minutes":175},{"goalId":"g2","title":"Fitness","minutes":30}]
PASS  an abandoned session still banks the minutes it served
PASS  a session with no goal is labelled, not dropped
PASS  a session ending 23:59 Sunday belongs to that week
PASS  and one ending 00:01 Monday belongs to the next
PASS  next week lists active blocks by their first day  blk1:12345 blk2:6
PASS  a paused block is not on next week’s list
PASS  a Sunday-only block sorts last, because the week starts on Monday
PASS  the streak is read at the end of a past week, not from today  3 then 0
```

**Manual walkthrough: not run** for the mobile half — see Step 1.

## Step 4 — Today ticks, mission draft re-seeds

`apps/desktop/src/hooks.ts` (new) holds `useMinute()`. It is not one interval
per caller: a module-level `Set` of subscribers shares a single 60 s timer that
is created on the first subscription and cleared on the last. `App.tsx` uses it
for the reminder loop and the nav badge — the interval it used to own is gone —
and Today uses it to rebuild `now`. Same hook, same shape, in
`apps/mobile/src/hooks.ts` for mobile Today.

*Deviation, small:* the plan says "reuse the existing `minute` counter in
`App.tsx` by moving the ticker into a tiny `useMinute()` hook". A plain hook
would have opened a second interval the moment Today also called it, which the
plan forbids in the same sentence, so the hook shares one timer between all its
callers. The count of intervals is unchanged: one.

Mission draft re-seed: `packages/core/src/drafts.ts` (new) exports the pure
`shouldReseed(draftDirty, remoteUpdatedAt, seededAt)` the plan suggested, and
`sameMission(a, b)` which compares two missions ignoring `updatedAt`. Both
`MissionScreen`s keep the mission the draft was seeded from, treat "dirty" as
"differs from that", re-seed silently when the draft is clean and the remote
stamp moved, and otherwise show *"Updated on another device. Reload draft?"*
(desktop) or a card with a Reload draft button (mobile) instead of clobbering
what is typed. Your own save coming back with a new stamp is recognised by
content and quietly re-bases, which is what stops the banner appearing after
every save.

Checks: typecheck, plus five in `shortcuts.test.mjs`:

```
PASS  an untouched draft catches up with the other device
PASS  a half-written one is left alone
PASS  and nothing happens when nothing moved
PASS  the same mission with a fresh stamp is still the same mission
PASS  a changed statement is not
```

## Step 5 — Desktop keyboard shortcuts

The mapper is in `packages/core/src/shortcuts.ts`, which the plan offers as the
alternative when wiring a desktop-only test file into the root `npm test` is
awkward — it was, and the mapper is pure and platform-free, so it lives in core
and is tested there.

`shortcutFor(chord, { mac, editing })` returns `{kind: 'tab'}`, `'start-next'`,
`'toggle-pause'`, `'give-up'`, `'close-ended'` or null. `SHORTCUT_TABS` is the
seven tabs in `Mod+1..7` order and `App.tsx`'s nav is built in that same order.
`SHORTCUT_HELP` is the table Settings and the README both render.

`useShortcuts` in `apps/desktop/src/hooks.ts` is the only DOM part: it decides
whether the caret is in an `input`, `textarea`, `select` or contenteditable and
hands everything else to the mapper. `App.tsx` has one `run(action)` that the
keyboard and the tray both go through. Give up asks with `window.confirm` first,
naming the growth about to be killed.

Settings gained a **Shortcuts** card that prints `Mod` as `Cmd` or `Ctrl` for the
machine it is on. The README has the same table.

Checks — 22 in `packages/core/test/shortcuts.test.mjs`:

```
PASS  there are seven tabs to reach  today mission goals blocks forest review settings
PASS  Mod+1 is Today
PASS  Mod+6 is Review
PASS  Mod+7 is Settings
PASS  Mod+8 is nothing
PASS  a bare 1 is nothing
PASS  Cmd is the modifier on a Mac
PASS  and Ctrl is not
PASS  Ctrl is the modifier everywhere else
PASS  and Cmd is not
PASS  both modifiers at once belongs to somebody else
PASS  Alt is somebody else too
PASS  Mod+Enter starts the next block
PASS  Mod+P pauses and resumes
PASS  and so does Mod+P with caps lock on
PASS  Mod+Shift+G gives up
PASS  Mod+G on its own does not
PASS  Mod+Shift+1 is not a tab switch
PASS  Escape closes the session-end screen
PASS  nothing fires while the caret is in a box
PASS  not even Escape, which would take a half-written note with it
PASS  the help table covers every binding
```

## Step 6 — Tray quick actions

`apps/desktop/electron/main.ts` keeps a `trayState` the renderer pushes, and
rebuilds the context menu from it: **Start next block: &lt;title&gt; at &lt;time&gt;**
(disabled with the label "Nothing left today" when there is none, and while a
session is running), **Pause** while one runs, **Resume** while one is paused, and
**Give up**, enabled only when there is something to give up. Main works nothing
out for itself.

The renderer keeps it informed from an effect in the store, on the shape the
plan specifies:
`setTrayState({ nextBlock?: { title, startMinute }, session?: 'running' | 'paused' | null })`.
Which block that is comes from a new pure helper,
`blockToStartNow(blocks, sessions, now)` in `packages/core/src/schedule.ts` —
the block running right now if it has not been honoured, otherwise the next one
due today — so the tray label and `Mod+Enter` cannot mean different blocks.

Main sends `tray-action` (`start-next` | `pause` | `resume` | `give-up`) back
after showing the window; the renderer runs it through the same `run(action)`
the keyboard uses, so it is the same store methods as the UI. Give up still
raises the window and asks before killing anything.

*Deviation:* the plan puts the `tray-action` listener implicitly on the store
side. It is in `App.tsx`, next to the shortcut handler, because the two perform
identical work and one of the four actions needs a confirmation dialog the store
has no business owning. `setTrayState` is called from the store, as specified.

Checks: `npm run typecheck` and `npm run build -w @mission/desktop`, both below,
plus four on the helper the label and the shortcut share:

```
PASS  the block running right now wins
PASS  once it is honoured, the next one is offered
PASS  and after the last one, nothing
PASS  a day with no blocks in it is nothing too
```

**Manual walkthrough: not run.** Electron was not launched in this environment,
so nothing was actually clicked in a tray menu. The menu template is built from
values the renderer supplies and every action round-trips through code paths the
keyboard test covers, but "the Pause item appears while a session runs" has not
been seen with human eyes.

## Step 7 — ESLint

`eslint.config.mjs` at the root: flat config, `typescript-eslint` recommended
without the type-checked rules, `eslint-plugin-react-hooks` on `.tsx`, and no
stylistic rules at all. `npm run lint` at the root covers `packages/core/src`,
`packages/data/src`, `apps/desktop/src`, `apps/desktop/electron`,
`apps/mobile/src`, `apps/mobile/App.tsx` and `scripts`.

Three rules are turned off in the config, each with its reason written there and
none of them silenced inline anywhere in the code:

- `@typescript-eslint/no-explicit-any` — the row mappers pass postgrest's
  untyped rows straight through, and `app.isQuitting` is a field Electron does
  not declare.
- `no-undef` — TypeScript resolves identifiers itself and already knows the DOM
  and React Native globals.
- `react-hooks/exhaustive-deps` — several effects narrow their dependencies on
  purpose (the reminder loop, the nudge badge, the session ticker) and each says
  why in a comment the rule cannot read. Off rather than warn: a warning nobody
  is required to act on is worse than an exception recorded in one place.

`@typescript-eslint/no-unused-vars` is kept as an error with `^_` allowed, which
is what `_e` in the IPC handlers is for.

It found exactly one real problem — `apps/mobile/src/screens/Forest.tsx`
destructured `C` off the theme and never used it, pre-existing — which is fixed
rather than suppressed.

*Deviation:* the file is `eslint.config.mjs`, not `eslint.config.js`. The root
package is CommonJS, so a `.js` flat config could not use `import`. Noted in the
file's own header.

New root devDependencies: `eslint`, `@eslint/js`, `typescript-eslint`,
`eslint-plugin-react-hooks`, `globals`. `package-lock.json` is updated, so
`npm ci` resolves them.

```
$ npm run lint

> mission-reminder@0.1.0 lint
> eslint packages/core/src packages/data/src apps/desktop/src apps/desktop/electron apps/mobile/src apps/mobile/App.tsx scripts

$ echo $?
0
```

## Step 8 — GitHub Actions

`.github/workflows/ci.yml`: on `push` and `pull_request`, `ubuntu-latest`, Node
20 with `cache: npm`, then `npm ci`, `npm run typecheck`, `npm run lint`,
`npm test`, `npm run build -w @mission/desktop`. No secrets, and the desktop
build needs no `.env` — the store treats missing Supabase keys as local mode,
which is the same path a first-time user takes.

**It cannot be run here.** There is no GitHub remote and none was created, so
the workflow has never executed. What was checked locally: the file parses as
YAML, the five steps it runs are the five commands above, and every script it
names resolves at the root (`typecheck`, `lint`, `test` are root scripts; the
build is the workspace's own, invoked with `-w` exactly as the gate is).

```
$ node -e "yaml.load(...)"
parsed OK
[ "actions/checkout@v4", "actions/setup-node@v4", "npm ci",
  "npm run typecheck", "npm run lint", "npm test",
  "npm run build -w @mission/desktop" ]
```

## What a user would notice

1. Blocks can be created, edited and deleted on the phone. The app's largest
   stated limitation is gone.
2. There is a Pause button. Growth stops where it was, five minutes a session
   are free, and the time is added back to what you owe rather than forgiven.
   Leaving during a pause costs nothing. Twenty minutes and it is not a pause.
3. The Sunday nudge opens something: kept against planned, every tree, where the
   hours went, and next week's blocks — this week or last.
4. Clicking a reminder lands on the screen it was about.
5. Today's timeline updates itself. "Now" moves without needing something else
   to happen first.
6. Editing the mission on one device while it changes on the other no longer
   loses what you typed.
7. Seven keyboard shortcuts on the desktop, listed in Settings.
8. The tray menu can start the next block, pause, resume and give up without
   opening the window.
9. Nothing about the mechanic got easier. Pause is the only new way out and it
   is priced.

## Skipped, and why

Nothing from the nine steps was skipped. Phase 3 was left alone: insights, a
daily target, packaging and signed URLs are all untouched.

Two things were **not exercised by hand**, both stated plainly above: the mobile
screens (Expo was never started) and the tray menu (Electron was never
launched). No GUI was run at all.

No runtime dependency was added anywhere, and nothing was added to mobile. The
only new dependencies are the five root devDependencies ESLint needs. No version
of anything existing changed. `node_modules`, `apps/desktop/dist` and
`apps/desktop/dist-electron` were not touched by hand.

## Gates

All four green, run from the repo root, after everything above.

### `npm run typecheck`

```
> mission-reminder@0.1.0 typecheck
> tsc -b packages/core packages/data && npm run typecheck -w @mission/desktop -w @mission/mobile


> @mission/desktop@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json


> @mission/mobile@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json
```

### `npm run lint`

```
> mission-reminder@0.1.0 lint
> eslint packages/core/src packages/data/src apps/desktop/src apps/desktop/electron apps/mobile/src apps/mobile/App.tsx scripts
```

Silent, exit 0.

### `npm test`

**217 checks, zero failures** (136 before this phase). The 81 new ones are
listed under Steps 2, 3, 4 and 5; the 136 from Phase 1 all still pass unchanged
and are not reprinted here.

```
> mission-reminder@0.1.0 test
> npm run build:core && npm test -w @mission/core && npm test -w @mission/data && node scripts/make-icons.test.mjs

> @mission/core@0.1.0 test
> node test/rules.test.mjs && node test/pause.test.mjs && node test/review.test.mjs && node test/shortcuts.test.mjs && node test/media-themes.test.mjs

> @mission/data@0.1.0 test
> node test/heartbeat.test.mjs && node test/validate.test.mjs && node test/sync.test.mjs
```

### `npm run build -w @mission/desktop`

```
> @mission/desktop@0.1.0 build
> vite build

vite v5.4.21 building for production...
✓ 112 modules transformed.
dist/index.html                   0.40 kB │ gzip:   0.27 kB
dist/assets/index-5Ig_IH6d.css    7.61 kB │ gzip:   2.28 kB
dist/assets/index-qgWrAw7c.js   447.80 kB │ gzip: 130.06 kB
✓ built in 774ms
✓ 2 modules transformed.
dist-electron/main.js  5.59 kB │ gzip: 2.77 kB
✓ 1 modules transformed.
dist-electron/preload.js  1.03 kB │ gzip: 0.40 kB
```

### `git status` / `git log`

Clean, two commits, no amend, no squash, no rebase, no remote.

## Files

Created:

```
.github/workflows/ci.yml
eslint.config.mjs
apps/desktop/src/hooks.ts
apps/desktop/src/screens/Review.tsx
apps/mobile/src/hooks.ts
apps/mobile/src/screens/Blocks.tsx
apps/mobile/src/screens/Review.tsx
packages/core/src/drafts.ts
packages/core/src/review.ts
packages/core/src/shortcuts.ts
packages/core/test/pause.test.mjs
packages/core/test/review.test.mjs
packages/core/test/shortcuts.test.mjs
docs/PHASE2_REPORT.md
```

Modified:

```
.gitignore                                  (in the baseline commit)
README.md
package.json
package-lock.json
apps/desktop/electron/main.ts
apps/desktop/electron/preload.ts
apps/desktop/src/App.tsx
apps/desktop/src/store.tsx
apps/desktop/src/screens/Focus.tsx
apps/desktop/src/screens/MissionScreen.tsx
apps/desktop/src/screens/Settings.tsx
apps/desktop/src/screens/Today.tsx
apps/mobile/App.tsx
apps/mobile/src/notifications.ts
apps/mobile/src/store.tsx
apps/mobile/src/screens/Focus.tsx
apps/mobile/src/screens/Forest.tsx
apps/mobile/src/screens/MissionScreen.tsx
apps/mobile/src/screens/Today.tsx
packages/core/package.json
packages/core/src/index.ts
packages/core/src/nudge.ts
packages/core/src/schedule.ts
packages/core/src/session.ts
packages/core/src/types.ts
packages/data/schema.sql
packages/data/src/mappers.ts
packages/data/src/validate.ts
packages/data/test/sync.test.mjs
packages/data/test/validate.test.mjs
```

---

*Reviewed 2026-09-10. Four defects found and fixed after this report was
written; see `PHASE2_REVIEW.md`. The check count is now 219.*
