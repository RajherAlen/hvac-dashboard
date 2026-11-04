import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Period, PeriodView } from '../hooks/usePeriod';
import { cn } from '../lib/utils';

const VIEW_LABEL: Record<PeriodView, string> = { week: 'Tjedan', month: 'Mjesec', custom: 'Prilagođeno' };
const PREV_LABEL = { week: 'Prethodni tjedan', month: 'Prethodni mjesec' } as const;
const NEXT_LABEL = { week: 'Sljedeći tjedan', month: 'Sljedeći mjesec' } as const;

/** Segmentirani odabir prikaza (Tjedan / Mjesec / Prilagođeno). */
export function ViewToggle({ period, views }: { period: Period; views: PeriodView[] }) {
  return (
    <div role="group" aria-label="Prikaz perioda" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
      {views.map(v => {
        const active = period.view === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => !active && period.setView(v)}
            className={cn(
              'min-h-10 sm:min-h-0 px-3 py-1.5 font-medium rounded-md transition-colors',
              active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            {VIEW_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

/** ‹ 2. – 8. studenoga 2026. › [Danas] */
export function PeriodStepper({ period, className }: { period: Period; className?: string }) {
  if (period.view === 'custom') return null;
  const v = period.view;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center bg-white border border-slate-200 rounded-lg text-sm flex-1 sm:flex-none">
        <button
          type="button"
          onClick={() => period.shift(-1)}
          aria-label={PREV_LABEL[v]}
          className="p-2.5 sm:p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-l-lg"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span
          className="flex-1 sm:flex-none px-2 sm:px-3 font-medium text-slate-800 sm:min-w-44 text-center text-xs sm:text-sm tabular-nums"
          aria-live="polite"
        >
          {period.label}
        </span>
        {/* Disabled gumb ne prima hover u svim preglednicima → tooltip na omotaču */}
        <span title={period.canGoNext ? undefined : 'Ne može se ići u budućnost'} className="inline-flex">
          <button
            type="button"
            onClick={() => period.shift(1)}
            disabled={!period.canGoNext}
            aria-label={period.canGoNext ? NEXT_LABEL[v] : `${NEXT_LABEL[v]} (ne može se ići u budućnost)`}
            className="p-2.5 sm:p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent rounded-r-lg"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
      {!period.isCurrent && (
        <button
          type="button"
          onClick={period.goToday}
          className="min-h-10 sm:min-h-0 px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-slate-200 hover:bg-blue-50 rounded-lg"
        >
          Danas
        </button>
      )}
    </div>
  );
}
