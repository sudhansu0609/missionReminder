# Phase 2 review

Reviewer: Claude Fable 5.1, 2026-09-10. Subject: the Phase 2 implementation
described in `PHASE2_REPORT.md`, written by an Opus agent against
`PHASE2_PLAN.md`. Commit `912c522` on `main`.

## Verdict

Accepted with fixes. The implementation followed the work order step by step,
kept the rules in core with tests, and its four gates were green on an
independent re-run. Reading the code found four defects, one of them caused
by the plan itself. All four are fixed, each with a regression check, and the
gates are green again.

| Gate | Before review | After review |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run lint` | clean | clean |
| `npm test` | 217 pass, 0 fail | 219 pass, 0 fail |
| `npm run build -w @mission/desktop` | builds | builds |

## Findings and fixes

### 1. Pausing on the phone and locking it killed the tree (plan defect)

The plan told the implementer that, for a paused session, "the heartbeat gap
rule applies only to the time after the last heartbeat", and the code did
exactly that. On the phone, backgrounding the app freezes JavaScript and stops
the heartbeat, so a four-minute pause with the screen locked came back as a
four-minute *lapse* and withered the tree. The README promised the opposite:
"while it is paused you can leave, close the app, walk off; none of it is
charged."

The gap rule exists so that unwatched time cannot become growth. A stopped
clock cannot grow whether the app is watching or not, so there is nothing for
a heartbeat to prove during a pause.

Fix (`packages/core/src/session.ts`): `reconcileSession` leaves a paused
session alone, except to enforce the cap: a pause already past
`MAX_PAUSE_SECONDS` ends the session on launch as it would on a resume. The
whole stretch is settled once, by `resumeSession`, under the budget. The
two-stretch splitting logic and the "move the marker to now" trick are gone.
Tests: "reconcile leaves a paused session alone", "resuming after the quit
charges the whole stretch as one pause", "a paused session backgrounded on the
phone is not charged as a lapse".

### 2. Resuming from the tray charged the whole pause as an absence

Desktop `Focus` opens an away episode on window blur and charges it from
`since` on focus. Blur during a pause opened an episode that the charge loop
correctly ignored, but a tray "Resume" clears the pause before the window's
focus event lands, so the next `charge()` ran unpaused and billed every second
since the blur.

Fix (`apps/desktop/src/screens/Focus.tsx`): when `pausedAt` clears and an
episode is open, the episode restarts at that moment. Cannot be unit-tested
without a DOM; verified by reading the event order in `main.ts`
(`showWindow()` then `webContents.send`).

### 3. The weekly review counted this morning's block as missed at breakfast

`weekReview` treated a day as reached at local midnight, so a 09:00 block
showed "0 of 1 kept, 1 went by without a tree" from the moment the day began.
The README said a block counts as planned "once the day has arrived", which
was the same mistake in prose.

Fix (`packages/core/src/review.ts`): an instance is planned once its start
plus grace has passed, the same line `missedBlocksToday` draws. README
corrected. Test: "a block later today is not planned yet".

### 4. The tray label went stale

The tray's "Start next block" line was recomputed only when blocks or
sessions changed. At 09:51 it still offered the 09:00 block; clicking it ran
`blockToStartNow` against the real clock and started something else.

Fix (`apps/desktop/src/store.tsx`): the memo also depends on the shared minute
ticker, so the label follows the clock.

### Also tidied

`endSession` now clears `pausedAt`, so a session given up while paused does
not carry a stopped-clock marker into the forest and onto the server. The
manual clearing in `resumeSession`'s cap path is gone with it. Test: "the
marker does not outlive the session".

## Things checked and left alone

- Pause budget maths: cumulative across pauses, the excess charged through
  `driftPenalty`, the cap path reading frozen growth. Correct.
- `tick` as a no-op while paused; both stores skip the write but keep the
  heartbeat. Correct.
- Store `updateDrift` guards and the mobile `cameBack` guard while paused.
- Shortcut mapper: modifier per platform, both modifiers held means hands
  off, nothing fires while editing, `select` counted as editing.
- Mission draft re-seed: own save coming back is recognised by content, not
  by stamp; dirty drafts get the reload affordance.
- `useMinute` as a shared subscriber set over one interval, on both apps.
- Mobile Blocks screen: parity with desktop, `Alert.alert` for delete,
  numeric hour/minute entry clamped, save disabled with no title or days.
- Data: `paused_at` column with the idempotent `alter table`, nullable both
  ways in the mappers, validator refuses a non-string marker.
- ESLint config and CI workflow: every script the workflow calls exists at
  the root; `exhaustive-deps` off is documented and deliberate.

## Known follow-ups (not blocking)

- The pause cap is mostly redundant. Past the 300 s budget the excess is
  charged at the ordinary lapse rate, which empties full health after about
  four more minutes, so a tree is dead well before the 20-minute cap. The cap
  still matters as the "ends on launch" rule and for the health it leaves
  behind (0.65 rather than 0). Worth a simpler story in Phase 3.
- Mobile notification taps are read through
  `addNotificationResponseReceivedListener` only. A cold start from a tapped
  notification should also consult the last response, or the tap may land on
  Today.
- A block deactivated mid-week loses its earlier planned instances in the
  review. Cosmetic.
- `main.ts` has its own `formatMinute` rather than importing core's
  `formatMinuteOfDay`. Harmless duplication.
- Neither the Expo screens nor the tray menu were exercised by hand in this
  environment; the implementer said the same. First manual pass should cover:
  add, edit and delete a block on the phone; pause, lock the phone for four
  minutes, resume; tray Resume with the window blurred.
