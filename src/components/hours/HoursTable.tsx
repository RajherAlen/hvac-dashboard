import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ListChecks } from 'lucide-react';
import { KIND_COLORS } from '../../lib/colors';
import { KIND_KEYS, nodeRate, type BreakdownNode, type KindKey } from '../../lib/hoursBreakdown';
import { formatEur, formatRate } from '../../lib/money';
import { cn, formatHours } from '../../lib/utils';
import { KindIcon } from '../orders/KindIcon';

export type SortKey = 'label' | 'hours' | 'plan' | 'diff' | 'value' | 'rate';

interface Props {
  rows: BreakdownNode[];
  total: BreakdownNode;
  showValue: boolean;
  showPlan: boolean;
  /** Prosječni €/h razdoblja – ispod 85 % prosjeka €/h se ističe. */
  avgRate: number | null;
  /** Red koji treba otvoriti i istaknuti (klik na stupac grafa). */
  focusKey: string | null;
  onOpenEntries: (node: BreakdownNode) => void;
}

const LOW_RATE = 0.85;

function signed(h: number) {
  if (Math.abs(h) < 0.01) return '0 h';
  return `${h > 0 ? '+' : '−'}${formatHours(Math.abs(h))}`;
}

function sortValue(n: BreakdownNode, k: SortKey): number | string {
  switch (k) {
    case 'label': return n.label.toLocaleLowerCase('hr');
    case 'hours': return n.hours;
    case 'plan': return n.plan;
    case 'diff': return n.hours - n.plan;
    case 'value': return n.value;
    case 'rate': return nodeRate(n) ?? -1;
  }
}

function sortTree(ns: BreakdownNode[], k: SortKey, dir: 1 | -1): BreakdownNode[] {
  return [...ns]
    .sort((a, b) => {
      const va = sortValue(a, k), vb = sortValue(b, k);
      const c = typeof va === 'string' ? va.localeCompare(vb as string, 'hr') : (va as number) - (vb as number);
      return c * dir || b.hours - a.hours;
    })
    .map(n => (n.children ? { ...n, children: sortTree(n.children, k, dir) } : n));
}

/** Mini traka sati u retku, složena po vrsti posla; širina relativna prema najvećem retku. */
function MiniBar({ node, max }: { node: BreakdownNode; max: number }) {
  const w = max > 0 ? (node.hours / max) * 100 : 0;
  return (
    <span className="flex h-1.5 rounded-full overflow-hidden bg-slate-100" aria-hidden="true">
      <span className="flex h-full" style={{ width: `${w}%` }}>
        {KIND_KEYS.filter(k => node.byKind[k] > 0).map(k => (
          <span key={k} className={cn('h-full', k === 'none' && 'hatch-none')}
            style={{ width: `${(node.byKind[k] / node.hours) * 100}%`, ...(k === 'none' ? {} : { backgroundColor: KIND_COLORS[k] }) }} />
        ))}
      </span>
    </span>
  );
}

function RateCell({ node, avgRate }: { node: BreakdownNode; avgRate: number | null }) {
  const r = nodeRate(node);
  if (r === null) {
    return <span className="text-slate-400" title={node.unpricedHours > 0 ? 'Nalog nema upisanu cijenu' : 'Rad bez naloga nema cijenu'}>—</span>;
  }
  const low = avgRate !== null && r < avgRate * LOW_RATE;
  return (
    <span className={cn(low ? 'text-amber-800 font-semibold' : 'text-slate-700')}
      title={low ? `Ispod prosjeka razdoblja (${formatRate(avgRate!)})` : undefined}>
      {formatRate(r)}
    </span>
  );
}

/**
 * Hijerarhijska tablica sati: klijent → objekt → nalog (ili kraće, ovisno o grupiranju).
 * Na mobitelu se svaki red slaže u dva retka (naziv i sati, pa udio, plan i €/h).
 */
