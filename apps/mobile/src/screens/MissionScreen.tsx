import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { sameMission, shouldReseed, uid, type Media, type Mission } from '@mission/core';
import { useStore } from '../store';
import { MediaStrip } from '../components/MediaStrip';
import { useTheme } from '../theme';

export function MissionScreen() {
  const { C, S } = useTheme();
  const { state, setMission } = useStore();
  const [draft, setDraft] = useState<Mission>(state.mission);
  /** The mission the draft was seeded from -- not necessarily the current one. */
  const [base, setBase] = useState<Mission>(state.mission);
  const dirty = !sameMission(draft, base);
  const movedElsewhere = state.mission.updatedAt !== base.updatedAt;

  // The mission arrives from the desktop while you are looking at it. An
  // untouched draft catches up silently; a half-written one is left alone and
  // offered the reload below.
  useEffect(() => {
    if (!movedElsewhere) return;
    // Our own save coming back with a fresh stamp, or the same edit made twice.
    if (sameMission(state.mission, draft)) { setBase(state.mission); return; }
    if (shouldReseed(dirty, state.mission.updatedAt, base.updatedAt)) {
      setDraft(state.mission);
      setBase(state.mission);
    }
  }, [state.mission, base, draft, dirty, movedElsewhere]);

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Mission</Text>
      <Text style={S.small}>Read this before every block. That is the whole point.</Text>

      <View style={S.card}>
        <Text style={S.small}>The one thing your days are supposed to add up to</Text>
        <TextInput
          style={[S.input, { minHeight: 90, textAlignVertical: 'top' }]}
          multiline value={draft.statement}
          onChangeText={(statement) => setDraft({ ...draft, statement })}
        />
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Vision board</Text>
        <Text style={S.small}>
          Photos from your camera roll, a video that gets you moving, a link to the
          thing you are aiming at. These show on Today and in the few seconds before
          a session starts.
        </Text>
        <MediaStrip media={draft.media}
                    onChange={(media) => setDraft({ ...draft, media })} />
      </View>

      <View style={S.card}>
        <View style={S.rowBetween}>
          <Text style={S.h2}>Why</Text>
          <Pressable style={S.btn}
                     onPress={() => setDraft({
                       ...draft, whys: [...draft.whys, { id: uid('why'), text: '' }],
                     })}>
            <Text style={S.btnText}>Add</Text>
          </Pressable>
        </View>
        <Text style={S.small}>
          The app rotates through these, one per session and one per reminder, so no
          single line goes numb.
        </Text>

        {draft.whys.map((w, i) => (
          <View key={w.id} style={{ gap: 6, marginTop: 10 }}>
            <TextInput
              style={[S.input, { minHeight: 70, textAlignVertical: 'top' }]}
              multiline value={w.text} placeholder={`Reason ${i + 1}`}
              placeholderTextColor={C.muted}
              onChangeText={(text) => setDraft({
                ...draft,
                whys: draft.whys.map((x) => (x.id === w.id ? { ...x, text } : x)),
              })}
            />
            <MediaStrip
              max={1}
              media={w.media ? [w.media] : []}
              onChange={(media: Media[]) => setDraft({
                ...draft,
                whys: draft.whys.map((x) => (x.id === w.id ? { ...x, media: media[0] } : x)),
              })}
            />
            <Pressable style={S.btn}
                       onPress={() => setDraft({
                         ...draft, whys: draft.whys.filter((x) => x.id !== w.id),
                       })}>
              <Text style={[S.btnText, { color: C.red }]}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {movedElsewhere && dirty && (
        <View style={[S.card, { borderLeftWidth: 3, borderLeftColor: C.amber }]}>
          <Text style={S.small}>
            Updated on another device. Saving will overwrite what came in.
          </Text>
          <Pressable style={S.btn}
                     onPress={() => { setDraft(state.mission); setBase(state.mission); }}>
            <Text style={S.btnText}>Reload draft</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={[S.btn, dirty && S.btnPrimary, { opacity: dirty ? 1 : 0.45 }]}
                 disabled={!dirty} onPress={() => setMission(draft)}>
        <Text style={dirty ? S.btnTextPrimary : S.btnText}>Save mission</Text>
      </Pressable>
    </ScrollView>
  );
}
