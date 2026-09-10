// Behaviour tests for the growth, drift, pace and nudge rules.
// Plain Node, no framework: run `npm test` from the repo root after a build.
import {
  buildTree, stageOf, speciesTraits, startSession, tick, applyDrift, endSession,
  growthAt, driftPenalty, seedState, computeNudges, goalPace, milestoneProgress,
  blocksForDay, missedBlocksToday, streakDays, forestSummary, moodOf,
  updateDrift, reconcileSession, elapsedSeconds, remainingSeconds, dayKey,
} from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

// --- tree geometry -------------------------------------------------------
const t = buildTree(7, 1234);
const t2 = buildTree(7, 1234);
ok('tree is deterministic', JSON.stringify(t) === JSON.stringify(t2));
ok('tree has structure', t.segments.length > 30 && t.leaves.length > 20,
   `${t.segments.length} segments, ${t.leaves.length} leaves`);
const shown = (g) => t.segments.filter((s) => g > s.appearAt).length;
ok('growth reveals progressively',
   shown(0.05) < shown(0.2) && shown(0.2) < shown(0.4) && shown(0.4) < shown(0.6),
   `${shown(0.05)} -> ${shown(0.2)} -> ${shown(0.4)} -> ${shown(0.6)}`);
const leavesAt = (g) => t.leaves.filter((l) => g > l.appearAt).length;
ok('canopy fills over the final stretch',
   leavesAt(0.6) < leavesAt(0.8) && leavesAt(0.8) < leavesAt(1.0) &&
   leavesAt(1.0) === t.leaves.length,
   `${leavesAt(0.6)} -> ${leavesAt(0.8)} -> ${leavesAt(1.0)}`);
ok('all segments visible at full growth', shown(1) === t.segments.length);
ok('species differ', speciesTraits(3).name !== speciesTraits(7).name ||
   speciesTraits(3).hue !== speciesTraits(7).hue);
ok('stages advance', stageOf(0).name === 'seed' && stageOf(0.5).name === 'young' &&
   stageOf(1).name === 'ancient');

// --- session -------------------------------------------------------------
const t0 = new Date('2026-09-07T09:00:00Z');
const half = new Date('2026-09-07T09:25:00Z');
const done = new Date('2026-09-07T09:50:00Z');
let s = startSession({ title: 'Deep work', plannedMinutes: 50 });
s.startedAt = t0.toISOString();

ok('growth is time served', Math.abs(growthAt(s, half) - 0.5) < 0.001,
   growthAt(s, half).toFixed(3));
ok('short glance is free', driftPenalty(8) === 0);
ok('long absence costs', driftPenalty(120) > 0.35, driftPenalty(120).toFixed(2));

const drifted = applyDrift(s, 90, 'left-app', half);
ok('drift lowers health', drifted.health < 1 && drifted.health > 0, drifted.health.toFixed(2));
ok('drift is recorded', drifted.drifts.length === 1);
ok('drift does not undo growth', drifted.growth >= 0.49);

let dying = s;
for (let i = 0; i < 6; i++) dying = applyDrift(dying, 180, 'left-app', half);
ok('enough drift kills the tree', dying.status === 'abandoned' && dying.health === 0);

const finished = tick({ ...s }, done);
ok('timer completes the session', finished.status === 'completed' && finished.growth === 1);
const quit = endSession({ ...s, growth: growthAt(s, half) }, 'abandoned', half);
ok('giving up keeps partial growth', quit.growth > 0.49 && quit.health < 1,
   `growth ${quit.growth.toFixed(2)} health ${quit.health.toFixed(2)}`);
ok('mood tracks health', moodOf({ ...s, health: 0.2 }) === 'worried' &&
   moodOf({ ...s, health: 1 }) === 'thriving');

// --- progressive drift ---------------------------------------------------
let episode = s;
for (const total of [30, 60, 90]) episode = updateDrift(episode, 'd1', total, 'left-app', half);
const oneShot = applyDrift(s, 90, 'left-app', half);
ok('progressive drift charges only the delta',
   Math.abs(episode.health - oneShot.health) < 1e-9,
   `${episode.health.toFixed(4)} vs ${oneShot.health.toFixed(4)}`);
ok('one absence is one lapse',
   episode.drifts.length === 1 && episode.drifts[0].seconds === 90);
ok('a glance inside the grace records nothing',
   updateDrift(s, 'd2', 8, 'left-app', half).drifts.length === 0);
ok('five minutes away kills the tree',
   updateDrift(s, 'd3', 300, 'left-app', half).status === 'abandoned',
   `penalty ${driftPenalty(300).toFixed(2)}`);
ok('a penalty is never more than a whole tree', driftPenalty(60 * 60) === 1);

// --- reconciling a session the app stopped watching ----------------------
const seen = new Date('2026-09-07T09:10:00Z');   // heartbeat 10 min in
const backLater = new Date('2026-09-07T09:20:00Z');
const backTooLate = new Date('2026-09-07T10:30:00Z');

ok('reconcile is a no-op inside the grace',
   reconcileSession(s, new Date('2026-09-07T09:24:45Z').toISOString(), half) === s);
ok('reconcile with no heartbeat measures from the start',
   reconcileSession(s, null, backLater).lostSeconds > 1190);

const woken = reconcileSession(s, seen.toISOString(), backLater);
ok('reconcile freezes growth at the last heartbeat',
   Math.abs(growthAt(woken, backLater) - 0.2) < 0.001,
   growthAt(woken, backLater).toFixed(3));
ok('reconcile banks the gap as lost time', Math.abs(woken.lostSeconds - 600) < 0.001);
ok('reconcile charges the gap as one lapse',
   woken.drifts.length === 1 && woken.health < 1);
