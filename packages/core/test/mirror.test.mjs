// Behaviour tests for the runtime mirror -- the read-only picture of "right
// now" that Dexter reads so it does not nag over a block that is already
// running (GUARDIAN_PLAN.md MR1).
// Plain Node, no framework: run `npm test` from the repo root after a build.
import { buildRuntimeMirror } from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

// A Wednesday, so the weekday blocks below are all in play, and late enough in
// the morning that one block is done, one is running and one is still to come.
const at = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 8, 9, h, m, 0, 0); // 2026-09-09 is a Wednesday
};

const block = (id, title, startMinute, durationMinutes = 50) => ({
  id, title, startMinute, durationMinutes,
  days: [1, 2, 3, 4, 5], active: true, graceMinutes: 10,
});

// Sessions are written out here rather than built with `startSession`, which
// stamps the real clock: these tests are about a fixed Wednesday.
const session = (id, title, from, extra = {}) => ({
  id, title, blockId: undefined, plannedMinutes: 50,
  startedAt: from.toISOString(), status: 'running',
  growth: 0, health: 1, drifts: [], species: 1, seed: 1,
  ...extra,
});
const running = (blockId, title, from, extra = {}) =>
  session(`ses_${blockId}`, title, from, { blockId, ...extra });
const kept = (blockId, title, from, to) =>
  running(blockId, title, from, { status: 'completed', endedAt: to.toISOString(), growth: 1 });

const baseState = () => ({
  mission: {
    id: 'mis', statement: 'Build one thing that outlives the day.', updatedAt: at('06:00').toISOString(),
    media: [],
    whys: [
      { id: 'w1', text: 'Because busy is not the same as built.' },
      { id: 'w2', text: 'Because they deserve the version of me that finishes.' },
    ],
  },
  goals: [],
  blocks: [
    block('early', 'Deep work', 6 * 60 + 30),
    block('mid', 'Writing', 10 * 60),
    block('late', 'Review', 17 * 60),
  ],
  sessions: [],
  settings: { themeId: 'forest', showVisionOnStart: true },
});

// --- the mission travels whole ---------------------------------------------
{
  const m = buildRuntimeMirror(baseState(), at('09:00'));
  ok('the statement is mirrored', m.mission.statement === 'Build one thing that outlives the day.');
  ok('the reasons come through as plain text, in order',
     JSON.stringify(m.mission.whys) ===
       JSON.stringify(['Because busy is not the same as built.',
                       'Because they deserve the version of me that finishes.']));
  ok('updated_at is the clock it was given', m.updated_at === at('09:00').toISOString());
}

// --- today's blocks and their status ---------------------------------------
{
  const m = buildRuntimeMirror(baseState(), at('09:00'));
  ok('every block due today is listed, in start order',
     m.today_blocks.map((b) => b.id).join(',') === 'early,mid,late',
     m.today_blocks.map((b) => b.id).join(','));
  ok('start and end are ISO instants, not wall-clock strings',
     m.today_blocks[0].start === at('06:30').toISOString() &&
     m.today_blocks[0].end === at('07:20').toISOString(),
     `${m.today_blocks[0].start} .. ${m.today_blocks[0].end}`);
  ok('a block whose grace ran out with nothing to show reads missed, all day',
     m.today_blocks[0].status === 'missed', m.today_blocks[0].status);
  ok('a block still ahead is upcoming', m.today_blocks[2].status === 'upcoming');
}

// A Saturday: the weekday blocks are simply not today's problem.
{
  const saturday = new Date(2026, 8, 12, 9, 0, 0, 0);
  const m = buildRuntimeMirror(baseState(), saturday);
  ok('a day with no blocks mirrors an empty list', m.today_blocks.length === 0);
  ok('and nothing is claimed to be running', m.session === null);
}

// --- honoured, missed, running ----------------------------------------------
{
  const state = baseState();
  state.sessions = [kept('early', 'Deep work', at('06:31'), at('07:21'))];
  const m = buildRuntimeMirror(state, at('10:30'));
  const byId = Object.fromEntries(m.today_blocks.map((b) => [b.id, b.status]));
  ok('a block that was kept reads done', byId.early === 'done', byId.early);
  ok('a block whose grace has passed with nothing to show reads missed',
     byId.mid === 'missed', byId.mid);
  ok('and one still ahead reads upcoming', byId.late === 'upcoming', byId.late);
}

