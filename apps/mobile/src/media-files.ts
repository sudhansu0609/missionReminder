import { Directory, File, Paths } from 'expo-file-system';
import { uid } from '@mission/core';

/** Somewhere the OS will not clear out from under us, unlike the cache. */
const mediaDir = () => new Directory(Paths.document, 'media');

/**
 * Pictures come out of the picker in a cache directory that the OS is free to
 * empty. Anything we intend to keep gets copied somewhere permanent first.
 */
export async function keepLocally(uri: string): Promise<string> {
  const dir = mediaDir();
  dir.create({ intermediates: true, idempotent: true });

  const ext = uri.split('?')[0]?.split('.').pop() ?? 'jpg';
  const dest = new File(dir, `${uid()}.${ext}`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
