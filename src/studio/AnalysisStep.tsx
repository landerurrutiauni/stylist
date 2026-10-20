import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { answersSchema } from '../../shared/schema/answers.ts';
import type { Stage } from '../../shared/schema/events.ts';
import { analyze, ApiError } from '../api/client.ts';
import { demoAnalysis } from '../demo/engine.ts';
import { useSession } from '../session/session.tsx';
import { ScreenTitle } from '../ui/ScreenTitle.tsx';
import { errorCopy } from './errors.ts';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'received', label: 'Fotos y respuestas recibidas por el servidor' },
  { key: 'observing', label: 'Claude está estudiando las dos fotos' },
  { key: 'writing', label: 'Redactando las recomendaciones' },
  { key: 'validating', label: 'Comprobando que el resultado está completo' },
];

/**
 * Runs the analysis requested on the review screen and shows only what is
 * really happening: the stage the server reports, the number of
 * recommendations already written and the time elapsed. No invented
 * percentages.
 */
export function AnalysisStep() {
  const session = useSession();
  const { state, setAnalysis, finishRun } = session;
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage | 'sending'>('sending');
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const runRef = useRef<number | null>(null);

  const pending = state.pendingRun;

  useEffect(() => {
    if (pending === null || runRef.current === pending) return;
    runRef.current = pending;
    const answers = answersSchema.safeParse(state.answers);
    if (!answers.success) {
      finishRun();
      navigate('/estudio/revision', { replace: true });
      return;
    }

    if (state.mode === 'demo') {
      setAnalysis(demoAnalysis(answers.data, state.refinement));
      finishRun();
      navigate('/estudio/resultados', { replace: true });
      return;
    }

    const { frontal, profile } = state.photos;
    if (!frontal || !profile) {
      finishRun();
      navigate('/estudio/fotos', { replace: true });
      return;
    }

    const abort = new AbortController();
    controller.current = abort;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    analyze(
      { frontal: frontal.blob, profile: profile.blob, answers: answers.data, refinement: state.refinement },
      { onStage: setStage, onProgress: setCount },
      abort.signal,
    )
      .then((analysis) => {
        setAnalysis(analysis);
        finishRun();
        navigate('/estudio/resultados', { replace: true });
      })
      .catch((problem: unknown) => {
        finishRun();
        if (problem instanceof ApiError && problem.code === 'cancelled') {
          navigate('/estudio/revision', { replace: true });
          return;
        }
        setError(problem instanceof ApiError ? problem : new ApiError('bad_response', 'Error inesperado.', true));
      })
      .finally(() => window.clearInterval(timer));
    // The run is keyed by `pending`; the other values are read once when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Leaving the screen cancels the request, so nothing keeps running unseen.
  // The abort waits a tick so React's development double-mount does not cancel it.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => {
        if (!mounted.current) controller.current?.abort();
      }, 0);
    };
  }, []);

  if (pending === null && !error) {
    return <Navigate to={state.analysis ? '/estudio/resultados' : '/estudio/revision'} replace />;
  }

  if (error) {
    const copy = errorCopy(error);
    return (
      <div className="screen screen-analysis">
        <header className="screen-head">
          <ScreenTitle>{copy.title}</ScreenTitle>
          <p className="screen-lede">{copy.body}</p>
        </header>
        <div className="error-block" role="alert">
          <p>{error.message}</p>
          <p className="small-print">Código: {error.code}</p>
        </div>
        <div className="screen-actions">
          {error.retryable ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null);
                setStage('sending');
                setCount(0);
                setElapsed(0);
                session.requestRun();
              }}
            >
              Reintentar
            </button>
          ) : null}
          {error.field || copy.photos ? (
            <Link to="/estudio/fotos" className={`btn ${error.retryable ? 'btn-outline' : 'btn-primary'}`}>
              Sustituir las fotos
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              session.setMode('demo');
              setError(null);
              session.requestRun();
            }}
          >
            Ver la demostración
          </button>
          <Link to="/estudio/revision" className="btn btn-text">
            Volver a la revisión
          </Link>
        </div>
      </div>
    );
  }

  const reached = (key: Stage) => {
    const order = ['sending', ...STAGES.map((item) => item.key)];
    return order.indexOf(stage) >= order.indexOf(key);
  };

  return (
    <div className="screen screen-analysis" aria-busy="true">
      <header className="screen-head">
        <ScreenTitle>Analizando tus fotos</ScreenTitle>
        <p className="screen-lede">Suele tardar entre medio minuto y dos minutos. Puedes cancelarlo cuando quieras.</p>
      </header>
      <ol className="stages" aria-live="polite">
        {STAGES.map((item) => {
          const done = reached(item.key) && item.key !== stage;
          const current = item.key === stage;
          return (
            <li key={item.key} data-state={done ? 'done' : current ? 'current' : 'pending'}>
              <span className="stage-mark" aria-hidden="true" />
              <span className="stage-label">
                {item.label}
                {item.key === 'writing' && reached('writing') ? (
                  <span className="stage-count num">{count === 1 ? ' · 1 lista' : ` · ${count} listas`}</span>
                ) : null}
              </span>
              <span className="visually-hidden">{done ? 'hecho' : current ? 'en curso' : 'pendiente'}</span>
            </li>
          );
        })}
      </ol>
      <p className="elapsed num" aria-hidden="true">
        {stage === 'sending' ? 'Enviando' : 'Tiempo transcurrido'}: {elapsed} s
      </p>
      <div className="screen-actions">
        <button type="button" className="btn btn-outline" onClick={() => controller.current?.abort()}>
          Cancelar análisis
        </button>
      </div>
    </div>
  );
}
