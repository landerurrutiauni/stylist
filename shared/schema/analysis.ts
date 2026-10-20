import { z } from 'zod';
import { AESTHETICS } from './answers.ts';
import { CATALOG, STYLE_IDS } from '../catalog/styles.ts';

/**
 * The structured result the model must return, and the envelope the server
 * sends to the browser. The same schema is used for the JSON-schema output
 * constraint on the API call, for server-side validation and for client-side
 * validation of what arrives over the network.
 */

export const IMAGE_ISSUES = [
  'blurry',
  'dark',
  'overexposed',
  'cropped',
  'no_face',
  'multiple_people',
  'not_frontal',
  'not_profile',
  'obstructed',
  'filtered',
  'low_resolution',
] as const;
export type ImageIssue = (typeof IMAGE_ISSUES)[number];

export const FACE_FEATURES = ['contour', 'forehead', 'cheekbones', 'cheeks', 'jaw', 'chin', 'hairline', 'profile', 'proportions'] as const;
export type FaceFeature = (typeof FACE_FEATURES)[number];

export const FACE_SHAPES = ['oval', 'round', 'square', 'rectangular', 'oblong', 'heart', 'diamond', 'triangular', 'indeterminate'] as const;
export type FaceShape = (typeof FACE_SHAPES)[number];

export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const FACTOR_KEYS = ['features', 'hair', 'preferences', 'routine', 'goals'] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

const imageCheckSchema = z.object({
  usable: z.boolean().describe('Whether this photo allows a reasonable observation for its purpose.'),
  issues: z.array(z.enum(IMAGE_ISSUES)).describe('Problems seen in the photo. Empty if none.'),
  note: z.string().describe('One sentence in Spanish (Spain) addressed to the user. If not usable, say what to change.'),
});

const factorSchema = z.object({
  rating: z
    .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .describe('0 = works against it, 2 = neutral, 4 = clearly in its favour.'),
  reason: z.string().describe('One short sentence in Spanish naming the concrete fact behind the rating.'),
});

export const recommendationSchema = z.object({
  styleId: z.enum(STYLE_IDS).describe('Catalogue id of the base cut.'),
  variantName: z
    .string()
    .describe('Name of the personalised version in Spanish, e.g. "Bob a la mandíbula con nuca graduada". At most 60 characters.'),
  aesthetics: z.array(z.enum(AESTHETICS)).describe('One to three aesthetics this version belongs to.'),
  rationale: z
    .string()
    .describe('Two or three sentences in Spanish explaining why this cut, citing observed features and named answers. No generic praise.'),
  factors: z.object({
    features: factorSchema.describe('Observable facial features and proportions.'),
    hair: factorSchema.describe('Declared texture and density.'),
    preferences: factorSchema.describe('Aesthetics and styles the person wants to explore.'),
    routine: factorSchema.describe('Daily time, tools and willingness to learn.'),
    goals: factorSchema.describe('Stated goals and things to avoid.'),
  }),
  confidence: z.enum(CONFIDENCE),
  dailyMinutes: z.number().int().describe('Realistic daily styling minutes for this person.'),
  difficulty: z.enum(['low', 'medium', 'high']),
  products: z.array(z.string()).describe('Products or tools needed, in Spanish. Empty if none.'),
  salonInstructions: z
    .string()
    .describe('What to tell the hairdresser or barber, in trade terms and in Spanish: lengths in cm, clipper guards, layers, fringe.'),
  adaptations: z.array(z.string()).describe('Possible adjustments of this cut for this person, in Spanish.'),
  tradeoffs: z.array(z.string()).describe('Compromises or limitations to weigh, in Spanish.'),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const analysisOutputSchema = z.object({
  imageCheck: z.object({
    frontal: imageCheckSchema,
    profile: imageCheckSchema,
  }),
  face: z.object({
    observations: z
      .array(z.object({ feature: z.enum(FACE_FEATURES), text: z.string() }))
      .describe('Only what can be seen in the photos, in Spanish. Never personality, health, ethnicity, age or identity.'),
    shape: z.object({
      estimate: z.enum(FACE_SHAPES),
      confidence: z.enum(CONFIDENCE),
      alternatives: z.array(z.enum(FACE_SHAPES)).describe('Other shapes the face could also be read as.'),
      uncertainty: z.string().describe('Why the estimate is not certain (pose, hair covering, lens distortion...), in Spanish.'),
    }),
    relevantFactors: z.array(z.string()).describe('Visual factors that matter for choosing a cut, in Spanish.'),
    hairSeen: z.string().describe('What can be seen of the current hair in the photos, in Spanish. Do not state texture or density as fact.'),
    hypotheses: z.array(z.string()).describe('Inferences that are not directly visible, each phrased as a hypothesis, in Spanish.'),
  }),
  preferences: z.object({
    summary: z.string().describe('Two sentences in Spanish summarising what the person asked for.'),
    influences: z.array(z.string()).describe('Each answer that changed the recommendations and how, in Spanish.'),
  }),
  recommendations: z.array(recommendationSchema),
  coverage: z.object({
    short: z.string().describe('Empty, or why there are fewer short options, in Spanish.'),
    medium: z.string().describe('Empty, or why there are fewer medium options, in Spanish.'),
    long: z.string().describe('Empty, or why there are fewer long options, in Spanish.'),
  }),
  explore: z.array(z.string()).describe('Suggestions for exploring other styles, in Spanish.'),
  limitations: z.array(z.string()).describe('Limits of this analysis, in Spanish.'),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

/**
 * Checks the schema cannot express: catalogue consistency, sensible counts and
 * lengths. Returns a list of problems; an empty list means the output is fit
 * to show.
 */
export function auditAnalysis(output: AnalysisOutput): string[] {
  const problems: string[] = [];
  const usable = output.imageCheck.frontal.usable && output.imageCheck.profile.usable;
  const seen = new Set<string>();
  for (const rec of output.recommendations) {
    if (seen.has(rec.styleId)) problems.push(`duplicate style ${rec.styleId}`);
    seen.add(rec.styleId);
    if (rec.variantName.trim().length === 0 || rec.variantName.length > 90) problems.push(`bad name for ${rec.styleId}`);
    if (rec.rationale.trim().length < 40) problems.push(`rationale too short for ${rec.styleId}`);
    if (rec.salonInstructions.trim().length < 30) problems.push(`instructions too short for ${rec.styleId}`);
    if (rec.dailyMinutes < 0 || rec.dailyMinutes > 120) problems.push(`minutes out of range for ${rec.styleId}`);
    if (rec.aesthetics.length === 0) problems.push(`no aesthetic for ${rec.styleId}`);
  }
  if (usable && output.recommendations.length === 0) problems.push('no recommendations for usable photos');
  if (!usable && output.recommendations.length > 0) problems.push('recommendations for unusable photos');
  if (output.recommendations.length > 15) problems.push('too many recommendations');
  return problems;
}

export const lengthOf = (styleId: string) => CATALOG.find((style) => style.id === styleId)?.length;

export const analysisEnvelopeSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  mode: z.enum(['live', 'demo']),
  model: z.string().nullable(),
  output: analysisOutputSchema,
});
export type AnalysisEnvelope = z.infer<typeof analysisEnvelopeSchema>;
