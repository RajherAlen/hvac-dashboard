import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { useClientDirectory } from '../../hooks/useClients';
import { useHoursBreakdown } from '../../hooks/useHoursBreakdown';
import { usePeriod } from '../../hooks/usePeriod';
import { usePlan } from '../../hooks/useWorkOrders';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { Field } from '../../components/ui/form';
import { DatePicker } from '../../components/ui/DatePicker';
import { inputClass } from '../../components/ui/styles';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { BucketEntriesDialog } from '../../components/BucketEntriesDialog';
import { TimeRibbon } from '../../components/hours/TimeRibbon';
import { HoursRankChart } from '../../components/hours/HoursRankChart';
import { HoursTable } from '../../components/hours/HoursTable';
import {
  KIND_KEYS, KIND_KEY_LABEL, breakdownCsv, buildBreakdown, downloadText, nodeRate,
  type BreakdownNode, type GroupBy, type KindKey, type PlanItem,
} from '../../lib/hoursBreakdown';
import { exportHoursValuePdf, reportExport } from '../../lib/exportPdf';
import { formatEur, formatRate } from '../../lib/money';
import { cn, formatHours, todayISO } from '../../lib/utils';
import { errorMessage } from '../../lib/errors';

const GROUPS: { key: GroupBy; label: string; plural: string; levels: string[] }[] = [
  { key: 'client', label: 'Klijent', plural: 'Klijentima', levels: ['Klijent', 'Objekt', 'Nalog'] },
  { key: 'site', label: 'Objekt', plural: 'Objektima', levels: ['Objekt', 'Nalog'] },
  { key: 'order', label: 'Nalog', plural: 'Nalozima', levels: ['Nalog'] },
];

