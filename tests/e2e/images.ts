import { readFileSync } from 'node:fs';

let cached: string | null = null;

/** A real, decodable JPEG (one of the synthetic fixtures) as the "generated" preview. */
export function fakeJpegBase64(): string {
  cached ??= readFileSync('tests/fixtures/generated/blurry.jpg').toString('base64');
  return cached;
}

/** A buffer that starts like a JPEG and is far over the 15 MB limit. */
export function oversizedJpeg(): Buffer {
  const buffer = Buffer.alloc(16 * 1024 * 1024);
  buffer.set([0xff, 0xd8, 0xff, 0xe0]);
  return buffer;
}
