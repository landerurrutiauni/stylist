import { useId, useMemo, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AESTHETICS, REFINEMENT_LIMIT, type Aesthetic } from '../../../shared/schema/answers.ts';
import { aestheticLabels, lengthCategoryLabels, type LengthCategory } from '../../../shared/labels.ts';
import { issueLabels } from '../../lib/faceLabels.ts';
import { aestheticsIn, applyFilters, countByLength, itemsOf, skippedFactors, type DifficultyFilter, type Filters } from '../../lib/results.ts';
import { previewStatus, useApiStatus } from '../../api/useApiStatus.ts';
import { useSession } from '../../session/session.tsx';
import { ScreenTitle } from '../../ui/ScreenTitle.tsx';
import { FaceSection } from './FaceSection.tsx';
import { NoResults } from './NoResults.tsx';
import { RecommendationCard } from './RecommendationCard.tsx';

const LENGTH_PARAM: Record<string, LengthCategory> = { corto: 'short', medio: 'medium', largo: 'long' };
const LENGTH_SLUG: Record<LengthCategory, string> = { short: 'corto', medium: 'medio', long: 'largo' };
const LENGTHS: LengthCategory[] = ['short', 'medium', 'long'];

function readFilters(params: URLSearchParams, fallback: LengthCategory): Filters {
  const time = params.get('tiempo');
  const difficulty = params.get('dificultad');
  const aesthetic = params.get('estetica');
  return {
    length: LENGTH_PARAM[params.get('longitud') ?? ''] ?? fallback,
    maintenance: time === '5' || time === '10' || time === '20' ? time : 'any',
    aesthetic: aesthetic && (AESTHETICS as readonly string[]).includes(aesthetic) ? (aesthetic as Aesthetic) : 'any',
    difficulty: difficulty === 'low' || difficulty === 'medium' || difficulty === 'high' ? difficulty : 'any',
    favorites: params.get('guardados') === '1',
  };
}

const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' });

