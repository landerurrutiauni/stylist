import { CATALOG, type CatalogStyle } from '../../shared/catalog/styles.ts';
import type { AnalysisEnvelope, AnalysisOutput, Recommendation } from '../../shared/schema/analysis.ts';
import type { Answers, Goal } from '../../shared/schema/answers.ts';
import {
  aestheticLabels,
  goalLabels,
  lengthCategoryLabels,
  maintenanceLabels,
  textureLabels,
  toolLabels,
  type LengthCategory,
} from '../../shared/labels.ts';
import { compatibility } from '../../shared/scoring.ts';

/**
 * Demo mode. Used when no API is configured, the server has no key, or the
 * person chooses to try FOLIA without sending photos. It never looks at the
 * photos and never pretends to: the facial factor is marked as not evaluated
 * and left out of the compatibility figure, every text says it comes from the
 * answers alone, and the screen carries a "Modo demostración" notice.
 */

type Rating = 0 | 1 | 2 | 3 | 4;

const EXPRESSION_PHRASE: Record<Answers['expression'], string> = {
  masculine: 'cortes de códigos masculinos',
  feminine: 'cortes de códigos femeninos',
  androgynous: 'cortes andróginos o neutros',
  mixed: 'una mezcla de estilos',
  all: 'cortes de todas las categorías',
};

const EXPRESSION_INFLUENCE: Record<Answers['expression'], string> = {
  masculine: 'Has pedido estilos masculinos: solo se han considerado cortes con esos códigos.',
  feminine: 'Has pedido estilos femeninos: solo se han considerado cortes con esos códigos.',
  androgynous: 'Has pedido estilos andróginos o neutros: solo se han considerado cortes con esos códigos.',
  mixed: 'Has pedido una mezcla de estilos: se han considerado cortes de todos los códigos.',
  all: 'Has pedido ver todas las categorías: no se ha filtrado ningún código de estilo.',
};
const clamp = (value: number): Rating => Math.max(0, Math.min(4, Math.round(value))) as Rating;

function fitsExpression(style: CatalogStyle, answers: Answers) {
  if (answers.expression === 'all' || answers.expression === 'mixed') return true;
  return style.expressions.includes(answers.expression);
}

function hairFactor(style: CatalogStyle, answers: Answers) {
  if (answers.texture === 'unsure') {
    return { rating: 2 as Rating, reason: 'No has indicado tu textura, así que no se ha podido valorar.' };
  }
  const texture = textureLabels[answers.texture].label.toLowerCase();
  if (!style.textures.includes(answers.texture)) {
    return { rating: 1 as Rating, reason: `Este corte no está pensado para pelo ${texture}.` };
  }
  const densityOk = answers.density === 'unsure' || style.densities.includes(answers.density);
  return densityOk
    ? { rating: 4 as Rating, reason: `Está pensado para pelo ${texture} como el que describes.` }
    : { rating: 2 as Rating, reason: `Funciona con pelo ${texture}, pero pide otra densidad que la que indicas.` };
}

function preferenceFactor(style: CatalogStyle, answers: Answers) {
  if (answers.aesthetics.length === 0) {
    return { rating: 2 as Rating, reason: 'No has elegido estéticas; se valora como neutral.' };
  }
  const shared = style.aesthetics.filter((aesthetic) => answers.aesthetics.includes(aesthetic));
  if (shared.length === 0) {
    return { rating: 1 as Rating, reason: 'No coincide con las estéticas que has elegido.' };
  }
  const names = shared.map((key) => aestheticLabels[key].toLowerCase()).join(' y ');
  return { rating: clamp(2 + shared.length), reason: `Comparte lo ${names} que buscas.` };
}

function routineFactor(style: CatalogStyle, answers: Answers) {
  const budget = maintenanceLabels[answers.maintenance].minutes;
  const missingTools = style.tools.filter((tool) => !answers.tools.includes(tool));
  let rating = style.minutes <= budget / 2 ? 4 : style.minutes <= budget ? 3 : style.minutes <= budget * 1.5 ? 2 : 0;
  if (missingTools.length > 0 && answers.routine !== 'learn') rating -= 1;
  const minutes = `Pide unos ${style.minutes} min al día y dispones de ${maintenanceLabels[answers.maintenance].short.toLowerCase()}`;
  const tools = missingTools.length > 0 ? `; necesitarías ${missingTools.map((tool) => toolLabels[tool].toLowerCase()).join(' y ')}` : '';
  return { rating: clamp(rating), reason: `${minutes}${tools}.` };
}