ok('growth never rises through a reconcile',
   growthAt(woken, backLater) <= growthAt(s, backLater) + 1e-9);
ok('time served ignores lost time',
   Math.abs(elapsedSeconds(woken, backLater) - 600) < 0.001);

const missedIt = reconcileSession({ ...s, health: 1 }, seen.toISOString(), backTooLate);
ok('reconcile abandons a session the app did not watch to the end',
   missedIt.status === 'abandoned', `growth ${missedIt.growth.toFixed(2)}`);
ok('an unwatched session keeps only the growth it earned',
   missedIt.growth > 0.19 && missedIt.growth < 0.21, missedIt.growth.toFixed(3));
ok('lost time is monotonic',
   reconcileSession(woken, seen.toISOString(), backTooLate).lostSeconds >= woken.lostSeconds);
ok('reconcile leaves a finished session alone',
   reconcileSession(quit, seen.toISOString(), backTooLate) === quit);
ok('an absence already charged is not billed twice', (() => {
  const away = 600;
  const charged = updateDrift(s, 'ep', away, 'left-app', backLater);
  const both = reconcileSession(charged, seen.toISOString(), backLater, 'ep');
  return both.drifts.length === 1 && Math.abs(both.health - charged.health) < 1e-9;
})());

// The finish line is planned length plus time lost *before* the gap. A short
// gap that carries the clock past it withers the block; the same gap earlier
// in the block does not.
const overrun = reconcileSession(s, '2026-09-07T09:48:00Z', new Date('2026-09-07T09:51:00Z'));
ok('a short gap that crosses the finish line withers the block',
   overrun.status === 'abandoned' && overrun.growth > 0.95 && overrun.growth < 0.97,
   `${overrun.status} at ${overrun.growth.toFixed(3)}`);
const midGap = reconcileSession(s, '2026-09-07T09:20:00Z', new Date('2026-09-07T09:23:00Z'));
ok('the same gap mid-block leaves it running with the time still owed',
   midGap.status === 'running' && Math.abs(midGap.lostSeconds - 180) < 0.001 &&
   Math.abs(remainingSeconds(midGap, new Date('2026-09-07T09:23:00Z')) - 30 * 60) < 0.001);

// --- goals ---------------------------------------------------------------
const state = seedState();
const goal = state.goals[0];
ok('weighted milestones', Math.abs(milestoneProgress(goal) - 1 / 8) < 0.001,
   milestoneProgress(goal).toFixed(3));

goal.startDate = '2026-09-01';
goal.targetDate = '2026-09-11';
const pace = goalPace(goal, '2026-09-07');
ok('pace knows you are behind', pace.pace === 'behind' || pace.pace === 'at-risk',
   `${pace.pace} — ${pace.message}`);
ok('expected progress from dates', Math.abs(pace.expected - 0.6) < 0.001, pace.expected.toFixed(2));

// --- schedule + nudges ---------------------------------------------------
const monday = new Date('2026-09-07T07:30:00');
// Monday carries both seeded blocks; Tuesday carries only the morning one.
ok('weekday blocks appear', blocksForDay(state.blocks, monday).length === 2,
   String(blocksForDay(state.blocks, monday).length));
ok('day filtering works',
   blocksForDay(state.blocks, new Date('2026-09-08T07:30:00')).length === 1);
ok('weekend is clear',
   blocksForDay(state.blocks, new Date('2026-09-12T07:30:00')).length === 0);
ok('a passed block is flagged missed',
   missedBlocksToday(state.blocks, [], monday).length === 1);

// Local calendar day, not UTC: late in the evening the two disagree.
const lateEvening = new Date('2026-09-07T23:30:00');
ok('nudge ids use the local day',
   computeNudges(state, lateEvening).every((n) => n.id.endsWith(dayKey(lateEvening))),
   dayKey(lateEvening));
ok('a nudge pace matches the goal card', (() => {
  const g = { ...goal, targetDate: '2026-09-11', startDate: '2026-09-01' };
  const behind = computeNudges({ ...state, goals: [g] }, lateEvening)
    .find((n) => n.kind === 'goal-behind');
  return behind?.body === goalPace(g, dayKey(lateEvening)).message;
})());

const nudges = computeNudges(state, monday);
ok('missed block produces a high-urgency nudge',
   nudges.some((n) => n.kind === 'block-missed' && n.urgency === 'high'));
ok('nudges carry a reason from the mission', nudges.every((n) =>
   n.kind === 'weekly-review' || typeof n.why === 'string'));
ok('nudge ids are stable per day',
   JSON.stringify(computeNudges(state, monday).map((n) => n.id)) ===
   JSON.stringify(nudges.map((n) => n.id)));
ok('a running session silences everything',
   computeNudges(state, monday, { activeSession: s }).length === 0);

// --- streak / forest -----------------------------------------------------
const mk = (day, status) => ({
  ...startSession({ title: 'x', plannedMinutes: 50 }),
  startedAt: `2026-09-${day}T09:00:00`, status, growth: 1, health: 1,
});
const hist = [mk('05', 'completed'), mk('06', 'completed'), mk('07', 'completed'),
              mk('03', 'abandoned')];
ok('streak counts back from today', streakDays(hist, new Date('2026-09-07T20:00:00')) === 3,
   String(streakDays(hist, new Date('2026-09-07T20:00:00'))));
const fs = forestSummary(hist);
ok('forest summary', fs.alive === 3 && fs.withered === 1, JSON.stringify(fs));

console.log('\nSample nudges:');
for (const n of nudges.slice(0, 3)) console.log(` - [${n.urgency}] ${n.title} :: ${n.body}`);
