# Mission Reminder

Time blocking that is anchored to *why* you are doing it.

A tree grows for the length of a block you keep. Leave the app, walk away from
the machine, or quit early and it wilts. Finish and it joins your forest for
good. Every session opens with one of your own reasons, and every reminder
carries one too — so a nudge is never just "you are late", it is "you are late,
and here is what you said this was for."

---

## What is in here

```
packages/core     domain model + all the rules (growth, drift, pace, nudges)
packages/data     storage: local cache, Supabase sync, schema.sql
apps/desktop      Electron + React (Windows / macOS / Linux)
apps/mobile       Expo + React Native (iPhone)
```

Both apps import the same `@mission/core`. The tree geometry, the drift
penalties, the pace maths and the reminder rules exist in exactly one place, so
a session started on the laptop renders as the identical tree on the phone —
same species, same branches, same lean — and both apps agree on whether you are
behind.

## Running it

```bash
npm install
npm test            # 217 behaviour checks over the rules and the storage, no framework
npm run typecheck   # both apps and both packages
npm run lint        # eslint, flat config, no stylistic rules
npm run desktop     # builds the shared packages, then opens the Electron app
npm run mobile      # starts Expo; scan the QR code with your iPhone
```

The same four commands run on every push through
`.github/workflows/ci.yml`, on Node 20.

Or skip remembering any of that. `start.ps1` (Windows), `start.sh` (macOS and
Linux) and `start.cmd` (double-clickable) check Node, install what is missing,
build the shared packages and launch — `./start.sh`, `./start.sh mobile`,
`./start.sh test`, `./start.sh typecheck`, `./start.sh build`. `npm start` is
the same as `npm run desktop`.

Node 20+. Everything works with no account and no internet — data sits on the
device until you turn sync on.

### On your iPhone

`npm run mobile` and scan the QR code with the Camera app. For everyday use you
want it on the home screen with its own icon and working background
notifications, which means a real build:

```bash
npx eas build --profile development --platform ios   # needs the $99/yr account
```

Expo Go is fine for trying it; local notifications fire from Expo Go too, they
just arrive branded as Expo.

## Turning on sync

1. Create a project at supabase.com (the free tier is plenty).
2. Paste `packages/data/schema.sql` into the SQL editor and run it. It creates
   four tables, locks every one to the owning user with row level security, and
   turns on realtime. It is safe to re-run on an existing database — that is
   how you pick up new columns such as the delete tombstones.
