import React, { useMemo } from 'react';
import Svg, { Ellipse, Line } from 'react-native-svg';
import {
  barkColor, blossomColor, buildTree, canopyColor, leafProgress, segmentEnd,
  segmentProgress, speciesTraits,
} from '@mission/core';
import { useTheme } from '../theme';

interface Props {
  species: number;
  seed: number;
  growth: number;
  health: number;
  height?: number;
  dead?: boolean;
}

/**
 * The same tree as the desktop, drawn with react-native-svg. Geometry comes
 * from @mission/core, so a session synced from the laptop renders here as the
 * identical plant -- same species, same branches, same lean.
 */
export function Tree({ species, seed, growth, health, height = 240, dead = false }: Props) {
  const { theme } = useTheme();
  const tp = theme.tree;
  const shape = useMemo(() => buildTree(species, seed), [species, seed]);
  const traits = useMemo(() => speciesTraits(species), [species]);
  const h = dead ? 0 : health;
  const bark = barkColor(h, tp);
  const width = (shape.width / (shape.height + 14)) * height;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${shape.width} ${shape.height + 14}`}>
      <Ellipse
        cx={shape.width / 2} cy={shape.height + 4}
        rx={54 * (0.4 + growth * 0.6)} ry={7}
        fill={tp.soil}
      />

      {shape.segments
        .filter((s) => growth > s.appearAt)
        .map((s, i) => {
          const end = segmentEnd(s, growth);
          const p = segmentProgress(s, growth);
          return (
            <Line
              key={`s${i}`}
              x1={s.x1} y1={s.y1} x2={end.x} y2={end.y}
              stroke={bark}
              strokeWidth={Math.max(s.w1 * (1 - p * 0.28), 0.8)}
              strokeLinecap="round"
              opacity={dead ? 0.55 : 1}
            />
          );
        })}

      {h > 0.05 && shape.leaves
        .filter((l) => growth > l.appearAt)
        .map((l, i) => {
          const p = leafProgress(l, growth);
          if (p <= 0) return null;
          const droop = (1 - h) * 6;
          return (
            <Ellipse
              key={`l${i}`}
              cx={l.x} cy={l.y + droop}
              rx={l.r * p * (l.blossom ? 0.8 : 1)}
              ry={l.r * p * 0.72}
              origin={`${l.x}, ${l.y + droop}`}
              rotation={l.angle}
              fill={l.blossom && h > 0.6
                ? toRnHsl(blossomColor(traits.hue, tp))
                : toRnHsl(canopyColor(traits.hue, h, l.tone, tp))}
              opacity={dead ? 0.35 : 0.92}
            />
          );
        })}
    </Svg>
  );
}

/**
 * react-native-svg wants comma-separated hsl(), not the space-separated CSS
 * Color 4 form core emits.
 */
function toRnHsl(color: string): string {
  return color.replace(/hsl\((\S+) (\S+) (\S+)\)/, 'hsl($1, $2, $3)');
}
