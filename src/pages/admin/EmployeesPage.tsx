import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useEmployees } from '../../hooks/useEmployees';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { EmployeeTable } from '../../components/EmployeeTable';
import { CreateEmployeeModal } from '../../components/CreateEmployeeModal';
import { getCurrentWeekRange } from '../../lib/utils';

export function AdminEmployeesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();

  const { data: employees = [], isLoading: empLoading } = useEmployees();
  const { data: weekLogs = [], isLoading: logsLoading } = useWorkLogs({
    startDate: weekStart,
    endDate: weekEnd,
  });

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Zaposlenici</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {employees.length} zaposlenik{employees.length === 1 ? '' : 'a'} — kliknite red za detalje
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shrink-0"
        >
          <PlusCircle size={15} />
          <span className="hidden sm:inline">Novi zaposlenik</span>
          <span className="sm:hidden">Novi</span>
        </button>
      </div>

      <EmployeeTable
        employees={employees}
        logs={weekLogs}
        isLoading={empLoading || logsLoading}
      />

      {showCreate && <CreateEmployeeModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
