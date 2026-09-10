// Import validation: what a backup has to look like before it is allowed to
// replace what is on the device. Plain Node, no framework.
import { validateState } from '../dist/index.js';
import { seedState } from '@mission/core';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const clone = () => JSON.parse(JSON.stringify(seedState()));

const good = validateState(clone());
ok('a seeded state is a valid backup', good.ok, good.ok ? '' : good.reason);
ok('validation runs the migration',
   good.ok && Array.isArray(good.state.mission.media));

const rejects = (label, mangle) => {
  const s = clone();
  mangle(s);
  const r = validateState(s);
  ok(label, r.ok === false, r.ok ? 'accepted it' : r.reason);
};

ok('a string is not a backup', validateState('{}').ok === false);
ok('null is not a backup', validateState(null).ok === false);
rejects('no mission is refused', (s) => { delete s.mission; });
rejects('a mission with no statement is refused', (s) => { s.mission.statement = 42; });
rejects('goals that are not a list are refused', (s) => { s.goals = {}; });
rejects('a goal with no id is refused', (s) => { delete s.goals[0].id; });
rejects('an unknown goal status is refused', (s) => { s.goals[0].status = 'maybe'; });
rejects('a block outside the day is refused', (s) => { s.blocks[0].startMinute = 1500; });
rejects('a block with no length is refused', (s) => { s.blocks[0].durationMinutes = 0; });
rejects('a block with an impossible weekday is refused', (s) => { s.blocks[0].days = [1, 9]; });

const withSession = clone();
withSession.sessions = [{
  id: 's1', title: 'Deep work', plannedMinutes: 50, startedAt: '2026-09-07T09:00:00.000Z',
  status: 'completed', growth: 1, health: 1, drifts: [], species: 1, seed: 1,
}];
ok('a state with sessions passes', validateState(withSession).ok);
ok('lost time is filled in for an older backup',
   validateState(withSession).state.sessions[0].lostSeconds === 0);

rejects('a pause marker that is not a time is refused', (s) => {
  s.sessions = [{ id: 's', status: 'running', growth: 0.2, health: 1, startedAt: 'x', pausedAt: 7 }];
});

rejects('growth outside 0..1 is refused', (s) => {
  s.sessions = [{ id: 's', status: 'completed', growth: 4, health: 1, startedAt: 'x' }];
});
rejects('a NaN health is refused', (s) => {
  s.sessions = [{ id: 's', status: 'completed', growth: 1, health: null, startedAt: 'x' }];
});
rejects('an unknown session status is refused', (s) => {
  s.sessions = [{ id: 's', status: 'paused', growth: 1, health: 1, startedAt: 'x' }];
});

const extra = clone();
extra.futureField = { kept: true };
const round = validateState(extra);
ok('unknown fields survive the trip', round.ok && round.state.futureField.kept === true);
