import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  computeNudges, formatMinuteOfDay, minutesOnDay, pickWhy,
  type AppState, type Block, type NudgeScreen, type Weekday,
} from '@mission/core';

/**
 * Local notifications only -- no push server, no backend. Blocks are recurring
 * and known ahead of time, so the whole reminder schedule can be handed to iOS
 * in advance and it fires whether or not the app is running.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** expo-notifications counts weekdays 1..7 from Sunday; the domain uses 0..6. */
const toExpoWeekday = (day: number) => day + 1;

/**
 * iOS keeps only the 64 soonest pending notifications and drops the rest
 * without telling anyone, so the schedule is built against an explicit budget
 * rather than left to chance about which reminders survive.
 */
const IOS_PENDING_LIMIT = 64;
/** Held back for the day-level reminders built after the blocks. */
const RESERVED_FOR_DIGEST = 6;

/** Minutes before a block starts that the "get ready" warning fires. */
const PRE_WARN_MINUTES = 5;
/** Sunday evening, matching the weekly-review rule in core's nudge engine. */
const REVIEW_HOUR = 18;

/**
 * Wipes and rebuilds the whole schedule. Cheap (a handful of entries) and much
 * easier to reason about than diffing, which matters because a wrong reminder
 * is worse than a missing one.
 *
 * Built in priority passes: if the budget runs out, what is lost is the least
 * useful reminder rather than whichever one happened to be scheduled last.
 */
export async function rescheduleAll(state: AppState): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  let budget = IOS_PENDING_LIMIT - RESERVED_FOR_DIGEST;
  const blocks = state.blocks.filter((b) => b.active);
  /** Every (block, weekday) the schedule has to cover, flattened once. */
  const slots = blocks.flatMap((b) => b.days.map((day) => ({ block: b, day })));

  // Pass 1: you said this time and it has gone by. The one that earns its keep.
  for (const { block, day } of slots) {
    if (block.graceMinutes <= 0 || budget <= 0) continue;
    await scheduleFor(state, block, day, block.graceMinutes,
      `You said ${formatMinuteOfDay(block.startMinute)} for ${block.title}`,
      'The block is running without you. Start now and you still get most of the tree.');
    budget--;
  }

  // Pass 2: the block is starting right now.
  for (const { block, day } of slots) {
    if (budget <= 0) break;
    await scheduleFor(state, block, day, 0, `${block.title} starts now`,
      'Open the app and plant the tree.');
    budget--;
  }

  // Pass 3: the desktop's 'block-soon'. First to go when the budget is tight,
  // because a warning missed still leaves the two reminders above.
  for (const { block, day } of slots) {
    if (budget <= 0) break;
    await scheduleFor(state, block, day, -PRE_WARN_MINUTES,
      `${block.title} in ${PRE_WARN_MINUTES} min`,
      `Starts ${formatMinuteOfDay(block.startMinute)}. Close what you are doing and plant the tree.`);
    budget--;
  }

  // Only nag about an empty day if the day is actually still empty.
  if (minutesOnDay(state.sessions) < 1) {
    const evening = new Date();
    evening.setHours(19, 30, 0, 0);
    if (evening.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Nothing planted today',
          body: withWhy(state, 'idle', 'There is still time for one short block.'),
          data: { screen: 'today' satisfies NudgeScreen },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: evening },
      });
    }
  }

  await scheduleGoalDigest(state);

  // Sunday evening: look back before looking forward. Deterministic, so it can
  // recur rather than being rebuilt from state each week.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Week in review',
      body: 'Check your goals against where you said you would be, and set next week\u2019s blocks.',
      data: { screen: 'review' satisfies NudgeScreen },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: toExpoWeekday(0),
      hour: REVIEW_HOUR,
      minute: 0,
    },
  });
}

/**
 * Goal-level nudges -- stalled, behind, at risk -- come from the same
 * `computeNudges` brain the desktop uses, so the phone cannot drift into having
 * its own opinion about when a goal is in trouble.
 *
 * They are scheduled only for this evening, never as a recurring rule. Whether
 * a goal is behind is true of a moment, not of every Tuesday, and this file's
 * one rule is that a wrong reminder is worse than a missing one. Each state
 * change rebuilds them; a phone left untouched simply goes quiet on this.
 */
async function scheduleGoalDigest(state: AppState): Promise<void> {
  const evening = new Date();
  evening.setHours(REVIEW_HOUR, 0, 0, 0);
  if (evening.getTime() <= Date.now()) return;

  const goalNudges = computeNudges(state, evening)
    .filter((n) => n.kind === 'goal-stalled' || n.kind === 'goal-behind')
    .slice(0, RESERVED_FOR_DIGEST - 2); // the idle nag and weekly review keep theirs

  for (const n of goalNudges) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.title,
        body: n.why ? `${n.body}\n\n${n.why}` : n.body,
        data: { screen: n.screen ?? 'goals' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: evening },
    });
  }
}

/**
 * Offsets can be negative (the pre-warning), which may cross back over
 * midnight into the previous day -- so the weekday moves with the clock.
 */
async function scheduleFor(
  state: AppState, block: Block, day: Weekday, offsetMinutes: number,
  title: string, body: string,
) {
  const raw = block.startMinute + offsetMinutes;
  const at = ((raw % 1440) + 1440) % 1440;
  const dayShift = Math.floor(raw / 1440);
  const weekday = (((day + dayShift) % 7) + 7) % 7;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: withWhy(state, block.id + day + offsetMinutes, body),
      data: { screen: 'today' satisfies NudgeScreen },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: toExpoWeekday(weekday),
      hour: Math.floor(at / 60),
      minute: at % 60,
    },
  });
}

/** Every reminder carries a reason. A bare "you are late" is easy to dismiss. */
function withWhy(state: AppState, salt: string, body: string): string {
  const why = pickWhy(state, salt);
  return why ? `${body}\n\n${why}` : body;
}

export async function notifyNow(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
}

/**
 * A tapped reminder should land where it was about. Every scheduled
 * notification carries the screen the nudge named; this is where it is read.
 */
export function onNotificationTap(go: (screen: NudgeScreen) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const screen = response.notification.request.content.data?.screen;
    if (typeof screen === 'string') go(screen as NudgeScreen);
  });
  return () => sub.remove();
}
