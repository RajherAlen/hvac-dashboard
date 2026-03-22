import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import type { Profile, WorkLog } from '../types';
import { formatHours, todayISO, getCurrentWeekRange } from '../lib/utils';

interface EmployeeTableProps {
  employees: Profile[];
  logs: WorkLog[];
  isLoading?: boolean;
}

function getEmployeeStats(employeeId: string, logs: WorkLog[]) {
  const today = todayISO();
  const { start, end } = getCurrentWeekRange();

  const todayLogs = logs.filter(l => l.employee_id === employeeId && l.log_date === today);
  const weekLogs = logs.filter(
    l => l.employee_id === employeeId && l.log_date >= start && l.log_date <= end
  );

  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const weekHours = weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const lastLog = logs.find(l => l.employee_id === employeeId);

  return { todayHours, weekHours, lastLog };
}

export function EmployeeTable({ employees, logs, isLoading }: EmployeeTableProps) {
  const [search, setSearch] = useState('');

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Pretraži zaposlenike..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table header */}
      <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
        <span>Zaposlenik</span>
        <span>Danas</span>
        <span>Ovaj tjedan</span>
        <span>Zadnji unos</span>
        <span />
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nema zaposlenika.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map(emp => {
            const { todayHours, weekHours, lastLog } = getEmployeeStats(emp.id, logs);
            const isActiveToday = todayHours > 0;

            return (
              <Link
                key={emp.id}
                to={`/admin/employees/${emp.id}`}
                className="flex md:grid md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                {/* Name + email */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-600">
                      {emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{emp.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{emp.email}</p>
                  </div>
                </div>

                {/* Today */}
                <div className="hidden md:flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isActiveToday ? 'text-green-600' : 'text-slate-400'}`}>
                    {formatHours(todayHours)}
                  </span>
                  {isActiveToday && (
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>

                {/* Week */}
                <div className="hidden md:block">
                  <span className="text-sm font-semibold text-slate-700">{formatHours(weekHours)}</span>
                </div>

                {/* Last log date */}
                <div className="hidden md:block">
                  <span className="text-xs text-slate-400">
                    {lastLog ? lastLog.log_date : '—'}
                  </span>
                </div>

                <ChevronRight size={16} className="text-slate-300 ml-auto md:ml-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
