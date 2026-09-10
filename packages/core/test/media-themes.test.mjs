// Behaviour tests for link parsing and the theme palettes.
// Plain Node, no framework: run `npm test` from the repo root after a build.
import {
  parseMediaUrl, makeMedia, isPortable, mediaLabel, sortMedia,
  THEMES, getTheme, canopyColor, barkColor, blossomColor, DEFAULT_THEME_ID,
  seedState,
} from '../dist/index.js';

const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};

// --- media links ---------------------------------------------------------
const yt = parseMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
ok('youtube watch links resolve to a thumbnail',
   yt.kind === 'video' && yt.thumbnailUrl?.includes('dQw4w9WgXcQ'), yt.thumbnailUrl);
ok('youtu.be short links resolve the same',
   parseMediaUrl('https://youtu.be/dQw4w9WgXcQ').thumbnailUrl === yt.thumbnailUrl);
ok('youtube shorts resolve',
   parseMediaUrl('https://youtube.com/shorts/dQw4w9WgXcQ').embedUrl?.includes('embed'));
ok('vimeo resolves',
   parseMediaUrl('https://vimeo.com/123456789').embedUrl
     === 'https://player.vimeo.com/video/123456789');
ok('image urls are images, case and query ignored',
   parseMediaUrl('https://example.com/a/photo.JPG?w=800').kind === 'image');
ok('a direct mp4 is a video',
   parseMediaUrl('https://example.com/clip.mp4').kind === 'video');
ok('phone photos are images',
   parseMediaUrl('file:///var/mobile/x.heic').provider === 'file');
ok('desktop copies are images',
   parseMediaUrl('mission-media://abc.png').provider === 'file');
ok('anything else is a plain link',
   parseMediaUrl('https://example.com/some/page').kind === 'link');
ok('makeMedia classifies on the way in',
   makeMedia('https://youtu.be/dQw4w9WgXcQ', 0).kind === 'video');
ok('only http urls travel between devices',
   isPortable('https://x.com/a.jpg') && !isPortable('file:///tmp/a.jpg'));
ok('link labels are readable',
   mediaLabel({ id: 'm', kind: 'link', url: 'https://www.example.com/plan', order: 0 })
     === 'example.com/plan');
ok('captions win over urls',
   mediaLabel({ id: 'm', kind: 'link', url: 'https://x.com', caption: 'The studio', order: 0 })
     === 'The studio');
ok('media sorts by order',
   sortMedia([{ id: 'b', order: 2 }, { id: 'a', order: 1 }]).map((m) => m.id).join('') === 'ab');
ok('missing media is not a crash', sortMedia(undefined).length === 0);

// --- themes --------------------------------------------------------------
ok('there are several themes', THEMES.length >= 6, `${THEMES.length} themes`);
ok('theme ids are unique', new Set(THEMES.map((t) => t.id)).size === THEMES.length);
ok('both light and dark are offered',
   THEMES.some((t) => t.mode === 'light') && THEMES.some((t) => t.mode === 'dark'));
ok('every theme defines every colour',
   THEMES.every((t) => Object.values(t.colors)
     .every((v) => typeof v === 'string' && v.length > 0)));
ok('an unknown id falls back', getTheme('nope').id === DEFAULT_THEME_ID);
ok('the seeded state picks a real theme',
   getTheme(seedState().settings.themeId).id === seedState().settings.themeId);

const canopies = THEMES.map((t) => canopyColor(120, 1, 0.5, t.tree));
ok('each theme recolours the canopy', new Set(canopies).size >= 5, canopies.join(' '));
ok('bark and blossom follow the theme too',
   new Set(THEMES.map((t) => barkColor(1, t.tree))).size >= 4 &&
   new Set(THEMES.map((t) => blossomColor(120, t.tree))).size >= 4);

const hueOf = (color) => Number(/hsl\((\d+)/.exec(color)[1]);
ok('a dying tree goes brown in every theme',
   THEMES.every((t) => {
     const h = hueOf(canopyColor(120, 0, 0.5, t.tree));
     return h >= 20 && h <= 40;
   }),
   THEMES.map((t) => hueOf(canopyColor(120, 0, 0.5, t.tree))).join(' '));

ok('wilting never sweeps the long way round the wheel',
   THEMES.every((t) => {
     // Half-dead should sit between the live hue and brown, not across the wheel.
     const live = hueOf(canopyColor(120, 1, 0.5, t.tree));
     const half = hueOf(canopyColor(120, 0.5, 0.5, t.tree));
     const gap = Math.abs(((half - live + 540) % 360) - 180);
     return gap <= 90;
   }));

ok('colours stay inside legal hsl ranges',
   THEMES.every((t) => [0, 0.5, 1].every((h) => {
     const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(canopyColor(300, h, 1, t.tree));
     return m && +m[1] <= 360 && +m[2] <= 100 && +m[3] <= 100;
   })));

ok('bark stays visible on light themes',
   THEMES.filter((t) => t.mode === 'light')
     .every((t) => Number(/(\d+)%\)$/.exec(barkColor(1, t.tree))[1]) < 45));