export function ResultsPage() {
  const { state, setRefinement, requestRun, setCompare } = useSession();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const id = useId();
  const analysis = state.analysis;
  const items = useMemo(() => (analysis ? itemsOf(analysis) : []), [analysis]);
  const preview = previewStatus(useApiStatus());

  if (!analysis) return <NoResults />;

  const output = analysis.output;
  const skip = skippedFactors(analysis);
  const counts = countByLength(items);
  const firstLength = LENGTHS.find((length) => counts[length] > 0) ?? 'short';
  const filters = readFilters(params, firstLength);
  const visible = applyFilters(items, filters, state.favorites);
  const inLength = items.filter((item) => item.length === filters.length);
  const usable = output.imageCheck.frontal.usable && output.imageCheck.profile.usable;
  const filtered = filters.maintenance !== 'any' || filters.aesthetic !== 'any' || filters.difficulty !== 'any' || filters.favorites;
  const demo = analysis.mode === 'demo';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    next.set('longitud', LENGTH_SLUG[filters.length]);
    setParams(next, { replace: true });
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + delta + 3) % 3;
    setParam('longitud', LENGTH_SLUG[LENGTHS[target]!]);
    document.getElementById(`${id}-tab-${LENGTHS[target]}`)?.focus();
  };

  const coverage = output.coverage[filters.length];

  return (
    <div className="screen screen-results">
      <header className="results-head">
        <div>
          <ScreenTitle>Tu ficha de estilo</ScreenTitle>
          <p className="results-meta">
            {demo
              ? 'Modo demostración · no se ha analizado ninguna foto'
              : `Análisis con Claude (${analysis.model ?? 'modelo no indicado'}) · ${dateFormat.format(new Date(analysis.createdAt))}`}
          </p>
        </div>
        <Link to="/estudio/revision" className="btn btn-outline">
          Cambiar respuestas
        </Link>
      </header>

      {demo ? (
        <div className="notice" role="note">
          <p>
            <strong>Modo demostración.</strong> Estas recomendaciones salen solo de tus respuestas y del catálogo de FOLIA. Tus fotos no se han
            enviado ni analizado, y el factor de rasgos faciales no cuenta en la compatibilidad.
          </p>
        </div>
      ) : null}

      <FaceSection analysis={analysis} />

      <section className="prefs" aria-labelledby="prefs-title">
        <h2 id="prefs-title" className="section-title">
          Lo que nos has contado
        </h2>
        <p className="prefs-summary">{output.preferences.summary}</p>
        {output.preferences.influences.length > 0 ? (
          <>
            <h3 className="notes-title">Qué ha influido en la selección</h3>
            <ul className="plain-list">
              {output.preferences.influences.map((influence) => (
                <li key={influence}>{influence}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {!usable ? (
        <section className="image-problem" aria-labelledby="problem-title">
          <h2 id="problem-title" className="section-title">
            Las fotos no permiten un análisis fiable
          </h2>
          <ul className="plain-list">
            {(['frontal', 'profile'] as const).map((kind) => {
              const check = output.imageCheck[kind];
              if (check.usable) return null;
              return (
                <li key={kind}>
                  <strong>{kind === 'frontal' ? 'Foto de frente' : 'Foto de perfil'}</strong>
                  {check.issues.length ? ` (${check.issues.map((issue) => issueLabels[issue]).join(', ')})` : ''}: {check.note}
                </li>
              );
            })}
          </ul>
          <p>No mostramos recomendaciones a partir de fotos que no se pueden leer.</p>
          <div className="screen-actions">
            <Link to="/estudio/fotos" className="btn btn-primary">
              Sustituir las fotos
            </Link>
          </div>
        </section>
      ) : (
        <section className="recs" aria-labelledby="recs-title">
          <div className="recs-head">
            <h2 id="recs-title" className="section-title">
              Recomendaciones
            </h2>
            <div className="tabs" role="tablist" aria-label="Longitud">
              {LENGTHS.map((length, index) => (
                <button
                  key={length}
                  id={`${id}-tab-${length}`}
                  type="button"
                  role="tab"
                  aria-selected={filters.length === length}
                  aria-controls={`${id}-panel`}
                  tabIndex={filters.length === length ? 0 : -1}
                  onClick={() => setParam('longitud', LENGTH_SLUG[length])}
                  onKeyDown={(event) => onTabKey(event, index)}
                >
                  {lengthCategoryLabels[length]} <span className="num tab-count">{counts[length]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filters" role="group" aria-label="Filtros">
            <label>
              <span>Tiempo al día</span>
              <select value={filters.maintenance} onChange={(event) => setParam('tiempo', event.target.value === 'any' ? null : event.target.value)}>
                <option value="any">Cualquiera</option>
                <option value="5">Hasta 5 min</option>
                <option value="10">Hasta 10 min</option>
                <option value="20">Hasta 20 min</option>
              </select>
            </label>
            <label>
              <span>Estética</span>
              <select value={filters.aesthetic} onChange={(event) => setParam('estetica', event.target.value === 'any' ? null : event.target.value)}>
                <option value="any">Todas</option>
                {aestheticsIn(items).map((aesthetic) => (
                  <option key={aesthetic} value={aesthetic}>
                    {aestheticLabels[aesthetic]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Dificultad</span>
              <select
                value={filters.difficulty}
                onChange={(event) => setParam('dificultad', event.target.value === 'any' ? null : (event.target.value as DifficultyFilter))}
              >
                <option value="any">Cualquiera</option>
                <option value="low">Fácil</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <label className="check check-inline">
              <input type="checkbox" checked={filters.favorites} onChange={(event) => setParam('guardados', event.target.checked ? '1' : null)} />
              <span>Solo guardados</span>
            </label>
          </div>

          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${filters.length}`} tabIndex={-1}>
            <p className="recs-count" aria-live="polite">
              {filtered
                ? `${visible.length} de ${inLength.length} cortes ${lengthCategoryLabels[filters.length].toLowerCase()}s con estos filtros`
                : `${inLength.length} ${inLength.length === 1 ? 'corte' : 'cortes'} de longitud ${lengthCategoryLabels[filters.length].toLowerCase()}`}
              {filtered ? (
                <>
                  {' · '}
                  <button type="button" className="btn-text" onClick={clearFilters}>
                    Quitar filtros
                  </button>
                </>
              ) : null}
            </p>
            {coverage ? <p className="coverage">{coverage}</p> : null}
            {!preview.available && !preview.checking && state.photos.frontal ? (
              <p className="recs-note">La simulación de cómo te queda cada corte no está activada en el servidor de esta publicación.</p>
            ) : null}
            {visible.length > 0 ? (
              <div className="cards">
                {visible.map((item) => (
                  <RecommendationCard key={item.rec.styleId} item={item} skip={skip} />
                ))}
              </div>
            ) : (
              <div className="empty-block">
                <p>
                  {inLength.length === 0
                    ? `No hay propuestas de longitud ${lengthCategoryLabels[filters.length].toLowerCase()} en este análisis.`
                    : 'Ningún corte cumple estos filtros.'}
                </p>
                {filtered ? (
                  <button type="button" className="btn btn-outline" onClick={clearFilters}>
                    Quitar filtros
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="refine" aria-labelledby="refine-title">
        <h2 id="refine-title" className="section-title">
          Ajustar la propuesta
        </h2>
        <p>
          Escribe qué cambiarías y genera una nueva selección con las mismas fotos.
          {demo
            ? ' En el modo de demostración el texto no se interpreta; cambia tus respuestas para ver otra selección.'
            : ' Se volverán a enviar a Anthropic con el consentimiento que ya diste.'}
        </p>
        <form
          className="refine-form"
          onSubmit={(event) => {
            event.preventDefault();
            requestRun();
            navigate('/estudio/analisis');
          }}
        >
          <label htmlFor={`${id}-refine`} className="field-label">
            ¿Qué cambiarías?
          </label>
          <textarea
            id={`${id}-refine`}
            rows={2}
            maxLength={REFINEMENT_LIMIT}
            value={state.refinement}
            placeholder="Más opciones con flequillo y menos tiempo de secador…"
            autoComplete="off"
            onChange={(event) => setRefinement(event.target.value)}
          />
          <div className="screen-actions">
            <button type="submit" className="btn btn-primary">
              Generar de nuevo
            </button>
          </div>
        </form>
      </section>

      {output.explore.length > 0 || output.limitations.length > 0 ? (
        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title" className="visually-hidden">
            Para seguir explorando y límites
          </h2>
          {output.explore.length > 0 ? (
            <div>
              <h3 className="notes-title">Para seguir explorando</h3>
              <ul className="plain-list">
                {output.explore.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {output.limitations.length > 0 ? (
            <div>
              <h3 className="notes-title">Límites de este análisis</h3>
              <ul className="plain-list">
                {output.limitations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.compare.length > 0 ? (
        <div className="compare-bar" role="region" aria-label="Comparación">
          <p>
            {state.compare.length === 1
              ? 'Elige otro corte para comparar.'
              : `Comparar ${state.compare.map((styleId) => items.find((item) => item.rec.styleId === styleId)?.rec.variantName ?? styleId).join(' y ')}`}
          </p>
          <div className="compare-bar-actions">
            <button type="button" className="btn-text" onClick={() => setCompare([])}>
              Quitar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={state.compare.length < 2}
              onClick={() => navigate(`/estudio/comparar?a=${state.compare[0]}&b=${state.compare[1]}`)}
            >
              Comparar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
