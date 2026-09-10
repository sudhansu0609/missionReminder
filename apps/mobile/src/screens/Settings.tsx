import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { canopyColor, THEMES } from '@mission/core';
import { supabase, supabaseConfigured, useStore } from '../store';
import { requestPermission } from '../notifications';
import { useTheme } from '../theme';

export function Settings() {
  const { C, S, theme } = useTheme();
  const { mode, email, refreshAuth, state, setSettings } = useStore();
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await fn();
      if (error) setMessage(error.message);
      else { setMessage(ok); await refreshAuth(); }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={S.content}>
      <Text style={S.h1}>Settings</Text>
      <Text style={S.small}>Storage is {mode}</Text>

      <View style={S.card}>
        <Text style={S.h2}>Look</Text>
        <Text style={S.small}>
          The theme recolours the forest as well as the app, and follows your account,
          so both devices match. The fourth dot is the canopy.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
          {THEMES.map((t) => (
            <Pressable key={t.id}
                       style={[S.themeCard, t.id === theme.id && S.themeCardActive]}
                       onPress={() => setSettings({ themeId: t.id })}>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <View style={[S.themeDot, { backgroundColor: t.colors.bg }]} />
                <View style={[S.themeDot, { backgroundColor: t.colors.panel }]} />
                <View style={[S.themeDot, { backgroundColor: t.colors.accent }]} />
                <View style={[S.themeDot, { backgroundColor: canopyColor(120, 1, 0.5, t.tree) }]} />
              </View>
              <Text style={[S.body, { fontWeight: '600' }]}>{t.name}</Text>
              <Text style={S.small}>{t.blurb}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[S.row, { marginTop: 8 }]}
                   onPress={() => setSettings({
                     showVisionOnStart: !state.settings.showVisionOnStart,
                   })}>
          <View style={{
            width: 20, height: 20, borderRadius: 6, borderWidth: 1,
            borderColor: state.settings.showVisionOnStart ? C.accent : C.line,
            backgroundColor: state.settings.showVisionOnStart ? C.accent : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {state.settings.showVisionOnStart
              ? <Text style={{ color: C.accentText, fontSize: 13 }}>✓</Text>
              : null}
          </View>
          <Text style={[S.body, { flex: 1 }]}>
            Show the mission before each session
          </Text>
        </Pressable>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Sync</Text>
        {!supabaseConfigured ? (
          <Text style={S.small}>
            No Supabase keys found. Everything stays on this phone. Add
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to
            apps/mobile/.env and restart.
          </Text>
        ) : email ? (
          <>
            <Text style={S.small}>Signed in as {email}. Same forest as the desktop.</Text>
            <Pressable style={S.btn}
                       onPress={() => run(async () => {
                         const r = await supabase!.auth.signOut();
                         return { error: r.error };
                       }, 'Signed out.')}>
              <Text style={S.btnText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={S.small}>Use the same account as the desktop app.</Text>
            <TextInput style={S.input} value={form.email} autoCapitalize="none"
                       keyboardType="email-address" placeholder="Email"
                       placeholderTextColor={C.muted}
                       onChangeText={(v) => setForm({ ...form, email: v })} />
            <TextInput style={S.input} value={form.password} secureTextEntry
                       placeholder="Password" placeholderTextColor={C.muted}
                       onChangeText={(v) => setForm({ ...form, password: v })} />
            <Pressable style={[S.btn, S.btnPrimary]} disabled={busy}
                       onPress={() => run(
                         () => supabase!.auth.signInWithPassword(form),
                         'Signed in. Pulling your forest.',
                       )}>
              <Text style={S.btnTextPrimary}>Sign in</Text>
            </Pressable>
            <Pressable style={S.btn} disabled={busy}
                       onPress={() => run(
                         () => supabase!.auth.signUp(form),
                         'Account created.',
                       )}>
              <Text style={S.btnText}>Create account</Text>
            </Pressable>
          </>
        )}
        {message && <Text style={[S.small, { color: C.amber }]}>{message}</Text>}
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Reminders</Text>
        <Text style={S.small}>
          Block reminders are scheduled on this device and fire whether or not the app
          is open. Every one carries a reason from your mission.
        </Text>
        <Pressable style={S.btn} onPress={() => void requestPermission()}>
          <Text style={S.btnText}>Allow notifications</Text>
        </Pressable>
      </View>

      <View style={S.card}>
        <Text style={S.h2}>Your data</Text>
        <Text style={S.small}>
          {state.goals.length} goals · {state.blocks.length} blocks ·{' '}
          {state.sessions.length} sessions
        </Text>
      </View>
    </ScrollView>
  );
}
