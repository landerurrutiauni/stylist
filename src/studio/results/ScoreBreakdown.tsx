import type { FactorKey, Recommendation } from '../../../shared/schema/analysis.ts';
import { FACTOR_LABELS, FACTOR_WEIGHTS } from '../../../shared/scoring.ts';

const RATING_WORDS = ['En contra', 'Poco a favor', 'Neutral', 'A favor', 'Muy a favor'];

/** The five factors behind an estimated compatibility, with the reason for each. */
export function ScoreBreakdown({ rec, skip, score }: { rec: Recommendation; skip: FactorKey[]; score: number }) {
  return (
    <div className="breakdown">
      <table>
        <caption className="visually-hidden">Factores de la compatibilidad estimada de {rec.variantName}</caption>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            <th scope="col" className="num">
              Peso
            </th>
            <th scope="col">Valoración</th>
            <th scope="col">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((key) => {
            const factor = rec.factors[key];
            const skipped = skip.includes(key);
            return (
              <tr key={key} className={skipped ? 'is-skipped' : undefined}>
                <th scope="row">{FACTOR_LABELS[key]}</th>
                <td className="num">{skipped ? '—' : `${Math.round(FACTOR_WEIGHTS[key] * 100)} %`}</td>
                <td>
                  {skipped ? (
                    'No evaluado'
                  ) : (
                    <span className="rating">
                      <span className="rating-bar" aria-hidden="true">
                        {[1, 2, 3, 4].map((step) => (
                          <span key={step} className={factor.rating >= step ? 'is-on' : undefined} />
                        ))}
                      </span>
                      <span>
                        {RATING_WORDS[factor.rating]} <span className="num">({factor.rating}/4)</span>
                      </span>
                    </span>
                  )}
                </td>
                <td>{factor.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="breakdown-note">
        Cada factor se valora de 0 a 4 y se pondera con el peso indicado{skip.length ? ', repartiendo el de los factores no evaluados' : ''}. El
        resultado, <span className="num">{score}</span>, se redondea a múltiplos de 5 porque la valoración es orientativa. No mide tu atractivo: mide
        cuánto encaja este corte con lo observado y lo que has contado.
      </p>
    </div>
  );
}
