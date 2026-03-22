import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, PlusCircle, Calendar } from 'lucide-react';
import { useEmployee } from '../../hooks/useEmployees';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { HoursChart } from '../../components/HoursChart';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { WorkLogForm } from '../../components/WorkLogForm';
import { StatCard } from '../../components/StatCard';
import { Clock, ClipboardList } from 'lucide-react';
import {
  getCurrentWeekRange,
  getLast7Days,
  formatHours,
  todayISO,
} from '../../lib/utils';
import { format, subDays } from 'date-fns';

export function AdminEmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showForm, setShowForm] = useState(false);

  // Date range state — default last 30 days
  const defaultEnd = todayISO();
  const defaultStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const { data: employee, isLoading: empLoading } = useEmployee(id);
  const { data: logs = [], isLoading: logsLoading } = useWorkLogs({
    employeeId: id,
    startDate,
    endDate,
  });

  const { start: ws, end: we } = getCurrentWeekRange();
  const { data: weekLogs = [] } = useWorkLogs({ employeeId: id, startDate: ws, endDate: we });
  const { data: todayLogs = [] } = useWorkLogs({ employeeId: id, startDate: todayISO(), endDate: todayISO() });
  const last7 = getLast7Days();
  const { data: last7Logs = [] } = useWorkLogs({ employeeId: id, startDate: last7[0], endDate: last7[6] });

  const weekHours = weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const totalLogs = logs.length;

  if (empLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Zaposlenik nije pronađen.</p>
        <Link to="/admin/employees" className="text-blue-600 text-sm mt-2 inline-block">← Natrag</Link>
      </div>
    );
  }

  const initials = employee.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft size={15} />
        Svi zaposlenici
      </Link>

      {/* Employee header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-blue-600">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{employee.full_name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              <a href={`mailto:${employee.email}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
                <Mail size={13} /> {employee.email}
              </a>
              {employee.phone && (
                <a href={`tel:${employee.phone}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
                  <Phone size={13} /> {employee.phone}
                </a>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <PlusCircle size={15} />
            Dodaj unos
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Sati danas"        value={formatHours(todayHours)}  icon={Clock}         color="blue" />
        <StatCard title="Ovaj tjedan"       value={formatHours(weekHours)}   icon={Clock}         color="green" />
        <StatCard title="Unosi u rasponu"   value={totalLogs}                icon={ClipboardList} color="amber" />
      </div>

      {/* Chart */}
      <HoursChart logs={last7Logs} mode="simple" title={`${employee.full_name} — Sati zadnjih 7 dana`} />

      {/* Filters + Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800 flex-1">Povijest radnih sati</h2>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">do</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayISO()}
              onChange={e => setEndDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-5">
          {logsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <EmployeeTimeline logs={logs} canEdit />
          )}
        </div>
      </div>

      {/* Mobile add button */}
      <button
        onClick={() => setShowForm(true)}
        className="sm:hidden fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors z-30"
      >
        <PlusCircle size={18} />
        Dodaj unos
      </button>

      {showForm && (
        <WorkLogForm
          onClose={() => setShowForm(false)}
          employeeId={id}
        />
      )}
    </div>
  );
}