3. Put your keys in place:

   ```
   # apps/desktop/.env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...

   # apps/mobile/.env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

4. Restart both, then Settings → create an account on one and sign in with it on
   the other.

Writes land locally first and are **queued** — not fired and forgotten — so the
UI never waits on the network and an edit made on a train is still an edit when
you land. The queue is replayed in order on reconnect, and the server is only
treated as authoritative for rows the queue is not still holding a newer version
of. Deletes are soft: removing a goal stamps a tombstone rather than dropping
the row, which is what stops the other device's cache from putting it straight
back. When both devices are online, a change on one shows up on the other in
about a second.

Settings → Your data will export the whole state as JSON and import it back,
with the file structurally checked and the counts shown before anything is
replaced.

## How the mechanic works

**Growth is time served.** It cannot be lost. Fifty minutes planned, twenty-five
minutes in, the tree is at 50% — and it stays at 50% even if you then quit.

**Health is the part you can lose.** It starts at 100%. Glances under 12 seconds
are free. Past that the cost climbs with how long you were gone — about 10% for
a brief detour, 50%+ for a couple of minutes elsewhere, and all of it at around
four and a half. There is no cap: one long absence can kill a tree, and it is
charged while you are away rather than politely waiting for you to come back,
so you can return to find it already gone. At zero the tree dies and the
session ends itself.

**Time the app did not see is not time served.** Growth used to be read
straight off the wall clock, so quitting mid-block and reopening the next day
completed the tree at 100%. Now the app leaves a mark every fifteen seconds
while a session runs. On the next launch, everything between the last mark and
now is *lost time*: it does not count toward growth, it is charged as one long
lapse, and if the block's window ran out while nobody was looking, the session
is withered rather than completed. A laptop that sleeps at minute 45 of 50
loses that block. That is the price of the loophole being closed.

**Pause is honest, not free.** Stop the clock and growth freezes exactly where
it was; the paused seconds are added to what you owe, so the finish line moves
rather than the block getting shorter. Five minutes of pause per session cost
nothing — the app is not trying to stop you answering the door. Past that, the
excess is charged like any other absence and can kill the tree, and a single
pause longer than twenty minutes is not a pause: the session ends withered at
the growth it had when you stopped. While it is paused you can leave, close
the app, walk off; none of it is charged. That is the whole point of the
button.

The first 60% of a block grows wood; the last 40% fills the canopy. That is
deliberate. The stretch you are most likely to bail on is the stretch that
visibly pays.

What counts as drifting away:

| | desktop | iPhone |
|---|---|---|
| left the app | window loses focus | app backgrounded |
| walked off | machine idle > 150s | screen kept awake, so backgrounding covers it |
| closed the app | lost time, charged as one lapse on the next launch | same |
| quit early | −35% health, growth kept | same |
| paused | free, up to 5 min a session | same |

A withered tree still goes in the forest. A record with no gaps in it would be a
worse mirror.

When a session ends — finished, killed, or withered while you were away — you
get a screen with the final tree, the numbers, and one line for what you
actually got done. That line lives on the session and shows up again in the
Forest.

## Photos, videos and links

Words go stale faster than pictures do. Three places take media:

- **Vision board** on the Mission screen. Photos from disk or the camera roll,
  a video that gets you moving, a link to the thing you are aiming at. It shows
  on Today and in the moment before a session starts.
- **One picture per reason.** Give a *why* an image and the image travels with
  it -- into the session screen and into the vision moment.
- **What a goal looks like done.** Optional, shows on the goal card.

Paste a YouTube or Vimeo URL and it is resolved to a video with a real
thumbnail -- no API key, no embed script. Any image URL becomes a picture.
Anything else is kept as a labelled link.

**The vision moment.** By default, starting a block gives you a few seconds of
your mission, one of your reasons, and a picture, before the timer appears.
Click or tap to skip it; turn it off in Settings.

Where the files live:

| | no account | signed in |
|---|---|---|
| desktop photo | copied into the app's own folder, served over a private `mission-media://` scheme | uploaded, appears on the phone |
| phone photo | copied out of the OS cache into app storage | uploaded, appears on the desktop |
| pasted link | stored as a URL | stored as a URL |

Links always sync because they are just text. Photos only cross devices once
you are signed in -- there is nowhere to put them otherwise.

## Themes

Seven, and the theme recolours the *forest*, not just the interface — each one
shifts the canopy hue, the bark and the blossoms, so the choice actually
changes what you look at for fifty minutes.

| | | |
|---|---|---|
| **Forest** | dark | deep green, low light — the original |
| **Ink** | dark | near-black and violet, cyan-blue foliage |
| **Dusk** | dark | plum and coral, magenta canopy |
| **Ember** | dark | warm charcoal, the forest turns autumn |
| **Paper** | light | warm white, one orange accent |
| **Sea** | light | cool daylight and teal |
| **Bloom** | light | pale lilac and pink, every tree flowers |

Settings → Look. The choice follows your account, so both devices match.

## How it tells you to get back on track

`computeNudges()` in `packages/core/src/nudge.ts` is the whole reminder brain —
one pure function, given your state and a clock, returning what is worth saying
right now:

- a block starting in five minutes
- a block whose start time plus grace period has passed with nothing to show
- an evening with nothing planted
- a goal untouched for four days
- a goal behind its own pace, or past its date
- Sunday evening, time to look back

Each carries a reason pulled from your mission, rotating so no single line goes
numb from repetition. A running session silences all of them.

The desktop checks every minute and fires system notifications, flashing the
taskbar for urgent ones. The phone hands iOS a real schedule in advance, so
block reminders fire whether or not the app is open. Nudge ids are stable per
day, so each one fires exactly once. Every reminder knows which screen it is
about, so clicking one lands you there rather than on whatever was last open.

## The week in review