{
  const state = baseState();
  const live = running('mid', 'Writing', at('10:01'));
  state.sessions = [live];
  const m = buildRuntimeMirror(state, at('10:20'));
  ok('the running block reads running',
     m.today_blocks.find((b) => b.id === 'mid').status === 'running');
  ok('the session block is filled in', m.session !== null);
  ok('with the block it belongs to', m.session.block_id === 'mid', String(m.session?.block_id));
  ok('its name', m.session.name === 'Writing');
  ok('when it started', m.session.started_at === live.startedAt);
  ok('and it is not paused', m.session.paused === false);
}

{
  const state = baseState();
  state.sessions = [running('mid', 'Writing', at('10:01'), { pausedAt: at('10:10').toISOString() })];
  const m = buildRuntimeMirror(state, at('10:12'));
  ok('a paused session says so', m.session.paused === true);
  ok('and is still the running block', m.session.block_id === 'mid');
}

// A session with no block behind it -- "just work for 25 minutes".
{
  const state = baseState();
  state.sessions = [session('ses_free', 'Inbox', at('14:00'), { plannedMinutes: 25 })];
  const m = buildRuntimeMirror(state, at('14:05'));
  ok('a free session mirrors with a null block id', m.session.block_id === null);
  ok('and keeps its own name', m.session.name === 'Inbox');
}

// --- next_nudge -------------------------------------------------------------
{
  // 08:00, and the 06:30 block was skipped: the app has something to say now.
  const m = buildRuntimeMirror(baseState(), at('08:00'));
  ok('a nudge that is due right now is dated now', m.next_nudge.at === at('08:00').toISOString(),
     String(m.next_nudge?.at));
  ok('and carries its kind', m.next_nudge.kind === 'block-missed', String(m.next_nudge?.kind));
  ok('and something a person can read',
     m.next_nudge.text === 'You said 06:30 — Deep work', String(m.next_nudge?.text));
}

{
  // Nothing due, but the day is not over: say what is coming rather than going
  // silent. At 09:00 the missed 06:30 block has aged out of the nudge window.
  const m = buildRuntimeMirror(baseState(), at('09:00'));
  ok('a quiet moment still points at the next block', m.next_nudge.kind === 'block-soon',
     String(m.next_nudge?.kind));
  ok('dated five minutes before it starts', m.next_nudge.at === at('09:55').toISOString(),
     String(m.next_nudge?.at));
}

{
  // While a session runs the app says nothing -- so the field must show what is
  // *coming*, five minutes before it starts, rather than going empty.
  const state = baseState();
  state.sessions = [running('early', 'Deep work', at('06:31'))];
  const m = buildRuntimeMirror(state, at('06:45'));
  ok('a running session silences the due nudges', m.next_nudge.kind === 'block-soon',
     String(m.next_nudge?.kind));
  ok('and the next block is announced five minutes early',
     m.next_nudge.at === at('09:55').toISOString(), String(m.next_nudge?.at));
  ok('naming the block and its time', m.next_nudge.text === 'Writing at 10:00',
     String(m.next_nudge?.text));
}

{
  // Nothing left in the day and nothing overdue: the honest answer is nothing.
  const state = baseState();
  state.sessions = [
    kept('early', 'Deep work', at('06:31'), at('07:21')),
    kept('mid', 'Writing', at('10:01'), at('10:51')),
    kept('late', 'Review', at('17:01'), at('17:51')),
  ];
  const m = buildRuntimeMirror(state, at('18:30'));
  ok('a day fully kept has nothing left to say', m.next_nudge === null,
     JSON.stringify(m.next_nudge));
  ok('and every block reads done',
     m.today_blocks.every((b) => b.status === 'done'),
     m.today_blocks.map((b) => `${b.id}:${b.status}`).join(' '));
}

// --- the shape itself -------------------------------------------------------
{
  const m = buildRuntimeMirror(baseState(), at('09:00'));
  ok('the payload survives a JSON round trip unchanged',
     JSON.stringify(JSON.parse(JSON.stringify(m))) === JSON.stringify(m));
  ok('and has exactly the agreed top-level keys',
     Object.keys(m).sort().join(',') ===
       'mission,next_nudge,session,today_blocks,updated_at',
     Object.keys(m).sort().join(','));
  ok('a block row has exactly the agreed keys',
     Object.keys(m.today_blocks[0]).sort().join(',') === 'end,id,name,start,status',
     Object.keys(m.today_blocks[0]).sort().join(','));
}

// The caller may already have the running session to hand; passing it must not
// change the answer.
{
  const state = baseState();
  const live = running('mid', 'Writing', at('10:01'));
  state.sessions = [live];
  const a = buildRuntimeMirror(state, at('10:20'));
  const b = buildRuntimeMirror(state, at('10:20'), { activeSession: live });
  ok('an explicit activeSession matches the one found in state',
     JSON.stringify(a) === JSON.stringify(b));
}
