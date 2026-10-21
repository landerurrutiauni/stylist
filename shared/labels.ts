import type { Aesthetic, Consideration, CurrentLength, Density, Expression, Goal, Maintenance, Routine, Texture, Tool } from './schema/answers.ts';

/** Spanish (Spain) wording for every questionnaire value. Used by the UI and the prompt. */

export const expressionLabels: Record<Expression, { label: string; hint: string }> = {
  masculine: { label: 'Masculinos', hint: 'Cortes de códigos masculinos.' },
  feminine: { label: 'Femeninos', hint: 'Cortes de códigos femeninos.' },
  androgynous: { label: 'Andróginos o neutros', hint: 'Siluetas que no se leen como de un género.' },
  mixed: { label: 'Mezcla de estilos', hint: 'Propuestas que combinan códigos de varias estéticas.' },
  all: { label: 'Todas las categorías', hint: 'Opciones de todas las categorías, sin filtrar.' },
};

export const textureLabels: Record<Texture, { label: string; hint: string }> = {
  straight: { label: 'Liso', hint: 'Cae recto desde la raíz y no forma ondas al secarse.' },
  wavy: { label: 'Ondulado', hint: 'Forma ondas en S, más marcadas en las puntas.' },
  curly: { label: 'Rizado', hint: 'Rizos definidos en espiral o tirabuzón.' },
  coily: { label: 'Muy rizado o afro', hint: 'Rizos pequeños y apretados, con mucho encogimiento.' },
  unsure: { label: 'No estoy seguro', hint: 'FOLIA no deducirá la textura de las fotos.' },
};

export const densityLabels: Record<Density, { label: string; hint: string }> = {
  fine: { label: 'Fino o de poca densidad', hint: 'Se ve el cuero cabelludo con facilidad o la coleta es fina.' },
  medium: { label: 'Densidad media', hint: 'Ni escaso ni abundante.' },
  thick: { label: 'Grueso o muy denso', hint: 'Mucho volumen y tarda en secarse.' },
  unsure: { label: 'No estoy seguro', hint: 'Lo tendremos en cuenta como dato desconocido.' },
};

export const considerationLabels: Record<Consideration, string> = {
  receding_hairline: 'Entradas',
  thinner_crown: 'Menos densidad en la coronilla',
  cowlicks: 'Remolinos',
  frizz: 'Tendencia al encrespamiento',
  sensitive_scalp: 'Cuero cabelludo sensible al calor o a productos',
};

export const currentLengthLabels: Record<CurrentLength, { label: string; hint: string }> = {
  very_short: { label: 'Muy corto', hint: 'Rapado o a máquina.' },
  short: { label: 'Corto', hint: 'Por encima de las orejas o la nuca.' },
  medium: { label: 'Medio', hint: 'Entre la mandíbula y los hombros.' },
  long: { label: 'Largo', hint: 'Por debajo de los hombros.' },
};

export const maintenanceLabels: Record<Maintenance, { label: string; short: string; minutes: number }> = {
  under5: { label: 'Menos de 5 minutos al día', short: 'Menos de 5 min', minutes: 5 },
  '5to10': { label: 'Entre 5 y 10 minutos', short: '5–10 min', minutes: 10 },
  '10to20': { label: 'Entre 10 y 20 minutos', short: '10–20 min', minutes: 20 },
  over20: { label: 'Más de 20 minutos si el resultado merece la pena', short: 'Más de 20 min', minutes: 30 },
};

export const aestheticLabels: Record<Aesthetic, string> = {
  classic: 'Clásico',
  minimal: 'Minimalista',
  elegant: 'Elegante',
  modern: 'Moderno',
  natural: 'Natural',
  urban: 'Urbano',
  alternative: 'Alternativo',
  romantic: 'Romántico',
  bold: 'Atrevido',
  professional: 'Profesional',
  trend: 'Inspirado en tendencias',
};

export const toolLabels: Record<Tool, string> = {
  blowdryer: 'Secador',
  flat_iron: 'Plancha',
  curling_iron: 'Rizador',
  hold_products: 'Productos de fijación',
  curl_cream: 'Cremas para rizos',
  texturizer: 'Texturizadores',
  none: 'Ninguna herramienta',
};

export const routineLabels: Record<Routine, string> = {
  learn: 'Quiero aprender una rutina nueva',
  simple: 'Prefiero mantenerla sencilla',
};

export const goalLabels: Record<Goal, string> = {
  highlight_features: 'Dar protagonismo a algunas facciones',
  more_volume: 'Tener más volumen',
  less_volume: 'Tener menos volumen',
  explore_fringe: 'Probar un flequillo',
  professional_image: 'Mantener una imagen profesional',
  soften_areas: 'Disimular visualmente algunas zonas',
  gentle_change: 'Cambiar sin que sea radical',
  low_maintenance: 'Algo de poco mantenimiento',
};

export type LengthCategory = 'short' | 'medium' | 'long';

export const lengthCategoryLabels: Record<LengthCategory, string> = {
  short: 'Corto',
  medium: 'Medio',
  long: 'Largo',
};

export type Difficulty = 'low' | 'medium' | 'high';

export const difficultyLabels: Record<Difficulty, string> = {
  low: 'Fácil de peinar',
  medium: 'Requiere algo de práctica',
  high: 'Requiere técnica',
};

export const difficultyShort: Record<Difficulty, string> = {
  low: 'Fácil',
  medium: 'Media',
  high: 'Alta',
};

const CODE_WORDS: Record<Exclude<Expression, 'mixed' | 'all'>, string> = {
  masculine: 'masculino',
  feminine: 'femenino',
  androgynous: 'andrógino',
};

/** The style codes a cut belongs to, in words: "masculino / andrógino", or "unisex" when it has all three. */
export function styleCodeLabel(expressions: readonly Exclude<Expression, 'mixed' | 'all'>[]): string {
  if (expressions.length >= 3) return 'unisex';
  const order: Exclude<Expression, 'mixed' | 'all'>[] = ['masculine', 'feminine', 'androgynous'];
  return order
    .filter((code) => expressions.includes(code))
    .map((code) => CODE_WORDS[code])
    .join(' / ');
}
