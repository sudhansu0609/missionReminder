import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import {
  elapsedSeconds, formatDuration, growthAt, hashToSeed, MOOD_LINE, moodOf,
  parseMediaUrl, pickWhy, remainingSeconds, sortMedia, stageOf, type Media,
} from '@mission/core';
import { useStore } from '../store';
import { Tree } from '../components/Tree';
import { Companion } from '../components/Companion';
import { MediaStrip } from '../components/MediaStrip';
import { useTheme } from '../theme';

/**
 * The Forest mechanic, straight: leave the app and the tree pays for it. The
 * screen is kept awake so the honest way to sit through a block is to actually
 * sit through it.
 */
export function Focus() {
  const { C, S } = useTheme();
  useKeepAwake();
  const { active, state, finish } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const [visionDismissed, setVisionDismissed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(id);
  }, []);

  // Leaving the app is charged by the store, not here: it owns the heartbeat,
  // and the charge and the growth freeze have to be one decision or a single
  // absence gets billed twice. See `resume` in store.tsx.

  if (!active) return null;

  const growth = growthAt(active, now);
  const stage = stageOf(growth);
  const mood = moodOf(active, now);
  const why = pickWhy(state, active.id);
  const goal = state.goals.find((g) => g.id === active.goalId);

  const whyEntry = state.mission.whys.find((w) => w.text === why);
  const board = sortMedia(state.mission.media);
  const visionMedia: Media | undefined =
    whyEntry?.media ?? board[hashToSeed(active.id) % Math.max(board.length, 1)];

  // A few seconds of what this is for, before anything starts counting.
  if (
    state.settings.showVisionOnStart && !visionDismissed &&
    elapsedSeconds(active, now) < 7 && (Boolean(why) || Boolean(visionMedia))
  ) {
    const thumb = visionMedia ? parseMediaUrl(visionMedia.url).thumbnailUrl : null;
    return (
      <Pressable style={S.visionScreen} onPress={() => setVisionDismissed(true)}>
        {thumb && <Image source={{ uri: thumb }} style={S.visionImage} resizeMode="cover" />}
        <Text style={S.visionStatement}>{state.mission.statement}</Text>
        {why ? <Text style={[S.why, { textAlign: 'center', fontSize: 16 }]}>{why}</Text> : null}
        {whyEntry?.cost ? (
          <Text style={[S.small, { color: C.amber, textAlign: 'center' }]}>{whyEntry.cost}</Text>
        ) : null}
        <Text style={S.small}>
          {active.title} · {active.plannedMinutes} minutes · tap to begin
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[S.screen, { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }]}>
      <Text style={S.small}>
        {active.title}{goal ? ` · ${goal.title}` : ''}
      </Text>

      <View style={{ alignItems: 'center' }}>
        <Tree species={active.species} seed={active.seed} growth={growth}
              health={active.health} height={260} />
        <View style={{ position: 'absolute', top: 0, right: 0 }}>
          <Companion mood={mood} />
        </View>
      </View>

      <Text style={{ color: C.text, fontSize: 52, fontVariant: ['tabular-nums'] }}>
        {formatDuration(remainingSeconds(active, now))}
      </Text>
      <Text style={S.small}>{stage.label} · {Math.round(growth * 100)}%</Text>
      <Text style={[S.body, { color: active.health < 0.5 ? C.amber : C.muted, textAlign: 'center' }]}>
        {MOOD_LINE[mood]}
      </Text>

      {why && (
        <View style={[S.missionBar, { marginTop: 8 }]}>
          <Text style={S.why}>{why}</Text>
        </View>
      )}

      {whyEntry?.media && <MediaStrip media={[whyEntry.media]} />}

      {active.drifts.length > 0 && (
        <Text style={[S.small, { color: C.amber }]}>
          {active.drifts.length} lapse{active.drifts.length > 1 ? 's' : ''} · health{' '}
          {Math.round(active.health * 100)}%
          {(active.lostSeconds ?? 0) > 60
            ? ` · ${Math.round((active.lostSeconds ?? 0) / 60)} min not served`
            : ''}
        </Text>
      )}

      <View style={{ marginTop: 12, width: '100%', gap: 10 }}>
        {!confirming ? (
          <Pressable style={S.btn} onPress={() => setConfirming(true)}>
            <Text style={[S.btnText, { color: C.red }]}>Give up</Text>
          </Pressable>
        ) : (
          <>
            <Text style={[S.small, { textAlign: 'center' }]}>
              Kill the tree at {Math.round(growth * 100)}%?
            </Text>
            <Pressable style={S.btn}
                       onPress={() => { finish('abandoned'); setConfirming(false); }}>
              <Text style={[S.btnText, { color: C.red }]}>Yes, end it</Text>
            </Pressable>
            <Pressable style={[S.btn, S.btnPrimary]} onPress={() => setConfirming(false)}>
              <Text style={S.btnTextPrimary}>Keep going</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
