import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';

export interface ConfirmDialogHandle {
  open(): void;
}

interface Props {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  children: ReactNode;
}

/** A native modal dialog: focus is trapped and Escape closes it. */
export const ConfirmDialog = forwardRef<ConfirmDialogHandle, Props>(function ConfirmDialog(
  { title, confirmLabel, cancelLabel = 'Cancelar', onConfirm, children },
  ref,
) {
  const dialog = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => ({ open: () => dialog.current?.showModal() }), []);

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-body">
      <h2 id="dialog-title">{title}</h2>
      <p id="dialog-body">{children}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-outline" onClick={() => dialog.current?.close()} autoFocus>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            dialog.current?.close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
});
