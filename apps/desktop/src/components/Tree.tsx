import React, { useMemo } from 'react';
import {
  barkColor, blossomColor, buildTree, canopyColor, leafProgress, segmentEnd,
  segmentProgress, speciesTraits,
} from '@mission/core';
import { useStore } from '../store';

interface Props {
  species: number;
  seed: number;
  /** 0..1. Drives how much of the tree is drawn. */
  growth: number;
  /** 0..1. Drives colour and droop. */
  health: number;
  height?: number;
  dead?: boolean;
}

/**
 * Draws the shape the core module generated. All of the interesting decisions
 * live in core/tree.ts -- this file only turns numbers into SVG, which is what
 * lets the phone render the identical tree from the identical session row.
 */
export function Tree({ species, seed, growth, health, height = 260, dead = false }: Props) {
  const { theme } = useStore();
  const tp = theme.tree;
  const shape = useMemo(() => buildTree(species, seed), [species, seed]);
  const traits = useMemo(() => speciesTraits(species), [species]);
  const h = dead ? 0 : health;
  const bark = barkColor(h, tp);
  const glowHue = (traits.hue + tp.hueShift + 360) % 360;

  const visibleSegments = shape.segments.filter((s) => growth > s.appearAt);
  const visibleLeaves = shape.leaves.filter((l) => growth > l.appearAt && h > 0.05);

  return (
    <svg
      viewBox={`0 0 ${shape.width} ${shape.height + 14}`}
      height={height}
      style={{ overflow: 'visible', display: 'block' }}
      aria-label={`Tree at ${Math.round(growth * 100)}% growth`}
    >
      <defs>
        <radialGradient id={`glow-${seed}`} cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor={`hsl(${glowHue} 60% 45% / ${tp.glow * h})`} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <ellipse cx={shape.width / 2} cy={shape.height * 0.55} rx={92} ry={86}
               fill={`url(#glow-${seed})`} />

      {/* Soil line, so a seed still reads as "planted" rather than "empty". */}
      <ellipse cx={shape.width / 2} cy={shape.height + 4} rx={54 * (0.4 + growth * 0.6)} ry={7}
               fill={tp.soil} />
      <line x1={shape.width / 2 - 62} y1={shape.height + 4} x2={shape.width / 2 + 62}
            y2={shape.height + 4} stroke="var(--line)" strokeWidth={1.5} />

      {visibleSegments.map((s, i) => {
        const end = segmentEnd(s, growth);
        const p = segmentProgress(s, growth);
        return (
          <line
            key={i}
            x1={s.x1} y1={s.y1} x2={end.x} y2={end.y}
            stroke={bark}
            strokeWidth={Math.max(s.w1 * (1 - p * 0.28), 0.8)}
            strokeLinecap="round"
            opacity={dead ? 0.55 : 1}
          />
        );
      })}

      {visibleLeaves.map((l, i) => {
        const p = leafProgress(l, growth);
        if (p <= 0) return null;
        // A wilting canopy sags: leaves slide down as health falls.
        const droop = (1 - h) * 6;
        return (
          <ellipse
            key={i}
            cx={l.x}
            cy={l.y + droop}
            rx={l.r * p * (l.blossom ? 0.8 : 1)}
            ry={l.r * p * 0.72}
            transform={`rotate(${l.angle} ${l.x} ${l.y + droop})`}
            fill={l.blossom && h > 0.6
              ? blossomColor(traits.hue, tp)
              : canopyColor(traits.hue, h, l.tone, tp)}
            opacity={dead ? 0.35 : 0.92}
          />
        );
      })}
    </svg>
  );
}
