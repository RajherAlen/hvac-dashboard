import { KIND_COLORS } from '../../lib/colors';
import { KIND_KEYS, KIND_KEY_LABEL, type KindKey } from '../../lib/hoursBreakdown';
import { cn, formatHours } from '../../lib/utils';
import { KindIcon } from '../orders/KindIcon';

interface Props {
  byKind: Record<KindKey, number>;
  total: number;
  active: KindKey | null;
  onToggle: (k: KindKey) => void;
}

/** Bijeli natpis samo na tamnim segmentima (kontrast ≥ 4,5:1); na ostalima tamni. */
const LIGHT_TEXT = new Set<KindKey>(['montaza', 'ostalo']);

const pct = (h: number, total: number) => (total > 0 ? Math.round((h / total) * 100) : 0);

function swatch(k: KindKey) {
  return k === 'none' ? undefined : { backgroundColor: KIND_COLORS[k] };
}

/**
 * Cijelo razdoblje kao jedna traka: koliki je udio sati otišao na koju vrstu posla.
 * Segmenti i stavke ispod su ujedno filtri – klik filtrira stranicu, ponovni klik vraća sve.
 */
export function TimeRibbon({ byKind, total, active, onToggle }: Props) {
  const parts = KIND_KEYS.filter(k => byKind[k] > 0);

  return (
    <div>
      <div className="ribbon-grow flex h-12 sm:h-14 w-full overflow-hidden rounded-lg ring-1 ring-slate-200" aria-hidden="true">
        {parts.map(k => {
          const p = (byKind[k] / total) * 100;
          const dim = active !== null && active !== k;
          return (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              onClick={() => onToggle(k)}
              style={{ width: `${p}%`, ...swatch(k) }}
              className={cn(
                'relative h-full min-w-1 border-r-2 border-white last:border-r-0 transition-opacity text-left overflow-hidden',
                k === 'none' && 'hatch-none',
                dim && 'opacity-25',
              )}
            >
              {p >= 11 && (
                <span className={cn('absolute inset-x-2.5 bottom-1.5 sm:bottom-2 truncate text-xs sm:text-sm font-semibold tabular-nums',
                  LIGHT_TEXT.has(k) ? 'text-white' : 'text-slate-900')}>
                  {KIND_KEY_LABEL[k]} {Math.round(p)} %
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-1" aria-label="Sati po vrsti posla">
        {parts.map(k => {
          const on = active === k;
          return (
            <li key={k}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(k)}
                title={on ? 'Prikaži sve vrste posla' : `Prikaži samo: ${KIND_KEY_LABEL[k]}`}
                className={cn(
                  'inline-flex items-center gap-2 min-h-10 sm:min-h-8 pl-2 pr-2.5 rounded-lg text-sm transition-colors',
                  on ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                  active !== null && !on && 'text-slate-500',
                )}
              >
                <span className={cn('w-3 h-3 rounded-sm shrink-0', k === 'none' && 'hatch-none ring-1 ring-slate-300')} style={swatch(k)} aria-hidden="true" />
                {k !== 'none' && <KindIcon kind={k} size={14} className={on ? 'text-white' : 'text-slate-500'} />}
                <span className="font-medium">{KIND_KEY_LABEL[k]}</span>
                <span className={cn('tabular-nums', on ? 'text-slate-200' : 'text-slate-500')}>
                  {formatHours(byKind[k])} · {pct(byKind[k], total)} %
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
