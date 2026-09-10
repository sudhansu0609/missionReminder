import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { getTheme, type Theme, type ThemeColors } from '@mission/core';

/**
 * Styles are rebuilt whenever the theme changes rather than being module-level
 * constants, so a theme switch on the desktop repaints the phone too -- the
 * setting rides along with the account.
 */

export type Styles = ReturnType<typeof buildStyles>;

interface ThemeValue {
  theme: Theme;
  C: ThemeColors;
  S: Styles;
}

const fallback = getTheme(undefined);
const Ctx = createContext<ThemeValue>({
  theme: fallback, C: fallback.colors, S: buildStyles(fallback.colors),
});

export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ themeId, children }: {
  themeId: string | undefined;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const theme = getTheme(themeId);
    return { theme, C: theme.colors, S: buildStyles(theme.colors) };
  }, [themeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function buildStyles(C: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    h1: { color: C.text, fontSize: 24, fontWeight: '600' },
    h2: { color: C.text, fontSize: 17, fontWeight: '600' },
    body: { color: C.text, fontSize: 15, lineHeight: 22 },
    small: { color: C.muted, fontSize: 13, lineHeight: 19 },
    why: { color: C.muted, fontSize: 14, fontStyle: 'italic', lineHeight: 21 },
    card: {
      backgroundColor: C.panel, borderColor: C.line, borderWidth: 1,
      borderRadius: 14, padding: 16, gap: 8,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowBetween: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', gap: 10,
    },
    btn: {
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
      borderWidth: 1, borderColor: C.line, backgroundColor: C.hover,
    },
    btnPrimary: { backgroundColor: C.accent, borderColor: 'transparent' },
    btnText: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    btnTextPrimary: { color: C.accentText, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    input: {
      color: C.text, backgroundColor: C.inputBg, borderColor: C.line, borderWidth: 1,
      borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15,
    },
    pill: {
      borderWidth: 1, borderColor: C.line, borderRadius: 999,
      paddingHorizontal: 9, paddingVertical: 2,
    },
    pillText: { color: C.muted, fontSize: 11 },
    bar: { height: 7, backgroundColor: C.track, borderRadius: 999, overflow: 'hidden' },
    tabBar: {
      flexDirection: 'row', backgroundColor: C.bg2,
      borderTopColor: C.line, borderTopWidth: 1, paddingBottom: 22, paddingTop: 8,
    },
    tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
    tabLabel: { fontSize: 11, color: C.muted },
    tabLabelActive: { color: C.accent },
    missionBar: { borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 12 },

    mediaCard: {
      width: 132, height: 132, borderRadius: 12, overflow: 'hidden',
      borderWidth: 1, borderColor: C.line, backgroundColor: C.hover,
    },
    mediaImage: { width: '100%', height: '100%' },
    mediaLinkBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 },
    mediaCaption: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingHorizontal: 7, paddingVertical: 5, color: '#fff', fontSize: 11,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    mediaRemove: {
      position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    mediaPlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    themeCard: {
      borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12,
      backgroundColor: C.hover, flexGrow: 1, minWidth: '46%', gap: 6,
    },
    themeCardActive: { borderColor: C.accent, borderWidth: 2 },
    themeDot: { width: 16, height: 16, borderRadius: 8 },
    visionScreen: {
      flex: 1, backgroundColor: C.bg, alignItems: 'center',
      justifyContent: 'center', padding: 28, gap: 18,
    },
    visionImage: { width: '100%', height: 240, borderRadius: 14 },
    visionStatement: { color: C.text, fontSize: 22, lineHeight: 30, textAlign: 'center' },
  });
}