export function HoursTable({ rows, total, showValue, showPlan, avgRate, focusKey, onOpenEntries }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'hours', dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const focusRef = useRef<HTMLTableRowElement | null>(null);

  // Klik na stupac grafa: red se otvori (usklađivanje stanja s propom tijekom rendera) i skrola u vidno polje
  const [prevFocus, setPrevFocus] = useState<string | null>(null);
  if (focusKey !== prevFocus) {
    setPrevFocus(focusKey);
    if (focusKey) setOpen(s => new Set(s).add(`/${focusKey}`));
  }
  useEffect(() => {
    if (!focusKey) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => focusRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }));
  }, [focusKey]);

  const sorted = sortTree(rows, sort.key, sort.dir);
  const max = Math.max(0, ...rows.map(r => r.hours));

  const toggle = (path: string) => setOpen(s => {
    const n = new Set(s);
    if (n.has(path)) n.delete(path); else n.add(path);
    return n;
  });

  const head = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={cn('px-3 py-2 font-medium', className)}
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
        <button type="button"
          onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'label' ? 1 : -1 }))}
          className={cn('inline-flex items-center gap-1 rounded hover:text-slate-900', active && 'text-slate-900')}>
          {label}
          {active && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
        </button>
      </th>
    );
  };

  const renderRows = (ns: BreakdownNode[], depth: number, parentPath: string): React.ReactNode => ns.map(n => {
    const path = `${parentPath}/${n.key}`;
    const hasKids = !!n.children?.length;
    const isOpen = open.has(path);
    const share = total.hours > 0 ? Math.round((n.hours / total.hours) * 100) : 0;
    const isFocus = depth === 0 && n.key === focusKey;
    const leaf = !hasKids;
    const kind = n.kind as KindKey | undefined;

    return (
      <Fragment key={path}>
        <tr ref={isFocus ? focusRef : undefined}
          className={cn('border-t border-slate-100 align-top', depth === 0 ? 'bg-white' : 'bg-slate-50/60', isFocus && 'bg-blue-50/70')}>
          <th scope="row" className="px-3 py-2.5 text-left font-normal">
            <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 20 }}>
              {hasKids ? (
                <button type="button" onClick={() => toggle(path)} aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Sakrij' : 'Prikaži'} razradu: ${n.label}`}
                  className="-ml-1 mt-px p-0.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  <ChevronRight size={16} className={cn('transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                </button>
              ) : <span className="w-5 shrink-0" aria-hidden="true" />}
              {kind && kind !== 'none' && <KindIcon kind={kind} size={14} className="mt-1 shrink-0 text-slate-500" />}
              <div className="min-w-0 flex-1">
                {leaf && n.hours > 0 ? (
                  <button type="button" onClick={() => onOpenEntries(n)}
                    className={cn('text-left hover:underline hover:text-blue-800', depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-800')}>
                    {n.label}
                  </button>
                ) : (
                  <span className={cn(depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-800', n.kind === 'none' && 'italic')}>{n.label}</span>
                )}
                {n.sublabel && <p className="text-xs text-slate-500 truncate">{n.sublabel}</p>}
                {/* Mobitel: drugi red s udjelom, planom i €/h */}
                <p className="sm:hidden mt-0.5 text-xs text-slate-600 tabular-nums">
                  {share} %{showPlan && n.plan > 0 && <> · plan {formatHours(n.plan)}</>}
                  {showValue && nodeRate(n) !== null && <> · <RateCell node={n} avgRate={avgRate} /></>}
                </p>
              </div>
              {leaf && n.hours > 0 && (
                <button type="button" onClick={() => onOpenEntries(n)} aria-label={`Unosi: ${n.label}`}
                  className="hidden sm:inline-flex p-1 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50">
                  <ListChecks size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </th>
          <td className="px-3 py-2.5 text-right tabular-nums w-28 sm:w-44">
            <span className={cn(depth === 0 ? 'font-semibold text-slate-900' : 'text-slate-800')}>{formatHours(n.hours)}</span>
            {depth === 0 && <span className="block mt-1.5"><MiniBar node={n} max={max} /></span>}
            {showValue && <span className="sm:hidden block text-xs text-slate-600">{n.value > 0 ? formatEur(n.value) : ''}</span>}
          </td>
          <td className="hidden sm:table-cell px-3 py-2.5 text-right tabular-nums text-slate-600">{share} %</td>
          {showPlan && (
            <>
              <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-slate-600">{n.plan > 0 ? formatHours(n.plan) : '—'}</td>
              <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums">
                {n.plan > 0 ? (
                  <span className={cn(n.hours - n.plan > n.plan * 0.15 ? 'text-amber-800 font-medium' : 'text-slate-600')}>{signed(n.hours - n.plan)}</span>
                ) : <span className="text-slate-400">—</span>}
              </td>
            </>
          )}
          {showValue && (
            <>
              <td className="hidden sm:table-cell px-3 py-2.5 text-right tabular-nums text-slate-800">
                {n.value > 0 ? formatEur(n.value) : <span className="text-slate-400" title={n.unpricedHours > 0 ? 'Nalog nema upisanu cijenu' : undefined}>—</span>}
              </td>
              <td className="hidden sm:table-cell px-3 py-2.5 text-right tabular-nums"><RateCell node={n} avgRate={avgRate} /></td>
            </>
          )}
        </tr>
        {hasKids && isOpen && renderRows(n.children!, depth + 1, path)}
      </Fragment>
    );
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-600 text-right bg-slate-50">
          <tr>
            {head('label', 'Naziv', 'text-left pl-9')}
            {head('hours', 'Sati')}
            <th scope="col" className="hidden sm:table-cell px-3 py-2 font-medium">Udio</th>
            {showPlan && head('plan', 'Plan', 'hidden md:table-cell')}
            {showPlan && head('diff', 'Odstupanje', 'hidden md:table-cell')}
            {showValue && head('value', 'Vrijednost', 'hidden sm:table-cell')}
            {showValue && head('rate', '€/h', 'hidden sm:table-cell')}
          </tr>
        </thead>
        <tbody>{renderRows(sorted, 0, '')}</tbody>
        <tfoot className="border-t-2 border-slate-200 bg-white">
          <tr className="font-semibold text-slate-900 tabular-nums">
            <th scope="row" className="px-3 py-2.5 text-left pl-9">Ukupno</th>
            <td className="px-3 py-2.5 text-right">
              {formatHours(total.hours)}
              {showValue && <span className="sm:hidden block text-xs font-normal text-slate-600">{formatEur(total.value)}</span>}
            </td>
            <td className="hidden sm:table-cell px-3 py-2.5 text-right">100 %</td>
            {showPlan && (
              <>
                <td className="hidden md:table-cell px-3 py-2.5 text-right">{total.plan > 0 ? formatHours(total.plan) : '—'}</td>
                <td className="hidden md:table-cell px-3 py-2.5 text-right font-normal text-slate-600">{total.plan > 0 ? signed(total.hours - total.plan) : '—'}</td>
              </>
            )}
            {showValue && (
              <>
                <td className="hidden sm:table-cell px-3 py-2.5 text-right">{formatEur(total.value)}</td>
                <td className="hidden sm:table-cell px-3 py-2.5 text-right">{nodeRate(total) !== null ? formatRate(nodeRate(total)!) : '—'}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
