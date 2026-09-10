import React, { useState } from 'react';
import {
  Image, Linking, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { makeMedia, mediaLabel, parseMediaUrl, sortMedia, type Media } from '@mission/core';
import { useStore } from '../store';
import { useTheme } from '../theme';

interface Props {
  media: Media[] | undefined;
  onChange?: (media: Media[]) => void;
  /** Cap the number of items, e.g. one picture per reason. */
  max?: number;
}

/**
 * Horizontal vision board. Adding from the camera roll is the whole reason the
 * phone is the better place to do this -- the photos that mean something are
 * already on it.
 */
export function MediaStrip({ media, onChange, max }: Props) {
  const { C, S } = useTheme();
  const { ingestMedia } = useStore();
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState('');
  const items = sortMedia(media);
  const editable = Boolean(onChange);
  const full = max !== undefined && items.length >= max;

  const append = async (urls: string[]) => {
    if (!onChange || urls.length === 0) return;
    const stored = await ingestMedia(urls);
    const next = [...items, ...stored.map((u, i) => makeMedia(u, items.length + i))];
    onChange(max ? next.slice(0, max) : next);
  };

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: !max || max > 1,
      selectionLimit: max ?? 0,
      quality: 0.85,
    });
    if (result.canceled) return;
    await append(result.assets.map((a) => a.uri));
  };

  const open = (m: Media) => {
    const parsed = parseMediaUrl(m.url);
    if (/^https?:/i.test(parsed.openUrl)) void Linking.openURL(parsed.openUrl);
  };

  return (
    <View style={{ gap: 10 }}>
      {items.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
          {items.map((m) => {
            const parsed = parseMediaUrl(m.url);
            return (
              <Pressable key={m.id} style={S.mediaCard} onPress={() => open(m)}>
                {parsed.thumbnailUrl ? (
                  <Image source={{ uri: parsed.thumbnailUrl }} style={S.mediaImage}
                         resizeMode="cover" />
                ) : (
                  <View style={S.mediaLinkBox}>
                    <Text style={S.small} numberOfLines={4}>{mediaLabel(m)}</Text>
                  </View>
                )}
                {parsed.kind === 'video' && (
                  <View style={S.mediaPlay} pointerEvents="none">
                    <Text style={{ color: '#fff', fontSize: 26 }}>▶</Text>
                  </View>
                )}
                {m.caption ? (
                  <Text style={S.mediaCaption} numberOfLines={2}>{m.caption}</Text>
                ) : null}
                {editable && (
                  <Pressable style={S.mediaRemove}
                             onPress={() => onChange!(items.filter((x) => x.id !== m.id))}>
                    <Text style={{ color: '#fff', fontSize: 15, lineHeight: 17 }}>×</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {editable && !full && (
        <View style={S.row}>
          <Pressable style={[S.btn, { flex: 1 }]} onPress={pick}>
            <Text style={S.btnText}>Add photo</Text>
          </Pressable>
          <Pressable style={[S.btn, { flex: 1 }]} onPress={() => setPasting((v) => !v)}>
            <Text style={S.btnText}>Paste link</Text>
          </Pressable>
        </View>
      )}

      {editable && pasting && (
        <View style={{ gap: 8 }}>
          <TextInput style={S.input} value={url} autoCapitalize="none" autoFocus
                     placeholder="YouTube, Vimeo, an image URL" placeholderTextColor={C.muted}
                     onChangeText={setUrl} />
          <Pressable style={[S.btn, S.btnPrimary]}
                     onPress={async () => {
                       if (!url.trim()) return;
                       await append([url.trim()]);
                       setUrl('');
                       setPasting(false);
                     }}>
            <Text style={S.btnTextPrimary}>Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
