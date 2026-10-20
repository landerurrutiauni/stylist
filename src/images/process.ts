import { detectFormat, IMAGE_LIMITS } from '../../shared/imageSniff.ts';
import { faceIssues, issuesFor, measure, toGray, type PhotoKind, type QualityIssue } from './quality.ts';

/**
 * Turns a picked or captured file into the photo FOLIA keeps in memory:
 * checked by its bytes, decoded with its EXIF orientation applied, resized to
 * at most 1600 px and re-encoded as JPEG. Re-encoding through a canvas drops
 * every piece of metadata (GPS position, camera, date).
 */

export interface ProcessedPhoto {
  blob: Blob;
  /** Object URL for previews; revoked when the photo is removed or the session ends. */
  url: string;
  width: number;
  height: number;
  issues: QualityIssue[];
  source: 'file' | 'camera';
  originalBytes: number;
}

export type PhotoErrorCode = 'empty' | 'too_large' | 'unsupported' | 'heic' | 'unreadable' | 'too_small';

export class PhotoError extends Error {
  constructor(
    public readonly code: PhotoErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MB = 1024 * 1024;

function isHeic(bytes: Uint8Array): boolean {
  const brand = String.fromCharCode(...bytes.subarray(4, 12));
  return brand.startsWith('ftyp') && /heic|heix|hevc|mif1|msf1|avif/.test(brand.slice(4));
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('unreadable', 'No hemos podido abrir la imagen. Puede estar dañada o incompleta.');
  }
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoError('unreadable', 'No hemos podido preparar la imagen.'))), 'image/jpeg', 0.9);
  });
}

interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}

async function detectFaces(bitmap: ImageBitmap): Promise<DetectedFace[] | null> {
  const Detector = (globalThis as { FaceDetector?: new (options: object) => { detect(source: ImageBitmap): Promise<DetectedFace[]> } }).FaceDetector;
  if (!Detector) return null;
  try {
    return await new Detector({ fastMode: true, maxDetectedFaces: 3 }).detect(bitmap);
  } catch {
    return null;
  }
}

export async function processPhoto(file: File, kind: PhotoKind, source: 'file' | 'camera'): Promise<ProcessedPhoto> {
  if (file.size === 0) throw new PhotoError('empty', 'El archivo está vacío.');
  if (file.size > IMAGE_LIMITS.maxInputBytes) {
    throw new PhotoError('too_large', `La imagen pesa ${(file.size / MB).toFixed(1)} MB y el máximo es ${IMAGE_LIMITS.maxInputBytes / MB} MB.`);
  }

  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (!detectFormat(head)) {
    if (isHeic(head)) {
      throw new PhotoError('heic', 'Es una foto HEIC. Elige JPEG, PNG o WebP; en iPhone puedes usar Ajustes › Cámara › Formatos › Más compatible.');
    }
    throw new PhotoError('unsupported', 'Ese archivo no es una imagen JPEG, PNG ni WebP.');
  }

  const bitmap = await decode(file);
  try {
    const { width, height } = bitmap;
    if (Math.min(width, height) < IMAGE_LIMITS.minShortSide) {
      throw new PhotoError(
        'too_small',
        `La imagen mide ${width} × ${height} px. Hace falta al menos ${IMAGE_LIMITS.minShortSide} px en el lado corto.`,
      );
    }

    const scale = Math.min(1, IMAGE_LIMITS.maxLongSide / Math.max(width, height));
    const outW = Math.round(width * scale);
    const outH = Math.round(height * scale);
    const canvas = canvasFor(outW, outH);
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('unreadable', 'Este navegador no permite preparar la imagen.');
    context.drawImage(bitmap, 0, 0, outW, outH);
    const blob = await toJpeg(canvas);

    // Pixel checks on a small copy.
    const small = Math.min(1, 192 / Math.max(outW, outH));
    const sw = Math.max(8, Math.round(outW * small));
    const sh = Math.max(8, Math.round(outH * small));
    const probe = canvasFor(sw, sh);
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    let issues: QualityIssue[] = [];
    if (probeContext) {
      probeContext.drawImage(canvas, 0, 0, sw, sh);
      const metrics = measure(toGray(probeContext.getImageData(0, 0, sw, sh).data), sw, sh);
      issues = issuesFor(metrics);
    }
    const faces = await detectFaces(bitmap);
    if (faces) {
      issues = issues.concat(
        faceIssues(
          kind,
          faces.map((face) => face.boundingBox),
          width,
          height,
        ),
      );
    }

    return { blob, url: URL.createObjectURL(blob), width: outW, height: outH, issues, source, originalBytes: file.size };
  } finally {
    bitmap.close();
  }
}

export function releasePhoto(photo: ProcessedPhoto | null | undefined) {
  if (photo) URL.revokeObjectURL(photo.url);
}
