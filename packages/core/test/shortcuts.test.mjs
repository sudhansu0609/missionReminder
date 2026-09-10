// The desktop key map, the mission-draft re-seed rule, and the one block a
// "start next" button should start. Plain Node, no framework.
import {
  shortcutFor, SHORTCUT_TABS, SHORTCUT_HELP, shouldReseed, sameMission,
  blockToStartNow,
} from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

const chord = (key, over = {}) => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over,
});
const ctrl = (key, over = {}) => chord(key, { ctrlKey: true, ...over });

// --- tabs ------------------------------------------------------------------
ok('there are seven tabs to reach', SHORTCUT_TABS.length === 7, SHORTCUT_TABS.join(' '));
ok('Mod+1 is Today', shortcutFor(ctrl('1')).tab === 'today');
ok('Mod+6 is Review', shortcutFor(ctrl('6')).tab === 'review');
ok('Mod+7 is Settings', shortcutFor(ctrl('7')).tab === 'settings');
ok('Mod+8 is nothing', shortcutFor(ctrl('8')) === null);
ok('a bare 1 is nothing', shortcutFor(chord('1')) === null);

// --- the modifier ----------------------------------------------------------
ok('Cmd is the modifier on a Mac',
   shortcutFor(chord('1', { metaKey: true }), { mac: true })?.tab === 'today');
ok('and Ctrl is not', shortcutFor(ctrl('1'), { mac: true }) === null);
ok('Ctrl is the modifier everywhere else', shortcutFor(ctrl('1')).tab === 'today');
ok('and Cmd is not', shortcutFor(chord('1', { metaKey: true })) === null);
ok('both modifiers at once belongs to somebody else',
   shortcutFor(ctrl('1', { metaKey: true })) === null);
ok('Alt is somebody else too', shortcutFor(ctrl('1', { altKey: true })) === null);

// --- the actions -----------------------------------------------------------
ok('Mod+Enter starts the next block', shortcutFor(ctrl('Enter')).kind === 'start-next');
ok('Mod+P pauses and resumes', shortcutFor(ctrl('p')).kind === 'toggle-pause');
ok('and so does Mod+P with caps lock on', shortcutFor(ctrl('P')).kind === 'toggle-pause');
ok('Mod+Shift+G gives up',
   shortcutFor(ctrl('G', { shiftKey: true })).kind === 'give-up');
ok('Mod+G on its own does not', shortcutFor(ctrl('g')) === null);
ok('Mod+Shift+1 is not a tab switch', shortcutFor(ctrl('1', { shiftKey: true })) === null);
ok('Escape closes the session-end screen',
   shortcutFor(chord('Escape')).kind === 'close-ended');

// --- hands off while typing ------------------------------------------------
ok('nothing fires while the caret is in a box',
   shortcutFor(ctrl('1'), { editing: true }) === null &&
   shortcutFor(ctrl('Enter'), { editing: true }) === null);
ok('not even Escape, which would take a half-written note with it',
   shortcutFor(chord('Escape'), { editing: true }) === null);
ok('the help table covers every binding', SHORTCUT_HELP.length === 5);

// --- the mission draft -----------------------------------------------------
const mission = (over = {}) => ({
  id: 'm', statement: 'Build the thing', whys: [], media: [],
  updatedAt: '2026-09-07T09:00:00.000Z', ...over,
});
ok('an untouched draft catches up with the other device',
   shouldReseed(false, '2026-09-07T10:00:00.000Z', '2026-09-07T09:00:00.000Z'));
ok('a half-written one is left alone',
   !shouldReseed(true, '2026-09-07T10:00:00.000Z', '2026-09-07T09:00:00.000Z'));
ok('and nothing happens when nothing moved',
   !shouldReseed(false, '2026-09-07T09:00:00.000Z', '2026-09-07T09:00:00.000Z'));
ok('the same mission with a fresh stamp is still the same mission',
   sameMission(mission(), mission({ updatedAt: '2026-09-09T11:00:00.000Z' })));
ok('a changed statement is not',
   !sameMission(mission(), mission({ statement: 'Something else' })));

// --- which block "start next" means ---------------------------------------
const block = (over) => ({
  id: 'blk1', title: 'Deep work', startMinute: 9 * 60, durationMinutes: 50,
  days: [1, 2, 3, 4, 5], active: true, graceMinutes: 10, ...over,
});
const blocks = [block({}), block({ id: 'blk2', title: 'Evening', startMinute: 20 * 60 })];
const midMorning = new Date('2026-09-07T09:20:00');
ok('the block running right now wins',
   blockToStartNow(blocks, [], midMorning)?.id === 'blk1');
ok('once it is honoured, the next one is offered', blockToStartNow(blocks, [{
  id: 's', blockId: 'blk1', title: 'Deep work', plannedMinutes: 50,
  startedAt: '2026-09-07T09:00:00', endedAt: '2026-09-07T09:50:00',
  status: 'completed', growth: 1, health: 1, drifts: [], species: 1, seed: 1,
}], midMorning)?.id === 'blk2');
ok('and after the last one, nothing',
   blockToStartNow(blocks, [], new Date('2026-09-07T22:00:00')) === null);
ok('a day with no blocks in it is nothing too',
   blockToStartNow(blocks, [], new Date('2026-09-12T09:20:00')) === null);
