import type { AnalysisEnvelope } from '../../../shared/schema/analysis.ts';
import { confidenceLabels, featureLabels, shapeLabels } from '../../lib/faceLabels.ts';
import { useSession } from '../../session/session.tsx';

/**
 * The signature of the results: the person's own two photos set as the two
 * views of a head sheet, beside what was observed in them. Observations,
 * declared facts and hypotheses are kept apart.
 */
export function FaceSection({ analysis }: { analysis: AnalysisEnvelope }) {
  const { state } = useSession();
  const { face } = analysis.output;
  const demo = analysis.mode === 'demo';
  const photos = state.photos.frontal && state.photos.profile ? state.photos : null;

  return (
    <section className="face" aria-labelledby="face-title">
      <div className="face-sheet">
        {photos ? (
          (['frontal', 'profile'] as const).map((kind) => (
            <figure key={kind}>
              <img
                src={photos[kind]!.url}
                alt={`Tu foto ${kind === 'frontal' ? 'de frente' : 'de perfil'}`}
                width={photos[kind]!.width}
                height={photos[kind]!.height}
              />
              <figcaption>{kind === 'frontal' ? 'De frente' : 'De perfil'}</figcaption>
            </figure>
          ))
        ) : (
          <p className="face-nophotos">En este ejemplo no hay fotos. Con las tuyas, aquí verías tu ficha de frente y de perfil.</p>
        )}
      </div>

      <div className="face-notes">
        <h2 id="face-title" className="section-title">
          Lo que se ve en tus fotos
        </h2>
        {demo ? (
          <div className="empty-block">
            <p>
              <strong>No se ha analizado ninguna foto.</strong> En el modo de demostración tus fotos no salen del navegador, así que aquí no hay
              observaciones. En un análisis real verías qué se aprecia de tu contorno, frente, pómulos, mandíbula, mentón y perfil, y la forma
              estimada con su grado de incertidumbre.
            </p>
          </div>
        ) : (
          <>
            <p className="face-shape">
              Forma estimada: <strong>{shapeLabels[face.shape.estimate]}</strong>, {confidenceLabels[face.shape.confidence]}.
              {face.shape.alternatives.length > 0
                ? ` También podría leerse como ${face.shape.alternatives.map((shape) => shapeLabels[shape]).join(' o ')}.`
                : ''}
            </p>
            <p className="face-uncertainty">{face.shape.uncertainty}</p>

            <h3 className="notes-title">Observado</h3>
            {face.observations.length > 0 ? (
              <dl className="observations">
                {face.observations.map((observation, index) => (
                  <div key={`${observation.feature}-${index}`}>
                    <dt>{featureLabels[observation.feature]}</dt>
                    <dd>{observation.text}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">No hay observaciones fiables en estas fotos.</p>
            )}

            {face.relevantFactors.length > 0 ? (
              <>
                <h3 className="notes-title">Lo que más pesa al elegir corte</h3>
                <ul className="plain-list">
                  {face.relevantFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <h3 className="notes-title">Lo que se ve de tu pelo</h3>
            <p>{face.hairSeen}</p>

            {face.hypotheses.length > 0 ? (
              <>
                <h3 className="notes-title">Hipótesis, no observaciones</h3>
                <ul className="plain-list muted-list">
                  {face.hypotheses.map((hypothesis) => (
                    <li key={hypothesis}>{hypothesis}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
