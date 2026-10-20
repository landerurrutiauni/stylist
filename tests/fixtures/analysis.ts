import type { AnalysisEnvelope, AnalysisOutput, Recommendation } from '../../shared/schema/analysis.ts';

/**
 * A complete, valid model output in the shape Claude must return. Used by the
 * handler tests (as the model's text) and by the E2E tests (inside the mocked
 * stream). Two cuts per length, with different times, aesthetics and
 * difficulties so the filters have something to filter.
 */

function rec(partial: Partial<Recommendation> & Pick<Recommendation, 'styleId' | 'variantName'>): Recommendation {
  return {
    aesthetics: ['natural'],
    rationale:
      'La mandíbula marcada que se ve en la foto frontal pide volumen arriba y lados limpios; además dijiste que quieres algo fácil de peinar.',
    factors: {
      features: { rating: 3, reason: 'El volumen arriba equilibra la mandíbula marcada.' },
      hair: { rating: 3, reason: 'El pelo ondulado de densidad media da textura sin productos.' },
      preferences: { rating: 3, reason: 'Encaja con la estética natural que marcaste.' },
      routine: { rating: 3, reason: 'Unos minutos con las manos y un poco de crema.' },
      goals: { rating: 2, reason: 'No cambia mucho tu objetivo de probar flequillo.' },
    },
    confidence: 'medium',
    dailyMinutes: 5,
    difficulty: 'low',
    products: ['Crema de peinado ligera'],
    salonInstructions: 'Laterales a tijera de 3 cm, parte superior a 7 cm con capas desfiladas y nuca limpia.',
    adaptations: ['Puede llevarse con raya al lado para un aire más formal.'],
    tradeoffs: ['Necesita repaso cada cinco semanas para mantener la forma.'],
    ...partial,
  };
}

export function liveOutput(): AnalysisOutput {
  return {
    imageCheck: {
      frontal: { usable: true, issues: [], note: 'La foto frontal tiene buena luz y se ve la cara entera.' },
      profile: { usable: true, issues: [], note: 'El perfil se ve completo, con la línea de la mandíbula.' },
    },
    face: {
      observations: [
        { feature: 'contour', text: 'Contorno con la parte inferior algo más ancha que la frente.' },
        { feature: 'jaw', text: 'Mandíbula marcada con ángulos visibles.' },
        { feature: 'hairline', text: 'Nacimiento del pelo recto en la frente.' },
      ],
      shape: {
        estimate: 'square',
        confidence: 'medium',
        alternatives: ['rectangular'],
        uncertainty: 'El pelo cubre parte de la frente y la cámara está algo cerca.',
      },
      relevantFactors: ['Mandíbula marcada', 'Frente de altura media'],
      hairSeen: 'En las fotos el pelo llega por debajo de las orejas y parece tener algo de onda.',
      hypotheses: ['Parece que el pelo tiene un remolino en la coronilla, aunque no se ve con claridad.'],
    },
    preferences: {
      summary: 'Quieres explorar todas las categorías con una rutina de entre 5 y 10 minutos. Te interesan los estilos naturales y modernos.',
      influences: ['Tu tiempo diario ha dejado fuera los cortes que necesitan plancha.'],
    },
    recommendations: [
      rec({ styleId: 'textured-crop', variantName: 'Crop texturizado con flequillo corto', aesthetics: ['modern'], dailyMinutes: 5 }),
      rec({
        styleId: 'side-part',
        variantName: 'Raya al lado clásica',
        aesthetics: ['classic', 'professional'],
        dailyMinutes: 10,
        difficulty: 'medium',
        factors: {
          features: { rating: 2, reason: 'Neutro respecto a la mandíbula.' },
          hair: { rating: 2, reason: 'La onda pide algo de secador para la raya.' },
          preferences: { rating: 2, reason: 'Más clásico de lo que buscas.' },
          routine: { rating: 2, reason: 'Diez minutos con secador.' },
          goals: { rating: 2, reason: 'No responde a tus objetivos concretos.' },
        },
      }),
      rec({
        styleId: 'curtain-shag',
        variantName: 'Shag con flequillo cortina',
        aesthetics: ['natural', 'modern'],
        dailyMinutes: 10,
        difficulty: 'medium',
      }),
      rec({ styleId: 'lob', variantName: 'Lob recto a la clavícula', aesthetics: ['minimal'], dailyMinutes: 8 }),
      rec({
        styleId: 'long-layers',
        variantName: 'Capas largas con movimiento',
        aesthetics: ['natural'],
        dailyMinutes: 15,
        difficulty: 'high',
        confidence: 'low',
        factors: {
          features: { rating: 1, reason: 'Alarga la cara más de lo necesario.' },
          hair: { rating: 2, reason: 'Tardaría en crecer desde tu largo actual.' },
          preferences: { rating: 3, reason: 'Natural, como pediste.' },
          routine: { rating: 1, reason: 'Más de diez minutos al día.' },
          goals: { rating: 2, reason: 'Neutro.' },
        },
      }),
      rec({
        styleId: 'long-curtain-bangs',
        variantName: 'Largo con flequillo abierto',
        aesthetics: ['romantic'],
        dailyMinutes: 12,
        difficulty: 'medium',
      }),
    ],
    coverage: { short: '', medium: '', long: 'Solo dos opciones largas porque tardarían más de un año en crecer desde tu largo actual.' },
    explore: ['Si te animas a más tiempo de peinado, un bob asimétrico también funcionaría.'],
    limitations: ['La textura y la densidad salen de tus respuestas; las fotos no permiten confirmarlas.'],
  };
}

export function liveEnvelope(output: AnalysisOutput = liveOutput()): AnalysisEnvelope {
  return { id: 'test-analysis', createdAt: '2026-10-20T10:00:00.000Z', mode: 'live', model: 'claude-test-model', output };
}

/** The same output with unusable photos: no recommendations, as the prompt requires. */
export function unusableOutput(): AnalysisOutput {
  const output = liveOutput();
  return {
    ...output,
    imageCheck: {
      frontal: { usable: false, issues: ['dark'], note: 'La foto frontal está demasiado oscura; hazla mirando a una ventana.' },
      profile: output.imageCheck.profile,
    },
    recommendations: [],
  };
}
