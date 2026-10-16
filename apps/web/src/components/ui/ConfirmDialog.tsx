import { useEffect, useId, useRef, type ReactNode } from 'react';
import { usePageTone } from '../layout/page-tone';
import { Button } from './Button';

/**
 * Asks before an action that cannot be taken back. A native modal dialog: focus moves into it and stays
 * there, Esc or a click outside cancels, and the page behind is inert until it closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** the action destroys or undoes something: its button says so in red */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dark = usePageTone() === 'dark';

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // Esc closes a dialog natively; keep React's state in step with it
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(e) => e.target === e.currentTarget && !pending && onCancel()}
      className={`m-auto w-[min(28rem,calc(100vw-2rem))] border border-bench bg-alu-50 p-0 text-ink backdrop:bg-black/60 ${
        dark ? 'surface-dark' : ''
      }`}
    >
      {open && (
        <div className="relative space-y-4 p-6">
          <span
            aria-hidden="true"
            className={`absolute inset-x-0 top-0 h-[3px] ${danger ? 'bg-danger' : 'bg-signal'}`}
          />
          <h2 id={titleId} className="font-expanded text-xl font-extrabold uppercase leading-tight">
            {title}
          </h2>
          {children && <div className="text-sm text-ink-2">{children}</div>}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={pending} onClick={onCancel} autoFocus>
              {cancelLabel}
            </Button>
            <Button
              disabled={pending}
              onClick={onConfirm}
              // the danger red is light on the dark ground: dark lettering keeps it readable
              className={danger ? 'border-danger! bg-danger! text-[#15181a]!' : ''}
              data-variant={danger ? undefined : 'primary'}
            >
              {pending ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
