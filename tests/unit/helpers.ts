import type { Answers } from '../../shared/schema/answers.ts';

/** Minimal image headers: enough bytes for format and size detection. */

export function fakeJpeg(width: number, height: number, padding = 64): Uint8Array<ArrayBuffer> {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof, ...new Array(padding).fill(0), 0xff, 0xd9]);
}

export function fakePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    ...u32(width),
    ...u32(height),
    8,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

export function fakeWebpVp8x(width: number, height: number): Uint8Array<ArrayBuffer> {
  const u24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
  return Uint8Array.from([
    ...ascii('RIFF'),
    0,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...u24(width - 1),
    ...u24(height - 1),
    0,
    0,
  ]);
}

export const ANSWERS: Answers = {
  expression: 'all',
  texture: 'wavy',
  density: 'medium',
  considerations: ['cowlicks'],
  considerationsNote: '',
  currentLength: 'medium',
  maintenance: '5to10',
  aesthetics: ['natural', 'modern'],
  imageNote: '',
  tools: ['blowdryer'],
  routine: 'simple',
  goals: ['explore_fringe'],
  avoidNote: 'Nada de rapados al cero.',
  freeNote: '',
};

export const ORIGIN = 'https://app.folia.test';

export function analyzeForm(
  overrides: { frontal?: Blob | null; profile?: Blob | null; answers?: unknown; consent?: string | null; refinement?: string } = {},
) {
  const form = new FormData();
  const frontal = overrides.frontal === undefined ? new Blob([fakeJpeg(1200, 1500)], { type: 'image/jpeg' }) : overrides.frontal;
  const profile = overrides.profile === undefined ? new Blob([fakeJpeg(1200, 1500)], { type: 'image/jpeg' }) : overrides.profile;
  if (frontal) form.append('frontal', frontal, 'frontal.jpg');
  if (profile) form.append('profile', profile, 'perfil.jpg');
  form.append('answers', typeof overrides.answers === 'string' ? overrides.answers : JSON.stringify(overrides.answers ?? ANSWERS));
  if (overrides.consent !== null) form.append('consent', overrides.consent ?? 'accepted');
  form.append('refinement', overrides.refinement ?? '');
  return form;
}

export function post(path: string, body: FormData | string, headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(`https://api.folia.test/functions/v1/folia-analyze${path}`, { method: 'POST', body, headers });
}

export async function events(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
