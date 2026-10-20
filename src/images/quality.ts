/**
 * Quick checks on a photo's pixels, run in the browser before anything is
 * sent. They catch the obvious problems (too dark, washed out, blurred) so the
 * person can retake the photo straight away; the model makes the final call
 * on whether a face can be read.
 */

export type PhotoKind = 'frontal' | 'profile';

export type IssueCode = 'dark' | 'bright' | 'blurry' | 'flat' | 'no_face' | 'many_faces' | 'cropped';

export interface QualityIssue {
  code: IssueCode;
  /** `block` stops the photo from being used; `warning` lets the person decide. */
  severity: 'block' | 'warning';
  message: string;
}

export interface QualityMetrics {
  /** Mean luminance, 0–255. */
  mean: number;
  /** Standard deviation of luminance: global contrast. */
  contrast: number;
  /** Variance of the Laplacian on the downscaled image: edge sharpness. */
  sharpness: number;
}

/** Luminance of RGBA pixels as a grey array. */
export function toGray(rgba: Uint8ClampedArray): Float32Array {
  const gray = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    gray[j] = 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  }
  return gray;
}

export function measure(gray: Float32Array, width: number, height: number): QualityMetrics {
  let sum = 0;
  for (const value of gray) sum += value;
  const mean = sum / gray.length;
  let squares = 0;
  for (const value of gray) squares += (value - mean) ** 2;
  const contrast = Math.sqrt(squares / gray.length);

  let lapSum = 0;
  let lapSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      lapSum += lap;
      lapSquares += lap * lap;
      count += 1;
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const sharpness = count ? lapSquares / count - lapMean * lapMean : 0;
  return { mean, contrast, sharpness };
}

/** Thresholds, calibrated on photos downscaled to at most 192 px. */
export const THRESHOLDS = {
  blockDark: 30,
  warnDark: 62,
  warnBright: 222,
  blockBright: 246,
  warnFlat: 20,
  warnBlurry: 18,
} as const;

export function issuesFor(metrics: QualityMetrics): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (metrics.mean < THRESHOLDS.blockDark) {
    issues.push({
      code: 'dark',
      severity: 'block',
      message: 'Está tan oscura que no se distingue el contorno de la cara. Busca una luz frontal o junto a una ventana.',
    });
  } else if (metrics.mean < THRESHOLDS.warnDark) {
    issues.push({ code: 'dark', severity: 'warning', message: 'Parece oscura. Con más luz se verán mejor la mandíbula y el nacimiento del pelo.' });
  }
  if (metrics.mean > THRESHOLDS.blockBright) {
    issues.push({ code: 'bright', severity: 'block', message: 'Está sobreexpuesta: la luz borra los rasgos. Aléjate de la luz directa.' });
  } else if (metrics.mean > THRESHOLDS.warnBright) {
    issues.push({ code: 'bright', severity: 'warning', message: 'Parece muy clara. Evita la luz directa sobre la cara.' });
  }
  if (metrics.contrast < THRESHOLDS.warnFlat && metrics.mean >= THRESHOLDS.blockDark && metrics.mean <= THRESHOLDS.blockBright) {
    issues.push({
      code: 'flat',
      severity: 'warning',
      message: 'Tiene muy poco contraste: cuesta separar la cara del fondo. Prueba con un fondo liso de otro tono.',
    });
  }
  if (metrics.sharpness < THRESHOLDS.warnBlurry) {
    issues.push({ code: 'blurry', severity: 'warning', message: 'Parece desenfocada o movida. Apoya el móvil o pide ayuda para hacerla.' });
  }
  return issues;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Issues from a face detector, when the browser has one (Shape Detection API). */
export function faceIssues(kind: PhotoKind, faces: Box[], width: number, height: number): QualityIssue[] {
  if (faces.length > 1) {
    return [{ code: 'many_faces', severity: 'warning', message: 'Parece que hay más de una persona. Usa una foto en la que solo aparezcas tú.' }];
  }
  if (faces.length === 0) {
    // Detectors are trained on frontal faces: a profile without a hit is normal.
    return kind === 'frontal'
      ? [
          {
            code: 'no_face',
            severity: 'warning',
            message: 'No hemos detectado una cara de frente. Comprueba que se ve entera y mirando a la cámara.',
          },
        ]
      : [];
  }
  const face = faces[0]!;
  const margin = Math.min(width, height) * 0.02;
  const touches = face.x <= margin || face.y <= margin || face.x + face.width >= width - margin || face.y + face.height >= height - margin;
  return touches
    ? [{ code: 'cropped', severity: 'warning', message: 'La cara toca el borde de la foto. Deja algo de espacio alrededor de la cabeza.' }]
    : [];
}
