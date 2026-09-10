import React, { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { dayKey, forestSummary, speciesTraits, type Session } from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { useTheme } from '../theme';

export function Forest({ onReview }: { onReview: () => void }) {
  const { S } = useTheme();
  const { state } = useStore();
  const summary = forestSummary(state.sessions);

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of state.sessions.filter((x) => x.status !== 'running')) {
      const key = dayKey(new Date(s.startedAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state.sessions]);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Forest</Text>
      <Text style={S.small}>
        {summary.alive} standing · {summary.withered} withered · {summary.hours} hours ·{' '}
        {summary.streak} day streak
      </Text>

      <Pressable style={S.btn} onPress={onReview}>
        <Text style={S.btnText}>Week in review</Text>
      </Pressable>

      {byDay.length === 0 && (
        <View style={S.card}>
          <Text style={S.small}>
            Nothing planted yet. Finish one block and the first tree lands here for good.
          </Text>
        </View>
      )}

      {byDay.map(([day, sessions]) => (
        <View key={day} style={S.card}>
          <Text style={S.h2}>
            {new Date(day).toLocaleDateString(undefined, {
              weekday: 'long', day: 'numeric', month: 'short',
            })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {sessions.map((s) => (
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
        </View>
      ))}
    </ScrollView>
  );
}
