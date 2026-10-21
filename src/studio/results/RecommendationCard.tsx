import { useId } from 'react';
import { Link } from 'react-router';
import type { FactorKey } from '../../../shared/schema/analysis.ts';
import { aestheticLabels, difficultyShort, lengthCategoryLabels, styleCodeLabel } from '../../../shared/labels.ts';
import { BAND_LABELS } from '../../../shared/scoring.ts';
import { HeadSheet } from '../../figures/HeadSheet.tsx';
import { cadenceText, type Item } from '../../lib/results.ts';
import { useSession } from '../../session/session.tsx';
import { PreviewPanel } from './PreviewPanel.tsx';
import { ScoreBreakdown } from './ScoreBreakdown.tsx';

export function RecommendationCard({ item, skip }: { item: Item; skip: FactorKey[] }) {
  const { state, toggleFavorite, toggleCompare } = useSession();
  const id = useId();
  const { rec, style } = item;
  const favorite = state.favorites.includes(rec.styleId);
  const comparing = state.compare.includes(rec.styleId);
  const renamed = rec.variantName.trim().toLowerCase() !== style.name.toLowerCase();

  return (
    <article className="card" aria-labelledby={`${id}-name`} data-testid="recommendation" data-style={rec.styleId}>
      <div className="card-figure">
        <HeadSheet spec={style.figure} view="front" surface="field" label={`Esquema frontal de ${style.name}`} />
        <HeadSheet spec={style.figure} view="profile" surface="field" label={`Esquema de perfil de ${style.name}`} />
      </div>
      <div className="card-body">
        <p className="card-meta">
          {lengthCategoryLabels[item.length]} {styleCodeLabel(style.expressions)} · {rec.aesthetics.map((key) => aestheticLabels[key]).join(', ')}
        </p>
        <h3 id={`${id}-name`} className="card-name">
          {rec.variantName}
        </h3>
        {renamed ? <p className="card-base">Base: {style.name}</p> : null}

        <div className="card-score">
          <p className="score num" aria-label={`Compatibilidad estimada ${item.score} sobre 100`}>
            {item.score}
          </p>
          <p className="score-label">
            {BAND_LABELS[item.band]}
            <br />
            <span className="muted">
              compatibilidad estimada{rec.confidence === 'low' ? ' · confianza baja' : rec.confidence === 'medium' ? ' · confianza media' : ''}
            </span>
          </p>
        </div>

        <ul className="card-facts">
          <li>
            <span className="num">{rec.dailyMinutes}</span> min al día
          </li>
          <li>Dificultad {difficultyShort[rec.difficulty].toLowerCase()}</li>
          <li>Corte cada {cadenceText(style)}</li>
        </ul>

        <p className="card-rationale">{rec.rationale}</p>

        <details className="card-why">
          <summary>Por qué esta puntuación</summary>
          <ScoreBreakdown rec={rec} skip={skip} score={item.score} />
        </details>

        <PreviewPanel item={item} size="compact" />

        <div className="card-actions">
          <Link to={`/estudio/resultados/${rec.styleId}`} className="btn btn-ink">
            Ver ficha
          </Link>
          <button type="button" className="btn btn-outline" aria-pressed={favorite} onClick={() => toggleFavorite(rec.styleId)}>
            {favorite ? 'Guardado' : 'Guardar'}
          </button>
          <label className="check check-inline">
            <input type="checkbox" checked={comparing} onChange={() => toggleCompare(rec.styleId)} />
            <span>Comparar</span>
          </label>
        </div>
      </div>
    </article>
  );
}
