import { useState } from 'react';
import { PlusCircle, ClipboardList } from 'lucide-react';
import { WorkLogForm } from '../../components/WorkLogForm';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { todayISO, formatHours } from '../../lib/utils';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

export function LogWorkPage() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);

  const today = todayISO();
  const { data: todayLogs = [], isLoading } = useWorkLogs({
    employeeId: user?.id,
    startDate: today,
    endDate: today,
  });

  const todayHours = todayLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="px-4 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Unos rada</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">
              {format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-colors shadow-sm"
          >
            <PlusCircle size={15} />
            <span className="hidden sm:inline">Dodaj unos</span>
            <span className="sm:hidden">Dodaj</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 sm:px-6 space-y-4">
        {/* Today's entries */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Današnji unosi</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {todayLogs.length > 0
                  ? `${formatHours(todayHours)} ukupno · Možete dodati više zadataka`
                  : 'Možete dodati više zadataka po danu'}
              </p>
            </div>
            <ClipboardList size={16} className="text-slate-400 shrink-0 ml-2" />
          </div>
          <div className="p-4 sm:p-5">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <EmployeeTimeline logs={todayLogs} canEdit />
            )}
          </div>
        </div>
      </div>

      {showForm && <WorkLogForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
