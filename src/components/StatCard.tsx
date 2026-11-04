import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export interface StatDelta {
  /** Relativna promjena, npr. 0.12 = +12 % */
  ratio: number;
  /** npr. "vs. isto razdoblje prošlog tjedna" */
  label: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  /** Boja samo za stanje – inače neutralno. */
  tone?: 'default' | 'danger';
  delta?: StatDelta | null;
  isLoading?: boolean;
  /** Zadržano radi kompatibilnosti – boje kartica više nisu dekorativne. */
  color?: string;
  /** Dodatni sadržaj ispod vrijednosti (npr. popis i akcija). */
  footer?: ReactNode;
}

export function StatCard({ title, value, subtitle, icon: Icon, tone = 'default', delta, isLoading = false, footer }: StatCardProps) {
  const danger = tone === 'danger';

  return (
    <div className={cn(
      'rounded-xl p-4 sm:p-5 border bg-white shadow-sm',
      danger ? 'border-red-200 bg-red-50/40' : 'border-slate-200',
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-slate-600 leading-tight">{title}</p>
        <Icon size={18} aria-hidden="true" className={cn('shrink-0', danger ? 'text-red-600' : 'text-slate-400')} />
      </div>

      {isLoading ? (
        <div aria-busy="true">
          <div className="mt-2 h-7 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="mt-2 h-3 w-28 bg-slate-100 rounded animate-pulse" />
          <span className="sr-only">Učitavanje…</span>
        </div>
      ) : (
        <>
          <p className={cn('mt-1.5 text-xl sm:text-2xl font-bold tabular-nums', danger ? 'text-red-700' : 'text-slate-900')}>
            {value}
          </p>
          {subtitle && (
            <p className={cn('mt-1 text-xs flex items-center gap-1', danger ? 'text-red-700' : 'text-slate-600')}>
              {danger && <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />}
              <span className="line-clamp-2">{subtitle}</span>
            </p>
          )}
          {delta && Number.isFinite(delta.ratio) && <DeltaBadge delta={delta} />}
          {footer}
        </>
      )}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: StatDelta }) {
  const pct = Math.round(delta.ratio * 100);
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1.5 text-xs text-slate-600 flex items-center gap-1 flex-wrap">
      <span className={cn(
        'inline-flex items-center gap-0.5 font-semibold tabular-nums',
        flat ? 'text-slate-700' : up ? 'text-green-700' : 'text-red-700',
      )}>
        {!flat && <Icon size={12} aria-hidden="true" />}
        {up ? '+' : pct < 0 ? '−' : ''}{Math.abs(pct)} %
      </span>
      <span>{delta.label}</span>
    </p>
  );
}
