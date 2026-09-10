// Behaviour tests for the sync rules -- the outbox, tombstones and the merge
// that owns your history. Plain Node, no framework; build first.
import { createLocalRepo, createSyncRepo, createOutbox, memoryKV } from '../dist/index.js';
import { fakeClient } from './fake-supabase.mjs';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const USER = 'user-1';

/** One device: its own cache, its own outbox, sharing a server. */
function device(client, kv = memoryKV()) {
  const local = createLocalRepo(kv);
  return { kv, local, repo: createSyncRepo(local, client, USER, kv) };
}

const goal = (id, title) => ({
  id, title, status: 'active', createdAt: '2026-09-01T09:00:00.000Z',
  species: 1, milestones: [],
});

// --- the outbox on its own ------------------------------------------------
{
  const kv = memoryKV();
  const box = createOutbox(kv);
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g1', row: { id: 'g1', title: 'one' } });
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g1', row: { id: 'g1', title: 'two' } });
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g2', row: { id: 'g2' } });
  ok('the outbox coalesces two upserts of the same row', (await box.size()) === 2);
  ok('pending ids are reported per table',
     (await box.pendingIds('goals')).has('g1') && (await box.pendingIds('blocks')).size === 0);

  const client = fakeClient();
  const { sent, remaining } = await box.flush(client, USER);
  ok('flush sends everything queued', sent === 2 && remaining === 0);
  ok('only the newest version of a row is sent',
     client.tables.goals.length === 2 && client.tables.goals[0].title === 'two',
     client.tables.goals.map((g) => g.title).join(' '));

  await box.enqueue({ table: 'goals', op: 'delete', rowId: 'g1', row: {} });
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g1', row: { id: 'g1', title: 'back' } });
  ok('an undelete is queued behind the delete, not folded into it', (await box.size()) === 2);
}

// --- a failed flush keeps its entries ------------------------------------
{
  const client = fakeClient();
  const a = device(client);
  await a.repo.load();                    // adopt the seeded state
  client.setFailing(true);
  await a.repo.upsertGoal(goal('g-offline', 'Written on a train'));
  const box = createOutbox(a.kv);
  ok('a failed flush leaves the entry queued', (await box.pendingIds('goals')).has('g-offline'));
  const state = await a.repo.load();
  ok('load returns the local row while the server is unreachable',
     state.goals.some((g) => g.id === 'g-offline'));
  client.setFailing(false);
  await a.repo.load();
  ok('the entry goes up on the next load',
     client.tables.goals.some((g) => g.id === 'g-offline'));
  ok('and the queue is empty afterwards', (await box.size()) === 0);
}

// --- an offline edit to an existing row survives reconnect ---------------
{
  const client = fakeClient();
  const a = device(client);
  await a.repo.load();
  await a.repo.upsertSession({
    id: 's1', title: 'Deep work', plannedMinutes: 50, startedAt: '2026-09-07T09:00:00.000Z',
    status: 'running', growth: 0, health: 1, drifts: [], species: 1, seed: 1,
  });
  await a.repo.load();
  ok('the running session is on the server',
     client.tables.sessions.find((s) => s.id === 's1')?.status === 'running');

  client.setFailing(true);
  await a.repo.upsertSession({
    id: 's1', title: 'Deep work', plannedMinutes: 50, startedAt: '2026-09-07T09:00:00.000Z',
    endedAt: '2026-09-07T09:50:00.000Z', status: 'completed', growth: 1, health: 1,
    drifts: [], species: 1, seed: 1, lostSeconds: 0,
  });
  client.setFailing(false);
  const merged = await a.repo.load();
  ok('an offline edit to an existing row is not overwritten by the stale server copy',
     merged.sessions.find((s) => s.id === 's1')?.status === 'completed',
     merged.sessions.find((s) => s.id === 's1')?.status);
  ok('and it reaches the server on reconnect',
     client.tables.sessions.find((s) => s.id === 's1')?.status === 'completed');
  ok('lost time round-trips through the row mapper',
     client.tables.sessions.find((s) => s.id === 's1')?.lost_seconds === 0);

  // A pause has to cross devices, or the phone shows a tree that stopped
  // growing for no visible reason.
  await a.repo.upsertSession({
    id: 's2', title: 'Deep work', plannedMinutes: 50, startedAt: '2026-09-07T09:00:00.000Z',
    status: 'running', growth: 0.2, health: 1, drifts: [], species: 1, seed: 1,
    lostSeconds: 0, pausedAt: '2026-09-07T09:10:00.000Z',
  });
  const back = await a.repo.load();
  ok('a paused session carries its stopped clock to the server',
     client.tables.sessions.find((s) => s.id === 's2')?.paused_at === '2026-09-07T09:10:00.000Z');
  ok('and reads back as paused',
     back.sessions.find((s) => s.id === 's2')?.pausedAt === '2026-09-07T09:10:00.000Z');
  ok('while an unpaused one reads back with no marker',
     back.sessions.find((s) => s.id === 's1')?.pausedAt === undefined);
}

