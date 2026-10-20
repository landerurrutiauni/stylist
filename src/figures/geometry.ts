import type { FigureSpec } from '../../shared/catalog/styles.ts';

/**
 * Head-sheet geometry. A hairdresser plans a cut on a sheet with a blank head
 * seen from the front and in profile; FOLIA draws every catalogue cut the same
 * way, from a handful of parameters, so each recommendation has a picture that
 * really shows its silhouette.
 *
 * Both views share a 400 × 500 viewBox. The head is a neutral mannequin with
 * no features: the drawing is about the hair's shape, never about a person.
 */

export type View = 'front' | 'profile';
type Pt = [number, number];

export const VIEWBOX = { width: 400, height: 500 };

// --------------------------------------------------------------- path tools

const r = (n: number) => Math.round(n * 10) / 10;

/** Smooth path through points (Catmull-Rom converted to cubic Béziers). */
export function smooth(points: Pt[], closed = false, tension = 1): string {
  if (points.length < 2) return '';
  const pts = closed ? [points[points.length - 1]!, ...points, points[0]!, points[1]!] : [points[0]!, ...points, points[points.length - 1]!];
  let d = `M${r(pts[1]![0])},${r(pts[1]![1])}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2]!;
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${r(c1[0])},${r(c1[1])} ${r(c2[0])},${r(c2[1])} ${r(p2[0])},${r(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

/** Densifies a polyline so waves and curls can be spaced evenly along it. */
function resample(points: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const count = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < count; k++) out.push([x0 + ((x1 - x0) * k) / count, y0 + ((y1 - y0) * k) / count]);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Gentle waves along the outline of wavy hair. */
function wave(points: Pt[], seed: number): Pt[] {
  const dense = resample(points, 26);
  return dense.map((p, i) => {
    if (i === 0 || i === dense.length - 1) return p;
    const prev = dense[i - 1]!;
    const next = dense[i + 1]!;
    const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
    const nx = (next[1] - prev[1]) / len;
    const ny = -(next[0] - prev[0]) / len;
    const offset = 4 * Math.sin(i * 1.3 + seed);
    return [p[0] + nx * offset, p[1] + ny * offset];
  });
}

export interface Curl {
  cx: number;
  cy: number;
  r: number;
}

/** Round curls placed along an outline: their outer halves form the edge. */
function curlsAlong(points: Pt[], texture: FigureSpec['texture']): Curl[] {
  if (texture !== 'curly' && texture !== 'coily') return [];
  const radius = texture === 'curly' ? 9 : 6.5;
  return resample(points, radius * 1.45).map(([cx, cy], i) => ({ cx: r(cx), cy: r(cy), r: r(radius * (i % 3 === 1 ? 0.86 : 1)) }));
}

/** A deterministic jitter, so drawings are identical on every render. */
const jitter = (i: number, scale: number) => (((Math.sin(i * 12.9898) * 43758.5453) % 1) - 0.5) * scale;

const mirror = (points: Pt[]): Pt[] => points.map(([x, y]) => [400 - x, y] as Pt).reverse();

// ------------------------------------------------------------- mannequin

export const FRONT_HEAD = smooth(
  [
    [200, 116],
    [250, 126],
    [277, 166],
    [281, 218],
    [275, 268],
    [262, 309],
    [240, 345],
    [215, 367],
    [200, 371],
    [185, 367],
    [160, 345],
    [138, 309],
    [125, 268],
    [119, 218],
    [123, 166],
    [150, 126],
  ],
  true,
);

export const FRONT_EARS = [
  'M121,234 C108,230 103,248 105,262 C107,280 113,296 127,298 Z',
  'M279,234 C292,230 297,248 295,262 C293,280 287,296 273,298 Z',
];

export const FRONT_NECK =
  'M171,330 L170,410 C146,421 76,432 40,460 C26,472 19,486 17,500 L383,500 C381,486 374,472 360,460 C324,432 254,421 230,410 L229,330 Z';

/** Shadow under the jaw: the shaded face of the neck volume. */
export const FRONT_NECK_SHADE = 'M171,346 C186,372 214,372 229,346 L229,390 C214,404 186,404 171,390 Z';

export const PROFILE_HEAD =
  'M170,126 C206,104 266,106 296,140 C320,168 322,228 306,270 C296,296 286,312 280,322 C268,340 244,350 216,356 C196,362 176,366 160,358 C150,352 145,342 143,330 C141,322 138,318 137,312 C136,306 138,302 136,298 C134,292 132,286 132,282 C122,280 114,276 116,268 C122,256 132,242 139,230 C144,222 146,212 145,200 C143,170 150,142 170,126 Z';

export const PROFILE_EAR = 'M232,240 C246,232 262,240 262,258 C262,276 254,292 240,296 C232,298 228,290 230,282 C232,270 226,252 232,240 Z';

export const PROFILE_NECK =
  'M204,350 C207,372 206,392 202,412 C186,428 150,440 122,457 C106,469 98,484 96,500 L392,500 C392,479 383,459 366,443 C342,425 314,415 302,405 C292,382 285,352 281,318 Z';

/** Shadow under the jaw line, on the neck. */
export const PROFILE_NECK_SHADE = 'M204,352 C228,352 254,344 276,330 L284,368 C262,384 232,392 205,390 Z';

// ------------------------------------------------------------- hair

const FRONT_LENGTH_Y: Record<FigureSpec['length'], number> = {
  crown: 236,
  ear: 258,
  cheek: 292,
  jaw: 326,
  chin: 372,
  nape: 392,
  shoulder: 446,
  collarbone: 466,
  chest: 488,
  back: 496,
};

const SIDE_WIDTH: Record<FigureSpec['sides'], number> = {
  skin: 81,
  short: 84,
  close: 88,
  full: 97,
  wide: 112,
};

export interface FigureParts {
  /** The hair's outer silhouette. */
  hair: string;
  /** Round curls on the outline of curly and coily hair. */
  curls: Curl[];
  /** What stays visible through the hair: face, ears and neck. */
  window: string;
  /** Strand lines drawn on the hair, clipped to it. */
  strands: string[];
  /** The parting, drawn in the head's colour. */
  part: string | null;
  /** The cut line: where the scissors or the clipper set the shape. */
  cut: { d: string; label: string };
  head: string;
  ears: string[];
  neck: string;
  neckShade: string;
}

const LENGTH_WORDS: Record<FigureSpec['length'], string> = {
  crown: 'contorno',
  ear: 'a la oreja',
  cheek: 'al pómulo',
  jaw: 'a la mandíbula',
  chin: 'al mentón',
  nape: 'a la nuca',
  shoulder: 'a los hombros',
  collarbone: 'a la clavícula',
  chest: 'al pecho',
  back: 'a la espalda',
};

function frontParts(spec: FigureSpec): FigureParts {
  const crownY = 112 - spec.top * 92;
  const side = SIDE_WIDTH[spec.sides] + spec.top * (spec.sides === 'wide' ? 46 : 18);
  const endY = FRONT_LENGTH_Y[spec.length];
  const tucked = spec.swept === 'back';
  // Short sides: hair stops at the temple or over the ear. Hair combed back
  // with close sides reads the same from the front.
  const sideEnd = spec.sides === 'skin' || spec.sides === 'short' || (spec.sides === 'close' && (endY <= 260 || tucked));
  const dome = side - 6 + spec.top * 10;
  const curly = spec.texture === 'curly' || spec.texture === 'coily';

  const left: Pt[] = [
    [200, crownY],
    [200 - dome * 0.62, crownY + (150 - crownY) * 0.2],
    [200 - dome, 168 - spec.top * 12],
  ];
  if (sideEnd) {
    const stopY = spec.sides === 'skin' ? 226 : tucked ? 252 : 240;
    left.push([200 - side + 2, 206], [200 - side + 6, stopY], [200 - 70, stopY + 4]);
  } else {
    const flare = spec.layers === 'heavy' ? 10 : spec.layers === 'light' ? 4 : 0;
    // A rounded afro closes in under the ears; other wide shapes fall straight.
    const roundBase = spec.sides === 'wide' && spec.top > 0.6;
    const taper = roundBase ? 34 : spec.sides === 'wide' ? 0 : spec.layers === 'heavy' ? 14 : 4;
    left.push([200 - side - 2, 222], [200 - side, 270]);
    if (endY > 300) left.push([200 - side + taper * 0.4, Math.min(endY, 330)]);
    if (endY > 380) left.push([200 - side - flare + taper, Math.min(endY, 420)]);
    if (endY > 440) left.push([200 - side - flare + taper * 0.6, endY - 18]);
    left.push([200 - side + taper + (spec.layers === 'heavy' ? 12 : 4), endY]);
  }

  let leftSide = left;
  if (spec.asymmetric && !sideEnd) {
    const last = left[left.length - 1]!;
    leftSide = [...left.slice(0, -1), [last[0] - 4, last[1] + 34]];
  }
  const rightSide = mirror(left);
  const outlineLeft = spec.texture === 'wavy' ? [...wave(leftSide.slice(0, -1), 1), leftSide[leftSide.length - 1]!] : leftSide;
  const outlineRight = spec.texture === 'wavy' ? [rightSide[0]!, ...wave(rightSide.slice(1), 2)] : rightSide;
  const hair = `${smooth([...outlineLeft, ...outlineRight], false)} Z`;
  const curls = curly ? curlsAlong([...leftSide.slice(0, sideEnd ? -1 : undefined), ...rightSide.slice(sideEnd ? 1 : 0)], spec.texture) : [];

  // The face window: everything under the fringe and inside the side hair.
  const hairline = tucked || spec.fringe === 'up' ? 142 : 150;
  let fringe: Pt[];
  switch (spec.fringe) {
    case 'blunt':
      fringe = [
        [200, 206],
        [150, 206],
        [128, 214],
      ];
      break;
    case 'micro':
      fringe = [
        [200, 166],
        [150, 168],
        [126, 186],
      ];
      break;
    case 'curtain':
      fringe = [
        [200, 156],
        [176, 176],
        [150, 214],
        [134, 240],
      ];
      break;
    case 'side':
      fringe = [
        [262, 152],
        [200, 176],
        [146, 206],
        [128, 226],
      ];
      break;
    case 'textured':
      fringe = [
        [200, 184],
        [182, 177],
        [166, 189],
        [146, 181],
        [128, 196],
      ];
      break;
    default:
      fringe =
        spec.part === 'side'
          ? [
              [236, hairline - 2],
              [190, hairline + 2],
              [150, hairline + 10],
              [128, 180],
            ]
          : [
              [200, hairline],
              [160, hairline + 6],
              [134, 176],
            ];
  }

  const windowLeft: Pt[] = [...fringe];
  if (sideEnd) {
    // Temple, then a short sideburn in front of the ear, then out below the hair.
    windowLeft.push([200 - 64, 198], [200 - 67, 240], [200 - side - 26, 262], [56, 520]);
  } else if (tucked) {
    // Hair behind the ears: the face and the ears stay clear.
    windowLeft.push([200 - 66, 200], [200 - side + 6, 226], [200 - side + 8, 300], [200 - 40, 372], [200 - 30, 420], [200 - 26, 520]);
  } else {
    const cover = spec.sides === 'wide' ? 64 : spec.layers === 'heavy' ? 62 : 66;
    windowLeft.push([200 - cover - 4, 236], [200 - cover, 290], [200 - cover + 8, 330], [200 - 36, 372], [200 - 30, 420], [200 - 26, 520]);
  }
  const windowPts: Pt[] = spec.fringe === 'side' ? [...windowLeft, ...mirror(windowLeft.slice(1))] : [...windowLeft, ...mirror(windowLeft)];

  return {
    hair,
    curls,
    window: smooth(windowPts, true, 0.9),
    strands: frontStrands(spec, crownY, side, endY, sideEnd),
    part: partLine(spec, crownY),
    cut: frontCut(spec, side, endY, sideEnd),
    head: FRONT_HEAD,
    ears: FRONT_EARS,
    neck: FRONT_NECK,
    neckShade: FRONT_NECK_SHADE,
  };
}

function partLine(spec: FigureSpec, crownY: number): string | null {
  if (spec.part === 'none' || spec.texture === 'coily' || spec.texture === 'curly') return null;
  const x = spec.part === 'center' ? 200 : 236;
  const top = crownY + 26;
  return `M${x},${spec.fringe === 'curtain' ? 158 : 150} C${x + 1},${(150 + top) / 2} ${x - 1},${top + 8} ${x},${top}`;
}

function curlTexture(left: number, right: number, top: number, bottom: number, texture: FigureSpec['texture']): string[] {
  const coils: string[] = [];
  const radius = texture === 'coily' ? 3.4 : 5.6;
  const gap = texture === 'coily' ? 13 : 19;
  let i = 0;
  for (let y = top + gap * 0.6; y < bottom - 4; y += gap * 0.8) {
    const row = Math.round((y - top) / gap);
    for (let x = left + (row % 2) * gap * 0.5; x < right; x += gap) {
      i += 1;
      const cx = x + jitter(i, gap * 0.5);
      const cy = y + jitter(i + 7, gap * 0.4);
      const turn = (i % 4) * 90;
      coils.push(
        `M${r(cx + radius * Math.cos((turn * Math.PI) / 180))},${r(cy + radius * Math.sin((turn * Math.PI) / 180))} a${radius},${radius} 0 1 1 ${r(-radius * 1.6 * Math.cos((turn * Math.PI) / 180))},${r(-radius * 1.6 * Math.sin((turn * Math.PI) / 180))}`,
      );
    }
  }
  return coils;
}

function frontStrands(spec: FigureSpec, crownY: number, side: number, endY: number, sideEnd: boolean): string[] {
  if (spec.texture === 'braids') {
    const lines: string[] = [];
    for (let i = 0; i < 4; i++) {
      const x = 200 - side + 9 + i * 10;
      lines.push(braid(x, 196 + i * 4, endY - 6), braid(400 - x, 196 + i * 4, endY - 6));
    }
    for (let i = 0; i < 6; i++) lines.push(braid(150 + i * 20, crownY + 34, 150, true));
    return lines;
  }
  if (spec.texture === 'coily' || spec.texture === 'curly') {
    return curlTexture(200 - side, 200 + side, crownY, sideEnd ? 236 : Math.min(endY, 500), spec.texture);
  }
  // Straight and wavy: long strands following the fall from the parting.
  const origin = spec.part === 'side' ? 236 : 200;
  const strands: string[] = [];
  const wavy = spec.texture === 'wavy';
  const fall = sideEnd ? 210 : endY - 6;
  for (const offset of [26, 46, 66, 82]) {
    for (const dir of [-1, 1]) {
      const sx = origin + dir * (offset * 0.35);
      const sy = crownY + 22;
      const ex = 200 + dir * Math.min(side - 8, offset + 14);
      const ey = sideEnd ? 186 + offset * 0.4 : fall - (82 - offset) * 0.6;
      const mid1: Pt = [sx + dir * offset * 0.8, sy + (ey - sy) * 0.25];
      const mid2: Pt = [ex + (wavy ? dir * 8 : 0), sy + (ey - sy) * 0.6];
      strands.push(`M${r(sx)},${r(sy)} C${r(mid1[0])},${r(mid1[1])} ${r(mid2[0] - (wavy ? dir * 16 : 0))},${r(mid2[1])} ${r(ex)},${r(ey)}`);
    }
  }
  return strands;
}

/** A braid drawn as a column of chevrons; `short` draws only its root section. */
function braid(x: number, top: number, bottom: number, short = false): string {
  let d = '';
  const step = short ? 9 : 11;
  for (let y = top; y < bottom; y += step) d += `M${r(x - 4)},${r(y)} L${r(x)},${r(y + step * 0.6)} L${r(x + 4)},${r(y)} `;
  return d.trim();
}

function frontCut(spec: FigureSpec, side: number, endY: number, sideEnd: boolean) {
  if (sideEnd) {
    const y = spec.sides === 'skin' ? 222 : 236;
    const x = 200 - side + 4;
    return {
      d: `M${x - 8},${y - 26} L${x + 4},${y + 2} M${408 - x},${y - 26} L${396 - x},${y + 2}`,
      label: spec.sides === 'skin' ? 'degradado en laterales' : 'contorno sobre la oreja',
    };
  }
  const y = endY;
  const span = side + 18;
  return {
    d: `M${200 - span},${y} L${200 + span},${y} M${200 - span},${y - 7} L${200 - span},${y + 7} M${200 + span},${y - 7} L${200 + span},${y + 7}`,
    label: `línea de corte ${LENGTH_WORDS[spec.length]}`,
  };
}

// ------------------------------------------------------------- profile

const PROFILE_LENGTH_Y: Record<FigureSpec['length'], number> = {
  crown: 286,
  ear: 300,
  cheek: 318,
  jaw: 340,
  chin: 362,
  nape: 382,
  shoulder: 440,
  collarbone: 462,
  chest: 488,
  back: 496,
};

function profileParts(spec: FigureSpec): FigureParts {
  const lift = spec.top * 92;
  const crownY = 108 - lift;
  const endY = PROFILE_LENGTH_Y[spec.length];
  const short = spec.sides === 'skin' || spec.sides === 'short' || (spec.sides === 'close' && endY <= 300);
  const curly = spec.texture === 'curly' || spec.texture === 'coily';
  const backX = (spec.sides === 'wide' ? 330 : spec.sides === 'full' ? 320 : 312) + spec.top * (spec.sides === 'wide' ? 40 : 14);
  const frontX = 162 - spec.top * (curly ? 34 : 14) - (spec.fringe === 'up' ? spec.top * 30 : 0);

  const outline: Pt[] = [
    [frontX, 150 - spec.top * 20],
    [178 - spec.top * 10, crownY + 18],
    [232, crownY],
    [backX - 30, crownY + 26 + spec.top * 10],
    [backX, 196],
  ];
  if (short) {
    const napeY = spec.sides === 'skin' ? 262 : 290;
    outline.push([backX - 6, 246], [backX - 22, napeY], [270, napeY + 12]);
  } else {
    const layer = spec.layers === 'heavy' ? 12 : 0;
    outline.push([backX + 2, 262], [backX - 4 + layer, Math.min(endY, 330)]);
    if (endY > 380) outline.push([backX - 10 + layer, Math.min(endY - 10, 420)]);
    if (spec.napeLonger) outline.push([backX - 14, endY + 18]);
    outline.push([backX - 24, endY], [264 + (endY > 400 ? 6 : 0), endY - 6]);
  }
  const shaped = spec.texture === 'wavy' ? [...wave(outline.slice(0, -1), 3), outline[outline.length - 1]!] : outline;
  const last = shaped[shaped.length - 1]!;
  const hair = `${smooth(shaped, false)} L${r(last[0] - 60)},${r(Math.max(last[1], 330))} L${r(frontX + 40)},240 Z`;
  const curls = curly ? curlsAlong(outline.slice(0, -1), spec.texture) : [];

  // The window: the face, the ear when it shows, and the neck.
  const fringeTip: Pt =
    spec.fringe === 'blunt'
      ? [146, 206]
      : spec.fringe === 'curtain'
        ? [150, 214]
        : spec.fringe === 'side'
          ? [148, 200]
          : spec.fringe === 'textured'
            ? [150, 186]
            : spec.fringe === 'micro'
              ? [152, 168]
              : [160, 150];
  const window: Pt[] = [[60, 120], [fringeTip[0] - 30, fringeTip[1] - 30], fringeTip, [fringeTip[0] + 22, fringeTip[1] + 10], [198, 196]];
  if (short || spec.swept === 'back') {
    window.push([216, 238], [228, 230], [262, 242], [270, 280], [short ? 268 : 262, short ? 300 : 330], [250, 520]);
  } else {
    window.push([206, 236], [214, 300], [222, 340], [232, 400], [232, 520]);
  }
  window.push([40, 520]);

  return {
    hair,
    curls,
    window: smooth(window, true, 0.85),
    strands: profileStrands(spec, crownY, backX, endY, short),
    part: null,
    cut: profileCut(spec, backX, endY, short),
    head: PROFILE_HEAD,
    ears: [PROFILE_EAR],
    neck: PROFILE_NECK,
    neckShade: PROFILE_NECK_SHADE,
  };
}

function profileStrands(spec: FigureSpec, crownY: number, backX: number, endY: number, short: boolean): string[] {
  if (spec.texture === 'braids') {
    return [0, 1, 2, 3, 4, 5].map((i) => braid(244 + i * 13, 190 + i * 6, endY - 8));
  }
  if (spec.texture === 'coily' || spec.texture === 'curly') {
    return curlTexture(150, backX + 10, crownY, short ? 286 : Math.min(endY, 500), spec.texture);
  }
  const strands: string[] = [];
  const wavy = spec.texture === 'wavy';
  const sweepBack = spec.swept === 'back' || spec.fringe === 'up';
  for (let i = 0; i < 6; i++) {
    const sx = 180 + i * 12;
    const sy = crownY + 16 + i * 2;
    const ex = short ? 236 + i * 13 : 252 + i * 9;
    const ey = short ? 200 + i * 12 : endY - 14 - (5 - i) * 6;
    const c1: Pt = sweepBack ? [sx + 40, sy - 4] : [sx + 10, sy + 40];
    const c2: Pt = [ex + (wavy ? 18 : 6), ey - (ey - sy) * 0.35];
    strands.push(`M${r(sx)},${r(sy)} C${r(c1[0])},${r(c1[1])} ${r(c2[0])},${r(c2[1])} ${r(ex)},${r(ey)}`);
  }
  return strands;
}

function profileCut(spec: FigureSpec, backX: number, endY: number, short: boolean) {
  if (short) {
    const y = spec.sides === 'skin' ? 252 : 282;
    return {
      d: `M${backX - 30},${y + 6} L${backX + 12},${y - 10} M214,232 L226,262`,
      label: spec.sides === 'skin' ? 'degradado en nuca y patillas' : 'contorno de nuca',
    };
  }
  const y = Math.min(endY + (spec.napeLonger ? 18 : 0), 496);
  return {
    d: `M${backX - 54},${y + 4} L${backX + 16},${y - 4} M${backX - 54},${y - 4} L${backX - 54},${y + 12}`,
    label: `largo ${LENGTH_WORDS[spec.length]}`,
  };
}

export function buildFigure(spec: FigureSpec, view: View): FigureParts {
  return view === 'front' ? frontParts(spec) : profileParts(spec);
}
