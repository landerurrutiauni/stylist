import { useId, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { STATUS_TEXT, useApiStatus } from '../api/useApiStatus.ts';
import { useSession } from '../session/session.tsx';
import { ScreenTitle } from '../ui/ScreenTitle.tsx';

export function ConsentStep() {
  const { state, setConsent, setMode } = useSession();
  const navigate = useNavigate();
  const status = useApiStatus();
  const id = useId();
  const [checked, setChecked] = useState(state.consent);

  if (!state.photos.frontal || !state.photos.profile) return <Navigate to="/estudio/fotos" replace />;

  const live = status.state === 'available';
  const model = status.state === 'available' ? status.model : null;

  const proceed = (mode: 'live' | 'demo') => {
    setConsent(mode === 'live');
    setMode(mode);
    navigate('/estudio/cuestionario/estilos');
  };

  return (
    <div className="screen screen-consent">
      <header className="screen-head">
        <ScreenTitle>Antes de enviar tus fotos</ScreenTitle>
        <p className="screen-lede">Para analizarlas, tus fotos tienen que salir de este navegador. Esto es lo que pasa con ellas.</p>
      </header>

      <dl className="facts">
        <div>
          <dt>Qué se envía</dt>
          <dd>
            Tus dos fotos, ya reducidas a 1600 px y sin metadatos (ni ubicación, ni fecha, ni modelo de móvil), y tus respuestas al cuestionario.
          </dd>
        </div>
        <div>
          <dt>A quién</dt>
          <dd>
            Al servidor de FOLIA, que las reenvía a Anthropic, la empresa que desarrolla Claude, para que su modelo{model ? ` (${model})` : ''} las
            analice.
          </dd>
        </div>
        <div>
          <dt>Para qué</dt>
          <dd>Solo para describir los rasgos visibles y proponerte cortes. No se identifica a nadie ni se valora tu aspecto.</dd>
        </div>
        <div>
          <dt>Qué guarda FOLIA</dt>
          <dd>Nada. El servidor procesa la petición en memoria, no guarda las fotos ni las respuestas y no las escribe en sus registros.</dd>
        </div>
        <div>
          <dt>Qué hace Anthropic</dt>
          <dd>
            Según su documentación pública, las imágenes no se conservan más allá de la petición y el contenido no se usa para entrenar modelos sin
            permiso expreso. Puede conservar datos si la ley lo exige o si sus sistemas de seguridad marcan una petición. FOLIA no controla ese
            tratamiento.
          </dd>
        </div>
        <div>
          <dt>En tu navegador</dt>
          <dd>Las fotos están solo en memoria. «Borrar sesión» o cerrar la pestaña las elimina.</dd>
        </div>
      </dl>
      <p className="small-print">
        Más detalle en <Link to="/privacidad">Privacidad</Link>. Aceptar aquí no sustituye a las obligaciones legales de quien publique FOLIA.
      </p>

      {status.state === 'checking' ? (
        <p className="inline-status" role="status">
          Comprobando si el análisis real está disponible…
        </p>
      ) : null}

      {live ? (
        <div className="consent-box">
          <label className="check" htmlFor={`${id}-consent`}>
            <input id={`${id}-consent`} type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            <span>Acepto que FOLIA envíe mis dos fotos y mis respuestas a Anthropic para este análisis.</span>
          </label>
          <div className="screen-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!checked}
              aria-describedby={checked ? undefined : `${id}-why`}
              onClick={() => proceed('live')}
            >
              Aceptar y seguir
            </button>
            {!checked ? (
              <p id={`${id}-why`} className="action-reason">
                Marca la casilla para continuar con el análisis real.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {status.state !== 'checking' && !live ? (
        <div className="notice" role="status">
          <p>
            <strong>Análisis real no disponible.</strong>{' '}
            {status.state === 'unreachable' ? `${STATUS_TEXT.unreachable} ${status.message}` : STATUS_TEXT[status.state]}
          </p>
          <p>Puedes seguir en modo demostración: tus fotos no saldrán del navegador y las recomendaciones saldrán solo de tus respuestas.</p>
        </div>
      ) : null}

      {status.state !== 'checking' ? (
        <div className="screen-actions screen-actions-secondary">
          <button type="button" className={`btn ${live ? 'btn-text' : 'btn-primary'}`} onClick={() => proceed('demo')}>
            Seguir sin enviar fotos (modo demostración)
          </button>
        </div>
      ) : null}
    </div>
  );
}
