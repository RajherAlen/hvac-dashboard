import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
import {
  Clock, Users, ClipboardList, Gauge, Download, MapPin,
  ChevronDown, User, FileText, Files, Inbox, CheckCircle2,
} from 'lucide-react';
import { addMonths, addWeeks, differenceInCalendarDays, addDays, parseISO, startOfMonth, endOfMonth, isWeekend } from 'date-fns';
import { StatCard, type StatDelta } from '../../components/StatCard';
import { HoursChart } from '../../components/HoursChart';
import { StaffDayMatrix } from '../../components/StaffDayMatrix';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { useWorkLogs, useLatestWorkLog } from '../../hooks/useWorkLogs';
import { useStaffDirectory, type DirectoryEntry } from '../../hooks/useStaffDirectory';
import { BucketEntriesDialog } from '../../components/BucketEntriesDialog';
import { LogLocation } from '../../components/clients/LogLocation';
import { ServiceDueCard } from '../../components/clients/ServiceDueCard';
import type { Bucket } from '../../lib/period';
import type { WorkLogWithEmployee } from '../../types';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { todayISO, formatHours, pluralHr, cn } from '../../lib/utils';
import { elapsedWorkdays, isStaff, sumHours } from '../../lib/period';
import { employeeColorMap } from '../../lib/colors';
import { formatDayLong, formatMonth, formatWeekday, formatRelative, capitalize, toISODate } from '../../lib/format-date';
import {
  exportDashboardPdf,
  exportEmployeePdf,
  exportMonthPerEmployeePdf,
  reportExport,
} from '../../lib/exportPdf';

