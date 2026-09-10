import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  daysSinceTouched, effortProgress, goalPace, milestoneProgress,
} from '@mission/core';
import { useStore } from '../store';
import { useTheme } from '../theme';

/**
 * Read and tick, not author. Creating goals is a desk activity; checking off a
 * milestone from the sofa is exactly what the phone is for.
 */
export function Goals() {
  const { C, S } = useTheme();
  const { state, toggleMilestone } = useStore();

  // Built here rather than at module scope: the colours move with the theme.
  const PACE_COLOR: Record<string, string> = {
    ahead: C.accent, 'on-track': C.accent, behind: C.amber,
    'at-risk': C.red, 'no-deadline': C.muted,
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Goals</Text>
      <Text style={S.small}>Where you actually are</Text>

      {state.goals.length === 0 && (
        <View style={S.card}>
          <Text style={S.small}>No goals yet. Add them on the desktop app.</Text>
        </View>
      )}

      {state.goals.map((goal) => {
        const pace = goalPace(goal);
        const progress = milestoneProgress(goal);
        const effort = effortProgress(goal, state.sessions);
        const silence = daysSinceTouched(goal, state.sessions);

        return (
          <View key={goal.id} style={S.card}>
            <View style={S.rowBetween}>
              <Text style={[S.h2, { flex: 1 }]}>{goal.title}</Text>
              <View style={[S.pill, { borderColor: PACE_COLOR[pace.pace] }]}>
                <Text style={[S.pillText, { color: PACE_COLOR[pace.pace] }]}>
                  {pace.pace.replace('-', ' ')}
                </Text>
              </View>
            </View>

            {goal.rationale ? <Text style={S.why}>{goal.rationale}</Text> : null}
            <Text style={S.small}>{pace.message}</Text>

            <View style={{ gap: 6, marginTop: 4 }}>
              <View style={S.bar}>
                <View style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: '100%', backgroundColor: C.accent,
                }} />
              </View>
              <View style={S.rowBetween}>
                <Text style={S.small}>Done {Math.round(progress * 100)}%</Text>
                <Text style={S.small}>Should be {Math.round(pace.expected * 100)}%</Text>
              </View>
              {effort !== null && (
                <Text style={S.small}>
                  Hours in: {Math.round(effort * 100)}% of {goal.estimatedHours}
                </Text>
              )}
              <Text style={S.small}>
                {silence === null
                  ? 'No focus time logged yet.'
                  : silence === 0 ? 'Worked on today.'
                    : `Last touched ${silence} day${silence === 1 ? '' : 's'} ago.`}
              </Text>
            </View>

            <View style={{ marginTop: 8 }}>
              {goal.milestones
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((m) => (
                  <Pressable key={m.id} style={[S.row, { paddingVertical: 7 }]}
                             onPress={() => toggleMilestone(goal.id, m.id)}>
                    <View style={{
                      width: 18, height: 18, borderRadius: 5, borderWidth: 1,
                      borderColor: m.doneAt ? C.accent : C.line,
                      backgroundColor: m.doneAt ? C.accent : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {m.doneAt ? <Text style={{ color: '#05130c', fontSize: 12 }}>✓</Text> : null}
                    </View>
                    <Text style={[S.body, m.doneAt ? {
                      color: C.muted, textDecorationLine: 'line-through',
                    } : null, { flex: 1 }]}>
                      {m.title}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
