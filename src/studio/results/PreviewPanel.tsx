import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, requestPreview } from '../../api/client.ts';
import { previewStatus, useApiStatus, type PreviewProvider } from '../../api/useApiStatus.ts';
import { downscale } from '../../images/process.ts';
import type { Item } from '../../lib/results.ts';
import { previewKey, useSession, type Preview, type PreviewView } from '../../session/session.tsx';
import type { ProcessedPhoto } from '../../images/process.ts';

const VIEWS: PreviewView[] = ['front', 'profile'];
const VIEW_WORDS: Record<PreviewView, string> = { front: 'de frente', profile: 'de perfil' };

/** What the consent says about each image service, from its published terms. */
const PROVIDERS: Record<PreviewProvider, { name: string; service: string; facts: string[]; caption: string }> = {
  cloudflare: {
    name: 'Cloudflare',
    service: 'Workers AI, con el modelo FLUX.2 [klein] de Black Forest Labs',
    facts: [
      'Se envía una copia reducida de cada foto (512 px), no la original.',
      'Según su documentación, Cloudflare no conserva lo que recibe ni lo que genera una vez terminada la petición, y no lo usa para entrenar modelos.',
      'Es gratuito dentro de una cuota diaria: si se agota, podrás volver a probar al día siguiente.',
    ],
    caption: 'Es una aproximación: el resultado real depende del corte, de tu pelo y del peinado.',
  },
  google: {
    name: 'Google',
    service: 'API de Gemini',
    facts: [
      'FOLIA pide a Google que no almacene la petición, pero Google conserva datos hasta 55 días para detectar usos que infrinjan su política.',
      'Según las condiciones de Google, en proyectos de pago el contenido no se usa para mejorar sus productos.',
    ],
    caption:
      'Es una aproximación: el resultado real depende del corte, de tu pelo y del peinado. Lleva una marca de agua invisible (SynthID) que la identifica como generada.',
  },
};

/**
 * "Ver cómo te queda": AI-edited versions of the person's own frontal and
 * profile photos with this cut. They are generated only when asked, after a
 * consent that names the image service, kept in memory and labelled as
 * simulations everywhere.
 */
