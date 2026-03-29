import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { todayISO, formatHours } from '../../lib/utils';
import { format, subDays } from 'date-fns';

export function MyHistoryPage() {
  const { user } = useAuth();

  const defaultEnd   = todayISO();
  const defaultStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const [startDate, setStartDate]       = useState(defaultStart);
  const [endDate, setEndDate]           = useState(defaultEnd);
  const [locationSearch, setLocationSearch] = useState('');

  const { data: logs = [], isLoading } = useWorkLogs({
    employeeId: user?.id,
    startDate,
    endDate,
    locationSearch: locationSearch || undefined,
  });

  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Moja povijest</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {logs.length} {logs.length === 1 ? 'unos' : 'unosa'} · {formatHours(totalHours)} ukupno
          </p>
        </div>
      </div>

      <div className="px-4 pb-8 sm:px-6 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filteri</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-3 sm:items-end">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Od</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Do</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayISO()}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>
            <div className="col-span-2 sm:flex-1 sm:min-w-40">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Pretraži lokaciju</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={locationSearch}
                  onChange={e => setLocationSearch(e.target.value)}
                  placeholder="npr. Zagreb, Ured..."
                  className="w-full text-sm border border-slate-200 rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <EmployeeTimeline logs={logs} canEdit />
        )}
      </div>
    </div>
  );
}
