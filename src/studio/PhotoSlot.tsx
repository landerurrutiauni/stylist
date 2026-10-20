import { useId, useRef, useState, type ChangeEvent } from 'react';
import type { FigureSpec } from '../../shared/catalog/styles.ts';
import { HeadSheet } from '../figures/HeadSheet.tsx';
import { PhotoError, processPhoto } from '../images/process.ts';
import type { PhotoKind } from '../images/quality.ts';
import { useSession } from '../session/session.tsx';
import { CameraDialog, cameraAvailable, type CameraDialogHandle } from './CameraDialog.tsx';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** The empty slot shows the bare mannequin of the matching head-sheet view. */
const EMPTY_FIGURE: FigureSpec = { top: 0, sides: 'skin', length: 'crown', fringe: 'none', part: 'none', texture: 'straight', layers: 'none' };

const COPY: Record<PhotoKind, { title: string; shows: string; camera: string; facing: 'user' | 'environment' }> = {
  frontal: {
    title: 'De frente',
    shows: 'Contorno, frente, pómulos, mejillas, mandíbula, mentón y el nacimiento del pelo.',
    camera: 'Mira a la cámara con la cara entera dentro del encuadre y el pelo apartado de la frente si puedes.',
    facing: 'user',
  },
  profile: {
    title: 'De perfil',
    shows: 'La línea del perfil, la proyección de mandíbula y mentón, y la nuca si se ve.',
    camera: 'Gira la cabeza hasta que la cámara vea tu perfil. Es más fácil si alguien te ayuda.',
    facing: 'environment',
  },
};

export function PhotoSlot({ kind }: { kind: PhotoKind }) {
  const { state, setPhoto } = useSession();
  const photo = state.photos[kind];
  const copy = COPY[kind];
  const id = useId();
  const camera = useRef<CameraDialogHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File, source: 'file' | 'camera') => {
    setBusy(true);
    setError(null);
    try {
      setPhoto(kind, await processPhoto(file, kind, source));
    } catch (problem) {
      setError(problem instanceof PhotoError ? problem.message : 'No hemos podido preparar esa imagen. Prueba con otra.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void accept(file, 'file');
  };

  const blocking = photo?.issues.filter((issue) => issue.severity === 'block') ?? [];
  const warnings = photo?.issues.filter((issue) => issue.severity === 'warning') ?? [];
  const status = busy ? 'Preparando la foto…' : photo ? (blocking.length ? 'No se puede usar' : warnings.length ? 'Revísala' : 'Lista') : 'Pendiente';
  const useCamera = cameraAvailable();

  return (
    <section className={`slot${photo ? ' is-filled' : ''}`} aria-labelledby={`${id}-title`} data-testid={`slot-${kind}`}>
      <div className="slot-head">
        <h2 id={`${id}-title`}>{copy.title}</h2>
        <p className="slot-status" aria-live="polite" data-state={blocking.length ? 'block' : warnings.length ? 'warn' : photo ? 'ok' : 'empty'}>
          {status}
        </p>
      </div>

      <div className="slot-frame">
        {photo ? (
          <img src={photo.url} alt={`Tu foto ${kind === 'frontal' ? 'frontal' : 'de perfil'}`} width={photo.width} height={photo.height} />
        ) : (
          <HeadSheet spec={EMPTY_FIGURE} view={kind === 'frontal' ? 'front' : 'profile'} surface="paper" hair={false} />
        )}
        {busy ? <span className="slot-busy">Preparando…</span> : null}
      </div>

      <p className="slot-shows">{copy.shows}</p>

      {error ? (
        <p className="slot-error" role="alert">
          {error}
        </p>
      ) : null}
      {[...blocking, ...warnings].length > 0 ? (
        <ul className="slot-issues">
          {[...blocking, ...warnings].map((issue) => (
            <li key={issue.code} data-severity={issue.severity}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="slot-actions">
        <label className={`btn ${photo ? 'btn-outline' : 'btn-ink'} file-button`}>
          <input
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            onChange={onFile}
            disabled={busy}
            aria-describedby={`${id}-formats`}
            data-testid={`input-${kind}`}
          />
          {photo ? 'Sustituir' : 'Elegir foto'}
        </label>
        {useCamera ? (
          <button type="button" className="btn btn-outline" onClick={() => camera.current?.open()} disabled={busy}>
            {photo ? 'Repetir con la cámara' : 'Hacer foto'}
          </button>
        ) : (
          <label className="btn btn-outline file-button">
            <input type="file" accept={ACCEPT} capture={copy.facing} className="visually-hidden" onChange={onFile} disabled={busy} />
            {photo ? 'Repetir con la cámara' : 'Hacer foto'}
          </label>
        )}
        {photo ? (
          <button type="button" className="btn btn-text" onClick={() => setPhoto(kind, null)}>
            Eliminar
          </button>
        ) : null}
      </div>
      <p id={`${id}-formats`} className="slot-formats">
        JPEG, PNG o WebP de hasta 15 MB.
      </p>

      {useCamera ? (
        <CameraDialog
          ref={camera}
          title={`Foto ${kind === 'frontal' ? 'de frente' : 'de perfil'}`}
          hint={copy.camera}
          facing={copy.facing}
          onCapture={(file) => void accept(file, 'camera')}
        />
      ) : null}
    </section>
  );
}