The Sunday nudge now opens something. **Review** is a tab on the desktop and a
card on Today (Sundays) or a button on Forest on the phone, with a *this week /
last week* toggle. It shows how many of the week's blocks you kept against how
many you planned, every tree you grew alive or withered, which goals the hours
actually went into, the streak, and the blocks waiting for you next week.

A block counts as *planned* once the day has arrived — a Thursday block is not
missed on Wednesday — and as *kept* when a session started inside its window
(five minutes early through to the end of the grace period plus the block) and
finished. The week runs local Monday to Sunday, and a session belongs to the
week it ended in.

## Keyboard, and the tray

On the desktop:

| Keys | Action |
|---|---|
| `Ctrl/Cmd+1` … `Ctrl/Cmd+7` | Today, Mission, Goals, Blocks, Forest, Review, Settings |
| `Ctrl/Cmd+Enter` | Start the next block today |
| `Ctrl/Cmd+P` | Pause or resume the running session |
| `Ctrl/Cmd+Shift+G` | Give up the running session |
| `Escape` | Close the session-end screen |

All of them are ignored while the caret is in a text box, Escape included.
Settings lists them too.

The tray menu carries the same three things without opening the window: the
next block by name and time, Pause or Resume while a session runs, and Give up
— which still asks, in the window, before it kills anything.

## How "how far am I" is measured

Two independent readings, because they fail differently:

- **Milestone progress** — weighted completion. A milestone worth 3 moves the
  ring three times as far as one worth 1.
- **Pace** — where you *should* be, from your start and target dates. Being 40%
  done is good news in month one and bad news in the final week, and the pill on
  each goal card says which: `ahead`, `on track`, `behind`, `at risk`.

Optionally a third: set estimated hours on a goal and focused minutes get banked
against it, so you can see effort and completion diverge.

## Known limits

- **Sync is last-write-wins per row.** Right for one person on two devices. If
  you edit the same goal on both while offline, the later write wins and the
  other is lost. Tombstones are never purged; at this scale that costs nothing.
- **The photo bucket is public-read with random per-user paths.** Writes are
  locked to you by policy, but anyone handed an exact image URL can view that
  one file. The alternative, signed URLs, expire and would make every picture in
  the app resolve asynchronously before it could be drawn. Fine for a vision
  board; not the place for anything you would not put in a shared album.
- **The iPhone timer needs the app in the foreground.** iOS does not grant
  background execution for this, which is also why Forest works the way it does.
  The screen is kept awake during a session, and time spent backgrounded is
  lost time rather than growth.
- **Expo SDK pins may need aligning** to whatever is current — run
  `npm run fix -w @mission/mobile` if the bundler complains.

## Verified

`npm test` — 217 checks, all passing:

- pause: growth frozen while stopped, the paused seconds owed back as lost
  time, one budget shared across a session, the excess charged like any other
  absence, a twenty-minute pause ending the session at the frozen growth, and
  a paused session the app was quit on keeping that growth
- the weekly review: Monday-to-Sunday boundaries, last week, kept against
  planned on a Mon-Fri fixture, minutes per goal, and the Sunday/Monday seam
- the keyboard map: the modifier per platform, nothing firing while typing,
  and which block "start next" means
- deterministic tree geometry, progressive reveal, canopy timing
- drift penalties and death, partial growth on quitting
- progressive drift: one absence stays one lapse and is charged only once
- reconciliation: growth freezes at the last heartbeat, lost time is monotonic,
  a block the app did not watch to the end is withered, a short gap is a no-op
- weighted milestones, pace maths, day-of-week filtering, missed-block detection
- nudge stability, local-day ids, and streak counting
- the sync rules against an in-memory fake of the Supabase client: an offline
  edit survives reconnect, a delete on one device is not resurrected by the
  other, the queue coalesces and survives a failed flush, first sign-in adopts
  exactly once
- the heartbeat's write / read / clear round trip
- import validation: a seeded state in, a mangled one refused with a reason
- the generated PNG icon: signature, header, and pixels that inflate back out
- YouTube / Vimeo / image / local-file / plain-link classification, link labels
- every theme: unique ids, complete palettes, a distinct canopy, a brown death
  colour, legal hsl ranges, and bark that stays visible on the light ones

Both apps typecheck clean and `npm run lint` is silent. The desktop app builds.
The same four gates run in GitHub Actions on every push.