const goalChecks: Partial<Record<Goal, (style: CatalogStyle) => boolean>> = {
  low_maintenance: (style) => style.minutes <= 5,
  explore_fringe: (style) => style.figure.fringe !== 'none' && style.figure.fringe !== 'up',
  more_volume: (style) => style.figure.top >= 0.3 || style.figure.layers === 'heavy',
  less_volume: (style) => style.figure.top < 0.3 && style.figure.layers !== 'heavy',
  professional_image: (style) => style.aesthetics.some((a) => a === 'professional' || a === 'classic' || a === 'elegant'),
};

function goalsFactor(style: CatalogStyle, answers: Answers) {
  const relevant = answers.goals.filter((goal) => goalChecks[goal] || goal === 'gentle_change');
  if (relevant.length === 0) return { rating: 2 as Rating, reason: 'No hay objetivos que este corte cumpla o contradiga.' };
  const met: Goal[] = [];
  const missed: Goal[] = [];
  for (const goal of relevant) {
    const ok = goal === 'gentle_change' ? lengthDistance(style.length, answers.currentLength) <= 1 : goalChecks[goal]!(style);
    (ok ? met : missed).push(goal);
  }
  const rating = clamp(2 + met.length - missed.length);
  const reason = met.length
    ? `Cumple «${goalLabels[met[0]!].toLowerCase()}»${missed.length ? `, pero no «${goalLabels[missed[0]!].toLowerCase()}»` : ''}.`
    : `No cumple «${goalLabels[missed[0]!].toLowerCase()}».`;
  return { rating, reason };
}

const LENGTH_ORDER: Record<string, number> = { very_short: 0, short: 1, medium: 2, long: 3 };

function lengthDistance(length: LengthCategory, current: Answers['currentLength']) {
  const target = length === 'short' ? 1 : length === 'medium' ? 2 : 3;
  return Math.abs(target - (LENGTH_ORDER[current] ?? 2));
}

function recommend(style: CatalogStyle, answers: Answers): Recommendation {
  const factors = {
    features: { rating: 2 as Rating, reason: 'No evaluado: en el modo de demostración no se analiza ninguna foto.' },
    hair: hairFactor(style, answers),
    preferences: preferenceFactor(style, answers),
    routine: routineFactor(style, answers),
    goals: goalsFactor(style, answers),
  };
  const shared = style.aesthetics.filter((aesthetic) => answers.aesthetics.includes(aesthetic));
  const minutes = Math.max(1, style.minutes + (style.tools.some((tool) => !answers.tools.includes(tool)) ? 3 : 0));
  return {
    styleId: style.id,
    variantName: style.name,
    aesthetics: (shared.length > 0 ? shared : style.aesthetics).slice(0, 3),
    rationale: `${style.summary} En esta demostración se ha elegido solo por tus respuestas: ${factors.hair.reason.charAt(0).toLowerCase()}${factors.hair.reason.slice(1)} ${factors.routine.reason}`,
    factors,
    confidence: 'low',
    dailyMinutes: minutes,
    difficulty: style.difficulty,
    products: style.tools.map((tool) => toolLabels[tool]),
    salonInstructions: style.barber,
    adaptations: [
      'En un análisis real, estas indicaciones se ajustarían a lo que se observa en tus fotos.',
      `Corte de mantenimiento cada ${style.cadence[0] === style.cadence[1] ? style.cadence[0] : `${style.cadence[0]}–${style.cadence[1]}`} semanas.`,
    ],
    tradeoffs: [style.tradeoff],
  };
}

