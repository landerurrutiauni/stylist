import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { useSession } from '../session/session.tsx';
import { ConfirmDialog, type ConfirmDialogHandle } from '../ui/ConfirmDialog.tsx';
import { Wordmark } from '../ui/Wordmark.tsx';

const STEPS = [
  { key: 'fotos', label: 'Fotos', path: '/estudio/fotos' },
  { key: 'consentimiento', label: 'Consentimiento', path: '/estudio/consentimiento' },
  { key: 'cuestionario', label: 'Cuestionario', path: '/estudio/cuestionario/estilos' },
  { key: 'revision', label: 'Revisión', path: '/estudio/revision' },
  { key: 'resultados', label: 'Resultados', path: '/estudio/resultados' },
] as const;

function currentStep(pathname: string): number {
  const segment = pathname.split('/')[2] ?? 'fotos';
  if (segment === 'analisis' || segment === 'comparar') return 4;
  const index = STEPS.findIndex((step) => step.key === segment);
  return index < 0 ? 0 : index;
}

/**
 * The studio frame: a mustard frame around a white working sheet, the step
 * list in the bar and the one destructive action, "Borrar sesión".
 */
export function StudioLayout() {
  const { state, reset } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const dialog = useRef<ConfirmDialogHandle>(null);
  const step = currentStep(location.pathname);

  // Move focus to the new screen's title so screen readers announce it.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.focus({ preventScroll: true });
  }, [location.pathname]);

  const reachable = (index: number) => {
    if (index === 0) return true;
    const photos = Boolean(state.photos.frontal && state.photos.profile);
    if (index === 1) return photos;
    if (index === 2 || index === 3) return state.mode === 'demo' || (photos && state.consent);
    return Boolean(state.analysis);
  };

  const hasData = Boolean(state.photos.frontal || state.photos.profile || state.analysis || state.answers.expression);

  return (
    <div className="studio">
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="studio-bar">
        <Link to="/" className="studio-mark" aria-label="FOLIA, ir al inicio">
          <Wordmark />
        </Link>
        <nav aria-label="Pasos del estudio" className="studio-steps">
          <ol>
            {STEPS.map((item, index) => {
              const current = index === step;
              return (
                <li key={item.key} className={current ? 'is-current' : undefined}>
                  {reachable(index) && !current ? (
                    <Link to={item.path}>{item.label}</Link>
                  ) : (
                    <span aria-current={current ? 'step' : undefined}>{item.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="studio-count num" aria-hidden="true">
          {STEPS[step]!.label} · {step + 1} de {STEPS.length}
        </p>
        <button type="button" className="btn-text studio-reset" onClick={() => dialog.current?.open()} disabled={!hasData}>
          Borrar sesión
        </button>
      </header>
      <main id="main" className="sheet" tabIndex={-1}>
        <Outlet />
      </main>
      <ConfirmDialog
        ref={dialog}
        title="¿Borrar esta sesión?"
        confirmLabel="Borrar fotos y respuestas"
        onConfirm={() => {
          reset();
          navigate('/', { state: { notice: 'erased' } });
        }}
      >
        Se eliminarán de este navegador tus dos fotos, tus respuestas y las recomendaciones. Si ya enviaste un análisis, FOLIA no guardó nada en su
        servidor; el tratamiento por parte de Anthropic se explica en Privacidad.
      </ConfirmDialog>
    </div>
  );
}
