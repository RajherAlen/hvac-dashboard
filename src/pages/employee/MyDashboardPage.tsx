import { useState } from 'react';
import { Clock, ClipboardList, PlusCircle } from 'lucide-react';
import { StatCard } from '../../components/StatCard';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { WorkLogForm } from '../../components/WorkLogForm';
import { HoursChart } from '../../components/HoursChart';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import {
  getCurrentWeekRange,
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
  const { data: last7Logs = [] } = useWorkLogs({
    employeeId: user?.id,
    startDate: last7[0],
    endDate: last7[6],
  });

  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const weekHours  = weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Moja nadzorna ploča</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <PlusCircle size={15} />
          Unesi rad
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
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
          icon={ClipboardList}
          color="green"
        />
      </div>

      {/* Chart */}
      <HoursChart logs={last7Logs} mode="simple" title="Moji sati — zadnjih 7 dana" />

      {/* Today's logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Današnji radni zapisi</h2>
        </div>
        <div className="p-5">
          <EmployeeTimeline logs={todayLogs} canEdit />
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="sm:hidden fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors z-30"
      >
        <PlusCircle size={18} />
        Unesi rad
      </button>

      {showForm && <WorkLogForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
