import { getTheme, type TreeColors } from './themes.js';
import { clamp, lerp, rng } from './util.js';

/**
 * Tree geometry, generated once per (species, seed) and then *revealed* by the
 * growth value. Every segment carries the slice of the 0..1 session timeline
 * during which it extends, so the renderer animates growth by doing nothing
 * more than passing a bigger number. Deterministic: the same session draws the
 * same tree on the phone and on the desktop.
 */

export interface Segment {
  x1: number; y1: number; x2: number; y2: number;
  w1: number; w2: number;
  depth: number;
  /** Growth value at which this segment starts extending. */
  appearAt: number;
  /** Growth span over which it extends from nothing to full length. */
  span: number;
}

export interface Leaf {
  x: number; y: number;
  r: number;
  /** Rotation in degrees, for renderers that draw leaf shapes. */
  angle: number;
  appearAt: number;
  /** 0..1 position along the palette, so a canopy is not one flat colour. */
  tone: number;
  blossom: boolean;
}

export interface TreeShape {
  segments: Segment[];
  leaves: Leaf[];
  /** Canvas the coordinates live in. Ground line is at y = height. */
  width: number;
  height: number;
}

export interface SpeciesTraits {
  name: string;
  spread: number;      // radians between sibling branches
  branches: number;    // children per node
  maxDepth: number;
  decay: number;       // length falloff per level
  lean: number;        // radians of trunk tilt
  leafSize: number;
  hue: number;         // base canopy hue
  blossoms: boolean;
}

const SPECIES_NAMES = [
  'Oak', 'Cedar', 'Birch', 'Maple', 'Willow', 'Pine', 'Ash', 'Rowan',
  'Alder', 'Juniper', 'Elm', 'Aspen',
];

/** Derives stable visual traits from a goal's species number. */
export function speciesTraits(species: number): SpeciesTraits {
  const r = rng(species * 7919 + 13);
  const idx = species % SPECIES_NAMES.length;
  return {
    name: SPECIES_NAMES[idx] ?? 'Oak',
    spread: lerp(0.45, 1.05, r()),
    branches: r() > 0.62 ? 3 : 2,
    maxDepth: 5 + (r() > 0.5 ? 1 : 0),
    decay: lerp(0.68, 0.8, r()),
    lean: lerp(-0.12, 0.12, r()),
    leafSize: lerp(2.4, 4.2, r()),
    hue: lerp(88, 150, r()),
    blossoms: r() > 0.65,
  };
}

const WIDTH = 200;
const HEIGHT = 260;

/**
 * Fraction of the session spent growing wood. The remainder fills the canopy,
 * which is the part that looks like a reward -- so the last stretch of a block,
 * the stretch you are most likely to bail on, is the one that visibly pays.
 */
const WOOD_PHASE = 0.6;

/**
 * When each depth level starts extending. The exponent front-loads the trunk:
 * a few seconds in you already have a sprout rather than a bare patch of soil.
 */
function levelSchedule(maxDepth: number): number[] {
  const levels = maxDepth + 1;
  return Array.from({ length: levels + 1 }, (_, d) =>
    Math.pow(d / levels, 1.25) * WOOD_PHASE);
}

