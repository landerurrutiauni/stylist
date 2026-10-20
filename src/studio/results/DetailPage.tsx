import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { aestheticLabels, difficultyLabels, lengthCategoryLabels } from '../../../shared/labels.ts';
import { BAND_LABELS } from '../../../shared/scoring.ts';
import { cutLabel, HeadSheet } from '../../figures/HeadSheet.tsx';
import { cadenceText, itemsOf, skippedFactors } from '../../lib/results.ts';
import { useSession } from '../../session/session.tsx';
import { ScreenTitle } from '../../ui/ScreenTitle.tsx';
import { NoResults } from './NoResults.tsx';
import { PreviewPanel } from './PreviewPanel.tsx';
import { ScoreBreakdown } from './ScoreBreakdown.tsx';

export function DetailPage() {
  const { styleId = '' } = useParams();
  const { state, toggleFavorite, toggleCompare } = useSession();
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  if (!state.analysis) return <NoResults />;
  const item = itemsOf(state.analysis).find((entry) => entry.rec.styleId === styleId);
  if (!item) {
    return (
      <div className="screen screen-empty">
        <header className="screen-head">
          <ScreenTitle>Este corte no está en tus recomendaciones</ScreenTitle>
          <p className="screen-lede">Puede que lo hayas abierto desde un análisis anterior.</p>
        </header>
        <Link to="/estudio/resultados" className="btn btn-primary">
          Ver mis recomendaciones
        </Link>
      </div>
    );
  }

  const { rec, style } = item;
  const skip = skippedFactors(state.analysis);
  const favorite = state.favorites.includes(rec.styleId);
  const comparing = state.compare.includes(rec.styleId);

  const ticket = [
    `FOLIA · ${rec.variantName}`,
    `Base: ${style.name} (${lengthCategoryLabels[style.length].toLowerCase()})`,
    '',
    'Qué pedir:',
    rec.salonInstructions,
    ...(rec.adaptations.length ? ['', 'Ajustes para mí:', ...rec.adaptations.map((line) => `- ${line}`)] : []),
    '',
    `Mantenimiento: unos ${rec.dailyMinutes} min al día; corte cada ${cadenceText(style)}.`,
    ...(rec.products.length ? [`Productos y herramientas: ${rec.products.join(', ')}.`] : []),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="screen screen-detail">
      <Link to="/estudio/resultados" className="back-link">
        Volver a las recomendaciones
      </Link>
      <header className="detail-head">
        <ScreenTitle>{rec.variantName}</ScreenTitle>
        <p className="results-meta">
          {rec.variantName.trim().toLowerCase() !== style.name.toLowerCase() ? `Base: ${style.name} · ` : ''}
          {lengthCategoryLabels[item.length]} · {rec.aesthetics.map((key) => aestheticLabels[key]).join(', ')}
        </p>
      </header>

      <div className="detail-top">
        <figure className="detail-figure">
          <div className="detail-figure-pair">
            <div>
              <HeadSheet spec={style.figure} view="front" surface="field" label={`Esquema frontal de ${style.name}`} />
              <p className="figure-note">De frente · {cutLabel(style.figure, 'front')}</p>
            </div>
            <div>
              <HeadSheet spec={style.figure} view="profile" surface="field" label={`Esquema de perfil de ${style.name}`} />
              <p className="figure-note">De perfil · {cutLabel(style.figure, 'profile')}</p>
            </div>
          </div>
          <figcaption>Esquema de la silueta del corte; la línea azul marca dónde se corta. No es una simulación sobre tu cara.</figcaption>
        </figure>

        <div className="detail-score">
          <p className="score score-large num">{item.score}</p>
          <p className="score-label">
            {BAND_LABELS[item.band]}
            <br />
            <span className="muted">compatibilidad estimada sobre 100</span>
          </p>
          <ul className="card-facts">
            <li>
              <span className="num">{rec.dailyMinutes}</span> min al día
            </li>
            <li>{difficultyLabels[rec.difficulty]}</li>
            <li>Corte cada {cadenceText(style)}</li>
          </ul>
          <div className="card-actions">
            <button type="button" className="btn btn-outline" aria-pressed={favorite} onClick={() => toggleFavorite(rec.styleId)}>
              {favorite ? 'Guardado' : 'Guardar'}
            </button>
            <label className="check check-inline">
              <input type="checkbox" checked={comparing} onChange={() => toggleCompare(rec.styleId)} />
              <span>Comparar</span>
            </label>
          </div>
        </div>
      </div>

      <section aria-labelledby="preview-title" className="detail-section">
        <h2 id="preview-title" className="section-title">
          Cómo te quedaría
        </h2>
        <PreviewPanel item={item} size="full" />
      </section>

      <section aria-labelledby="why-title" className="detail-section">
        <h2 id="why-title" className="section-title">
          Por qué te lo proponemos
        </h2>
        <p className="detail-rationale">{rec.rationale}</p>
        <ScoreBreakdown rec={rec} skip={skip} score={item.score} />
      </section>

      <section aria-labelledby="ticket-title" className="detail-section ticket">
        <h2 id="ticket-title" className="section-title">
          Qué pedir en la peluquería
        </h2>
        <p className="ticket-brief">{rec.salonInstructions}</p>
        {rec.adaptations.length ? (
          <>
            <h3 className="notes-title">Ajustes para ti</h3>
            <ul className="plain-list">
              {rec.adaptations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        <h3 className="notes-title">Productos y herramientas</h3>
        <p>{rec.products.length ? rec.products.join(', ') : 'Ninguno en especial.'}</p>
        <div className="screen-actions no-print">
          <button type="button" className="btn btn-ink" onClick={() => void copy()}>
            Copiar indicaciones
          </button>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            Imprimir ficha
          </button>
          <p className="action-reason" role="status">
            {copied === 'done'
              ? 'Copiado. Pégalo en un mensaje para tu peluquería.'
              : copied === 'failed'
                ? 'No se ha podido copiar; selecciona el texto a mano.'
                : ''}
          </p>
        </div>
      </section>

      <section aria-labelledby="tradeoffs-title" className="detail-section">
        <h2 id="tradeoffs-title" className="section-title">
          Ten en cuenta
        </h2>
        <ul className="plain-list">
          {rec.tradeoffs.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
