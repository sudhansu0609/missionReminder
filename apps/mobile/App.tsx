import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider, useStore } from './src/store';
import { ThemeProvider, useTheme } from './src/theme';
import { notifyNow, requestPermission, rescheduleAll } from './src/notifications';
import { Today } from './src/screens/Today';
import { Goals } from './src/screens/Goals';
import { Forest } from './src/screens/Forest';
import { MissionScreen } from './src/screens/MissionScreen';
import { Settings } from './src/screens/Settings';
import { Focus } from './src/screens/Focus';
import { SessionEnd } from './src/screens/SessionEnd';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'mission', label: 'Mission' },
  { id: 'goals', label: 'Goals' },
  { id: 'forest', label: 'Forest' },
  { id: 'settings', label: 'You' },
] as const;

export default function App() {
  return (
    <StoreProvider
      onEvent={(kind, session) => {
        if (kind === 'completed') {
          void notifyNow('Tree is rooted', `${session.title} — done. That one counts.`);
        } else {
          void notifyNow('The tree died', 'Too much time away. Start another when you are ready.');
        }
      }}
    >
      <Themed />
    </StoreProvider>
  );
}

/** Reads the theme id out of synced settings and hands it to the provider. */
function Themed() {
  const { state } = useStore();
  return (
    <ThemeProvider themeId={state.settings?.themeId}>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const { C, S, theme } = useTheme();
  const { ready, active, ended, state } = useStore();
  const [tab, setTab] = useState<string>('today');

  useEffect(() => { void requestPermission(); }, []);

  // The whole reminder schedule is rebuilt whenever the blocks, the mission or
  // today's sessions change -- that is what keeps the wording current and stops
  // the evening nag from firing on a day you already worked.
  useEffect(() => {
    if (!ready) return;
    void rescheduleAll(state);
  }, [ready, state.blocks, state.mission, state.sessions.length]);

  if (!ready) {
    return (
      <View style={[S.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={S.small}>Waking up...</Text>
      </View>
    );
  }

  // A running session takes the whole screen. There is nothing else to do.
  if (active) {
    return (
      <SafeAreaView style={S.screen}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <Focus />
      </SafeAreaView>
    );
  }

  // And when it ends, what it left behind -- before the tabs come back.
  if (ended) {
    return (
      <SafeAreaView style={S.screen}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        <SessionEnd />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.screen}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'today' && <Today />}
        {tab === 'mission' && <MissionScreen />}
        {tab === 'goals' && <Goals />}
        {tab === 'forest' && <Forest />}
        {tab === 'settings' && <Settings />}
      </View>

      <View style={S.tabBar}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={S.tab} onPress={() => setTab(t.id)}>
            <View style={{
              width: 6, height: 6, borderRadius: 3,
              backgroundColor: tab === t.id ? C.accent : 'transparent',
            }} />
            <Text style={[S.tabLabel, tab === t.id && S.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
