import { useId, useState, type ReactNode } from 'react';
import { AlertDialog as A } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from './form';
import { inputClass } from './styles';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  onConfirm: () => Promise<unknown> | void;
  /** Ako je zadano, korisnik mora upisati ovaj tekst (npr. ime zaposlenika) za potvrdu. */
  confirmText?: string;
  error?: string | null;
}

/** Potvrda destruktivne radnje (role="alertdialog"). Fokus po zadanom na "Odustani". */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, pendingLabel = 'Brisanje…',
  onConfirm, confirmText, error,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const inputId = useId();
  const matches = !confirmText || typed.trim() === confirmText.trim();

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault(); // dijalog zatvaramo tek nakon uspjeha
    if (!matches) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped('');
    } catch {
      /* greška se prikazuje kroz `error` */
    } finally {
      setPending(false);
    }
  };

  return (
    <A.Root open={open} onOpenChange={o => { if (!pending) { onOpenChange(o); if (!o) setTyped(''); } }}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-slate-900/50" />
        <A.Content
          className={cn(
            'fixed z-50 bg-white shadow-xl p-5 sm:p-6 focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl',
          )}
        >
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0" aria-hidden="true">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div className="min-w-0 flex-1">
              <A.Title className="text-base font-semibold text-slate-900">{title}</A.Title>
              <A.Description className="mt-1 text-sm text-slate-600">{description}</A.Description>
            </div>
          </div>

          {confirmText && (
            <div className="mt-4">
              <label htmlFor={inputId} className="block text-sm text-slate-700 mb-1">
                Za potvrdu upišite <strong className="font-semibold">{confirmText}</strong>
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                autoComplete="off"
                className={inputClass(false)}
              />
            </div>
          )}

          {error && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <A.Cancel
              disabled={pending}
              className="min-h-11 sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Odustani
            </A.Cancel>
            <A.Action
              onClick={handleConfirm}
              disabled={!matches || pending}
              className="min-h-11 sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              {pending && <Spinner />}
              {pending ? pendingLabel : confirmLabel}
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
