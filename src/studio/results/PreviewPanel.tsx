import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, requestPreview } from '../../api/client.ts';
import { previewStatus, useApiStatus, type PreviewProvider } from '../../api/useApiStatus.ts';
import { downscale } from '../../images/process.ts';
import type { Item } from '../../lib/results.ts';
import { useSession } from '../../session/session.tsx';

/** What the consent says about each image service, from its published terms. */
const PROVIDERS: Record<PreviewProvider, { name: string; service: string; facts: string[]; caption: string }> = {
  cloudflare: {
    name: 'Cloudflare',
    service: 'Workers AI, con el modelo FLUX.2 [klein] de Black Forest Labs',
    facts: [
      'Se envía una copia reducida de tu foto frontal (512 px), no la original.',
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
 * "Ver cómo te queda": an AI-edited version of the person's own frontal photo
 * with this cut. It is generated only when asked, after a consent that names
 * the image service, kept in memory and labelled as a simulation everywhere.
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

  const frontal = state.photos.frontal;
  const preview = state.previews[item.rec.styleId];

  useEffect(() => () => controller.current?.abort(), []);

  if (!frontal) {
    return size === 'full' ? (
      <p className="preview-unavailable">Para ver una simulación de este corte sobre tu cara hace falta tu foto frontal.</p>
    ) : null;
  }
  // In a card, an unavailable simulation is said once for the whole list, not on every card.
  if (size === 'compact' && !status.available && !status.checking && !preview) return null;

  const generate = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const photo = await downscale(frontal.blob, status.maxSide);
      const image = await requestPreview(
        {
          frontal: photo,
          styleId: item.rec.styleId,
          variantName: item.rec.variantName,
          instructions: item.rec.salonInstructions,
          texture: state.answers.texture,
        },
        abort.signal,
      );
      setPreview(item.rec.styleId, {
        url: URL.createObjectURL(image.blob),
        blob: image.blob,
        model: image.model,
        createdAt: new Date().toISOString(),
      });
    } catch (problem) {
      if (problem instanceof ApiError && problem.code === 'cancelled') return;
      setError(problem instanceof ApiError ? problem.message : 'No se ha podido generar la vista previa.');
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  };

  const start = () => {
    if (state.previewConsent) void generate();
    else dialog.current?.showModal();
  };

  const download = () => {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview.url;
    link.download = `folia-${item.rec.styleId}.${preview.blob.type === 'image/png' ? 'png' : 'jpg'}`;
    link.click();
  };

  const unavailable = !status.available && !status.checking;
  const provider = PROVIDERS[status.provider ?? 'google'];

  return (
    <div className={`preview preview-${size}`} data-testid="preview-panel">
      {preview ? (
        <figure className="preview-figure">
          <div className="preview-pair">
            {size === 'full' ? (
              <div>
                <img src={frontal.url} alt="Tu foto frontal, sin cambios" width={frontal.width} height={frontal.height} />
                <p className="preview-tag">Tu foto</p>
              </div>
            ) : null}
            <div>
              <img
                src={preview.url}
                alt={`Simulación generada por IA de tu foto frontal con ${item.rec.variantName}`}
                width={frontal.width}
                height={frontal.height}
              />
              <p className="preview-tag">Simulación con IA</p>
            </div>
          </div>
          <figcaption className="preview-caption">
            Imagen generada con IA ({preview.model}) a partir de tu foto. {provider.caption}
          </figcaption>
        </figure>
      ) : null}

      {busy ? (
        <p className="preview-progress" role="status">
          Generando la simulación… <span className="num">{elapsed} s</span>. Suele tardar entre 10 y 40 segundos.{' '}
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
            className={`btn ${preview ? 'btn-outline' : 'btn-primary'}`}
            onClick={start}
            disabled={unavailable || status.checking}
            aria-describedby={unavailable ? `${id}-why` : undefined}
          >
            {preview ? 'Generar otra versión' : 'Ver cómo te queda'}
          </button>
          {preview && size === 'full' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={download}>
                Descargar imagen
              </button>
              <button type="button" className="btn btn-text" onClick={() => setPreview(item.rec.styleId, null)}>
                Borrar simulación
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {unavailable ? (
        <p id={`${id}-why`} className="action-reason">
          La simulación con IA no está configurada en el servidor de esta publicación.
        </p>
      ) : null}

      <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Ver el corte sobre tu foto</h2>
        <p>
          Para generar la simulación, tu foto frontal y la descripción del corte se envían a <strong>{provider.name}</strong> ({provider.service}
          {status.model ? `; modelo ${status.model}` : ''}), que devuelve tu foto con el pelo cambiado. Claude, el modelo que hace el análisis, no
          genera imágenes.
        </p>
        <ul className="plain-list">
          <li>FOLIA no guarda ni tu foto ni la imagen generada: solo se muestran en este navegador.</li>
          {provider.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
          <li>Usa solo fotos tuyas. La imagen es una simulación generada por IA y así se indica siempre.</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>La foto es mía y acepto enviarla a {provider.name} para generar simulaciones en esta sesión.</span>
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
