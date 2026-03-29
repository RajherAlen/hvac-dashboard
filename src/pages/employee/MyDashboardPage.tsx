import { useState } from 'react';
import { Clock, ClipboardList, PlusCircle, Calendar, TrendingUp } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { WorkLogForm } from '../../components/WorkLogForm';
import { HoursChart } from '../../components/HoursChart';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import {
  getCurrentWeekRange,
  getCurrentMonthRange,
  getLast7Days,
  todayISO,
  formatHours,
} from '../../lib/utils';
import { format, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';

export function MyDashboardPage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);

  const today = todayISO();
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
  const last7 = getLast7Days();

  const { data: todayLogs = [] } = useWorkLogs({
    employeeId: user?.id,
    startDate: today,
    endDate: today,
  });
  const { data: weekLogs = [] } = useWorkLogs({
    employeeId: user?.id,
    startDate: weekStart,
    endDate: weekEnd,
  });
  const { data: monthLogs = [], isLoading: monthLoading } = useWorkLogs({
    employeeId: user?.id,
    startDate: monthStart,
    endDate: monthEnd,
  });
  const { data: last7Logs = [] } = useWorkLogs({
    employeeId: user?.id,
    startDate: last7[0],
    endDate: last7[6],
  });

  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const weekHours  = weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const monthHours = monthLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const dayOfMonth = new Date().getDate();
  const avgPerDay  = dayOfMonth > 0 ? monthHours / dayOfMonth : 0;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Top greeting bar */}
      <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Moja nadzorna ploča</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">
              {format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-colors shadow-sm"
          >
            <PlusCircle size={15} />
            Unesi rad
          </button>
        </div>
      </div>

      <div className="px-4 pb-24 sm:px-6 sm:pb-8 space-y-4">
        {/* Month hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-5 sm:p-6 shadow-lg">
          {/* Decorative circles */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-12 -bottom-10 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-20 w-20 rounded-full bg-indigo-500/30 blur-2xl" />

          <div className="relative">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-100">Sati ovaj mjesec</p>
                {monthLoading ? (
                  <div className="mt-2 h-12 w-32 bg-white/20 rounded-xl animate-pulse" />
                ) : (
                  <p className="mt-1 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                    {formatHours(monthHours)}
                  </p>
                )}
                <p className="mt-1.5 text-sm text-blue-200 capitalize">
                  {format(new Date(), 'MMMM yyyy', { locale: hr })}
                </p>
              </div>
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-white/20 backdrop-blur-sm shrink-0 ml-3">
                <Calendar size={22} className="text-white" />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-5">
              <div>
                <p className="text-xs font-medium text-blue-200 uppercase tracking-wide">Unosa</p>
                <p className="mt-0.5 text-xl font-bold text-white">{monthLogs.length}</p>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div>
                <p className="text-xs font-medium text-blue-200 uppercase tracking-wide">Prosjek / dan</p>
                <p className="mt-0.5 text-xl font-bold text-white">{formatHours(avgPerDay)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Today + Week stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Sati danas"
            value={formatHours(todayHours)}
            icon={Clock}
            color="blue"
          />
          <StatCard
            title="Ovaj tjedan"
            value={formatHours(weekHours)}
            subtitle={`${format(parseISO(weekStart), 'd MMM', { locale: hr })} – ${format(parseISO(weekEnd), 'd MMM', { locale: hr })}`}
            icon={TrendingUp}
            color="green"
          />
        </div>

        {/* Chart */}
        <HoursChart logs={last7Logs} mode="simple" title="Moji sati — zadnjih 7 dana" />

        {/* Today's logs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Današnji radni zapisi</h2>
              {todayLogs.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatHours(todayHours)} ukupno danas
                </p>
              )}
            </div>
            <ClipboardList size={16} className="text-slate-400" />
          </div>
          <div className="p-4 sm:p-5">
            <EmployeeTimeline logs={todayLogs} canEdit />
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="sm:hidden fixed bottom-6 right-5 flex items-center gap-2 px-5 py-3.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-2xl shadow-xl transition-colors z-30"
        style={{ boxShadow: '0 8px 24px rgba(37,99,235,0.45)' }}
      >
        <PlusCircle size={18} />
        Unesi rad
      </button>

      {showForm && <WorkLogForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
