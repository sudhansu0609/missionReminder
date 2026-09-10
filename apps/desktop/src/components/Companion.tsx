import React from 'react';
import { MOOD_LINE, type Mood } from '@mission/core';

const MOOD_COLOR: Record<Mood, string> = {
  thriving: '#8ff0b5',
  watching: '#9fd8ff',
  worried: '#ffc46b',
  grieving: '#8b8f96',
};

/**
 * A small light that lives in the tree. It is the fastest read in the whole
 * interface: you learn its colours in a day and after that you never need to
 * look at the health number.
 */
export function Companion({ mood, size = 74 }: { mood: Mood; size?: number }) {
  const color = MOOD_COLOR[mood];
  const speed = mood === 'worried' ? '0.9s' : mood === 'grieving' ? '4s' : '2.4s';

  return (
    <div className="companion" title={MOOD_LINE[mood]} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r="26" fill={color} opacity="0.14">
          <animate attributeName="r" values="24;30;24" dur={speed} repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="50" r="13" fill={color} opacity={mood === 'grieving' ? 0.4 : 0.95}>
          <animate attributeName="opacity"
                   values={mood === 'grieving' ? '0.3;0.45;0.3' : '0.75;1;0.75'}
                   dur={speed} repeatCount="indefinite" />
        </circle>
        {/* Eyes. They close when it is grieving. */}
        <circle cx="45" cy="47" r="2.2" fill="#0d1512" opacity={mood === 'grieving' ? 0 : 1} />
        <circle cx="55" cy="47" r="2.2" fill="#0d1512" opacity={mood === 'grieving' ? 0 : 1} />
        {mood === 'grieving' && (
          <>
            <path d="M42 47 L48 47" stroke="#0d1512" strokeWidth="2" strokeLinecap="round" />
            <path d="M52 47 L58 47" stroke="#0d1512" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        <path
          d={mood === 'worried' || mood === 'grieving' ? 'M44 58 Q50 53 56 58' : 'M44 55 Q50 60 56 55'}
          stroke="#0d1512" strokeWidth="2" fill="none" strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
