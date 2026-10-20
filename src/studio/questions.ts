import {
  AESTHETICS,
  CONSIDERATIONS,
  CURRENT_LENGTHS,
  DENSITIES,
  EXPRESSIONS,
  GOALS,
  MAINTENANCE,
  ROUTINES,
  TEXT_LIMITS,
  TEXTURES,
  TOOLS,
  type DraftAnswers,
} from '../../shared/schema/answers.ts';
import {
  aestheticLabels,
  considerationLabels,
  currentLengthLabels,
  densityLabels,
  expressionLabels,
  goalLabels,
  maintenanceLabels,
  routineLabels,
  textureLabels,
  toolLabels,
} from '../../shared/labels.ts';

/** One question screen: a main field, optionally followed by extra fields. */

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export type Field =
  | { kind: 'single'; key: keyof DraftAnswers; legend: string; options: Option[]; optional?: boolean }
  | { kind: 'multi'; key: keyof DraftAnswers; legend: string; options: Option[]; exclusive?: string }
  | { kind: 'text'; key: keyof DraftAnswers; label: string; hint: string; max: number; placeholder: string };

export interface Question {
  slug: string;
  title: string;
  help: string;
  required: boolean;
  fields: Field[];
  /** Short name used on the review screen. */
  short: string;
}

const opts = <T extends string>(values: readonly T[], label: (value: T) => string | { label: string; hint?: string }): Option[] =>
  values.map((value) => {
    const result = label(value);
    return typeof result === 'string' ? { value, label: result } : { value, label: result.label, hint: result.hint };
  });

export const QUESTIONS: Question[] = [
  {
    slug: 'estilos',
    short: 'Estilos a explorar',
    title: '¿Qué estilos quieres explorar?',
    help: 'Elige por lo que te apetece ver, no por cómo te ve nadie. FOLIA no deduce tu género de las fotos.',
    required: true,
    fields: [{ kind: 'single', key: 'expression', legend: 'Estilos', options: opts(EXPRESSIONS, (value) => expressionLabels[value]) }],
  },
  {
    slug: 'textura',
    short: 'Textura',
    title: '¿Cómo es tu pelo?',
    help: 'Piensa en cómo queda al secarse al aire, sin plancha ni rizador.',
    required: true,
    fields: [{ kind: 'single', key: 'texture', legend: 'Textura capilar', options: opts(TEXTURES, (value) => textureLabels[value]) }],
  },
  {
    slug: 'densidad',
    short: 'Densidad',
    title: '¿Cuánto pelo tienes y qué grosor?',
    help: 'La densidad decide cuántas capas aguanta un corte. Las particularidades son opcionales y solo sirven para elegir mejor.',
    required: true,
    fields: [
      { kind: 'single', key: 'density', legend: 'Densidad y grosor', options: opts(DENSITIES, (value) => densityLabels[value]) },
      {
        kind: 'multi',
        key: 'considerations',
        legend: 'Particularidades a tener en cuenta (opcional)',
        options: opts(CONSIDERATIONS, (value) => considerationLabels[value]),
      },
      {
        kind: 'text',
        key: 'considerationsNote',
        label: 'Algo más sobre tu pelo (opcional)',
        hint: 'Por ejemplo, un remolino en la coronilla o una zona con menos pelo.',
        max: TEXT_LIMITS.considerationsNote,
        placeholder: 'Tengo un remolino en la frente que…',
      },
    ],
  },
  {
    slug: 'longitud',
    short: 'Longitud actual',
    title: '¿Qué largo tienes ahora?',
    help: 'Sirve para saber cuánto cambia cada propuesta y cuánto tendrías que esperar a que crezca.',
    required: true,
    fields: [
      { kind: 'single', key: 'currentLength', legend: 'Longitud actual', options: opts(CURRENT_LENGTHS, (value) => currentLengthLabels[value]) },
    ],
  },
  {
    slug: 'tiempo',
    short: 'Tiempo al día',
    title: '¿Cuánto tiempo quieres dedicarle cada día?',
    help: 'Cuenta solo el peinado, no el lavado.',
    required: true,
    fields: [
      {
        kind: 'single',
        key: 'maintenance',
        legend: 'Tiempo de peinado',
        options: opts(MAINTENANCE, (value) => ({ label: maintenanceLabels[value].label })),
      },
    ],
  },
  {
    slug: 'estetica',
    short: 'Estética',
    title: '¿Con qué estética te identificas?',
    help: 'Puedes marcar varias, o ninguna si prefieres no condicionar la propuesta.',
    required: false,
    fields: [
      { kind: 'multi', key: 'aesthetics', legend: 'Estética personal', options: opts(AESTHETICS, (value) => aestheticLabels[value]) },
      {
        kind: 'text',
        key: 'imageNote',
        label: '¿Qué imagen quieres proyectar o qué estilos te inspiran?',
        hint: 'Una persona, una época, una película… lo que te sirva para explicarlo.',
        max: TEXT_LIMITS.imageNote,
        placeholder: 'Algo cuidado pero que no parezca peinado…',
      },
    ],
  },
  {
    slug: 'herramientas',
    short: 'Herramientas',
    title: '¿Qué usas para peinarte?',
    help: 'Así sabremos qué cortes encajan con tu rutina tal como es hoy.',
    required: false,
    fields: [
      { kind: 'multi', key: 'tools', legend: 'Herramientas y productos', options: opts(TOOLS, (value) => toolLabels[value]), exclusive: 'none' },
      { kind: 'single', key: 'routine', legend: 'Tu rutina (opcional)', options: opts(ROUTINES, (value) => routineLabels[value]), optional: true },
    ],
  },
  {
    slug: 'objetivos',
    short: 'Objetivos',
    title: '¿Qué quieres conseguir con el cambio?',
    help: 'Marca lo que te importe. Lo que escribas abajo pesa tanto como las casillas.',
    required: false,
    fields: [
      { kind: 'multi', key: 'goals', legend: 'Objetivos', options: opts(GOALS, (value) => goalLabels[value]) },
      {
        kind: 'text',
        key: 'avoidNote',
        label: 'Cortes que no te gustan, que ya has probado o que quieres evitar',
        hint: 'FOLIA no te propondrá lo que descartes aquí, o te explicará por qué una versión es distinta.',
        max: TEXT_LIMITS.avoidNote,
        placeholder: 'Ya llevé flequillo recto y no me gustó porque…',
      },
    ],
  },
  {
    slug: 'comentario',
    short: 'Comentario',
    title: '¿Algo más que debamos saber?',
    help: 'Cualquier detalle: tu trabajo, el clima donde vives, un evento próximo.',
    required: false,
    fields: [
      {
        kind: 'text',
        key: 'freeNote',
        label: 'Comentario libre',
        hint: 'Opcional.',
        max: TEXT_LIMITS.freeNote,
        placeholder: 'Trabajo de cara al público y llevo casco en moto…',
      },
    ],
  },
];

export const questionIndex = (slug: string) => QUESTIONS.findIndex((question) => question.slug === slug);

/** Required questions still unanswered, in order. */
export function missingRequired(answers: DraftAnswers): Question[] {
  return QUESTIONS.filter((question) => question.required).filter((question) => {
    const field = question.fields[0]!;
    return answers[field.key] === null;
  });
}
