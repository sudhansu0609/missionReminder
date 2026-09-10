// The weekly review: boundaries, kept-versus-missed, and where the minutes went.
// Plain Node, no framework: run `npm test` from the repo root after a build.
import { weekReview, weekStartOf, dayKey } from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

// 2026-09-07 is a Monday, so this week runs to Sunday the 13th.
const block = (over) => ({
  id: 'blk1', title: 'Deep work', goalId: 'g1', startMinute: 9 * 60,
  durationMinutes: 50, days: [1, 2, 3, 4, 5], active: true, graceMinutes: 10,
  ...over,
});
const ses = (id, started, ended, over = {}) => ({
  id, title: 'Deep work', plannedMinutes: 50, startedAt: started, endedAt: ended,
  status: 'completed', growth: 1, health: 1, drifts: [], species: 1, seed: 1,
  lostSeconds: 0, ...over,
});
const goal = (id, title) => ({
  id, title, status: 'active', createdAt: '2026-09-01T00:00:00', milestones: [], species: 1,
});

const state = {
  mission: { id: 'm', statement: 'x', whys: [], media: [], updatedAt: '2026-09-01T00:00:00' },
  goals: [goal('g1', 'Book'), goal('g2', 'Fitness')],
  blocks: [block({}), block({ id: 'blk2', title: 'Long run', goalId: 'g2', days: [6], startMinute: 8 * 60 })],
  sessions: [
    // Monday and Tuesday kept; Wednesday started an hour and a half late.
    ses('s1', '2026-09-07T09:00:00', '2026-09-07T09:50:00', { blockId: 'blk1', goalId: 'g1' }),
    ses('s2', '2026-09-08T09:05:00', '2026-09-08T09:55:00', { blockId: 'blk1', goalId: 'g1' }),
    ses('s3', '2026-09-09T10:30:00', '2026-09-09T11:20:00', { blockId: 'blk1', goalId: 'g1' }),
    // Given up half way, and it still banks the minutes it served.
    ses('s4', '2026-09-10T14:00:00', '2026-09-10T14:25:00',
        { goalId: 'g1', status: 'abandoned', growth: 0.5 }),
    ses('s5', '2026-09-11T07:00:00', '2026-09-11T07:30:00',
        { goalId: 'g2', plannedMinutes: 30 }),
    // Last week, for the weeksAgo check.
    ses('s0', '2026-09-02T09:00:00', '2026-09-02T09:50:00', { blockId: 'blk1', goalId: 'g1' }),
  ],
  settings: { themeId: 'forest', showVisionOnStart: true },
};

const friday = new Date('2026-09-11T12:00:00');
const week = weekReview(state, friday);

// --- boundaries ------------------------------------------------------------
ok('the week runs local Monday to Sunday',
   week.weekStart === '2026-09-07' && week.weekEnd === '2026-09-13',
   `${week.weekStart} .. ${week.weekEnd}`);
ok('weekStartOf finds the Monday from any day of the week',
   dayKey(weekStartOf(new Date('2026-09-13T23:00:00'))) === '2026-09-07' &&
   dayKey(weekStartOf(new Date('2026-09-07T00:00:00'))) === '2026-09-07');
const lastWeek = weekReview(state, friday, 1);
ok('weeksAgo = 1 is last week',
   lastWeek.weekStart === '2026-08-31' && lastWeek.weekEnd === '2026-09-06',
   `${lastWeek.weekStart} .. ${lastWeek.weekEnd}`);
ok('and it holds last week’s session',
   lastWeek.sessions.length === 1 && lastWeek.sessions[0].id === 's0');

// --- sessions and trees ----------------------------------------------------
ok('this week holds five sessions, newest first',
   week.sessions.length === 5 && week.sessions[0].id === 's5' &&
   week.sessions[4].id === 's1',
   week.sessions.map((s) => s.id).join(' '));
ok('trees are counted alive and dead',
   week.trees.alive === 4 && week.trees.dead === 1,
   JSON.stringify(week.trees));

// --- blocks kept -----------------------------------------------------------
// Mon-Fri is five planned instances by Friday lunchtime; Saturday's block has
// not come round yet. Two were started inside the window, one an hour late.
ok('planned counts only the days the week has reached',
   week.blocks.planned === 5, String(week.blocks.planned));
ok('kept is a session started inside the block window',
   week.blocks.kept === 2, String(week.blocks.kept));
ok('missed is the rest', week.blocks.missed === 3, String(week.blocks.missed));
ok('a block later in the week is not missed yet',
   weekReview({ ...state, blocks: [block({ days: [5] })] },
              new Date('2026-09-09T12:00:00')).blocks.planned === 0);

// --- minutes by goal -------------------------------------------------------
const byGoal = week.minutesByGoal;
ok('minutes are summed per goal and sorted desc',
   byGoal[0].goalId === 'g1' && byGoal[0].minutes === 175 &&
   byGoal[1].goalId === 'g2' && byGoal[1].minutes === 30,
   JSON.stringify(byGoal));
ok('an abandoned session still banks the minutes it served',
   byGoal[0].minutes === 50 + 50 + 50 + 25);
ok('a session with no goal is labelled, not dropped', (() => {
  const loose = weekReview({ ...state, sessions: [ses('x', '2026-09-08T09:00:00', '2026-09-08T09:50:00')] },
                           friday);
  return loose.minutesByGoal[0].title === 'No goal' && loose.minutesByGoal[0].goalId === undefined;
})());

// --- the Sunday/Monday seam -----------------------------------------------
const seam = {
  ...state,
  sessions: [
    ses('sun', '2026-09-13T23:30:00', '2026-09-13T23:59:00'),
    ses('mon', '2026-09-14T00:00:00', '2026-09-14T00:01:00'),
  ],
};
const monday = new Date('2026-09-14T09:00:00');
ok('a session ending 23:59 Sunday belongs to that week',
   weekReview(seam, monday, 1).sessions.map((s) => s.id).join() === 'sun');
ok('and one ending 00:01 Monday belongs to the next',
   weekReview(seam, monday, 0).sessions.map((s) => s.id).join() === 'mon');

// --- next week -------------------------------------------------------------
ok('next week lists active blocks by their first day',
   week.nextWeek.map((n) => n.block.id).join(' ') === 'blk1 blk2',
   week.nextWeek.map((n) => `${n.block.id}:${n.days.join('')}`).join(' '));
ok('a paused block is not on next week’s list',
   weekReview({ ...state, blocks: [block({ active: false })] }, friday).nextWeek.length === 0);
ok('a Sunday-only block sorts last, because the week starts on Monday',
   weekReview({ ...state, blocks: [block({ id: 'sun', days: [0] }), block({})] }, friday)
     .nextWeek.map((n) => n.block.id).join(' ') === 'blk1 sun');

// --- streak ----------------------------------------------------------------
// Three days running, Friday to Sunday, and nothing since. Read at the end of
// that week it is a streak of three; read from this Friday it is nothing.
const ran = {
  ...state,
  sessions: ['04', '05', '06'].map((d) =>
    ses(`r${d}`, `2026-09-${d}T09:00:00`, `2026-09-${d}T09:50:00`)),
};
ok('the streak is read at the end of a past week, not from today',
   weekReview(ran, friday, 1).streakDays === 3 && weekReview(ran, friday, 0).streakDays === 0,
   `${weekReview(ran, friday, 1).streakDays} then ${weekReview(ran, friday, 0).streakDays}`);