// --- a delete on one device is not resurrected by the other --------------
{
  const client = fakeClient();
  const a = device(client);
  await a.repo.load();
  await a.repo.upsertGoal(goal('g-shared', 'Ship it'));
  await a.repo.load();

  const b = device(client);                     // second device, own cache
  const seen = await b.repo.load();
  ok('the second device pulls the goal down', seen.goals.some((g) => g.id === 'g-shared'));

  await a.repo.deleteGoal('g-shared');
  await a.repo.flush();          // writes queue first and go up in the background
  ok('a delete is soft on the server',
     client.tables.goals.find((g) => g.id === 'g-shared')?.deleted_at != null);

  const after = await b.repo.load();
  ok('a delete on device A is not resurrected by device B',
     !after.goals.some((g) => g.id === 'g-shared'));
  const backOnA = await a.repo.load();
  ok('and it stays gone on the device that deleted it',
     !backOnA.goals.some((g) => g.id === 'g-shared'));
}

// --- adoption ------------------------------------------------------------
{
  const client = fakeClient();
  const a = device(client);
  const first = await a.repo.load();
  ok('the first sign-in pushes the local forest up',
     client.tables.goals.length === first.goals.length && client.tables.missions.length === 1,
     `${client.tables.goals.length} goals`);

  const before = client.writes.length;
  await a.repo.load();
  ok('adoption happens exactly once',
     client.writes.length === before, `${client.writes.length - before} extra writes`);

  // A device signing in to an account that already has a mission adopts nothing:
  // its own cache is the seeded default, and pushing it would be an import.
  const c = device(client);
  await c.repo.load();
  ok('a second device does not push its seeded state over the account',
     client.tables.missions.length === 1);
}

// --- a row the server never had, and nothing pending, is gone ------------
{
  const client = fakeClient();
  const a = device(client);
  await a.repo.load();
  await a.local.upsertGoal(goal('g-ghost', 'Never queued'));   // straight to the cache
  const state = await a.repo.load();
  ok('a cached row the server does not know and nobody queued is dropped',
     !state.goals.some((g) => g.id === 'g-ghost'));
}

// --- sessions are never deleted, so an old one is not "gone" ---------------
{
  const client = fakeClient();
  const a = device(client);
  await a.repo.load();
  // Straight into the cache: the shape a session takes once it has fallen
  // outside the newest-500 window the fetch returns.
  await a.local.upsertSession({
    id: 's-old', title: 'Long ago', plannedMinutes: 25, startedAt: '2024-01-01T09:00:00.000Z',
    endedAt: '2024-01-01T09:25:00.000Z', status: 'completed', growth: 1, health: 1,
    drifts: [], species: 1, seed: 1, lostSeconds: 0,
  });
  const state = await a.repo.load();
  ok('a cached session the fetch did not return is kept, not dropped',
     state.sessions.some((s) => s.id === 's-old'));
}

// --- a write that lands mid-flush is not thrown away ------------------------
{
  const kv = memoryKV();
  const box = createOutbox(kv);
  let release;
  const gate = new Promise((r) => { release = r; });
  const sent = [];
  // A client whose upserts hang until the test says so.
  const slow = {
    from() {
      return {
        upsert(row) {
          return { then(res, rej) { return gate.then(() => { sent.push(row); res({ error: null }); }, rej); } };
        },
      };
    },
  };
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g1', row: { id: 'g1', title: 'one' } });
  const inFlight = box.flush(slow, USER);
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g2', row: { id: 'g2', title: 'new' } });
  await box.enqueue({ table: 'goals', op: 'upsert', rowId: 'g1', row: { id: 'g1', title: 'two' } });
  release();
  await inFlight;
  ok('a row queued while a flush was in flight survives it',
     (await box.pendingIds('goals')).has('g2'));
  ok('a newer version of the row being sent survives too',
     (await box.pendingIds('goals')).has('g1'));
  await box.flush(slow, USER);
  const lastG1 = sent.filter((r) => r.id === 'g1').pop();
  ok('and both go up on the next flush, the row ending on its newest version',
     (await box.size()) === 0 && sent.length === 3 && lastG1.title === 'two' &&
     sent.some((r) => r.id === 'g2'),
     sent.map((r) => `${r.id}:${r.title}`).join(' '));
}

// --- the cache is not a change source ----------------------------------------
{
  const client = fakeClient();
  const a = device(client);
  let fired = 0;
  const off = a.repo.subscribe(() => { fired++; });
  await a.repo.load();
  await a.repo.upsertGoal(goal('g-quiet', 'No echo'));
  await a.repo.load();
  ok('local writes and loads do not fire the change subscription',
     fired === 0, `${fired} events`);
  off();
}
