import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { speciesTraits, stageOf } from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { useTheme } from '../theme';

/**
 * The same end screen as the desktop: what the session left behind, and the
 * one line about it that lands in `Session.note`.
 */
export function SessionEnd() {
  const { C, S } = useTheme();
  const { ended, dismissEnded, setNote, state } = useStore();
  const [note, setDraft] = useState(ended?.note ?? '');
  if (!ended) return null;

  const dead = ended.status === 'abandoned' && ended.health <= 0.05;
  const goal = state.goals.find((g) => g.id === ended.goalId);
  const lostMinutes = Math.round((ended.lostSeconds ?? 0) / 60);

  const save = () => {
    if (note.trim() !== (ended.note ?? '')) setNote(ended.id, note);
    dismissEnded();
  };

  const stat = (value: string, label: string) => (
    <View style={{ alignItems: 'center', minWidth: 68 }}>
      <Text style={{ color: C.text, fontSize: 22, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={S.small}>{label}</Text>
    </View>
  );

  return (
    <ScrollView style={S.screen}
                contentContainerStyle={[S.content, { alignItems: 'center', gap: 14, padding: 24 }]}>
      <Text style={S.small}>
        {ended.status === 'completed' ? 'Rooted for good' : 'This one did not make it'}
      </Text>

      <Tree species={ended.species} seed={ended.seed} growth={ended.growth}
            health={ended.health} height={220} dead={dead} />

      <Text style={[S.h2, { textAlign: 'center' }]}>
        {ended.title}{goal ? ` · ${goal.title}` : ''}
      </Text>
      <Text style={[S.small, ended.status === 'completed' ? null : { color: C.amber }]}>
        {stageOf(ended.growth).label} · {speciesTraits(ended.species).name}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18 }}>
        {stat(`${Math.round(ended.growth * 100)}%`, 'grown')}
        {stat(`${Math.round(ended.health * 100)}%`, 'health')}
        {stat(String(ended.drifts.length), ended.drifts.length === 1 ? 'lapse' : 'lapses')}
        {stat(String(Math.round(ended.plannedMinutes * ended.growth)), 'minutes')}
      </View>

      {lostMinutes > 0 && (
        <Text style={[S.small, { color: C.amber, textAlign: 'center' }]}>
          {lostMinutes} minute{lostMinutes === 1 ? '' : 's'} passed with the app not
          watching. That time is not growth.
        </Text>
      )}

      <View style={{ width: '100%', gap: 8 }}>
        <Text style={S.small}>What did you get done?</Text>
        <TextInput style={S.input} value={note} onChangeText={setDraft}
                   placeholder="One line, for when you look back"
                   placeholderTextColor={C.muted} onSubmitEditing={save} />
        <Pressable style={[S.btn, S.btnPrimary]} onPress={save}>
          <Text style={S.btnTextPrimary}>Save</Text>
        </Pressable>
        <Pressable style={S.btn} onPress={dismissEnded}>
          <Text style={S.btnText}>Skip</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
