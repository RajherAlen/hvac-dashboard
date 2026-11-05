import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
import {
  Clock, Users, ClipboardList, Gauge, Download, MapPin,
  ChevronDown, User, FileText, Files, Inbox, CheckCircle2,
} from 'lucide-react';
import { addMonths, addWeeks, differenceInCalendarDays, addDays, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { CalendarOff } from 'lucide-react';
import { useWorkCalendar, usePendingAbsences } from '../../hooks/useAbsences';
import { AbsenceDialog } from '../../components/absences/AbsenceDialog';
import { ABSENCE_TONE } from '../../components/absences/absenceStyle';
import { ABSENCE_CODE, ABSENCE_LABEL, type WorkCalendar } from '../../lib/workCalendar';
import { StatCard, type StatDelta } from '../../components/StatCard';
import { HoursChart } from '../../components/HoursChart';
import { StaffDayMatrix } from '../../components/StaffDayMatrix';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { useWorkLogs, useLatestWorkLog } from '../../hooks/useWorkLogs';
import { usePlan, type PlanAssignment } from '../../hooks/useWorkOrders';
import { useClientDirectory } from '../../hooks/useClients';
import { useProfileNames } from '../../hooks/useWorkLogChanges';
import { KindIcon } from '../../components/orders/KindIcon';
import { OFFICE_LOCATION } from '../../lib/clients';
import { useStaffDirectory, type DirectoryEntry } from '../../hooks/useStaffDirectory';
import { BucketEntriesDialog } from '../../components/BucketEntriesDialog';
import { LogLocation } from '../../components/clients/LogLocation';
import { ServiceDueCard } from '../../components/clients/ServiceDueCard';
import type { Bucket } from '../../lib/period';
import type { AbsenceKind, WorkLogWithEmployee } from '../../types';
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
  // Raspored naloga (null = modul nije uključen → usporedba s normom kao prije)
  const { data: periodPlan } = usePlan(startDate, endDate);
  const { data: recentPlan } = usePlan(recentFrom, today);
  // Radni kalendar: praznici, neradni dani tvrtke i odsutnosti (period + zadnjih 10 dana za panel "Danas")
  const { cal } = useWorkCalendar(startDate < recentFrom ? startDate : recentFrom, endDate > today ? endDate : today);
  const { data: pendingAbsences } = usePendingAbsences();
  const [absenceDialog, setAbsenceDialog] = useState<{ employeeId: string; day: string } | null>(null);

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

  // Popunjenost norme: završeni radni dani (danas se ne broji dok traje) × aktivni zaposlenici × 8 h,
  // bez praznika, neradnih dana i odobrenih odsutnosti
  const normUpTo     = endDate < today ? endDate : toISODate(addDays(parseISO(today), -1));
  const normWorkdays = elapsedWorkdays(periodDays, normUpTo, cal);
  const normDays     = periodDays.filter(d => d <= normUpTo && cal.isWorkday(d));
  const normHours    = activeStaff.reduce((s, e) => s + normDays.reduce((t, d) => t + cal.expected(e.id, d, NORM_PER_DAY), 0), 0);
  const absenceDays  = activeStaff.reduce((s, e) => s + normDays.filter(d => cal.absenceOf(e.id, d)).length, 0);
  const doneHours    = sumHours(periodLogs.filter(l => l.log_date <= normUpTo));
  const normPct      = normHours > 0 ? Math.round((doneHours / normHours) * 100) : null;

  // Plan iz rasporeda: po zaposleniku i danu
  const planByEmpDay = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const a of periodPlan ?? []) {
      (out[a.employee_id] ??= {})[a.day] = (out[a.employee_id]?.[a.day] ?? 0) + Number(a.planned_hours);
    }
    return out;
  }, [periodPlan]);
  const planMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [emp, byDay] of Object.entries(planByEmpDay)) for (const [d, h] of Object.entries(byDay)) m.set(`${emp}|${d}`, h);
    return m;
  }, [planByEmpDay]);
  const hasPlan = planMap.size > 0;
  // Plan na dan odobrene odsutnosti je sukob, ne obveza – ne ulazi u ostvarenje
  const plannedUpTo = (periodPlan ?? []).filter(a => a.day <= normUpTo && !cal.absenceOf(a.employee_id, a.day)).reduce((t, a) => t + Number(a.planned_hours), 0);
  // Uspoređuju se samo osobe i dani koji su imali plan (rad bez naloga ne napuhuje postotak)
  const doneOnPlan = sumHours(periodLogs.filter(l => l.log_date <= normUpTo && planMap.has(`${l.employee_id}|${l.log_date}`)));
  const planPct = plannedUpTo > 0 ? Math.round((doneOnPlan / plannedUpTo) * 100) : null;

  const prevHours   = sumHours(prevLogs);
  const cmpLogs     = prev.inProgress ? periodLogs.filter(l => l.log_date <= prev.currentEnd) : periodLogs;
  const cmpHours    = sumHours(cmpLogs);

  const delta = (cur: number, before: number): StatDelta | null =>
    !prev.enabled || prevLoading || before <= 0 ? null : { ratio: (cur - before) / before, label: prev.label };

  // Rad se upisuje na kraju dana ili sljedeće jutro, pa se "nedostaje" gleda za prethodni radni dan.
  let prevWorkday = addDays(parseISO(today), -1);
  for (let i = 0; i < 14 && !cal.isWorkday(toISODate(prevWorkday)); i++) prevWorkday = addDays(prevWorkday, -1);
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

  const expectedPrev = directory.entries.filter(e => !e.isAdmin && e.status === 'aktivan' && !loggedPrevIds.has(e.emp.id));
  // Odsutni toga dana nisu "propustili unos"
  const missingPrev = expectedPrev.filter(e => !cal.absenceOf(e.emp.id, prevDay));
  const absentPrev = expectedPrev.filter(e => cal.absenceOf(e.emp.id, prevDay));
  const daysNote = `${normWorkdays} ${pluralHr(normWorkdays, 'radni dan', 'radna dana', 'radnih dana')}`
    + (absenceDays > 0 ? `, ${absenceDays} ${pluralHr(absenceDays, 'dan', 'dana', 'dana')} odsutnosti` : '');
  const pendingCount = pendingAbsences?.length ?? 0;

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
        {hasPlan ? (
          <StatCard
            title="Ostvarenje plana"
            value={planPct === null ? '—' : `${planPct} %`}
            subtitle={planPct === null
              ? 'Planirani dani još nisu prošli'
              : `${formatHours(doneOnPlan)} / ${formatHours(plannedUpTo)} planirano${endDate < today ? '' : ', do jučer'}`}
            icon={Gauge}
            isLoading={isLoading}
            footer={planPct !== null ? <NormBar pct={planPct} /> : null}
          />
        ) : (
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
        )}
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
        planByEmpDay={hasPlan ? planByEmpDay : undefined}
        normStaffIds={activeIds}
        cal={cal}
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
            <span className="text-xs text-slate-600">Norma {NORM_PER_DAY} h po radnom danu · praznici i odsutnosti se ne broje</span>
          </div>
          {pendingCount > 0 && (
            <Link to="/odsutnosti"
              className="mb-3 flex items-center gap-2 text-sm text-slate-800 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-lg px-3 py-2">
              <CalendarOff size={15} className="text-slate-500 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                <strong className="font-semibold">{pendingCount}</strong> {pluralHr(pendingCount, 'zahtjev za odsutnost čeka', 'zahtjeva za odsutnost čekaju', 'zahtjeva za odsutnost čeka')} odobrenje
              </span>
              <span className="text-blue-700 font-medium">Pregledaj</span>
            </Link>
          )}
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
              plan={hasPlan ? planMap : undefined}
              cal={cal}
              onAbsenceMoreDays={cal.absencesEnabled ? (employeeId, day) => setAbsenceDialog({ employeeId, day }) : undefined}
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
          absent={absentPrev}
          cal={cal}
          todayPlan={(recentPlan ?? []).filter(a => a.day === today)}
          prevPlan={(recentPlan ?? []).filter(a => a.day === prevDay)}
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

      {absenceDialog && (
        <AbsenceDialog
          asAdmin
          employeeId={absenceDialog.employeeId}
          employees={employees}
          initialStart={absenceDialog.day}
          onClose={() => setAbsenceDialog(null)}
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

function TodayPanel({ todayLogs, loading, latestLog, missing, absent, cal, prevDay, staffCount, recentLogs, today, colors, employeeHref, todayPlan, prevPlan }: {
  /** Odsutni na prethodni radni dan (nisu "propustili" unos) */
  absent: DirectoryEntry[];
  cal: WorkCalendar;
  todayPlan: PlanAssignment[];
  prevPlan: PlanAssignment[];
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
  for (let d = parseISO(today), i = 0; stripDays.length < 5 && i < 30; d = addDays(d, -1), i++) {
    if (cal.isWorkday(toISODate(d))) stripDays.unshift(toISODate(d));
  }
  const dir = useClientDirectory();
  const placeOf = (siteId: string | null) => (siteId ? dir.siteIndex.get(siteId)?.client.name ?? 'Objekt' : OFFICE_LOCATION);
  const loggedAsg = new Set(recentLogs.map(l => l.assignment_id).filter(Boolean) as string[]);
  const planByEmp = new Map<string, PlanAssignment[]>();
  for (const a of todayPlan) { if (!planByEmp.has(a.employee_id)) planByEmp.set(a.employee_id, []); planByEmp.get(a.employee_id)!.push(a); }
  const names = useProfileNames();
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
          {todayPlan.length > 0 && (
            <div className="border-t border-slate-100 pt-3 pb-1">
              <h3 className="px-4 sm:px-5 pb-1.5 text-sm font-semibold text-slate-800">Plan za danas</h3>
              <ul>
                {[...planByEmp.entries()].map(([emp, items]) => (
                  <li key={emp} className="px-4 sm:px-5 py-1.5">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <PersonDot color={colors[emp]} />
                      <Link to={employeeHref(emp)} className="hover:text-blue-700 hover:underline truncate">{names.get(emp)?.name ?? 'Tehničar'}</Link>
                    </p>
                    <ul className="ml-[18px] mt-0.5 space-y-0.5">
                      {items.map(a => {
                        const done = !!a.done_at || loggedAsg.has(a.id);
                        return (
                          <li key={a.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                            <KindIcon kind={a.work_orders.kind} size={12} className="text-slate-500 shrink-0" />
                            <span className="truncate flex-1">{placeOf(a.work_orders.site_id)}, {a.work_orders.title.toLowerCase()} {formatHours(Number(a.planned_hours))}</span>
                            <span className={cn('shrink-0 font-medium', done ? 'text-emerald-800' : 'text-slate-500')}>{done ? 'upisano' : 'čeka'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {todayLogs.length === 0 && todayPlan.length > 0 ? null : todayLogs.length === 0 ? (
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
                      const away = stripDays.map(d => cal.absenceOf(e.emp.id, d)?.kind ?? null);
                      // Koliko radnih dana zaredom (bez današnjeg, koji još traje) nema unosa; dani odsutnosti se preskaču
                      let gap = 0;
                      for (let i = stripDays.length - 2; i >= 0 && hours[i] === 0; i--) if (!away[i]) gap++;
                      return (
                        <li key={e.emp.id}>
                          <Link to={employeeHref(e.emp.id)} className="flex items-center gap-3 px-4 sm:px-5 py-2 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
                            <PersonDot color={colors[e.emp.id]} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-800 truncate">{e.emp.full_name}</span>
                              <span className={cn('block text-xs', gap >= 2 ? 'text-red-700' : 'text-slate-600')}>
                                {gap >= 2
                                  ? `Bez unosa ${gap} ${pluralHr(gap, 'radni dan', 'radna dana', 'radnih dana')} zaredom`
                                  : (() => {
                                    const open = prevPlan.filter(a => a.employee_id === e.emp.id && !a.done_at && !loggedAsg.has(a.id));
                                    if (open.length) return `Nalog ${placeOf(open[0].work_orders.site_id)} bez unosa${open.length > 1 ? ` (+${open.length - 1})` : ''}`;
                                    return e.lastLogDate ? `Zadnji unos ${formatRelative(e.lastLogDate)}` : 'Još nema nijedan unos';
                                  })()}
                              </span>
                            </span>
                            <DayStrip days={stripDays} hours={hours} away={away} today={today} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-4 sm:px-5 pb-3 text-[11px] text-slate-500 text-right">Zadnjih 5 radnih dana</p>
                </>
              )}
              {absent.length > 0 && (
                <p className="px-4 sm:px-5 pb-3 -mt-1 text-xs text-slate-600">
                  Odsutni: {absent.map(e => {
                    const a = cal.absenceOf(e.emp.id, prevDay);
                    return `${e.emp.full_name}${a ? ` (${ABSENCE_LABEL[a.kind].toLowerCase()})` : ''}`;
                  }).join(', ')}
                </p>
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

/** Pet pločica: jedan radni dan = jedna pločica, iste boje kao matrica. Odsutnost = šrafirana pločica. */
function DayStrip({ days, hours, away, today }: { days: string[]; hours: number[]; away: (AbsenceKind | null)[]; today: string }) {
  const label = days.map((d, i) => `${formatWeekday(d)}: ${
    hours[i] === 0 && away[i] ? ABSENCE_LABEL[away[i]!].toLowerCase()
      : d === today && hours[i] === 0 ? 'danas, još ništa' : formatHours(hours[i])}`).join('; ');
  return (
    <span className="flex items-end gap-[3px] shrink-0" role="img" aria-label={`Zadnjih 5 radnih dana – ${label}`}>
      {days.map((d, i) => {
        const v = hours[i];
        const a = away[i];
        if (v === 0 && a) {
          return (
            <span key={d} title={`${formatWeekday(d)}: ${ABSENCE_LABEL[a]} (${ABSENCE_CODE[a]})`}
              className={cn('w-2.5 h-3.5 rounded-[3px] border', ABSENCE_TONE[a].swatch)} />
          );
        }
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
