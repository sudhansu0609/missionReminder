// The mark that says the app was watching. Plain Node, no framework.
import {
  memoryKV, writeHeartbeat, readHeartbeat, clearHeartbeat, HEARTBEAT_SECONDS,
} from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const kv = memoryKV();
const at = new Date('2026-09-07T09:15:00.000Z');

ok('nothing written yet reads as nothing', (await readHeartbeat(kv)) === null);

await writeHeartbeat(kv, 'ses_1', at);
const beat = await readHeartbeat(kv);
ok('a heartbeat round-trips',
   beat?.sessionId === 'ses_1' && beat?.at === at.toISOString(), JSON.stringify(beat));

await writeHeartbeat(kv, 'ses_1', new Date('2026-09-07T09:15:15.000Z'));
ok('the newest write wins', (await readHeartbeat(kv)).at.endsWith('09:15:15.000Z'));

await clearHeartbeat(kv);
ok('clearing leaves nothing behind', (await readHeartbeat(kv)) === null);

ok('the interval is short enough that the grace is two of them',
   HEARTBEAT_SECONDS > 0 && HEARTBEAT_SECONDS * 2 === 30, String(HEARTBEAT_SECONDS));

const broken = memoryKV();
await broken.setItem('mission-reminder:heartbeat:v1', 'not json');
ok('a corrupt heartbeat is not a crash', (await readHeartbeat(broken)) === null);
