import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@mission/core';

export const MEDIA_BUCKET = 'mission-media';

/**
 * Photo upload, so a picture added on the phone is there on the laptop.
 *
 * The bucket is public-read with random per-user paths: the alternative,
 * signed URLs, expire and would force every image in the app to resolve
 * asynchronously before it could be drawn. Writes are still locked to the
 * owner by policy -- see schema.sql. Anyone handed the exact URL can view that
 * one file, so this is the right place for a vision board and the wrong place
 * for anything you would not put in a shared album.
 */
export async function uploadMedia(
  client: SupabaseClient,
  userId: string,
  data: ArrayBuffer | Uint8Array | Blob,
  ext: string,
  contentType: string,
): Promise<string> {
  const path = `${userId}/${uid()}.${ext.replace(/^\./, '').toLowerCase()}`;
  const { error } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(path, data as Blob, { contentType, upsert: false });
  if (error) throw error;

  const { data: pub } = client.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/** Removes an uploaded file. Ignores anything that is not one of ours. */
export async function deleteMedia(client: SupabaseClient, url: string): Promise<void> {
  const path = storagePathOf(url);
  if (!path) return;
  await client.storage.from(MEDIA_BUCKET).remove([path]);
}

export function storagePathOf(url: string): string | null {
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/** Best-effort file extension and MIME type from a picked file's name or URI. */
export function guessType(nameOrUri: string): { ext: string; contentType: string } {
  const ext = (nameOrUri.split('?')[0]?.split('.').pop() ?? 'jpg').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', bmp: 'image/bmp',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  };
  return { ext, contentType: map[ext] ?? 'application/octet-stream' };
}
