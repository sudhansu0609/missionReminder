import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Mood } from '@mission/core';

const MOOD_COLOR: Record<Mood, string> = {
  thriving: '#8ff0b5',
  watching: '#9fd8ff',
  worried: '#ffc46b',
  grieving: '#8b8f96',
};

/** The small light in the tree. Same read as the desktop version. */
export function Companion({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const color = MOOD_COLOR[mood];
  const sad = mood === 'worried' || mood === 'grieving';

  return (
    <View style={{ width: size, height: size }}>
      <Svg viewBox="0 0 100 100" width={size} height={size}>
        <Circle cx="50" cy="50" r="27" fill={color} opacity={0.14} />
        <Circle cx="50" cy="50" r="13" fill={color} opacity={mood === 'grieving' ? 0.45 : 0.95} />
        {mood === 'grieving' ? (
          <>
            <Path d="M42 47 L48 47" stroke="#0d1512" strokeWidth={2} strokeLinecap="round" />
            <Path d="M52 47 L58 47" stroke="#0d1512" strokeWidth={2} strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx="45" cy="47" r={2.2} fill="#0d1512" />
            <Circle cx="55" cy="47" r={2.2} fill="#0d1512" />
          </>
        )}
        <Path
          d={sad ? 'M44 58 Q50 53 56 58' : 'M44 55 Q50 60 56 55'}
          stroke="#0d1512" strokeWidth={2} fill="none" strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
