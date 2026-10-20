import { Link, Navigate, useNavigate } from 'react-router';
import type { DraftAnswers } from '../../shared/schema/answers.ts';
import { STATUS_TEXT, useApiStatus } from '../api/useApiStatus.ts';
import { useSession } from '../session/session.tsx';
import { ScreenTitle } from '../ui/ScreenTitle.tsx';
import { QUESTIONS, missingRequired, type Field } from './questions.ts';

function describe(field: Field, answers: DraftAnswers): string | null {
  const value = answers[field.key];
  if (field.kind === 'text') return typeof value === 'string' && value.trim() ? `«${value.trim()}»` : null;
  if (field.kind === 'single') {
    const option = field.options.find((item) => item.value === value);
    return option ? option.label : null;
  }
  const list = (value as string[]).map((item) => field.options.find((option) => option.value === item)?.label).filter(Boolean);
  return list.length ? list.join(', ') : null;
}

export function ReviewStep() {
  const { state, setMode, requestRun } = useSession();
  const navigate = useNavigate();
  const status = useApiStatus();
  const photos = Boolean(state.photos.frontal && state.photos.profile);

  if (state.mode !== 'demo' && (!photos || !state.consent)) return <Navigate to={photos ? '/estudio/consentimiento' : '/estudio/fotos'} replace />;

  const missing = missingRequired(state.answers);
  const live = state.mode === 'live';
  const liveBlocked = live && status.state !== 'available' && status.state !== 'checking';

  const run = (mode: 'live' | 'demo') => {
    setMode(mode);
    requestRun();
    navigate('/estudio/analisis');
  };

  return (
    <div className="screen screen-review">
      <header className="screen-head">
        <ScreenTitle>Revisa antes de analizar</ScreenTitle>
        <p className="screen-lede">
          {live
            ? 'Esto es lo que se enviará a Anthropic para el análisis. Puedes corregir cualquier respuesta.'
            : 'Modo demostración: no se enviará nada. Las recomendaciones saldrán solo de estas respuestas.'}
        </p>
      </header>

      <div className="review-layout">
        <section aria-labelledby="review-answers-title">
          <h2 id="review-answers-title" className="section-title">
            Respuestas
          </h2>
          <dl className="review-list">
            {QUESTIONS.map((question) => {
              const parts = question.fields.map((field) => describe(field, state.answers)).filter((text): text is string => Boolean(text));
              const empty = parts.length === 0;
              return (
                <div key={question.slug} className={empty && question.required ? 'is-missing' : undefined}>
                  <dt>{question.short}</dt>
                  <dd>{empty ? (question.required ? 'Falta responder' : 'Sin respuesta') : parts.join(' · ')}</dd>
                  <dd className="review-edit">
                    <Link to={`/estudio/cuestionario/${question.slug}`} aria-label={`Cambiar: ${question.short}`}>
                      Cambiar
                    </Link>
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
        {photos ? (
          <section className="review-photos" aria-labelledby="review-photos-title">
            <h2 id="review-photos-title" className="section-title">
              Fotos
            </h2>
            <div className="review-thumbs">
              {(['frontal', 'profile'] as const).map((kind) => {
                const photo = state.photos[kind]!;
                return (
                  <figure key={kind}>
                    <img src={photo.url} alt={`Foto ${kind === 'frontal' ? 'frontal' : 'de perfil'}`} width={photo.width} height={photo.height} />
                    <figcaption>{kind === 'frontal' ? 'De frente' : 'De perfil'}</figcaption>
                  </figure>
                );
              })}
            </div>
            <Link to="/estudio/fotos" className="review-change">
              Cambiar fotos
            </Link>
          </section>
        ) : null}
      </div>

      {liveBlocked ? (
        <div className="notice" role="status">
          <p>
            <strong>Análisis real no disponible.</strong>{' '}
            {status.state === 'unreachable'
              ? `${STATUS_TEXT.unreachable} ${status.message}`
              : STATUS_TEXT[status.state as 'not_configured' | 'missing_api_key']}
          </p>
        </div>
      ) : null}

      <div className="screen-actions">
        {live ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={missing.length > 0 || liveBlocked || status.state === 'checking'}
            onClick={() => run('live')}
          >
            Analizar mis fotos
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={missing.length > 0} onClick={() => run('demo')}>
            Ver la demostración
          </button>
        )}
        {live ? (
          <button type="button" className="btn btn-text" disabled={missing.length > 0} onClick={() => run('demo')}>
            Probar antes en modo demostración
          </button>
        ) : null}
        {missing.length > 0 ? (
          <p className="action-reason" role="status">
            Falta responder: {missing.map((question) => question.short.toLowerCase()).join(', ')}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
