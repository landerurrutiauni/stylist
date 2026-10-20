import type { Confidence, FaceFeature, FaceShape, ImageIssue } from '../../shared/schema/analysis.ts';

export const featureLabels: Record<FaceFeature, string> = {
  contour: 'Contorno',
  forehead: 'Frente',
  cheekbones: 'Pómulos',
  cheeks: 'Mejillas',
  jaw: 'Mandíbula',
  chin: 'Mentón',
  hairline: 'Nacimiento del pelo',
  profile: 'Perfil',
  proportions: 'Proporciones',
};

export const shapeLabels: Record<FaceShape, string> = {
  oval: 'ovalada',
  round: 'redonda',
  square: 'cuadrada',
  rectangular: 'rectangular',
  oblong: 'alargada',
  heart: 'de corazón',
  diamond: 'de diamante',
  triangular: 'triangular',
  indeterminate: 'sin determinar',
};

export const confidenceLabels: Record<Confidence, string> = {
  high: 'confianza alta',
  medium: 'confianza media',
  low: 'confianza baja',
};

export const issueLabels: Record<ImageIssue, string> = {
  blurry: 'desenfocada',
  dark: 'oscura',
  overexposed: 'sobreexpuesta',
  cropped: 'recortada',
  no_face: 'sin una cara visible',
  multiple_people: 'con más de una persona',
  not_frontal: 'no está de frente',
  not_profile: 'no está de perfil',
  obstructed: 'con la cara tapada',
  filtered: 'con filtros',
  low_resolution: 'con poca resolución',
};
