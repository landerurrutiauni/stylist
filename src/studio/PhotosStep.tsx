import { useNavigate } from 'react-router';
import { useSession } from '../session/session.tsx';
import { ScreenTitle } from '../ui/ScreenTitle.tsx';
import { FramingGuide } from './FramingGuide.tsx';
import { PhotoSlot } from './PhotoSlot.tsx';

const TIPS = [
  'Luz uniforme de frente, por ejemplo mirando a una ventana. Evita una lámpara justo encima.',
  'La cara entera a la vista: aparta el pelo de la frente si puedes y quítate las gafas.',
  'Sin filtros, retoques ni efectos de belleza.',
  'Un fondo liso que contraste con tu pelo, para que se distinga el contorno.',
  'La cámara a la altura de la cara y a un brazo de distancia; de más cerca, el objetivo deforma.',
  'Para el perfil, gira la cabeza unos 90°, hasta que la cámara vea la línea de la nariz y del mentón.',
];

export function PhotosStep() {
  const { state } = useSession();
  const navigate = useNavigate();
  const { frontal, profile } = state.photos;
  const blocked = [frontal, profile].some((photo) => photo?.issues.some((issue) => issue.severity === 'block'));
  const missing = !frontal ? (!profile ? 'Faltan las dos fotos.' : 'Falta la foto de frente.') : !profile ? 'Falta la foto de perfil.' : null;
  const reason = missing ?? (blocked ? 'Sustituye la foto que no se puede usar.' : null);

  return (
    <div className="screen screen-photos">
      <header className="screen-head">
        <ScreenTitle>Tus dos fotos</ScreenTitle>
        <p className="screen-lede">
          Una de frente y otra de perfil, las dos vistas de la ficha en la que un peluquero planea un corte. Se quedan en tu navegador hasta que
          aceptes enviarlas.
        </p>
      </header>

      <div className="photos-layout">
        <div className="slots">
          <PhotoSlot kind="frontal" />
          <PhotoSlot kind="profile" />
        </div>
        <aside className="tips" aria-labelledby="tips-title">
          <h2 id="tips-title" className="section-title">
            Cómo hacer buenas fotos
          </h2>
          <FramingGuide />
          <ul>
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="screen-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={Boolean(reason)}
          aria-describedby={reason ? 'photos-reason' : undefined}
          onClick={() => navigate('/estudio/consentimiento')}
        >
          Continuar
        </button>
        {reason ? (
          <p id="photos-reason" className="action-reason" role="status">
            {reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