/** Norma po zaposleniku i radnom danu */
const NORM_PER_DAY = 8;

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
  const [openBucket, setOpenBucket] = useState<{ bucket: Bucket; employeeId?: string } | null>(null);
  const { data: allTodayLogs = [], isLoading: todayLoading } = useWorkLogs({ startDate: today, endDate: today });
  const { data: latestLog } = useLatestWorkLog();
  const recentFrom = toISODate(addDays(parseISO(today), -10));
  const { data: allRecentLogs = [] } = useWorkLogs({ startDate: recentFrom, endDate: today });

  // Admini ne evidentiraju rad → isključeni iz KPI-ja, grafa, matrice i izvoza.
  // Graf/izvoz: svi zaposlenici (i deaktivirani – njihovi stari sati ostaju u povijesti).
  const employees  = useMemo(() => directory.entries.filter(e => !e.isAdmin).map(e => e.emp), [directory.entries]);
  // Norma, "Aktivni danas" i "Nedostaje unos": samo aktivni (bez pozvanih i deaktiviranih).
  const activeStaff = directory.activeStaff;
  const periodLogs = useMemo(() => allPeriodLogs.filter(l => isStaff(l.profiles)), [allPeriodLogs]);
  const prevLogs   = useMemo(() => allPrevLogs.filter(l => isStaff(l.profiles)), [allPrevLogs]);
  const monthLogs  = useMemo(() => allMonthLogs.filter(l => isStaff(l.profiles)), [allMonthLogs]);
  const todayLogs  = useMemo(() => allTodayLogs.filter(l => isStaff(l.profiles)), [allTodayLogs]);
  const colors = useMemo(() => employeeColorMap(employees), [employees]);
  const activeIds = useMemo(() => activeStaff.map(e => e.id), [activeStaff]);

  // ── KPI ───────────────────────────────────────────────────────────────
  const totalHours      = sumHours(periodLogs);
  const loggedTodayIds  = new Set(todayLogs.map(l => l.employee_id));
  const activeToday     = activeStaff.filter(e => loggedTodayIds.has(e.id)).length;

  // Popunjenost norme: završeni radni dani (danas se ne broji dok traje) × aktivni zaposlenici × 8 h
  const normUpTo     = endDate < today ? endDate : toISODate(addDays(parseISO(today), -1));
  const normWorkdays = elapsedWorkdays(periodDays, normUpTo);
  const normHours    = NORM_PER_DAY * activeStaff.length * normWorkdays;
  const doneHours    = sumHours(periodLogs.filter(l => l.log_date <= normUpTo));
  const normPct      = normHours > 0 ? Math.round((doneHours / normHours) * 100) : null;

  const prevHours   = sumHours(prevLogs);
  const cmpLogs     = prev.inProgress ? periodLogs.filter(l => l.log_date <= prev.currentEnd) : periodLogs;
  const cmpHours    = sumHours(cmpLogs);

  const delta = (cur: number, before: number): StatDelta | null =>
    !prev.enabled || prevLoading || before <= 0 ? null : { ratio: (cur - before) / before, label: prev.label };

  // Rad se upisuje na kraju dana ili sljedeće jutro, pa se "nedostaje" gleda za prethodni radni dan.
  let prevWorkday = addDays(parseISO(today), -1);
  while (isWeekend(prevWorkday)) prevWorkday = addDays(prevWorkday, -1);
  const prevDay = toISODate(prevWorkday);
  const recentLogs = allRecentLogs.filter(l => isStaff(l.profiles));
  const loggedPrevIds = new Set(recentLogs.filter(l => l.log_date === prevDay && Number(l.hours_worked) > 0).map(l => l.employee_id));

  // Linkovi na profil zaposlenika zadržavaju odabrani period
  const periodQuery = view === 'month' ? `view=month&date=${startDate.slice(0, 7)}` : `view=week&date=${startDate}`;
  const employeeHref = (id: string) => `/admin/employees/${id}?${periodQuery}`;

  // Matrica: aktivni zaposlenici + svi koji su u periodu imali sate
  const matrixStaff = useMemo(() => {
    const withHours = new Set(periodLogs.map(l => l.employee_id));
    const active = new Set(activeIds);
    return employees.filter(e => active.has(e.id) || withHours.has(e.id));
  }, [employees, periodLogs, activeIds]);

  const missingPrev = directory.entries.filter(e => !e.isAdmin && e.status === 'aktivan' && !loggedPrevIds.has(e.emp.id));
  const daysNote = `${normWorkdays} ${pluralHr(normWorkdays, 'radni dan', 'radna dana', 'radnih dana')}`;

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-3 sm:gap-4">
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
          title="Popunjenost norme"
          value={normPct === null ? '—' : `${normPct} %`}
          subtitle={normPct === null
            ? 'Prvi radni dan perioda još traje'
            : `${formatHours(doneHours)} / ${formatHours(normHours)} · ${daysNote}${endDate < today ? '' : ' do jučer'}`}
          icon={Gauge}
          isLoading={isLoading || employeesLoading}
          footer={normPct !== null ? <NormBar pct={normPct} /> : null}
        />
        <StatCard
          title="Aktivni danas"
          value={`${activeToday} / ${activeStaff.length}`}
          subtitle="upisalo rad za danas"
          icon={Users}
          isLoading={employeesLoading || todayLoading}
        />
        <StatCard
          title="Unosi u periodu"
          value={periodLogs.length}
          icon={ClipboardList}
          delta={delta(cmpLogs.length, prevLogs.length)}
          isLoading={isLoading}
        />
      </div>

      {/* Jedan graf preko cijele širine: dan po dan i u mjesečnom prikazu */}
      <HoursChart
        logs={periodLogs}
        employees={employees}
        days={periodDays}
        isLoading={isLoading || employeesLoading}
        groupBy="day"
        mode="stacked"
        title="Sati po danu"
        onBucketClick={bucket => setOpenBucket({ bucket })}
        normPerPerson={NORM_PER_DAY}
        normStaffIds={activeIds}
        legendToggle
        height={280}
        maxBarSize={56}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 min-w-0" aria-labelledby="matrix-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 id="matrix-title" className="text-sm font-semibold text-slate-800">
              {view === 'week' ? 'Tjedni pregled po zaposleniku' : 'Mjesečni pregled po zaposleniku'}
            </h2>
            <span className="text-xs text-slate-600">Norma {NORM_PER_DAY} h po radnom danu</span>
          </div>
          {employeesLoading || isLoading ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : matrixStaff.length === 0 ? (
            <p className="text-sm text-slate-600 py-4">Nema zaposlenika koji evidentiraju rad.</p>
          ) : (
            <StaffDayMatrix
              logs={periodLogs}
              staff={matrixStaff}
              days={periodDays}
              today={today}
              colors={colors}
              normPerDay={NORM_PER_DAY}
              employeeHref={employeeHref}
              onCellClick={(employeeId, day) => setOpenBucket({ bucket: { key: day, label: day, days: [day] }, employeeId })}
            />
          )}
        </section>

        <TodayPanel
          todayLogs={todayLogs}
          loading={todayLoading || employeesLoading}
          latestLog={latestLog ?? null}
          missing={missingPrev}
          prevDay={prevDay}
          staffCount={activeStaff.length}
          recentLogs={recentLogs}
          today={today}
          colors={colors}
          employeeHref={employeeHref}
        />
      </div>

      {openBucket && (
        <BucketEntriesDialog
          bucket={openBucket.bucket}
          logs={openBucket.employeeId ? periodLogs.filter(l => l.employee_id === openBucket.employeeId) : periodLogs}
          onClose={() => setOpenBucket(null)}
          employeeHref={employeeHref}
        />
      )}

      {/* Servisni rokovi (prikazuje se samo ako ih ima) */}
      <ServiceDueCard />
    </div>
  );
}

function NormBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2" aria-hidden="true">
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', pct < 80 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Danas: aktivnost i tko još nije upisao ─────────────────────────────────

function TodayPanel({ todayLogs, loading, latestLog, missing, prevDay, staffCount, recentLogs, today, colors, employeeHref }: {
  todayLogs: WorkLogWithEmployee[];
  loading: boolean;
  latestLog: WorkLogWithEmployee | null;
  missing: DirectoryEntry[];
  /** Prethodni radni dan – za njega se provjerava je li rad upisan */
  prevDay: string;
  staffCount: number;
  recentLogs: WorkLogWithEmployee[];
  today: string;
  colors: Record<string, string>;
  employeeHref: (id: string) => string;
}) {
  // Zadnjih 5 radnih dana (uključujući danas) za traku uz svako ime
  const stripDays: string[] = [];
  for (let d = parseISO(today); stripDays.length < 5; d = addDays(d, -1)) {
    if (!isWeekend(d)) stripDays.unshift(toISODate(d));
  }
  const hoursOn = (emp: string, day: string) =>
    recentLogs.filter(l => l.employee_id === emp && l.log_date === day).reduce((t, l) => t + Number(l.hours_worked), 0);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="today-title">
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <h2 id="today-title" className="text-sm font-semibold text-slate-800">Danas</h2>
        <p className="text-xs text-slate-600 mt-0.5">{capitalize(formatDayLong(new Date()))}</p>
      </div>

      {loading ? (
        <div className="px-4 sm:px-5 pb-4 space-y-3" aria-busy="true">
          {[0, 1].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          {todayLogs.length === 0 ? (
            <div className="mx-4 sm:mx-5 mb-4 flex items-start gap-3 bg-slate-50 rounded-lg px-3 py-3">
              <Inbox size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm text-slate-800">Danas još nema evidentiranih radova.</p>
                {latestLog && (
                  <p className="text-xs text-slate-600 mt-0.5 truncate">
                    Zadnji unos: {latestLog.profiles?.full_name?.trim() ?? '—'}, {formatWeekday(latestLog.log_date)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {todayLogs.map(log => (
                <li key={log.id} className="flex items-start gap-3 px-4 sm:px-5 py-2.5">
                  <PersonDot color={colors[log.employee_id]} className="mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{log.profiles?.full_name ?? '—'}</p>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{formatHours(Number(log.hours_worked))}</span>
                    </div>
                    <p className="text-xs text-slate-700 truncate">{log.task_description}</p>
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <MapPin size={11} aria-hidden="true" />
                      <span className="sr-only">Lokacija:</span>
                      <LogLocation log={log} className="truncate" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-baseline justify-between gap-3 px-4 sm:px-5 pb-1.5">
                <h3 className="text-sm font-semibold text-slate-800">
                  Nedostaje unos za {formatRelative(prevDay) === 'jučer' ? 'jučer' : formatWeekday(prevDay)}
                </h3>
                {missing.length > 0 && (
                  <span className="text-xs text-slate-600 tabular-nums">
                    <span className={cn('font-semibold', missing.length === staffCount ? 'text-red-700' : 'text-slate-900')}>{missing.length}</span> od {staffCount}
                  </span>
                )}
              </div>
              {missing.length === 0 ? (
                <p className="flex items-center gap-2 px-4 sm:px-5 pb-4 pt-1 text-sm text-emerald-800">
                  <CheckCircle2 size={15} aria-hidden="true" /> Svi su upisali rad za {formatRelative(prevDay) === 'jučer' ? 'jučer' : formatWeekday(prevDay)}.
                </p>
              ) : (
                <>
                  <ul className="pb-1">
                    {missing.map(e => {
                      const hours = stripDays.map(d => hoursOn(e.emp.id, d));
                      // Koliko radnih dana zaredom (bez današnjeg, koji još traje) nema unosa
                      let gap = 0;
                      for (let i = stripDays.length - 2; i >= 0 && hours[i] === 0; i--) gap++;
                      return (
                        <li key={e.emp.id}>
                          <Link to={employeeHref(e.emp.id)} className="flex items-center gap-3 px-4 sm:px-5 py-2 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
                            <PersonDot color={colors[e.emp.id]} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-800 truncate">{e.emp.full_name}</span>
                              <span className={cn('block text-xs', gap >= 2 ? 'text-red-700' : 'text-slate-600')}>
                                {gap >= 2
                                  ? `Bez unosa ${gap} ${pluralHr(gap, 'radni dan', 'radna dana', 'radnih dana')} zaredom`
                                  : e.lastLogDate ? `Zadnji unos ${formatRelative(e.lastLogDate)}` : 'Još nema nijedan unos'}
                              </span>
                            </span>
                            <DayStrip days={stripDays} hours={hours} today={today} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-4 sm:px-5 pb-3 text-[11px] text-slate-500 text-right">Zadnjih 5 radnih dana</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Identitet osobe: ista boja kao u grafu i matrici. */
function PersonDot({ color, className }: { color?: string; className?: string }) {
  return <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', className)} style={{ background: color ?? '#94a3b8' }} aria-hidden="true" />;
}

const STRIP: Record<'full' | 'part' | 'miss' | 'today', string> = {
  full: 'bg-emerald-600',
  part: 'bg-amber-400',
  miss: 'bg-red-500',
  today: 'border border-slate-300 bg-[repeating-linear-gradient(135deg,#e2e8f0_0_2px,#fff_2px_4px)]',
};

/** Pet pločica: jedan radni dan = jedna pločica, iste boje kao matrica. */
function DayStrip({ days, hours, today }: { days: string[]; hours: number[]; today: string }) {
  const label = days.map((d, i) => `${formatWeekday(d)}: ${d === today && hours[i] === 0 ? 'danas, još ništa' : formatHours(hours[i])}`).join('; ');
  return (
    <span className="flex items-end gap-[3px] shrink-0" role="img" aria-label={`Zadnjih 5 radnih dana – ${label}`}>
      {days.map((d, i) => {
        const v = hours[i];
        const kind = d === today && v < NORM_PER_DAY ? 'today' : v >= NORM_PER_DAY ? 'full' : v > 0 ? 'part' : 'miss';
        return (
          <span key={d} title={`${formatWeekday(d)}: ${formatHours(v)}`}
            className={cn('w-2.5 rounded-[3px]', d === today ? 'h-4' : 'h-3.5', STRIP[kind])} />
        );
      })}
    </span>
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
