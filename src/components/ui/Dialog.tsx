import { useEffect, useState, type ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DialogProps {
  /** Dijalozi se u aplikaciji montiraju uvjetno (`{show && <X />}`), pa je zadano otvoreno. */
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Jedinstvena modalna komponenta (Radix Dialog):
 * role="dialog", aria-modal, aria-labelledby/-describedby, Escape, klik izvan,
 * focus trap, autofokus na prvo polje forme i vraćanje fokusa na okidač.
 * Portal u <body> + z-50 → overlay prekriva i sidebar.
 * Na mobitelu se prikazuje kao bottom sheet.
 */
export function Dialog({ open = true, onClose, title, description, children, className }: DialogProps) {
  // Dijalog se uklanja iz stabla pri zatvaranju (uvjetni render), pa fokus na okidač
  // vraćamo sami – element koji je imao fokus u trenutku otvaranja.
  const [returnTo] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => {
    const el = returnTo;
    setTimeout(() => {
      // StrictMode simulira unmount dok je dijalog otvoren – tada ne diramo fokus.
      if (document.activeElement?.closest('[role=dialog],[role=alertdialog]')) return;
      if (el?.isConnected) el.focus();
    }, 0);
  }, [returnTo]);

  return (
    <D.Root open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content
          onOpenAutoFocus={e => {
            // Fokus na prvo polje forme umjesto na gumb "zatvori" u zaglavlju.
            const root = e.currentTarget as HTMLElement | null;
            const first = root?.querySelector<HTMLElement>(
              'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [data-autofocus]',
            );
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
          className={cn(
            'fixed z-50 bg-white shadow-xl flex flex-col focus:outline-none',
            // mobitel: bottom sheet
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
            // ≥ sm: centrirani modal
            // Centriranje bez translate(-50%): polovični pikseli inače tresu sadržaj pri svakom ponovnom iscrtavanju (npr. hover)
            'sm:inset-0 sm:m-auto sm:h-fit sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-2xl sm:max-h-[90dvh]',
            'data-[state=open]:animate-[sheet-in_180ms_ease-out] sm:data-[state=open]:animate-[fade-in_150ms_ease-out]',
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="sm:hidden flex justify-center pt-2.5" aria-hidden="true">
            <div className="w-10 h-1 rounded-full bg-slate-300" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-4 pb-3 border-b border-slate-200 shrink-0">
            <div className="min-w-0">
              <D.Title className="text-base font-semibold text-slate-900">{title}</D.Title>
              {description && <D.Description className="text-sm text-slate-600 mt-0.5">{description}</D.Description>}
            </div>
            <D.Close
              className="-mr-2 -mt-1 p-2.5 sm:p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Zatvori"
            >
              <X size={18} aria-hidden="true" />
            </D.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