export function buildTree(species: number, seed: number): TreeShape {
  const t = speciesTraits(species);
  const rand = rng(seed * 2654435761 + species);
  const schedule = levelSchedule(t.maxDepth);
  const segments: Segment[] = [];
  const leaves: Leaf[] = [];

  const jitter = (amount: number) => (rand() - 0.5) * 2 * amount;

  const grow = (
    x: number, y: number,
    angle: number, length: number, width: number,
    depth: number,
  ) => {
    const appearAt = schedule[depth] ?? 0;
    const span = Math.max((schedule[depth + 1] ?? WOOD_PHASE) - appearAt, 0.004);
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    const endWidth = width * 0.72;

    segments.push({ x1: x, y1: y, x2, y2, w1: width, w2: endWidth, depth, appearAt, span });

    if (depth >= t.maxDepth) {
      // Terminal twig: a cluster of leaves that opens over the canopy phase.
      const count = 3 + Math.floor(rand() * 3);
      const clusterAt = WOOD_PHASE + rand() * 0.22;
      for (let i = 0; i < count; i++) {
        leaves.push({
          x: x2 + jitter(6),
          y: y2 + jitter(6),
          r: t.leafSize * lerp(0.75, 1.25, rand()),
          angle: (angle * 180) / Math.PI + jitter(40),
          appearAt: Math.min(clusterAt + (i / count) * 0.14 + rand() * 0.04, 0.995),
          tone: rand(),
          blossom: t.blossoms && rand() > 0.86,
        });
      }
      return;
    }

    for (let i = 0; i < t.branches; i++) {
      const offset = (i - (t.branches - 1) / 2) * t.spread + jitter(0.18);
      grow(
        x2, y2,
        angle + offset,
        length * t.decay * lerp(0.9, 1.1, rand()),
        endWidth,
        depth + 1,
      );
    }
  };

  grow(WIDTH / 2, HEIGHT, -Math.PI / 2 + t.lean, HEIGHT * 0.26, 13, 0);

  return { segments, leaves, width: WIDTH, height: HEIGHT };
}

/** How far a segment has extended at the current growth. 0 = hidden. */
export function segmentProgress(s: Segment, growth: number): number {
  return clamp((growth - s.appearAt) / s.span);
}

/** Endpoint of a partially grown segment, for drawing mid-extension. */
export function segmentEnd(s: Segment, growth: number): { x: number; y: number } {
  const p = segmentProgress(s, growth);
  return { x: lerp(s.x1, s.x2, p), y: lerp(s.y1, s.y2, p) };
}

/** Leaves scale in rather than popping. Returns 0..1. */
export function leafProgress(l: Leaf, growth: number): number {
  return clamp((growth - l.appearAt) / 0.05);
}

export type StageName =
  | 'seed' | 'sprout' | 'sapling' | 'young' | 'mature' | 'flowering' | 'ancient';

const STAGES: { at: number; name: StageName; label: string }[] = [
  { at: 0.0, name: 'seed', label: 'Seed in the soil' },
  { at: 0.08, name: 'sprout', label: 'Breaking ground' },
  { at: 0.25, name: 'sapling', label: 'Sapling' },
  { at: 0.45, name: 'young', label: 'Taking shape' },
  { at: 0.7, name: 'mature', label: 'Full canopy' },
  { at: 0.9, name: 'flowering', label: 'In bloom' },
  { at: 1.0, name: 'ancient', label: 'Rooted for good' },
];

export function stageOf(growth: number): { name: StageName; label: string } {
  let out = STAGES[0]!;
  for (const s of STAGES) if (growth >= s.at) out = s;
  return { name: out.name, label: out.label };
}

/** Shortest way round the colour wheel, so wilting never sweeps through green. */
function lerpHue(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

const DEFAULT_TREE = getTheme(undefined).tree;

/**
 * Canopy colour as a function of health, tinted by the active theme. Full
 * health is the species hue shifted into the theme's band; a wilting tree
 * desaturates and slides toward brown before it dies.
 */
export function canopyColor(
  hue: number, health: number, tone: number, tree: TreeColors = DEFAULT_TREE,
): string {
  const base = (hue + tree.hueShift + 360) % 360;
  const h = lerpHue(28, base, health);
  const s = clamp((lerp(26, 52, health) + tone * 10) * tree.saturation, 0, 100);
  const l = clamp(lerp(24, 38, health) + tone * 12 + tree.lightness, 4, 92);
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

export function barkColor(health: number, tree: TreeColors = DEFAULT_TREE): string {
  const l = clamp(lerp(18, 30, health) + tree.barkLightness, 4, 92);
  const s = clamp(lerp(8, tree.barkSat, health), 0, 100);
  return `hsl(${tree.barkHue.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

/** Blossoms sit a fixed distance from the canopy hue, so they always contrast. */
export function blossomColor(hue: number, tree: TreeColors = DEFAULT_TREE): string {
  const h = (hue + tree.hueShift + tree.blossomShift + 720) % 360;
  const l = clamp(72 + tree.lightness * 0.5, 40, 88);
  return `hsl(${h.toFixed(0)} 62% ${l.toFixed(0)}%)`;
}
