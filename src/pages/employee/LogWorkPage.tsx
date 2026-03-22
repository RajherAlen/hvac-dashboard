import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { WorkLogForm } from '../../components/WorkLogForm';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { useAuth } from '../../hooks/useAuth';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { todayISO } from '../../lib/utils';
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Unos rada</h1>
          <p className="text-sm text-slate-500 mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: hr })}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <PlusCircle size={15} />
          Dodaj unos
        </button>
      </div>

      {/* Today's entries */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Današnji unosi</h2>
          <p className="text-xs text-slate-400 mt-0.5">Možete dodati više zadataka po danu</p>
        </div>
        <div className="p-5">
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

      {showForm && <WorkLogForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