export function HoursValuePage() {
  useDocumentTitle('Sati i vrijednost');
  const today = todayISO();
  const period = usePeriod('month');
  const [params, setParams] = useSearchParams();
  const group: GroupBy = (GROUPS.find(g => g.key === params.get('group'))?.key) ?? 'client';
  const kindParam = params.get('kind') as KindKey | null;
  const kind: KindKey | null = kindParam && KIND_KEYS.includes(kindParam) ? kindParam : null;
  const emp = params.get('emp');

  const setParam = useCallback((k: string, v: string | null) => setParams(prev => {
    const p = new URLSearchParams(prev);
    if (v === null) p.delete(k); else p.set(k, v);
    return p;
  }, { replace: true }), [setParams]);

  const dir = useClientDirectory();
  const { entries } = useStaffDirectory();
  const staff = useMemo(() => entries.filter(e => !e.isAdmin).map(e => e.emp), [entries]);
  const q = useHoursBreakdown(period.start, period.end);
  const { data: planData } = usePlan(period.start, period.end);

  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [openNode, setOpenNode] = useState<BreakdownNode | null>(null);

  const hasPrice = !!q.data?.hasPrice;
  const hasOrders = !!q.data?.hasOrders;

  const { all, view } = useMemo(() => {
    const logs = (q.data?.logs ?? []).filter(l => !emp || l.employee_id === emp);
    const plan: PlanItem[] = (planData ?? [])
      .filter(a => !emp || a.employee_id === emp)
      .map(a => ({ employee_id: a.employee_id, planned_hours: Number(a.planned_hours), order: a.work_orders }));
    const totals = q.data?.orderTotals ?? new Map<string, number>();
    const all = buildBreakdown(logs, plan, dir.siteIndex, totals, group);
    if (!kind) return { all, view: all };
    const view = buildBreakdown(
      logs.filter(l => (l.order?.kind ?? 'none') === kind),
      kind === 'none' ? [] : plan.filter(a => a.order.kind === kind),
      dir.siteIndex, totals, group,
    );
    return { all, view };
  }, [q.data, planData, dir.siteIndex, group, kind, emp]);

  const avgRate = nodeRate(view.total);
  const unpriced = view.total.unpricedHours;
  const showValue = hasPrice && view.total.value > 0;
  const showPlan = view.total.plan > 0;
  const groupDef = GROUPS.find(g => g.key === group)!;
  const empName = emp ? staff.find(s => s.id === emp)?.full_name ?? 'Odabrani tehničar' : null;
  const filterLabel = [kind ? KIND_KEY_LABEL[kind] : null, empName].filter(Boolean).join(', ') || null;
  const isLoading = q.isLoading || dir.isLoading;
  const empty = !isLoading && all.total.hours === 0;

  if (dir.missingSchema) return <ModuleNotEnabled />;

  const exportCsv = () => {
    const name = `sati-${groupDef.key}-${period.start}_${period.end}.csv`;
    downloadText(name, breakdownCsv(view, groupDef.levels, showValue));
  };

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-5 max-w-6xl">
      {/* Zaglavlje + period */}
      <header className="flex flex-col lg:flex-row lg:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 lg:mr-auto">Sati i vrijednost</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle period={period} views={['week', 'month', 'custom']} />
          {period.view === 'custom' ? (
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
              <Field label="Od" className="[&_label]:text-xs [&_label]:mb-0.5">{p => <DatePicker {...p} size="sm" value={period.start} max={period.end} onChange={v => period.setCustomRange(v, period.end)} />}</Field>
              <Field label="Do" className="[&_label]:text-xs [&_label]:mb-0.5">{p => <DatePicker {...p} size="sm" value={period.end} min={period.start} max={today} onChange={v => period.setCustomRange(period.start, v)} />}</Field>
            </div>
          ) : <PeriodStepper period={period} />}
          <ExportMenu
            disabled={isLoading || empty}
            onPdf={() => reportExport(exportHoursValuePdf(view, period.label, groupDef.plural, filterLabel, showValue))}
            onCsv={exportCsv}
          />
        </div>
      </header>

      {q.isError && (
        <p role="alert" className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Sati se nisu učitali: {errorMessage(q.error)}. Osvježite stranicu.
        </p>
      )}

      {/* Sažetak i traka vremena */}
      <section aria-labelledby="hv-summary" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
        {isLoading ? (
          <div aria-busy="true" className="space-y-3">
            <div className="h-6 w-3/4 bg-slate-100 rounded animate-pulse" />
            <div className="h-14 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ) : empty ? (
          <div className="py-6 text-center">
            <p id="hv-summary" className="text-slate-800 font-medium">U ovom razdoblju nema upisanih sati{empName ? ` za ${empName}` : ''}.</p>
            {period.view !== 'custom' && (
              <button type="button" onClick={() => period.shift(-1)}
                className="mt-3 inline-flex items-center min-h-10 px-3.5 text-sm font-medium text-blue-700 bg-white border border-slate-300 hover:bg-blue-50 rounded-lg">
                Prikaži {period.view === 'week' ? 'prošli tjedan' : 'prošli mjesec'}
              </button>
            )}
          </div>
        ) : (
          <>
            <h2 id="hv-summary" className="text-base sm:text-lg text-slate-900 leading-snug max-w-[70ch]">
              <span className="font-semibold">{period.label}:</span>{' '}
              <strong className="tabular-nums">{formatHours(all.total.hours)}</strong> rada
              {hasOrders && all.total.byKind.none > 0 && <>, od toga <strong className="tabular-nums">{formatHours(all.total.byKind.none)}</strong> bez naloga</>}.
            </h2>
            {hasPrice && (
              <p className="mt-1 text-sm text-slate-700 tabular-nums">
                {nodeRate(all.total) !== null ? (
                  <>Vrijednost <strong className="text-slate-900">{formatEur(all.total.value)}</strong>, prosječno <strong className="text-slate-900">{formatRate(nodeRate(all.total)!)}</strong>.</>
                ) : 'Nijedan nalog u razdoblju nema upisanu cijenu.'}
                {all.total.unpricedHours > 0 && (
                  <> {formatHours(all.total.unpricedHours)} je na nalozima bez cijene –{' '}
                    <Link to="/raspored" className="font-medium text-blue-700 hover:underline">upišite cijene na nalozima</Link>.</>
                )}
              </p>
            )}
            {hasOrders && !hasPrice && (
              <p className="mt-1 text-sm text-slate-600">
                Za vrijednost posla pokrenite migraciju <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">20261110_work_order_value.sql</code>.
              </p>
            )}
            {hasOrders ? (
              <div className="mt-4 sm:mt-5">
                <TimeRibbon byKind={all.total.byKind} total={all.total.hours} active={kind}
                  onToggle={k => setParam('kind', kind === k ? null : k)} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Vrsta posla vidi se kad se rad upisuje na nalog iz rasporeda.</p>
            )}
          </>
        )}
      </section>

      {!isLoading && !empty && (
        <section aria-labelledby="hv-breakdown" className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b border-slate-100">
            <h2 id="hv-breakdown" className="sr-only">Razrada po {groupDef.plural.toLowerCase()}</h2>
            <div role="group" aria-label="Grupiraj po" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              {GROUPS.map(g => (
                <button key={g.key} type="button" aria-pressed={group === g.key}
                  onClick={() => { setParam('group', g.key === 'client' ? null : g.key); setFocusKey(null); }}
                  className={cn('min-h-10 sm:min-h-0 px-3 py-1.5 font-medium rounded-md transition-colors',
                    group === g.key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                  {g.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="sr-only sm:not-sr-only">Tehničar</span>
              <select value={emp ?? ''} onChange={e => setParam('emp', e.target.value || null)} className={inputClass(false, 'w-auto py-1.5')}>
                <option value="">Svi tehničari</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </label>
            {kind && (
              <button type="button" onClick={() => setParam('kind', null)}
                className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-2.5 py-1.5 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg">
                {KIND_KEY_LABEL[kind]} <X size={14} aria-hidden="true" /><span className="sr-only">– ukloni filtar</span>
              </button>
            )}
            {showValue && avgRate !== null && (
              <p className="w-full sm:w-auto sm:ml-auto text-xs text-slate-600">
                Istaknuto: €/h ispod 85 % prosjeka ({formatRate(avgRate)})
              </p>
            )}
          </div>

          {view.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-600">Nema sati za odabrani filtar.</p>
          ) : (
            <>
              <div className="hidden sm:block px-3 sm:px-5 pt-4 pb-2">
                <HoursRankChart rows={view.rows} showValue={showValue} title={`Sati po ${groupDef.plural.toLowerCase()}`}
                  onSelect={key => setFocusKey(key)} />
              </div>
              <HoursTable rows={view.rows} total={view.total} showValue={showValue} showPlan={showPlan}
                avgRate={avgRate} focusKey={focusKey} onOpenEntries={setOpenNode} />
              {unpriced > 0 && showValue && (
                <p className="px-4 sm:px-5 py-3 text-xs text-slate-600 border-t border-slate-100">
                  „—” u stupcu vrijednosti: nalog nema upisanu cijenu ili je rad upisan bez naloga.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {openNode && (
        <BucketEntriesDialog
          bucket={{ key: openNode.key, label: openNode.label, days: period.days }}
          logs={openNode.logs}
          onClose={() => setOpenNode(null)}
          employeeHref={id => `/admin/employees/${id}`}
        />
      )}
    </div>
  );
}

function ExportMenu({ disabled, onPdf, onCsv }: { disabled: boolean; onPdf: () => void; onCsv: () => void }) {
  const itemCls = 'flex items-start gap-3 w-full px-3 py-2.5 min-h-11 rounded-lg text-left text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={disabled}
        className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg data-[state=open]:bg-slate-100">
        <Download size={15} aria-hidden="true" /> Izvoz <ChevronDown size={13} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12}
          className="z-50 w-[min(18rem,calc(100vw-24px))] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
          <DropdownMenu.Item className={itemCls} onSelect={onPdf}>
            <FileText size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
            <span><span className="block font-medium">PDF izvješće</span><span className="block text-xs text-slate-600">Sažetak i tablica za ispis</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={onCsv}>
            <FileSpreadsheet size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
            <span><span className="block font-medium">Tablica za Excel (CSV)</span><span className="block text-xs text-slate-600">Svi redovi s razradom</span></span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
