import { cn } from '../../lib/utils';

/** Zajednički stil inputa: 16 px na mobitelu (iOS ne zumira), 44 px visina dodira. */
export function inputClass(invalid?: boolean, extra?: string) {
  return cn(
    'w-full min-h-11 sm:min-h-0 px-3 py-2 text-base sm:text-sm text-slate-900 bg-white border rounded-lg',
    'focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors',
    invalid
      ? 'border-red-500 focus:ring-red-500/40 focus:border-red-500'
      : 'border-slate-300 focus:ring-blue-500/40 focus:border-blue-500',
    extra,
  );
}
