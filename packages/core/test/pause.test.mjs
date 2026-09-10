// Pause: what it freezes, what it costs, and where it stops being a pause.
// Plain Node, no framework: run `npm test` from the repo root after a build.
import {
  startSession, pauseSession, resumeSession, tick, growthAt, driftPenalty,
  reconcileSession, moodOf, pauseBudgetLeft, pauseSecondsUsed,
  PAUSE_BUDGET_SECONDS, MAX_PAUSE_SECONDS,
} from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const at = (hhmm) => new Date(`2026-09-07T${hhmm}:00`);
const fresh = () => {
  const s = startSession({ title: 'Deep work', plannedMinutes: 50 });
  return { ...s, startedAt: at('09:00').toISOString(), lostSeconds: 0 };
};

// --- growth freezes --------------------------------------------------------
const paused = pauseSession(fresh(), at('09:10'));
ok('pausing stamps the moment the clock stopped', Boolean(paused.pausedAt));
ok('growth is frozen while paused',
   close(growthAt(paused, at('09:10')), 0.2) && close(growthAt(paused, at('09:40')), 0.2),
   growthAt(paused, at('09:40')).toFixed(3));
ok('a paused session is watching, not drifting', moodOf(paused, at('09:40')) === 'watching');
ok('pausing twice changes nothing',
   pauseSession(paused, at('09:20')) === paused);

// --- inside the budget -----------------------------------------------------
const short = resumeSession(paused, at('09:12'));
ok('a two-minute pause costs no health', short.health === 1, String(short.health));
ok('and adds 120 s to lost time', short.lostSeconds === 120, String(short.lostSeconds));
ok('and is recorded as one manual pause',
   short.drifts.length === 1 && short.drifts[0].reason === 'manual-pause' &&
   short.drifts[0].seconds === 120);
ok('growth carries on from where it froze',
   close(growthAt(short, at('09:12')), 0.2), growthAt(short, at('09:12')).toFixed(3));
ok('the finish line moved by the pause',
   close(growthAt(short, at('09:52')), 1), growthAt(short, at('09:52')).toFixed(3));
ok('the budget is spent down, not reset',
   pauseBudgetLeft(short) === PAUSE_BUDGET_SECONDS - 120,
   String(pauseBudgetLeft(short)));

// --- past the budget -------------------------------------------------------
const long = resumeSession(pauseSession(fresh(), at('09:10')), at('09:17'));
ok('a seven-minute pause costs driftPenalty(excess)',
   close(long.health, 1 - driftPenalty(420 - PAUSE_BUDGET_SECONDS)),
   `${long.health.toFixed(3)} vs ${(1 - driftPenalty(120)).toFixed(3)}`);
ok('and the whole pause is still owed as lost time', long.lostSeconds === 420);

// Two stops of three minutes are one six-minute stop as far as the budget is
// concerned: the first is free, the second pays for the minute past 300 s.
let twice = resumeSession(pauseSession(fresh(), at('09:10')), at('09:13'));
ok('the first three-minute pause is free', twice.health === 1);
twice = resumeSession(pauseSession(twice, at('09:20')), at('09:23'));
ok('two pauses of three minutes share one budget',
   close(twice.health, 1 - driftPenalty(360 - PAUSE_BUDGET_SECONDS)),
   `${twice.health.toFixed(3)} vs ${(1 - driftPenalty(60)).toFixed(3)}`);
ok('pause used is cumulative', pauseSecondsUsed(twice) === 360, String(pauseSecondsUsed(twice)));

// --- past the cap ----------------------------------------------------------
const walked = resumeSession(pauseSession(fresh(), at('09:10')), at('09:35'));
ok('a 25-minute pause abandons the session',
   walked.status === 'abandoned' && (25 * 60) > MAX_PAUSE_SECONDS);
ok('at the growth it had when the clock stopped',
   close(walked.growth, 0.2), walked.growth.toFixed(3));
ok('and the pause is left in the record',
   walked.drifts.some((d) => d.reason === 'manual-pause' && d.seconds === 1500));

// --- the timer -------------------------------------------------------------
const stopped = pauseSession(fresh(), at('09:10'));
ok('tick does not complete a paused session past its planned length',
   tick(stopped, at('10:30')) === stopped);
ok('tick completes it once resumed and the time is served',
   tick(resumeSession(stopped, at('09:12')), at('09:52')).status === 'completed');

// --- reconcile -------------------------------------------------------------
// Paused at 09:10, the app kept beating until 09:12, then it was quit and
// reopened at 09:14. The pause up to the last beat is a pause; the two minutes
// after it are a gap nobody watched.
const quit = reconcileSession(pauseSession(fresh(), at('09:10')),
                              at('09:12').toISOString(), at('09:14'));
ok('reconcile of a paused session keeps the frozen growth',
   close(growthAt(quit, at('09:14')), 0.2), growthAt(quit, at('09:14')).toFixed(3));
ok('it is still paused afterwards', Boolean(quit.pausedAt) && quit.status === 'running');
ok('the pause is banked and so is the gap', quit.lostSeconds === 240, String(quit.lostSeconds));
ok('the unwatched stretch is charged as a lapse',
   close(quit.health, 1 - driftPenalty(120)), quit.health.toFixed(3));
ok('the pause itself was free', quit.drifts.some(
   (d) => d.reason === 'manual-pause' && d.seconds === 120));

// A pause the app was watching all along, past the cap, ends the same way a
// resume would have.
const abandonedByGap = reconcileSession(pauseSession(fresh(), at('09:10')),
                                        at('09:40').toISOString(), at('09:41'));
ok('a pause past the cap is an abandonment even without a resume',
   abandonedByGap.status === 'abandoned' && close(abandonedByGap.growth, 0.2),
   abandonedByGap.growth.toFixed(3));

// An unpaused session must behave exactly as it did before pause existed.
const untouched = fresh();
ok('reconcile still no-ops inside the grace on a normal session',
   reconcileSession(untouched, at('09:10').toISOString(),
                    new Date('2026-09-07T09:10:20')) === untouched);
