import { useMemo, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  Clock, Users, ClipboardList, TrendingUp, Download, MapPin,
  ChevronDown, User, FileText, Files, Inbox,
} from 'lucide-react';
import { addMonths, addWeeks, differenceInCalendarDays, addDays, parseISO, startOfMonth, endOfMonth, isWeekend } from 'date-fns';
import { StatCard, type StatDelta } from '../../components/StatCard';
import { HoursChart } from '../../components/HoursChart';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { useWorkLogs, useLatestWorkLog } from '../../hooks/useWorkLogs';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { BucketEntriesDialog } from '../../components/BucketEntriesDialog';
import { LogLocation } from '../../components/clients/LogLocation';
import { ServiceDueCard } from '../../components/clients/ServiceDueCard';
import type { Bucket } from '../../lib/period';
import type { Profile } from '../../types';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { todayISO, formatHours, initials, pluralHr } from '../../lib/utils';
import { elapsedWorkdays, isStaff, sumHours } from '../../lib/period';
import { formatDayLong, formatMonth, formatWeekday, capitalize, toISODate } from '../../lib/format-date';
import {
  exportDashboardPdf,
  exportEmployeePdf,
  exportMonthPerEmployeePdf,
  reportExport,
} from '../../lib/exportPdf';

/** Ako do ovog sata radnog dana nitko nije upisao rad, "Aktivni danas" postaje crven. */
const NOBODY_ACTIVE_ALERT_HOUR = 10;

