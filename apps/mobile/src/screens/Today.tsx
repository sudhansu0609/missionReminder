import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  blocksForDay, computeNudges, forestSummary, formatMinuteOfDay, minutesOnDay,
  missedBlocksToday, wasHonouredToday,
} from '@mission/core';
import { useStore } from '../store';
import { useMinute } from '../hooks';
import { MediaStrip } from '../components/MediaStrip';
import { useTheme } from '../theme';

const DURATIONS = [15, 25, 50, 90];

export function Today({ onReview }: { onReview: () => void }) {
  const { C, S } = useTheme();
  const { state, begin } = useStore();
  // The timeline reads the clock, so it has to notice the clock moving. One
  // shared minute ticker for the whole app.
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);
  const [minutes, setMinutes] = useState(50);
  const [goalId, setGoalId] = useState<string | undefined>(state.goals[0]?.id);
  const [title, setTitle] = useState('');

  const blocks = blocksForDay(state.blocks, now);
  const missed = missedBlocksToday(state.blocks, state.sessions, now);
  const nudges = useMemo(() => computeNudges(state, now).slice(0, 3), [state, now]);
  const summary = forestSummary(state.sessions);
  // Sunday is when the look-back is worth offering unprompted.
  const isSunday = now.getDay() === 0;

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Today</Text>
      <Text style={S.small}>
        {summary.streak} day streak · {Math.round(minutesOnDay(state.sessions))} min today ·{' '}
        {summary.alive} trees standing
      </Text>

      {isSunday && (
        <Pressable style={[S.card, { borderLeftWidth: 3, borderLeftColor: C.accent }]}
                   onPress={onReview}>
          <Text style={S.h2}>Week in review</Text>
          <Text style={S.small}>
            What you planned, what you kept, and where the hours went. Tap to look back.
          </Text>
        </Pressable>
      )}

      <View style={S.card}>
        <View style={S.missionBar}>
          <Text style={S.body}>{state.mission.statement}</Text>
        </View>
        {state.mission.whys[0] && <Text style={S.why}>{state.mission.whys[0].text}</Text>}
        {state.mission.media.length > 0 && <MediaStrip media={state.mission.media} />}
      </View>

      {nudges.map((n) => (
        <View key={n.id}
              style={[S.card, {
                borderLeftWidth: 3,
                borderLeftColor: n.urgency === 'high' ? C.red : C.amber,
              }]}>
          <Text style={S.h2}>{n.title}</Text>
          <Text style={S.small}>{n.body}</Text>
          {n.why && <Text style={S.why}>{n.why}</Text>}
          {n.blockId && (
            <Pressable style={[S.btn, S.btnPrimary, { marginTop: 6 }]}
                       onPress={() => {
                         const b = state.blocks.find((x) => x.id === n.blockId);
                         if (b) begin({
                           title: b.title, minutes: b.durationMinutes,
                           goalId: b.goalId, blockId: b.id,
                         });
                       }}>
              <Text style={S.btnTextPrimary}>Start now</Text>
            </Pressable>
          )}
        </View>
      ))}

      <View style={S.card}>
        <Text style={S.h2}>Plant a tree</Text>
        <TextInput style={S.input} value={title} onChangeText={setTitle}
                   placeholder="What are you working on" placeholderTextColor={C.muted} />

        <Text style={[S.small, { marginTop: 6 }]}>Toward</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Pressable style={[S.btn, !goalId && S.btnPrimary]} onPress={() => setGoalId(undefined)}>
            <Text style={!goalId ? S.btnTextPrimary : S.btnText}>No goal</Text>
          </Pressable>
          {state.goals.filter((g) => g.status === 'active').map((g) => (
            <Pressable key={g.id} style={[S.btn, goalId === g.id && S.btnPrimary]}
                       onPress={() => setGoalId(g.id)}>
              <Text style={goalId === g.id ? S.btnTextPrimary : S.btnText}>{g.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
          {DURATIONS.map((d) => (
            <Pressable key={d} style={[S.btn, { flex: 1 }, d === minutes && S.btnPrimary]}
                       onPress={() => setMinutes(d)}>
              <Text style={d === minutes ? S.btnTextPrimary : S.btnText}>{d}m</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[S.btn, S.btnPrimary, { marginTop: 10 }]}
                   onPress={() => begin({ title: title || 'Focus', minutes, goalId })}>
          <Text style={S.btnTextPrimary}>Start {minutes} minutes</Text>
        </Pressable>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Your blocks today</Text>
        {blocks.length === 0 && (
          <Text style={S.small}>
            Nothing scheduled today. A commitment you keep beats one you set well.
          </Text>
        )}
        {blocks.map((b) => {
          const done = wasHonouredToday(b, state.sessions, now);
          const isMissed = missed.some((m) => m.id === b.id);
          return (
            <View key={b.id} style={[S.rowBetween, { paddingVertical: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={S.body}>
                  {formatMinuteOfDay(b.startMinute)} · {b.title}
                </Text>
                <Text style={S.small}>{b.durationMinutes} min</Text>
              </View>
              {done ? (
                <View style={S.pill}>
                  <Text style={[S.pillText, { color: C.accent }]}>kept</Text>
                </View>
              ) : (
                <Pressable style={[S.btn, isMissed && S.btnPrimary]}
                           onPress={() => begin({
                             title: b.title, minutes: b.durationMinutes,
                             goalId: b.goalId, blockId: b.id,
                           })}>
                  <Text style={isMissed ? S.btnTextPrimary : S.btnText}>Start</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
