import { useState } from 'react';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { todayISO, formatHours } from '../../lib/utils';
import { format, subDays } from 'date-fns';

export function MyHistoryPage() {
  const { user } = useAuth();

  const defaultEnd   = todayISO();
  const defaultStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate]     = useState(defaultEnd);
  const [locationSearch, setLocationSearch] = useState('');

  const { data: logs = [], isLoading } = useWorkLogs({
    employeeId: user?.id,
    startDate,
    endDate,
    locationSearch: locationSearch || undefined,
  });

  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Moja povijest</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {logs.length} {logs.length === 1 ? 'unos' : 'unosa'} · {formatHours(totalHours)} ukupno
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Od</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Do</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayISO()}
              onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-slate-500 mb-1">Pretraži lokaciju</label>
            <input
              type="text"
              value={locationSearch}
              onChange={e => setLocationSearch(e.target.value)}
              placeholder="npr. Zagreb, Ured..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <EmployeeTimeline logs={logs} canEdit />
      )}
    </div>
  );
}
