/**
 * Themes live in core so the phone and the desktop are never a shade apart, and
 * so a theme can restyle the *forest* as well as the interface -- each one
 * shifts the canopy hue, which is the part you actually stare at.
 */

export interface ThemeColors {
  bg: string;
  bg2: string;
  panel: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  /** Text drawn on top of the accent colour. */
  accentText: string;
  /** Accent at low opacity, for selected rows and glows. */
  accentSoft: string;
  amber: string;
  red: string;
  /** Hover / pressed wash. Differs by mode: light themes darken, dark lighten. */
  hover: string;
  inputBg: string;
  /** Empty part of a progress bar. */
  track: string;
}

export interface TreeColors {
  /** Degrees added to each species hue. This is what recolours the forest. */
  hueShift: number;
  saturation: number;
  lightness: number;
  barkHue: number;
  barkSat: number;
  /** Dark themes want darker bark; light themes want it to still read. */
  barkLightness: number;
  /** Degrees from the canopy hue to the blossom hue. */
  blossomShift: number;
  soil: string;
  /** Opacity of the halo behind the tree. */
  glow: number;
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
  tree: TreeColors;
}

const darkTree = (over: Partial<TreeColors> = {}): TreeColors => ({
  hueShift: 0, saturation: 1, lightness: 0,
  barkHue: 26, barkSat: 16, barkLightness: 0,
  blossomShift: 210, soil: 'rgba(0,0,0,0.35)', glow: 0.28,
  ...over,
});

const lightTree = (over: Partial<TreeColors> = {}): TreeColors => ({
  hueShift: 0, saturation: 1.05, lightness: -8,
  barkHue: 26, barkSat: 22, barkLightness: -4,
  blossomShift: 210, soil: 'rgba(0,0,0,0.13)', glow: 0.2,
  ...over,
});

export const THEMES: Theme[] = [
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Deep green, low light. The original.',
    mode: 'dark',
    colors: {
      bg: '#0d1512', bg2: '#121d19', panel: '#16231e',
      line: 'rgba(255,255,255,0.08)', text: '#e8f0ea', muted: '#8ea79a',
      accent: '#4fbf85', accentText: '#05130c', accentSoft: 'rgba(79,191,133,0.14)',
      amber: '#e0a350', red: '#d9705f',
      hover: 'rgba(255,255,255,0.06)', inputBg: '#0e1815', track: 'rgba(255,255,255,0.08)',
    },
    tree: darkTree(),
  },
  {
    id: 'ink',
    name: 'Ink',
    blurb: 'Near-black and violet. Nothing on screen but the work.',
    mode: 'dark',
    colors: {
      bg: '#0a0a0e', bg2: '#101017', panel: '#15151f',
      line: 'rgba(255,255,255,0.07)', text: '#ecebf4', muted: '#8a8799',
      accent: '#7c6cff', accentText: '#f6f4ff', accentSoft: 'rgba(124,108,255,0.16)',
      amber: '#e3a94f', red: '#ff6b6b',
      hover: 'rgba(255,255,255,0.05)', inputBg: '#0f0f16', track: 'rgba(255,255,255,0.08)',
    },
    // Cool foliage: the green band lands on cyan and blue instead.
    tree: darkTree({ hueShift: 92, saturation: 0.82, lightness: 5, barkHue: 250, barkSat: 10, blossomShift: 150, glow: 0.24 }),
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'Plum and coral. Colourful without shouting.',
    mode: 'dark',
    colors: {
      bg: '#13101c', bg2: '#1a1526', panel: '#1f192f',
      line: 'rgba(255,255,255,0.09)', text: '#f2ecff', muted: '#9a90b5',
      accent: '#ff7a8a', accentText: '#2a0f16', accentSoft: 'rgba(255,122,138,0.16)',
      amber: '#ffc16b', red: '#ff5f6d',
      hover: 'rgba(255,255,255,0.06)', inputBg: '#161122', track: 'rgba(255,255,255,0.09)',
    },
    tree: darkTree({ hueShift: 205, saturation: 0.9, lightness: 8, barkHue: 285, barkSat: 14, blossomShift: 120, glow: 0.3 }),
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Warm charcoal. The forest turns autumn.',
    mode: 'dark',
    colors: {
      bg: '#12100e', bg2: '#191512', panel: '#1e1a17',
      line: 'rgba(255,255,255,0.08)', text: '#f3ece4', muted: '#a29488',
      accent: '#ff8a3d', accentText: '#1a0d03', accentSoft: 'rgba(255,138,61,0.15)',
      amber: '#ffc04d', red: '#e5533d',
      hover: 'rgba(255,255,255,0.06)', inputBg: '#151210', track: 'rgba(255,255,255,0.08)',
    },
    tree: darkTree({ hueShift: -58, saturation: 1.1, lightness: 4, barkHue: 20, barkSat: 24, blossomShift: 300, glow: 0.3 }),
  },
  {
    id: 'paper',
    name: 'Paper',
    blurb: 'Warm white, one orange accent, nothing else.',
    mode: 'light',
    colors: {
      bg: '#faf8f4', bg2: '#f2efe7', panel: '#ffffff',
      line: 'rgba(0,0,0,0.10)', text: '#1b1a17', muted: '#78736a',
      accent: '#dd5c33', accentText: '#fffaf7', accentSoft: 'rgba(221,92,51,0.12)',
      amber: '#b57d20', red: '#c0392b',
      hover: 'rgba(0,0,0,0.05)', inputBg: '#ffffff', track: 'rgba(0,0,0,0.09)',
    },
    tree: lightTree(),
  },
  {
    id: 'sea',
    name: 'Sea',
    blurb: 'Cool daylight and teal. Easiest on a bright desk.',
    mode: 'light',
    colors: {
      bg: '#f4f8fa', bg2: '#e8f0f4', panel: '#ffffff',
      line: 'rgba(0,0,0,0.09)', text: '#0f232c', muted: '#68808e',
      accent: '#0f8a86', accentText: '#f2fffe', accentSoft: 'rgba(15,138,134,0.12)',
      amber: '#b3801f', red: '#c8503f',
      hover: 'rgba(0,0,0,0.045)', inputBg: '#ffffff', track: 'rgba(0,0,0,0.08)',
    },
    tree: lightTree({ hueShift: 42, saturation: 1.0, lightness: -6, barkHue: 200, barkSat: 12, blossomShift: 180 }),
  },
  {
    id: 'bloom',
    name: 'Bloom',
    blurb: 'Pale lilac and pink. Every tree flowers.',
    mode: 'light',
    colors: {
      bg: '#fdf7fb', bg2: '#f7ecf4', panel: '#ffffff',
      line: 'rgba(0,0,0,0.09)', text: '#241420', muted: '#8a7183',
      accent: '#cc3d88', accentText: '#fff5fa', accentSoft: 'rgba(204,61,136,0.12)',
      amber: '#b8792a', red: '#c8404a',
      hover: 'rgba(0,0,0,0.045)', inputBg: '#ffffff', track: 'rgba(0,0,0,0.08)',
    },
    tree: lightTree({ hueShift: 232, saturation: 0.95, lightness: -2, barkHue: 320, barkSat: 16, blossomShift: 60 }),
  },
];

export const DEFAULT_THEME_ID = 'forest';

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}
