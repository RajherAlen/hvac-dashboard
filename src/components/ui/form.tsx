import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}

interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  children: (props: FieldControlProps) => ReactNode;
  className?: string;
}

/**
 * Labela povezana s kontrolom (htmlFor/id), poruka greške i pomoćni tekst
 * povezani preko aria-describedby.
 */
export function Field({ label, error, hint, required, optional, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
        {optional && <span className="text-slate-500 font-normal"> (neobavezno)</span>}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {hint && !error && <div id={hintId} className="mt-1 text-xs text-slate-600">{hint}</div>}
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
          <AlertCircle size={13} aria-hidden="true" className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin', className)}
    />
  );
}

export function FormActions({
  onCancel, submitLabel, pendingLabel, isPending, disabled, destructive,
}: {
  onCancel: () => void;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 min-h-11 sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
      >
        Odustani
      </button>
      <button
        type="submit"
        disabled={isPending || disabled}
        aria-busy={isPending || undefined}
        className={cn(
          'flex-1 min-h-11 sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
          destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
        )}
      >
        {isPending && <Spinner />}
        {isPending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
      <AlertCircle size={15} aria-hidden="true" className="shrink-0 mt-0.5" />
      {message}
    </p>
  );
}
