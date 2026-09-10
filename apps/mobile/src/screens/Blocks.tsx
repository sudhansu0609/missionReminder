import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatMinuteOfDay, uid, type Block, type Weekday } from '@mission/core';
import { useStore } from '../store';
import { useTheme } from '../theme';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function blankBlock(): Block {
  return {
    id: uid('blk'), title: '', startMinute: 9 * 60, durationMinutes: 50,
    days: [1, 2, 3, 4, 5], active: true, graceMinutes: 10,
  };
}

/**
 * The same editor the desktop has. Setting up a schedule is a desk activity
 * and this will never be the nicer of the two, but "you cannot do it here"
 * was the app's largest stated limitation and it is not worth keeping.
 */
export function Blocks() {
  const { C, S } = useTheme();
  const { state, saveBlock, removeBlock } = useStore();
  const [editing, setEditing] = useState<Block | null>(null);

  const confirmDelete = (block: Block) => {
    // Same wording as the desktop, through the platform's own dialog.
    Alert.alert(
      `Delete "${block.title}"?`,
      'The block goes; the trees you already grew for it stay.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeBlock(block.id) },
      ],
    );
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Time blocks</Text>
      <Text style={S.small}>The promises. Sessions are what you actually did.</Text>

      {editing ? (
        <BlockEditor
          block={editing}
          onCancel={() => setEditing(null)}
          onSave={(b) => { saveBlock(b); setEditing(null); }}
        />
      ) : (
        <Pressable style={[S.btn, S.btnPrimary]} onPress={() => setEditing(blankBlock())}>
          <Text style={S.btnTextPrimary}>New block</Text>
        </Pressable>
      )}

      {state.blocks.length === 0 && !editing && (
        <View style={S.card}>
          <Text style={S.small}>
            No blocks yet. Pick one time you will show up, every weekday. One kept
            block beats five ambitious ones.
          </Text>
        </View>
      )}

      {state.blocks.map((b) => {
        const goal = state.goals.find((g) => g.id === b.goalId);
        return (
          <View key={b.id} style={S.card}>
            <View style={S.rowBetween}>
              <Text style={[S.h2, { flex: 1 }]}>{b.title}</Text>
              {!b.active && (
                <View style={S.pill}><Text style={S.pillText}>paused</Text></View>
              )}
            </View>
            <Text style={S.small}>
              {formatMinuteOfDay(b.startMinute)} for {b.durationMinutes} min
              {goal ? ` toward ${goal.title}` : ''} · nudges after {b.graceMinutes} min
            </Text>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
              {DAY_LABELS.map((d, i) => (
                <View key={i}
                      style={[S.pill, {
                        opacity: b.days.includes(i as Weekday) ? 1 : 0.28,
                        borderColor: b.days.includes(i as Weekday) ? C.accent : C.line,
                      }]}>
                  <Text style={S.pillText}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable style={[S.btn, { flex: 1 }]}
                         onPress={() => saveBlock({ ...b, active: !b.active })}>
                <Text style={S.btnText}>{b.active ? 'Pause' : 'Resume'}</Text>
              </Pressable>
              <Pressable style={[S.btn, { flex: 1 }]} onPress={() => setEditing(b)}>
                <Text style={S.btnText}>Edit</Text>
              </Pressable>
              <Pressable style={[S.btn, { flex: 1 }]} onPress={() => confirmDelete(b)}>
                <Text style={[S.btnText, { color: C.red }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function BlockEditor({ block, onSave, onCancel }: {
  block: Block; onSave: (b: Block) => void; onCancel: () => void;
}) {
  const { C, S } = useTheme();
  const { state } = useStore();
  const [draft, setDraft] = useState<Block>(block);
  const set = (patch: Partial<Block>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleDay = (day: Weekday) =>
    set({
      days: draft.days.includes(day)
        ? draft.days.filter((d) => d !== day)
        : [...draft.days, day].sort((a, b) => a - b),
    });

  return (
    <View style={S.card}>
      <Text style={S.small}>Name</Text>
      <TextInput style={S.input} value={draft.title} placeholder="Deep work"
                 placeholderTextColor={C.muted}
                 onChangeText={(title) => set({ title })} />

      <Text style={[S.small, { marginTop: 6 }]}>Toward which goal</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pressable style={[S.btn, !draft.goalId && S.btnPrimary]}
                   onPress={() => set({ goalId: undefined })}>
          <Text style={!draft.goalId ? S.btnTextPrimary : S.btnText}>No goal</Text>
        </Pressable>
        {state.goals.map((g) => (
          <Pressable key={g.id} style={[S.btn, draft.goalId === g.id && S.btnPrimary]}
                     onPress={() => set({ goalId: g.id })}>
            <Text style={draft.goalId === g.id ? S.btnTextPrimary : S.btnText}>{g.title}</Text>
          </Pressable>
        ))}
      </View>

      {/* Two numbers rather than a wheel: a native picker is a dependency, and
          this is a thing you set once and then leave alone for months. */}
      <Text style={[S.small, { marginTop: 6 }]}>
        Starts at {formatMinuteOfDay(draft.startMinute)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <TextInput style={S.input} keyboardType="number-pad"
                     value={String(Math.floor(draft.startMinute / 60))}
                     onChangeText={(v) => set({
                       startMinute: clamp(Number(v) || 0, 0, 23) * 60 + (draft.startMinute % 60),
                     })} />
          <Text style={S.small}>hour</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TextInput style={S.input} keyboardType="number-pad"
                     value={String(draft.startMinute % 60)}
                     onChangeText={(v) => set({
                       startMinute: Math.floor(draft.startMinute / 60) * 60
                         + clamp(Number(v) || 0, 0, 59),
                     })} />
          <Text style={S.small}>minute</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <TextInput style={S.input} keyboardType="number-pad"
                     value={String(draft.durationMinutes)}
                     onChangeText={(v) => set({ durationMinutes: clamp(Number(v) || 25, 5, 240) })} />
          <Text style={S.small}>minutes long</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TextInput style={S.input} keyboardType="number-pad"
                     value={String(draft.graceMinutes)}
                     onChangeText={(v) => set({ graceMinutes: clamp(Number(v) || 0, 0, 120) })} />
          <Text style={S.small}>nudge me after</Text>
        </View>
      </View>

      <Text style={[S.small, { marginTop: 6 }]}>Days</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {DAY_LABELS.map((d, i) => (
          <Pressable key={i}
                     style={[S.btn, { flex: 1, paddingHorizontal: 0 },
                             draft.days.includes(i as Weekday) && S.btnPrimary]}
                     onPress={() => toggleDay(i as Weekday)}>
            <Text style={draft.days.includes(i as Weekday) ? S.btnTextPrimary : S.btnText}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={[S.row, { marginTop: 8 }]} onPress={() => set({ active: !draft.active })}>
        <View style={{
          width: 20, height: 20, borderRadius: 6, borderWidth: 1,
          borderColor: draft.active ? C.accent : C.line,
          backgroundColor: draft.active ? C.accent : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {draft.active ? <Text style={{ color: C.accentText, fontSize: 13 }}>✓</Text> : null}
        </View>
        <Text style={[S.body, { flex: 1 }]}>Active — remind me and count it as planned</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable
          style={[S.btn, S.btnPrimary, { flex: 1 },
                  (!draft.title.trim() || draft.days.length === 0) && { opacity: 0.45 }]}
          disabled={!draft.title.trim() || draft.days.length === 0}
          onPress={() => onSave(draft)}
        >
          <Text style={S.btnTextPrimary}>Save block</Text>
        </Pressable>
        <Pressable style={[S.btn, { flex: 1 }]} onPress={onCancel}>
          <Text style={S.btnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
