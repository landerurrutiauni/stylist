import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface CameraDialogHandle {
  open(): void;
}

interface Props {
  title: string;
  hint: string;
  facing: 'user' | 'environment';
  onCapture(file: File): void;
}

export const cameraAvailable = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Takes a photo with the device camera. The video stream stays on the device:
 * only the captured frame becomes a photo, and the stream stops as soon as the
 * dialog closes.
 */
export const CameraDialog = forwardRef<CameraDialogHandle, Props>(function CameraDialog({ title, hint, facing, onCapture }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'denied' | 'error'>('idle');

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => {});
      }
      setStatus('live');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
    }
  }, [facing]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        dialog.current?.showModal();
        void start();
      },
    }),
    [start],
  );

  useEffect(() => stop, [stop]);

  const close = () => {
    stop();
    dialog.current?.close();
    setStatus('idle');
  };

  const capture = () => {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    if (facing === 'user') {
      // The preview is mirrored like a mirror; the photo is not.
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(element, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], 'camara.jpg', { type: 'image/jpeg' }));
        close();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <dialog ref={dialog} className="dialog camera" aria-labelledby={`camera-${facing}-title`} onClose={stop} onCancel={stop}>
      <h2 id={`camera-${facing}-title`}>{title}</h2>
      <p className="camera-hint">{hint}</p>
      <div className="camera-frame">
        <video ref={video} playsInline muted className={facing === 'user' ? 'is-mirrored' : undefined} aria-label="Vista previa de la cámara" />
        {status === 'starting' ? <p className="camera-status">Abriendo la cámara…</p> : null}
        {status === 'denied' ? (
          <p className="camera-status" role="alert">
            El navegador no tiene permiso para usar la cámara. Puedes darlo en los ajustes del sitio o elegir una foto del dispositivo.
          </p>
        ) : null}
        {status === 'error' ? (
          <p className="camera-status" role="alert">
            No se ha podido abrir la cámara. Elige una foto del dispositivo.
          </p>
        ) : null}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-outline" onClick={close}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={capture} disabled={status !== 'live'}>
          Hacer la foto
        </button>
      </div>
    </dialog>
  );
});
