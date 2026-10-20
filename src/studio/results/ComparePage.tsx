import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { FactorKey } from '../../../shared/schema/analysis.ts';
import { difficultyShort, lengthCategoryLabels } from '../../../shared/labels.ts';
import { BAND_LABELS, FACTOR_LABELS } from '../../../shared/scoring.ts';
import { HeadSheet } from '../../figures/HeadSheet.tsx';
import { cadenceText, differences, itemsOf, skippedFactors, type Item } from '../../lib/results.ts';
import { useSession } from '../../session/session.tsx';
import { ScreenTitle } from '../../ui/ScreenTitle.tsx';
import { NoResults } from './NoResults.tsx';

function Row({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  return (
    <div className="compare-row" role="row">
      <p className="compare-label" role="rowheader">
        {label}
      </p>
      <div role="cell">{a}</div>
      <div role="cell">{b}</div>
    </div>
  );
}

export function ComparePage() {
  const { state } = useSession();
  const [params, setParams] = useSearchParams();
  if (!state.analysis) return <NoResults />;

  const items = itemsOf(state.analysis);
  const skip = skippedFactors(state.analysis);
  const pick = (key: 'a' | 'b') => items.find((item) => item.rec.styleId === params.get(key)) ?? null;
  const a = pick('a');
  const b = pick('b');

  const choose = (key: 'a' | 'b', value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  const selector = (key: 'a' | 'b', current: Item | null, other: Item | null) => (
    <label className="compare-select">
      <span>{key === 'a' ? 'Primer corte' : 'Segundo corte'}</span>
      <select value={current?.rec.styleId ?? ''} onChange={(event) => choose(key, event.target.value)}>
        <option value="" disabled>
          Elige un corte
        </option>
        {items.map((item) => (
          <option key={item.rec.styleId} value={item.rec.styleId} disabled={item.rec.styleId === other?.rec.styleId}>
            {item.rec.variantName} ({lengthCategoryLabels[item.length].toLowerCase()})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="screen screen-compare">
      <Link to="/estudio/resultados" className="back-link">
        Volver a las recomendaciones
      </Link>
      <header className="screen-head">
        <ScreenTitle>Comparar dos cortes</ScreenTitle>
        <p className="screen-lede">Las diferencias salen de los mismos datos que cada ficha: factores, tiempo, dificultad y mantenimiento.</p>
      </header>

      <div className="compare-pickers">
        {selector('a', a, b)}
        {selector('b', b, a)}
      </div>

      {a && b ? (
        <>
          <section className="compare-diff" aria-labelledby="diff-title">
            <h2 id="diff-title" className="section-title">
              Diferencias clave
            </h2>
            {differences(a, b, skip).length ? (
              <ul className="plain-list">
                {differences(a, b, skip).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Los dos cortes reciben la misma valoración en todo lo que FOLIA mide.</p>
            )}
          </section>

          <div className="compare-grid" role="table" aria-label={`Comparación de ${a.rec.variantName} y ${b.rec.variantName}`}>
            <div className="compare-row compare-heads" role="row">
              <p className="compare-label" role="columnheader">
                <span className="visually-hidden">Aspecto</span>
              </p>
              {[a, b].map((item) => (
                <div key={item.rec.styleId} role="columnheader">
                  <div className="compare-figure">
                    {state.previews[item.rec.styleId] && state.photos.frontal ? (
                      <img
                        src={state.previews[item.rec.styleId]!.url}
                        alt={`Simulación con IA de tu foto con ${item.rec.variantName}`}
                        width={state.photos.frontal.width}
                        height={state.photos.frontal.height}
                      />
                    ) : (
                      <HeadSheet spec={item.style.figure} view="front" surface="field" label={`Esquema de ${item.style.name}`} />
                    )}
                  </div>
                  <h3 className="card-name">{item.rec.variantName}</h3>
                  <Link to={`/estudio/resultados/${item.rec.styleId}`}>Ver ficha</Link>
                </div>
              ))}
            </div>
            <Row
              label="Compatibilidad estimada"
              a={
                <p>
                  <strong className="num">{a.score}</strong> · {BAND_LABELS[a.band]}
                </p>
              }
              b={
                <p>
                  <strong className="num">{b.score}</strong> · {BAND_LABELS[b.band]}
                </p>
              }
            />
            {(Object.keys(FACTOR_LABELS) as FactorKey[])
              .filter((key) => !skip.includes(key))
              .map((key) => (
                <Row
                  key={key}
                  label={FACTOR_LABELS[key]}
                  a={
                    <p>
                      <span className="num">{a.rec.factors[key].rating}/4</span> · {a.rec.factors[key].reason}
                    </p>
                  }
                  b={
                    <p>
                      <span className="num">{b.rec.factors[key].rating}/4</span> · {b.rec.factors[key].reason}
                    </p>
                  }
                />
              ))}
            <Row label="Longitud" a={lengthCategoryLabels[a.length]} b={lengthCategoryLabels[b.length]} />
            <Row
              label="Tiempo al día"
              a={<span className="num">{a.rec.dailyMinutes} min</span>}
              b={<span className="num">{b.rec.dailyMinutes} min</span>}
            />
            <Row label="Dificultad" a={difficultyShort[a.rec.difficulty]} b={difficultyShort[b.rec.difficulty]} />
            <Row label="Corte de mantenimiento" a={`Cada ${cadenceText(a.style)}`} b={`Cada ${cadenceText(b.style)}`} />
            <Row label="Productos" a={a.rec.products.join(', ') || 'Ninguno'} b={b.rec.products.join(', ') || 'Ninguno'} />
            <Row label="Qué pedir" a={<p>{a.rec.salonInstructions}</p>} b={<p>{b.rec.salonInstructions}</p>} />
            <Row
              label="Ten en cuenta"
              a={
                <ul className="plain-list">
                  {a.rec.tradeoffs.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              }
              b={
                <ul className="plain-list">
                  {b.rec.tradeoffs.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              }
            />
          </div>
        </>
      ) : (
        <div className="empty-block">
          <p>Elige dos cortes de tus recomendaciones para ver sus diferencias.</p>
        </div>
      )}
    </div>
  );
}
