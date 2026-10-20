import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, requestPreview } from '../../api/client.ts';
import { previewStatus, useApiStatus } from '../../api/useApiStatus.ts';
import type { Item } from '../../lib/results.ts';
import { useSession } from '../../session/session.tsx';

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
      const image = await requestPreview(
        {
          frontal: frontal.blob,
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
              <img src={preview.url} alt={`Simulación generada por IA de tu foto frontal con ${item.rec.variantName}`} />
              <p className="preview-tag">Simulación con IA</p>
            </div>
          </div>
          <figcaption className="preview-caption">
            Imagen generada con IA ({preview.model}) a partir de tu foto. Es una aproximación: el resultado real depende del corte, de tu pelo y del
            peinado. Lleva una marca de agua invisible (SynthID) que la identifica como generada.
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
          Para generar la simulación, tu foto frontal y la descripción del corte se envían a <strong>Google</strong> (API de Gemini
          {status.model ? `, modelo ${status.model}` : ''}), que devuelve tu foto con el pelo cambiado. Claude, el modelo que hace el análisis, no
          genera imágenes.
        </p>
        <ul className="plain-list">
          <li>FOLIA no guarda ni tu foto ni la imagen generada: solo se muestran en este navegador.</li>
          <li>
            FOLIA pide a Google que no almacene la petición, pero Google conserva datos hasta 55 días para detectar usos que infrinjan su política.
          </li>
          <li>Según las condiciones de Google, en proyectos de pago el contenido no se usa para mejorar sus productos.</li>
          <li>Usa solo fotos tuyas. La imagen es una simulación y lleva una marca de agua invisible que la identifica.</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>La foto es mía y acepto enviarla a Google para generar simulaciones en esta sesión.</span>
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