export function demoAnalysis(answers: Answers, refinement = ''): AnalysisEnvelope {
  const candidates = CATALOG.filter((style) => fitsExpression(style, answers))
    .map((style) => ({ style, rec: recommend(style, answers) }))
    .map((item) => ({ ...item, score: compatibility(item.rec.factors, ['features']) }))
    .sort((a, b) => b.score - a.score || a.style.id.localeCompare(b.style.id));

  const lengths: LengthCategory[] = ['short', 'medium', 'long'];
  const recommendations: Recommendation[] = [];
  const coverage: AnalysisOutput['coverage'] = { short: '', medium: '', long: '' };
  for (const length of lengths) {
    const pool = candidates.filter((item) => item.style.length === length && item.rec.factors.hair.rating >= 2);
    const picked = pool.slice(0, 3);
    recommendations.push(...picked.map((item) => item.rec));
    if (picked.length < 3) {
      coverage[length] =
        picked.length === 0
          ? `Ningún corte ${lengthCategoryLabels[length].toLowerCase()} del catálogo encaja con la textura y los estilos que has indicado.`
          : `Solo ${picked.length === 1 ? 'un corte' : `${picked.length} cortes`} de longitud ${lengthCategoryLabels[length].toLowerCase()} encajan con tu textura y los estilos elegidos.`;
    }
  }

  const influences = [
    EXPRESSION_INFLUENCE[answers.expression],
    answers.texture === 'unsure'
      ? 'Textura sin indicar: se han incluido cortes de todas las texturas con menos confianza.'
      : `Textura ${textureLabels[answers.texture].label.toLowerCase()}: se han descartado los cortes que no están pensados para ella.`,
    `Tiempo disponible (${maintenanceLabels[answers.maintenance].short.toLowerCase()}): pesa en el factor de rutina.`,
  ];
  if (answers.aesthetics.length > 0) {
    influences.push(`Estéticas elegidas: ${answers.aesthetics.map((key) => aestheticLabels[key].toLowerCase()).join(', ')}.`);
  }
  if (refinement.trim())
    influences.push('El ajuste que has escrito no se interpreta en el modo de demostración; sí lo tendría en cuenta un análisis real.');

  const output: AnalysisOutput = {
    imageCheck: {
      frontal: { usable: true, issues: [], note: 'No se ha enviado: modo demostración.' },
      profile: { usable: true, issues: [], note: 'No se ha enviado: modo demostración.' },
    },
    face: {
      observations: [],
      shape: { estimate: 'indeterminate', confidence: 'low', alternatives: [], uncertainty: 'Modo demostración: no se ha analizado ninguna foto.' },
      relevantFactors: [],
      hairSeen: 'No analizado en el modo de demostración.',
      hypotheses: [],
    },
    preferences: {
      summary: `Quieres ver ${EXPRESSION_PHRASE[answers.expression]}. Tu pelo es ${answers.texture === 'unsure' ? 'de una textura que no has indicado' : textureLabels[answers.texture].label.toLowerCase()} y dispones de ${maintenanceLabels[answers.maintenance].short.toLowerCase()} al día para peinarte.`,
      influences,
    },
    recommendations,
    coverage,
    explore: [
      'Haz el análisis real con tus fotos para que la selección tenga en cuenta tu contorno, mandíbula y perfil.',
      'Cambia la estética o el tiempo disponible en el cuestionario y genera de nuevo para ver cómo cambia la selección.',
    ],
    limitations: [
      'Modo demostración: no se han enviado ni analizado tus fotos.',
      'La compatibilidad estimada se calcula solo con tus respuestas; el factor de rasgos faciales no se ha evaluado.',
      'Las notas de texto libre no se interpretan en este modo.',
    ],
  };

  return { id: `demo-${Date.now()}`, createdAt: new Date().toISOString(), mode: 'demo', model: null, output };
}

/** Answers used by "Ver un ejemplo", when someone wants to look around first. */
export const SAMPLE_ANSWERS: Answers = {
  expression: 'all',
  texture: 'wavy',
  density: 'medium',
  considerations: [],
  considerationsNote: '',
  currentLength: 'medium',
  maintenance: '5to10',
  aesthetics: ['natural', 'modern'],
  imageNote: '',
  tools: ['blowdryer'],
  routine: 'simple',
  goals: ['gentle_change', 'explore_fringe'],
  avoidNote: '',
  freeNote: '',
};
