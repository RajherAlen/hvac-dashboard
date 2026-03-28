import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, PlusCircle, Calendar, Trash2, TrendingUp } from 'lucide-react';
import { useEmployee, useDeleteEmployee } from '../../hooks/useEmployees';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { HoursChart } from '../../components/HoursChart';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { WorkLogForm } from '../../components/WorkLogForm';
import { Clock, ClipboardList } from 'lucide-react';
import {
  getCurrentWeekRange,
  getLast7Days,
  formatHours,
  todayISO,
} from '../../lib/utils';
import { format, startOfMonth, subDays } from 'date-fns';

type FilterMode = 'week' | 'month' | 'custom';

export function AdminEmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteEmployee = useDeleteEmployee();

  const [filterMode, setFilterMode] = useState<FilterMode>('month');
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(todayISO());

  const { startDate, endDate } = useMemo(() => {
    if (filterMode === 'week') {
      const { start, end } = getCurrentWeekRange();
      return { startDate: start, endDate: end };
    }
    if (filterMode === 'month') {
      return {
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: todayISO(),
      };
    }
    return { startDate: customStart, endDate: customEnd };
  }, [filterMode, customStart, customEnd]);

  const { data: employee, isLoading: empLoading } = useEmployee(id);
  const { data: logs = [], isLoading: logsLoading } = useWorkLogs({ employeeId: id, startDate, endDate });

  const { data: todayLogs = [] } = useWorkLogs({ employeeId: id, startDate: todayISO(), endDate: todayISO() });
  const last7 = getLast7Days();
  const { data: last7Logs = [] } = useWorkLogs({ employeeId: id, startDate: last7[0], endDate: last7[6] });

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const { data: monthLogs = [] } = useWorkLogs({ employeeId: id, startDate: monthStart, endDate: todayISO() });

  const monthHours = monthLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const totalLogs = logs.length;

  const handleDelete = async () => {
    if (!id) return;
    await deleteEmployee.mutateAsync(id);
    navigate('/admin/employees', { replace: true });
  };

  if (empLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-36 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
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
  const isActiveToday = todayHours > 0;

  return (
    <div className="p-6 space-y-5">
      {/* Back */}
      <Link
        to="/admin/employees"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors tracking-wide uppercase"
      >
        <ArrowLeft size={13} />
        Svi zaposlenici
      </Link>

      {/* Employee header */}
      <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-500" />

        <div className="p-6 pt-7">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
                <span className="text-lg font-bold text-white tracking-wide">{initials}</span>
              </div>
              {isActiveToday && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">{employee.full_name}</h1>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wider uppercase ${
                  employee.role === 'admin'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {employee.role === 'admin' ? 'Admin' : 'Zaposlenik'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <a
                  href={`mailto:${employee.email}`}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <Mail size={12} /> {employee.email}
                </a>
                {employee.phone && (
                  <a
                    href={`tel:${employee.phone}`}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Phone size={12} /> {employee.phone}
                  </a>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm shadow-blue-200"
              >
                <PlusCircle size={14} />
                Dodaj unos
              </button>

              {showDeleteConfirm ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <span className="text-xs text-red-600 font-medium whitespace-nowrap">Obrisati zaposlenika?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleteEmployee.isPending}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors"
                  >
                    {deleteEmployee.isPending ? '...' : 'Da'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Ne
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl transition-all"
                >
                  <Trash2 size={13} />
                  Obriši
                </button>
              )}
            </div>
          </div>

          {deleteEmployee.error && (
            <p className="mt-4 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {(deleteEmployee.error as Error).message}
            </p>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Today */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Danas</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Clock size={15} className="text-blue-500" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{formatHours(todayHours)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {isActiveToday ? 'Aktivan danas' : 'Nema unosa'}
            </p>
          </div>
        </div>

        {/* This month */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-md shadow-blue-200 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Ovaj mjesec</span>
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp size={15} className="text-white" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-white leading-none">{formatHours(monthHours)}</p>
            <p className="text-xs text-blue-200 mt-1">{format(new Date(), 'MMMM yyyy')}</p>
          </div>
        </div>

        {/* Entries in range */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">U rasponu</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <ClipboardList size={15} className="text-amber-500" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{totalLogs}</p>
            <p className="text-xs text-slate-400 mt-1">
              {filterMode === 'week' ? 'Ovaj tjedan' : filterMode === 'month' ? 'Ovaj mjesec' : 'Prilagođeni raspon'}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <HoursChart logs={last7Logs} mode="simple" title={`${employee.full_name} — Sati zadnjih 7 dana`} />

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header + filters */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800 flex-1">Povijest radnih sati</h2>

          {/* Preset tabs */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">
            {(['week', 'month', 'custom'] as FilterMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterMode === mode
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode === 'week' ? 'Tjedan' : mode === 'month' ? 'Mjesec' : 'Prilagođeno'}
              </button>
            ))}
          </div>

          {/* Custom pickers */}
          {filterMode === 'custom' && (
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={e => setCustomStart(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={todayISO()}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          )}
        </div>

        <div className="p-5">
          {logsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardList size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nema unosa u odabranom periodu.</p>
            </div>
          ) : (
            <EmployeeTimeline logs={logs} canEdit />
          )}
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="sm:hidden fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg shadow-blue-300 transition-colors z-30"
      >
        <PlusCircle size={18} />
        Dodaj unos
      </button>

      {showForm && (
        <WorkLogForm onClose={() => setShowForm(false)} employeeId={id} />
      )}
    </div>
  );
}
