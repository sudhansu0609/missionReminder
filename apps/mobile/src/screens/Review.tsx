import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  formatMinuteOfDay, speciesTraits, weekReview, type Weekday,
} from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { useTheme } from '../theme';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The Sunday look-back on the phone. No seventh tab for it: it is a thing you
 * open once a week, from the nudge, from Today on a Sunday, or from Forest.
 */
export function Review({ onClose }: { onClose: () => void }) {
  const { C, S } = useTheme();
  const { state } = useStore();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const week = useMemo(() => weekReview(state, new Date(), weeksAgo), [state, weeksAgo]);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <View style={S.rowBetween}>
        <Text style={S.h1}>Week in review</Text>
        <Pressable style={S.btn} onPress={onClose}>
          <Text style={S.btnText}>Close</Text>
        </Pressable>
      </View>
      <Text style={S.small}>{pretty(week.weekStart)} to {pretty(week.weekEnd)}</Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[S.btn, { flex: 1 }, weeksAgo === 0 && S.btnPrimary]}
                   onPress={() => setWeeksAgo(0)}>
          <Text style={weeksAgo === 0 ? S.btnTextPrimary : S.btnText}>This week</Text>
        </Pressable>
        <Pressable style={[S.btn, { flex: 1 }, weeksAgo === 1 && S.btnPrimary]}
                   onPress={() => setWeeksAgo(1)}>
          <Text style={weeksAgo === 1 ? S.btnTextPrimary : S.btnText}>Last week</Text>
        </Pressable>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>{week.blocks.kept} of {week.blocks.planned} blocks kept</Text>
        <View style={S.bar}>
          <View style={{
            width: `${week.blocks.planned === 0 ? 0
              : Math.round((week.blocks.kept / week.blocks.planned) * 100)}%`,
            height: '100%', backgroundColor: C.accent,
          }} />
        </View>
        <Text style={S.small}>
          {week.blocks.missed === 0
            ? 'Nothing went by unanswered.'
            : `${week.blocks.missed} went by without a tree.`}{' '}
          {week.trees.alive} standing, {week.trees.dead} withered · {week.streakDays} day streak
        </Text>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Where the hours went</Text>
        {week.minutesByGoal.length === 0 ? (
          <Text style={S.small}>No focused minutes this week. That is the whole review.</Text>
        ) : week.minutesByGoal.map((row) => (
          <View key={row.goalId ?? 'none'} style={{ gap: 4, marginTop: 4 }}>
            <View style={S.rowBetween}>
              <Text style={[S.body, { flex: 1 }]}>{row.title}</Text>
              <Text style={S.small}>{Math.round(row.minutes)} min</Text>
            </View>
            <View style={S.bar}>
              <View style={{
                width: `${Math.round((row.minutes / Math.max(week.minutesByGoal[0].minutes, 1)) * 100)}%`,
                height: '100%', backgroundColor: C.accent,
              }} />
            </View>
          </View>
        ))}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>What you planted</Text>
        {week.sessions.length === 0 ? (
          <Text style={S.small}>
            No trees at all. One kept block next week is a better answer than seven
            planned ones.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {week.sessions.map((s) => (
              <View key={s.id} style={{ width: 96, alignItems: 'center' }}>
                <Tree species={s.species} seed={s.seed} growth={s.growth} health={s.health}
                      height={92} dead={s.status === 'abandoned' && s.health <= 0.05} />
                <Text style={[S.small, { textAlign: 'center' }]} numberOfLines={1}>{s.title}</Text>
                <Text style={S.small}>
                  {speciesTraits(s.species).name} · {Math.round(s.growth * 100)}%
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Next week</Text>
        {week.nextWeek.length === 0 ? (
          <Text style={S.small}>
            Nothing scheduled. A week with no blocks in it is a week you will improvise.
          </Text>
        ) : week.nextWeek.map(({ block, days }) => (
          <View key={block.id} style={{ gap: 4, marginTop: 6 }}>
            <Text style={S.body}>
              {formatMinuteOfDay(block.startMinute)} · {block.title}
              <Text style={S.small}> · {block.durationMinutes} min</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {DAY_LABELS.map((d, i) => (
                <View key={i}
                      style={[S.pill, {
                        opacity: days.includes(i as Weekday) ? 1 : 0.28,
                        borderColor: days.includes(i as Weekday) ? C.accent : C.line,
                      }]}>
                  <Text style={S.pillText}>{d}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const pretty = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
