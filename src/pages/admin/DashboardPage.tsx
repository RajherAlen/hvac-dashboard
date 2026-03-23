import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Clock, Users, ClipboardList, TrendingUp,
  ChevronLeft, ChevronRight, Download, MapPin,
  ChevronDown, User, FileText,
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

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
    <div className="p-6 space-y-6">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Pregled</h1>

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
            <span className="px-3 font-medium text-slate-700 min-w-[150px] text-center capitalize">
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

          {/* PDF export dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Download size={15} />
              Izvezi PDF
              <ChevronDown size={13} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-2">

                {/* ── Current period ── */}
                <p className="px-3 pt-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider capitalize">
                  {periodLabel}
                </p>

                {/* All employees — current period */}
                <button
                  onClick={() => { exportDashboardPdf(periodLogs, employees, periodLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  Svi zaposlenici
                </button>

                {/* One button per employee — current period */}
                {employees.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => { exportEmployeePdf(periodLogs, emp, periodLabel); setShowExportMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors pl-6"
                  >
                    <User size={13} className="text-slate-400 shrink-0" />
                    {emp.full_name}
                  </button>
                ))}

                <div className="my-2 border-t border-slate-100" />

                {/* ── Full month ── */}
                <p className="px-3 pt-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider capitalize">
                  {monthLabel} (cijeli mjesec)
                </p>

                {/* All employees — full month */}
                <button
                  onClick={() => { exportDashboardPdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  Svi zaposlenici
                </button>

                {/* Per-employee sections — full month */}
                <button
                  onClick={() => { exportMonthPerEmployeePdf(monthLogs, employees, monthLabel); setShowExportMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileText size={14} className="text-slate-400 shrink-0" />
                  Po zaposleniku (zasebne stranice)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Današnja aktivnost</h2>
          <p className="text-xs text-slate-400 mt-0.5">
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
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">
                      {emp?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{emp?.full_name ?? '—'}</p>
                      <span className="text-sm font-semibold text-blue-600 flex-shrink-0">
                        {formatHours(Number(log.hours_worked))}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">{log.task_description}</p>
                    <span className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <MapPin size={11} />
                      {log.location}
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
