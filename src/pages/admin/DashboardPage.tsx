import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Clock, Users, ClipboardList, TrendingUp,
  ChevronLeft, ChevronRight, Download, MapPin,
  ChevronDown, User, FileText, X,
} from 'lucide-react';
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addWeeks, addMonths,
  eachDayOfInterval,
} from 'date-fns';
import { hr } from 'date-fns/locale';
import { StatCard } from '../../components/StatCard';
import { HoursChart } from '../../components/HoursChart';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useEmployees } from '../../hooks/useEmployees';
import { todayISO, formatHours } from '../../lib/utils';
import {
  exportDashboardPdf,
  exportEmployeePdf,
  exportMonthPerEmployeePdf,
} from '../../lib/exportPdf';

type PeriodMode = 'week' | 'month';

export function AdminDashboardPage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('week');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const today = todayISO();

  // Close desktop dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (showExportMenu) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showExportMenu]);

  // Compute selected period range
  const { startDate, endDate, periodDays, periodLabel } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;

    if (periodMode === 'week') {
      const ref = addWeeks(now, periodOffset);
      start = startOfWeek(ref, { weekStartsOn: 1 });
      end   = endOfWeek(ref,   { weekStartsOn: 1 });
    } else {
      const ref = addMonths(now, periodOffset);
      start = startOfMonth(ref);
      end   = endOfMonth(ref);
    }

    const days = eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
    const label =
      periodMode === 'week'
        ? `${format(start, 'd MMM', { locale: hr })} – ${format(end, 'd MMM yyyy', { locale: hr })}`
        : format(start, 'LLLL yyyy', { locale: hr });

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate:   format(end,   'yyyy-MM-dd'),
      periodDays: days,
      periodLabel: label,
    };
  }, [periodMode, periodOffset]);

  // Compute the full month containing the selected period (for "full month" exports)
  const { monthStart, monthEnd, monthLabel } = useMemo(() => {
    const now = new Date();
    let ref: Date;
    if (periodMode === 'week') {
      const weekRef = addWeeks(now, periodOffset);
      ref = startOfWeek(weekRef, { weekStartsOn: 1 });
    } else {
      ref = addMonths(now, periodOffset);
    }
    const ms = startOfMonth(ref);
    const me = endOfMonth(ref);
    return {
      monthStart: format(ms, 'yyyy-MM-dd'),
      monthEnd:   format(me, 'yyyy-MM-dd'),
      monthLabel: format(ms, 'LLLL yyyy', { locale: hr }),
    };
  }, [periodMode, periodOffset]);

  const { data: periodLogs = [], isLoading } = useWorkLogs({ startDate, endDate });
  const { data: monthLogs  = [] }            = useWorkLogs({ startDate: monthStart, endDate: monthEnd });
  const { data: employees  = [] }            = useEmployees();
  const { data: todayLogs  = [] }            = useWorkLogs({ startDate: today, endDate: today });

  // Stats
  const totalHours    = periodLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const activeToday   = new Set(todayLogs.map(l => l.employee_id)).size;
  const periodEntries = periodLogs.length;
  const avgPerDay     = periodDays.length > 0 ? totalHours / periodDays.length : 0;


  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Pregled</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Week / Month toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white text-sm">
            {(['week', 'month'] as PeriodMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setPeriodMode(m); setPeriodOffset(0); }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  periodMode === m
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m === 'week' ? 'Tjedan' : 'Mjesec'}
              </button>
            ))}
          </div>

          {/* Period navigation */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg text-sm">
            <button
              onClick={() => setPeriodOffset(o => o - 1)}
              className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors rounded-l-lg"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 sm:px-3 font-medium text-slate-700 min-w-[110px] sm:min-w-[150px] text-center capitalize text-xs sm:text-sm">
              {periodLabel}
            </span>
            <button
              onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))}
              disabled={periodOffset === 0}
              className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-r-lg"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* PDF export trigger button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 rounded-lg transition-colors"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Izvezi PDF</span>
              <span className="sm:hidden">PDF</span>
              <ChevronDown size={13} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Desktop dropdown */}
            {showExportMenu && (
              <div className="hidden sm:block absolute right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-2 overflow-hidden">
                <p className="px-3 pt-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {periodLabel}
                </p>
                <button
                  onClick={() => { exportDashboardPdf(periodLogs, employees, periodLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" /> Svi zaposlenici
                </button>
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => { exportEmployeePdf(periodLogs, emp, periodLabel); setShowExportMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors pl-6"
                  >
                    <User size={13} className="text-slate-400 shrink-0" /> {emp.full_name}
                  </button>
                ))}
                <div className="my-2 border-t border-slate-100" />
                <p className="px-3 pt-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {monthLabel} (cijeli mjesec)
                </p>
                <button
                  onClick={() => { exportDashboardPdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" /> Svi zaposlenici
                </button>
                <button
                  onClick={() => { exportMonthPerEmployeePdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" /> Po zaposleniku (zasebne stranice)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile bottom drawer — backdrop catches outside-tap, drawer stops propagation */}
      {showExportMenu && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end drawer-backdrop"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={() => setShowExportMenu(false)}
        >
          {/* Drawer panel — stopPropagation prevents the backdrop onClick from firing */}
          <div
            className="drawer-panel bg-white flex flex-col"
            style={{
              borderRadius: '24px 24px 0 0',
              maxHeight: '88dvh',
              boxShadow: '0 -8px 40px rgba(15,23,42,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-0 shrink-0">
              <div className="w-9 h-[5px] rounded-full bg-slate-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}
                >
                  <Download size={17} className="text-white" />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-slate-900 leading-tight">Izvezi PDF</p>
                  <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportMenu(false)}
                className="w-9 h-9 rounded-2xl bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X size={17} />
              </button>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 mx-5 shrink-0" />

            {/* Scrollable list */}
            <div className="overflow-y-auto overscroll-contain" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
              {/* Section: current period */}
              <p className="px-5 pt-4 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">
                {periodLabel}
              </p>

              {/* All employees — period */}
              <button
                onClick={() => { exportDashboardPdf(periodLogs, employees, periodLabel); setShowExportMenu(false); }}
                className="flex items-center gap-3.5 w-full px-5 py-3.5 active:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText size={17} className="text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-slate-800">Svi zaposlenici</p>
                  <p className="text-xs text-slate-400 mt-0.5">Jedan PDF za sve</p>
                </div>
              </button>

              {/* Per employee — period */}
              {employees.map(emp => {
                const initials = emp.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <button
                    key={emp.id}
                    onClick={() => { exportEmployeePdf(periodLogs, emp, periodLabel); setShowExportMenu(false); }}
                    className="flex items-center gap-3.5 w-full px-5 py-3 active:bg-slate-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-slate-600">{initials}</span>
                    </div>
                    <p className="text-[14px] font-medium text-slate-700">{emp.full_name}</p>
                  </button>
                );
              })}

              {/* Divider + full month section */}
              <div className="h-px bg-slate-100 mx-5 my-2" />
              <p className="px-5 pt-2 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">
                {monthLabel} — cijeli mjesec
              </p>

              {/* All employees — month */}
              <button
                onClick={() => { exportDashboardPdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                className="flex items-center gap-3.5 w-full px-5 py-3.5 active:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <FileText size={17} className="text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-slate-800">Svi zaposlenici</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cijeli mjesec</p>
                </div>
              </button>

              {/* Per employee pages — month */}
              <button
                onClick={() => { exportMonthPerEmployeePdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                className="flex items-center gap-3.5 w-full px-5 py-3.5 active:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0">
                  <FileText size={17} className="text-violet-600" />
                </div>
                <div className="text-left">
                  <p className="text-[14px] font-semibold text-slate-800">Po zaposleniku</p>
                  <p className="text-xs text-slate-400 mt-0.5">Zasebne stranice</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={periodMode === 'week' ? 'Sati u tjednu' : 'Sati u mjesecu'}
          value={formatHours(totalHours)}
          icon={Clock}
          color="blue"
          isLoading={isLoading}
        />
        <StatCard
          title="Aktivni danas"
          value={`${activeToday} / ${employees.length}`}
          subtitle="zaposlenika evidentiralo danas"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Unosi u periodu"
          value={periodEntries}
          icon={ClipboardList}
          color="amber"
          isLoading={isLoading}
        />
        <StatCard
          title="Prosj. sati / dan"
          value={formatHours(avgPerDay)}
          subtitle={`u ${periodMode === 'week' ? 'tjednu' : 'mjesecu'}`}
          icon={TrendingUp}
          color="purple"
          isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HoursChart
          logs={periodLogs}
          days={periodDays}
          mode="simple"
          title={
            periodMode === 'week'
              ? 'Ukupni sati — po danu'
              : 'Ukupni sati — po tjednu'
          }
        />
        <HoursChart
          logs={periodLogs}
          employees={employees}
          days={periodDays}
          mode="stacked"
          title={
            periodMode === 'week'
              ? 'Po zaposleniku — tjedan'
              : 'Po zaposleniku — mjesec'
          }
        />
      </div>

      {/* Today's activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Današnja aktivnost</h2>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}
          </p>
        </div>

        {todayLogs.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Danas još nema evidentiranih radova.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayLogs.map(log => {
              const emp = (log as any).profiles;
              return (
                <div key={log.id} className="flex items-start gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">
                      {emp?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{emp?.full_name ?? '—'}</p>
                      <span className="text-sm font-semibold text-blue-600 flex-shrink-0">
                        {formatHours(Number(log.hours_worked))}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">{log.task_description}</p>
                    <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <MapPin size={11} />
                      <span className="truncate">{log.location}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
