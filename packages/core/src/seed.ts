import type { AppState } from './types.js';
import { DEFAULT_THEME_ID } from './themes.js';
import { hashToSeed, nowISO, uid } from './util.js';

/**
 * First-run state. Deliberately not empty: an empty mission screen teaches you
 * nothing, and the fastest way to explain this app is to show a filled-in one.
 * Every field here is meant to be overwritten.
 */
export function seedState(): AppState {
  const goalId = uid('goal');
  return {
    mission: {
      id: uid('mis'),
      statement: 'Write down the one thing your days are supposed to add up to.',
      updatedAt: nowISO(),
      media: [],
      whys: [
        {
          id: uid('why'),
          text: 'Because I do not want to reach forty having been busy instead of having built something.',
          cost: 'Another year of motion without direction.',
        },
        {
          id: uid('why'),
          text: 'Because the people I care about deserve the version of me that finishes things.',
        },
      ],
    },
    goals: [
      {
        id: goalId,
        title: 'Ship the first real version',
        rationale: 'Nothing counts until someone else can use it.',
        status: 'active',
        createdAt: nowISO(),
        startDate: nowISO().slice(0, 10),
        estimatedHours: 60,
        species: hashToSeed(goalId),
        milestones: [
          { id: uid('ms'), title: 'Decide what it actually is', weight: 1, order: 0, doneAt: nowISO() },
          { id: uid('ms'), title: 'Build the core loop', weight: 3, order: 1 },
          { id: uid('ms'), title: 'Use it myself for two weeks', weight: 2, order: 2 },
          { id: uid('ms'), title: 'Put it in front of one other person', weight: 2, order: 3 },
        ],
      },
    ],
    blocks: [
      {
        id: uid('blk'),
        title: 'Deep work',
        goalId,
        startMinute: 6 * 60 + 30,
        durationMinutes: 50,
        days: [1, 2, 3, 4, 5],
        active: true,
        graceMinutes: 10,
      },
      {
        id: uid('blk'),
        title: 'Evening block',
        goalId,
        startMinute: 20 * 60,
        durationMinutes: 25,
        days: [1, 3, 5],
        active: true,
        graceMinutes: 15,
      },
    ],
    sessions: [],
    settings: { themeId: DEFAULT_THEME_ID, showVisionOnStart: true },
  };
}