export function AdminDashboardPage() {
  useDocumentTitle('Nadzorna ploča');
  const today = todayISO();
  const period = usePeriod('week', ['week', 'month']);
  const { start: startDate, end: endDate, days: periodDays, label: periodLabel, view } = period;

  // Usporedba s prethodnim periodom. Ako je period u tijeku, uspoređuju se samo završeni dani
  // (do jučer) u oba perioda – inače bi današnji, još neupisani dan uvijek davao pad.
  const prev = useMemo(() => {
    const shift = (d: string) => toISODate(view === 'week' ? addWeeks(parseISO(d), -1) : addMonths(parseISO(d), -1));
    const pStart = shift(startDate);
    const fullEnd = view === 'week' ? shift(endDate) : toISODate(endOfMonth(parseISO(pStart)));
    const inProgress = startDate <= today && today <= endDate;
    const completedDays = differenceInCalendarDays(parseISO(today), parseISO(startDate)); // dani prije danas
    const pEnd = inProgress ? toISODate(addDays(parseISO(pStart), completedDays - 1)) : fullEnd;
    const noun = view === 'week' ? 'prošli tjedan' : 'prošli mjesec';
    return {
      enabled: !inProgress || completedDays > 0,
      inProgress,
      currentEnd: inProgress ? toISODate(addDays(parseISO(today), -1)) : endDate,
      start: pStart,
      end: pEnd > fullEnd ? fullEnd : pEnd,
      label: inProgress ? `vs. ${noun}, do jučer` : `vs. ${noun}`,
    };
  }, [view, startDate, endDate, today]);

  // Cijeli mjesec u kojem počinje odabrani tjedan (za izvoz "Cijeli mjesec")
  const monthStart = toISODate(startOfMonth(parseISO(startDate)));
  const monthEnd = toISODate(endOfMonth(parseISO(startDate)));
  const monthLabel = capitalize(formatMonth(monthStart));

  const { data: allPeriodLogs = [], isLoading } = useWorkLogs({ startDate, endDate });
  const { data: allPrevLogs = [], isLoading: prevLoading } = useWorkLogs({ startDate: prev.start, endDate: prev.end });
  const { data: allMonthLogs = [] } = useWorkLogs({ startDate: monthStart, endDate: monthEnd });
  const directory = useStaffDirectory();
  const employeesLoading = directory.isLoading;
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null);
  const { data: allTodayLogs = [], isLoading: todayLoading } = useWorkLogs({ startDate: today, endDate: today });
  const { data: latestLog } = useLatestWorkLog();

  // Admini ne evidentiraju rad → isključeni iz KPI-ja, grafova, legendi i izvoza.
  // Grafovi/izvoz: svi zaposlenici (i deaktivirani – njihovi stari sati ostaju u povijesti).
  const employees  = useMemo(() => directory.entries.filter(e => !e.isAdmin).map(e => e.emp), [directory.entries]);
  // "Aktivni danas" i popis tko nije upisao: samo aktivni (bez pozvanih i deaktiviranih).
  const activeStaff = directory.activeStaff;
  const periodLogs = useMemo(() => allPeriodLogs.filter(l => isStaff(l.profiles)), [allPeriodLogs]);
  const prevLogs   = useMemo(() => allPrevLogs.filter(l => isStaff(l.profiles)), [allPrevLogs]);
  const monthLogs  = useMemo(() => allMonthLogs.filter(l => isStaff(l.profiles)), [allMonthLogs]);
  const todayLogs  = useMemo(() => allTodayLogs.filter(l => isStaff(l.profiles)), [allTodayLogs]);

  // ── KPI ───────────────────────────────────────────────────────────────
  const totalHours      = sumHours(periodLogs);
  const loggedTodayIds  = new Set(todayLogs.map(l => l.employee_id));
  const activeToday     = activeStaff.filter(e => loggedTodayIds.has(e.id)).length;
  const missingToday    = activeStaff.filter(e => !loggedTodayIds.has(e.id));
  // Danas se broji kao radni dan tek kad postoji unos – inače bi jutro uvijek rušilo prosjek.
  const workdaysElapsed = elapsedWorkdays(periodDays, todayLogs.length > 0 ? today : toISODate(addDays(parseISO(today), -1)));
  // Tim: sati / protekli radni dani. Po zaposleniku: još / broj zaposlenika koji su u periodu radili.
  const teamPerDay      = workdaysElapsed > 0 ? totalHours / workdaysElapsed : 0;
  const contributors    = new Set(periodLogs.map(l => l.employee_id)).size;
  const avgPerDay       = contributors > 0 ? teamPerDay / contributors : 0;

  const prevHours    = sumHours(prevLogs);
  const prevDays     = useMemo(() => {
    const out: string[] = [];
    for (let d = parseISO(prev.start); toISODate(d) <= prev.end; d = addDays(d, 1)) out.push(toISODate(d));
    return out;
  }, [prev.start, prev.end]);
  const prevWorkdays = elapsedWorkdays(prevDays, prev.end);
  const prevContrib  = new Set(prevLogs.map(l => l.employee_id)).size;
  const prevAvg      = prevWorkdays > 0 && prevContrib > 0 ? prevHours / prevWorkdays / prevContrib : 0;

  // Trenutne vrijednosti za usporedbu (bez današnjeg dana ako je period u tijeku)
  const cmpLogs     = prev.inProgress ? periodLogs.filter(l => l.log_date <= prev.currentEnd) : periodLogs;
  const cmpHours    = sumHours(cmpLogs);
  const cmpWorkdays = elapsedWorkdays(periodDays, prev.currentEnd);
  const cmpContrib  = new Set(cmpLogs.map(l => l.employee_id)).size;
  const cmpAvg      = cmpWorkdays > 0 && cmpContrib > 0 ? cmpHours / cmpWorkdays / cmpContrib : 0;

  const delta = (cur: number, before: number): StatDelta | null =>
    !prev.enabled || prevLoading || before <= 0 ? null : { ratio: (cur - before) / before, label: prev.label };

  const now = new Date();
  const isWorkdayNow = !isWeekend(now);
  const nobodyYet = !todayLoading && activeToday === 0 && activeStaff.length > 0
    && isWorkdayNow && now.getHours() >= NOBODY_ACTIVE_ALERT_HOUR;

  // Linkovi na profil zaposlenika zadržavaju odabrani period
  const periodQuery = view === 'month' ? `view=month&date=${startDate.slice(0, 7)}` : `view=week&date=${startDate}`;
  const employeeHref = (id: string) => `/admin/employees/${id}?${periodQuery}`;

  const daysNote = `${workdaysElapsed} ${pluralHr(workdaysElapsed, 'radni dan', 'radna dana', 'radnih dana')}`;

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Zaglavlje: red 1 = naslov + PDF, red 2 = period (na mobitelu) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Nadzorna ploča</h1>
          <div className="lg:hidden">
            <ExportMenu
              compact
              {...{ periodLogs, monthLogs, employees, periodLabel, monthLabel, showMonth: view === 'week' }}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <ViewToggle period={period} views={['week', 'month']} />
          <PeriodStepper period={period} />
          <div className="hidden lg:block">
            <ExportMenu {...{ periodLogs, monthLogs, employees, periodLabel, monthLabel, showMonth: view === 'week' }} />
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title={view === 'week' ? 'Sati u tjednu' : 'Sati u mjesecu'}
          value={formatHours(totalHours)}
          icon={Clock}
          delta={delta(cmpHours, prevHours)}
          isLoading={isLoading}
        />
        <StatCard
          title="Aktivni danas"
          value={`${activeToday} / ${activeStaff.length}`}
          subtitle={nobodyYet ? `Nitko nije upisao rad do ${NOBODY_ACTIVE_ALERT_HOUR} h` : 'zaposlenika evidentiralo danas'}
          tone={nobodyYet ? 'danger' : 'default'}
          icon={Users}
          isLoading={employeesLoading || todayLoading}
          footer={isWorkdayNow && missingToday.length > 0 ? <MissingToday missing={missingToday} /> : null}
        />
        <StatCard
          title="Unosi u periodu"
          value={periodLogs.length}
          icon={ClipboardList}
          delta={delta(cmpLogs.length, prevLogs.length)}
          isLoading={isLoading}
        />
        <StatCard
          title="Prosjek po zaposleniku / dan"
          value={formatHours(avgPerDay)}
          subtitle={`tim: ${formatHours(teamPerDay)} / dan · ${daysNote}${endDate < today ? '' : ' do danas'}`}
          icon={TrendingUp}
          delta={delta(cmpAvg, prevAvg)}
          isLoading={isLoading}
        />
      </div>

      {/* Grafovi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HoursChart
          logs={periodLogs}
          days={periodDays}
          isLoading={isLoading}
          groupBy={view === 'week' ? 'day' : 'week'}
          mode="simple"
          title={view === 'week' ? 'Ukupni sati po danu' : 'Ukupni sati po tjednu'}
          onBucketClick={setOpenBucket}
        />
        <HoursChart
          logs={periodLogs}
          employees={employees}
          days={periodDays}
          isLoading={isLoading || employeesLoading}
          groupBy={view === 'week' ? 'day' : 'week'}
          mode="stacked"
          title={view === 'week' ? 'Sati po zaposleniku – po danu' : 'Sati po zaposleniku – po tjednu'}
          onBucketClick={setOpenBucket}
          employeeHref={employeeHref}
        />
      </div>

      {openBucket && (
        <BucketEntriesDialog bucket={openBucket} logs={periodLogs} onClose={() => setOpenBucket(null)} employeeHref={employeeHref} />
      )}

      {/* Servisni rokovi (prikazuje se samo ako ih ima) */}
      <ServiceDueCard />

      {/* Današnja aktivnost */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="today-title">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
          <h2 id="today-title" className="text-sm font-semibold text-slate-800">Današnja aktivnost</h2>
          <p className="text-xs text-slate-600 mt-0.5">{capitalize(formatDayLong(new Date()))}</p>
        </div>

        {todayLoading ? (
          <div className="p-4 sm:p-5 space-y-3" aria-busy="true">
            {[0, 1].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : todayLogs.length === 0 ? (
          <div className="flex items-center gap-3 px-4 sm:px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0" aria-hidden="true">
              <Inbox size={16} className="text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-800">Danas još nema evidentiranih radova.</p>
              {latestLog && (
                <p className="text-xs text-slate-600 mt-0.5 truncate">
                  Zadnji unos: {latestLog.profiles?.full_name ?? '—'}, {formatWeekday(latestLog.log_date)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todayLogs.map(log => {
              const emp = log.profiles;
              return (
                <li key={log.id} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                    <span className="text-xs font-bold text-blue-800">{initials(emp?.full_name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{emp?.full_name ?? '—'}</p>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                        {formatHours(Number(log.hours_worked))}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5 truncate">{log.task_description}</p>
                    <span className="flex items-center gap-1 text-xs text-slate-600 mt-0.5">
                      <MapPin size={11} aria-hidden="true" />
                      <span className="sr-only">Lokacija:</span>
                      <LogLocation log={log} className="truncate" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Izvoz PDF ──────────────────────────────────────────────────────────────

type Logs = Parameters<typeof exportDashboardPdf>[0];
type Employees = Parameters<typeof exportDashboardPdf>[1];

function ExportMenu({
  periodLogs, monthLogs, employees, periodLabel, monthLabel, showMonth, compact,
}: {
  periodLogs: Logs; monthLogs: Logs; employees: Employees;
  periodLabel: string; monthLabel: string; showMonth: boolean; compact?: boolean;
}) {
  const itemCls =
    'flex items-start gap-3 w-full px-3 py-2.5 min-h-11 rounded-lg text-left text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100';
  const labelCls = 'px-3 pt-2 pb-1 text-xs font-semibold text-slate-600';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg data-[state=open]:bg-slate-100"
        aria-label="Izvezi PDF"
      >
        <Download size={15} aria-hidden="true" />
        {!compact && <span>Izvezi PDF</span>}
        <ChevronDown size={13} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-24px))] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-1.5"
        >
          <DropdownMenu.Label className={labelCls}>Odabrani period · {periodLabel}</DropdownMenu.Label>
          <DropdownMenu.Item className={itemCls} onSelect={() => reportExport(exportDashboardPdf(periodLogs, employees, periodLabel))}>
            <FileText size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
            <span><span className="block font-medium">Svi zaposlenici – zbirno</span><span className="block text-xs text-slate-600">Sažetak po zaposleniku i popis svih unosa</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={() => reportExport(exportMonthPerEmployeePdf(periodLogs, employees, periodLabel))}>
            <Files size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
            <span><span className="block font-medium">Po zaposleniku</span><span className="block text-xs text-slate-600">Svaki zaposlenik na zasebnoj stranici</span></span>
          </DropdownMenu.Item>
          {employees.length > 0 && (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={itemCls}>
                <User size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="flex-1"><span className="block font-medium">Jedan zaposlenik…</span><span className="block text-xs text-slate-600">Izvješće samo za odabranu osobu</span></span>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={4}
                  collisionPadding={12}
                  className="z-50 min-w-52 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-1.5"
                >
                  {employees.map(emp => (
                    <DropdownMenu.Item
                      key={emp.id}
                      className={itemCls}
                      onSelect={() => reportExport(exportEmployeePdf(periodLogs, emp, periodLabel))}
                    >
                      {emp.full_name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          )}

          {showMonth && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-slate-100" />
              <DropdownMenu.Label className={labelCls}>Cijeli mjesec · {monthLabel}</DropdownMenu.Label>
              <DropdownMenu.Item className={itemCls} onSelect={() => reportExport(exportDashboardPdf(monthLogs, employees, monthLabel))}>
                <FileText size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="block font-medium">Svi zaposlenici – zbirno</span><span className="block text-xs text-slate-600">Cijeli mjesec, ne samo odabrani tjedan</span></span>
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemCls} onSelect={() => reportExport(exportMonthPerEmployeePdf(monthLogs, employees, monthLabel))}>
                <Files size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="block font-medium">Po zaposleniku</span><span className="block text-xs text-slate-600">Mjesečno izvješće, osoba po stranici</span></span>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Tko danas još nije upisao rad ──────────────────────────────────────────

function MissingToday({ missing }: { missing: Profile[] }) {
  const shown = missing.slice(0, 3).map(e => e.full_name.split(' ')[0]);
  const rest = missing.length - shown.length;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-100">
      <p className="text-xs text-slate-700" title={missing.map(e => e.full_name).join(', ')}>
        <span className="text-slate-600">Nisu upisali: </span>
        {shown.join(', ')}{rest > 0 && ` i još ${rest}`}
      </p>
    </div>
  );
}
