import type { Media, MediaKind } from './types.js';
import { uid } from './util.js';

/**
 * Link handling. Pasting a YouTube URL should do something better than storing
 * a blue string, so this pulls out the video id and derives a thumbnail -- which
 * means video reminders work with no API key, no embed script and no upload.
 */

export interface ParsedMedia {
  kind: MediaKind;
  provider: 'youtube' | 'vimeo' | 'image' | 'file' | 'web';
  /** Best-effort still image for the card. */
  thumbnailUrl?: string;
  /** Where to send the viewer when they tap it. */
  openUrl: string;
  /** Player URL, for hosts that allow embedding. */
  embedUrl?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

function youtubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  return m?.[1] ?? null;
}

export function parseMediaUrl(url: string): ParsedMedia {
  const trimmed = url.trim();

  const yt = youtubeId(trimmed);
  if (yt) {
    return {
      kind: 'video',
      provider: 'youtube',
      thumbnailUrl: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      openUrl: `https://www.youtube.com/watch?v=${yt}`,
      embedUrl: `https://www.youtube.com/embed/${yt}`,
    };
  }

  const vm = vimeoId(trimmed);
  if (vm) {
    return {
      kind: 'video',
      provider: 'vimeo',
      openUrl: `https://vimeo.com/${vm}`,
      embedUrl: `https://player.vimeo.com/video/${vm}`,
    };
  }

  if (VIDEO_EXT.test(trimmed)) {
    return { kind: 'video', provider: 'web', openUrl: trimmed, embedUrl: trimmed };
  }

  // Local files from the photo picker, and anything that looks like a picture.
  const isLocal = /^(file:|mission-media:|content:|ph:|assets-library:)/i.test(trimmed);
  if (IMAGE_EXT.test(trimmed) || isLocal) {
    return {
      kind: 'image',
      provider: isLocal ? 'file' : 'image',
      thumbnailUrl: trimmed,
      openUrl: trimmed,
    };
  }

  return { kind: 'link', provider: 'web', openUrl: trimmed };
}

/** Builds a Media row from a pasted or picked URL, classifying it on the way in. */
export function makeMedia(url: string, order: number, caption?: string): Media {
  return { id: uid('med'), kind: parseMediaUrl(url).kind, url: url.trim(), order, caption };
}

/** True when the URL will still resolve on another device. */
export function isPortable(url: string): boolean {
  return /^https?:/i.test(url.trim());
}

export function sortMedia(list: Media[] | undefined): Media[] {
  return [...(list ?? [])].sort((a, b) => a.order - b.order);
}

/** Nice short label for a link card that has no picture to show. */
export function mediaLabel(media: Media): string {
  if (media.caption) return media.caption;
  try {
    const u = new URL(media.url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return media.url.replace(/^\w+:\/\//, '').slice(0, 40);
  }
}