export function PreviewPanel({ item, size }: { item: Item; size: 'compact' | 'full' }) {
  const { state, setPreview, setPreviewConsent } = useSession();
  const status = previewStatus(useApiStatus());
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const photos: Record<PreviewView, ProcessedPhoto | null> = { front: state.photos.frontal, profile: state.photos.profile };
  const previews: Record<PreviewView, Preview | undefined> = {
    front: state.previews[previewKey(item.rec.styleId, 'front')],
    profile: state.previews[previewKey(item.rec.styleId, 'profile')],
  };
  const views = VIEWS.filter((view) => photos[view]);
  const hasPreview = VIEWS.some((view) => previews[view]);

  useEffect(() => () => controller.current?.abort(), []);

  if (!photos.front) {
    return size === 'full' ? <p className="preview-unavailable">Para ver una simulación de este corte sobre tu cara hacen falta tus fotos.</p> : null;
  }
  // In a card, an unavailable simulation is said once for the whole list, not on every card.
  if (size === 'compact' && !status.available && !status.checking && !hasPreview) return null;

  /** Both views at once: the frontal photo and the profile photo, each edited with this cut. */
  const generate = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    const results = await Promise.allSettled(
      views.map(async (view) => {
        const photo = await downscale(photos[view]!.blob, status.maxSide);
        const image = await requestPreview(
          {
            photo,
            view,
            styleId: item.rec.styleId,
            variantName: item.rec.variantName,
            instructions: item.rec.salonInstructions,
            texture: state.answers.texture,
          },
          abort.signal,
        );
        setPreview(previewKey(item.rec.styleId, view), {
          url: URL.createObjectURL(image.blob),
          blob: image.blob,
          model: image.model,
          createdAt: new Date().toISOString(),
        });
      }),
    );
    window.clearInterval(timer);
    setBusy(false);
    const problems = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown)
      .filter((problem) => !(problem instanceof ApiError && problem.code === 'cancelled'));
    if (problems.length > 0) {
      const messages = [
        ...new Set(problems.map((problem) => (problem instanceof ApiError ? problem.message : 'No se ha podido generar la vista previa.'))),
      ];
      setError(messages.join(' '));
    }
  };

  const start = () => {
    if (state.previewConsent) void generate();
    else dialog.current?.showModal();
  };

  const clear = () => VIEWS.forEach((view) => setPreview(previewKey(item.rec.styleId, view), null));

  const unavailable = !status.available && !status.checking;
  const provider = PROVIDERS[status.provider ?? 'google'];
  const model = previews.front?.model ?? previews.profile?.model;

  return (
    <div className={`preview preview-${size}`} data-testid="preview-panel">
      {hasPreview ? (
        <figure className="preview-figure">
          <div className={`preview-grid preview-grid-${size}`}>
            {VIEWS.map((view) => {
              const photo = photos[view];
              const preview = previews[view];
              if (!photo || !preview) return null;
              return (
                <div key={view} className="preview-view">
                  {size === 'full' ? (
                    <div>
                      <img src={photo.url} alt={`Tu foto ${VIEW_WORDS[view]}, sin cambios`} width={photo.width} height={photo.height} />
                      <p className="preview-tag">Tu foto {VIEW_WORDS[view]}</p>
                    </div>
                  ) : null}
                  <div>
                    <img
                      src={preview.url}
                      alt={`Simulación generada por IA de tu foto ${VIEW_WORDS[view]} con ${item.rec.variantName}`}
                      width={photo.width}
                      height={photo.height}
                    />
                    <p className="preview-tag">
                      Simulación con IA{size === 'compact' ? ` · ${VIEW_WORDS[view]}` : ''}
                      {size === 'full' ? (
                        <>
                          {' · '}
                          <a href={preview.url} download={`folia-${item.rec.styleId}-${view}.${preview.blob.type === 'image/png' ? 'png' : 'jpg'}`}>
                            Descargar
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <figcaption className="preview-caption">
            Imágenes generadas con IA{model ? ` (${model})` : ''} a partir de tus fotos. {provider.caption}
          </figcaption>
        </figure>
      ) : null}

      {busy ? (
        <p className="preview-progress" role="status">
          Generando la vista {views.length > 1 ? 'de frente y la de perfil' : 'de frente'}… <span className="num">{elapsed} s</span>. Suele tardar
          entre 10 y 40 segundos.{' '}
          <button type="button" className="btn-text" onClick={() => controller.current?.abort()}>
            Cancelar
          </button>
        </p>
      ) : null}

      {error ? (
        <p className="preview-error" role="alert">
          {error}
        </p>
      ) : null}

      {!busy ? (
        <div className="preview-actions">
          <button
            type="button"
            className={`btn ${hasPreview ? 'btn-outline' : 'btn-primary'}`}
            onClick={start}
            disabled={unavailable || status.checking}
            aria-describedby={unavailable ? `${id}-why` : undefined}
          >
            {hasPreview ? 'Generar otra versión' : 'Ver cómo te queda'}
          </button>
          {hasPreview && size === 'full' ? (
            <button type="button" className="btn btn-text" onClick={clear}>
              Borrar simulaciones
            </button>
          ) : null}
        </div>
      ) : null}
      {unavailable ? (
        <p id={`${id}-why`} className="action-reason">
          La simulación con IA no está configurada en el servidor de esta publicación.
        </p>
      ) : null}

      <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Ver el corte sobre tus fotos</h2>
        <p>
          Para generar la simulación, tus fotos de frente y de perfil y la descripción del corte se envían a <strong>{provider.name}</strong> (
          {provider.service}
          {status.model ? `; modelo ${status.model}` : ''}), que devuelve tus fotos con el pelo cambiado. Claude, el modelo que hace el análisis, no
          genera imágenes.
        </p>
        <ul className="plain-list">
          <li>FOLIA no guarda ni tus fotos ni las imágenes generadas: solo se muestran en este navegador.</li>
          {provider.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
          <li>Usa solo fotos tuyas. Cada imagen es una simulación generada por IA y así se indica siempre.</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>Las fotos son mías y acepto enviarlas a {provider.name} para generar simulaciones en esta sesión.</span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!agree}
            onClick={() => {
              setPreviewConsent(true);
              dialog.current?.close();
              void generate();
            }}
          >
            Aceptar y generar
          </button>
        </div>
      </dialog>
    </div>
  );
}
