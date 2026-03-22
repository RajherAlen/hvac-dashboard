import { Clock, Users, ClipboardList, TrendingUp } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { HoursChart } from '../../components/HoursChart';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useEmployees } from '../../hooks/useEmployees';
import { getCurrentWeekRange, getLast7Days, todayISO, formatHours } from '../../lib/utils';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { hr } from 'date-fns/locale';
import { MapPin } from 'lucide-react';

export function AdminDashboardPage() {
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const today = todayISO();
  const last7 = getLast7Days();
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: weekLogs = [], isLoading: weekLoading } = useWorkLogs({
    startDate: weekStart,
    endDate: weekEnd,
  });

  const { data: last7Logs = [] } = useWorkLogs({
    startDate: last7[0],
    endDate: last7[6],
  });

  const { data: monthLogs = [] } = useWorkLogs({
    startDate: monthStart,
    endDate: monthEnd,
  });

  const { data: employees = [] } = useEmployees();
  const { data: todayLogs = [] } = useWorkLogs({ startDate: today, endDate: today });

  // Stats
  const totalWeekHours = weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const activeToday = new Set(todayLogs.map(l => l.employee_id)).size;
  const monthEntries = monthLogs.length;
  const avgHoursPerDay = last7Logs.length > 0
    ? last7Logs.reduce((s, l) => s + Number(l.hours_worked), 0) / 7
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pregled</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tjedan od {format(parseISO(weekStart), 'd MMM', { locale: hr })} – {format(parseISO(weekEnd), 'd MMM yyyy', { locale: hr })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sati ovog tjedna"
          value={formatHours(totalWeekHours)}
          icon={Clock}
          color="blue"
          isLoading={weekLoading}
        />
        <StatCard
          title="Aktivni danas"
          value={`${activeToday} / ${employees.length}`}
          subtitle="zaposlenika evidentiralo danas"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Unosi ovog mjeseca"
          value={monthEntries}
          icon={ClipboardList}
          color="amber"
        />
        <StatCard
          title="Prosj. sati / dan"
          value={formatHours(avgHoursPerDay)}
          subtitle="zadnjih 7 dana"
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HoursChart
          logs={last7Logs}
          mode="simple"
          title="Ukupni sati — zadnjih 7 dana"
        />
        <HoursChart
          logs={last7Logs}
          employees={employees}
          mode="stacked"
          title="Po zaposleniku — zadnjih 7 dana"
        />
      </div>

      {/* Today's activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Današnja aktivnost</h2>
          <p className="text-xs text-slate-400 mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}</p>
        </div>

        {todayLogs.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Danas još nema evidentiranih radova.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayLogs.map(log => {
              const emp = (log as any).profiles;
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600">
                      {emp?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{emp?.full_name ?? 'Unknown'}</p>
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
