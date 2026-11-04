import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useEmployees } from '../../hooks/useEmployees';
import { useWorkLogs, useLastLogDates } from '../../hooks/useWorkLogs';
import { EmployeeTable } from '../../components/EmployeeTable';
import { CreateEmployeeModal } from '../../components/CreateEmployeeModal';
import { getCurrentWeekRange, pluralHr, todayISO } from '../../lib/utils';
import { isStaff } from '../../lib/period';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function AdminEmployeesPage() {
  const [showCreate, setShowCreate] = useState(false);
  useDocumentTitle('Zaposlenici');
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const today = todayISO();

  const { data: employees = [], isLoading: empLoading } = useEmployees();
  const { data: weekLogs = [], isLoading: logsLoading } = useWorkLogs({ startDate: weekStart, endDate: weekEnd });
  const { data: lastLogDates = {}, isLoading: lastLoading } = useLastLogDates(employees.map(e => e.id));

  const staff = employees.filter(isStaff);
  const activeToday = new Set(weekLogs.filter(l => l.log_date === today && isStaff(l.profiles)).map(l => l.employee_id)).size;

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Zaposlenici</h1>
          {!empLoading && (
            <p className="text-sm text-slate-600 mt-0.5">
              {staff.length} {pluralHr(staff.length, 'zaposlenik', 'zaposlenika', 'zaposlenika')}
              {' · '}
              {activeToday} {pluralHr(activeToday, 'aktivan', 'aktivna', 'aktivnih')} danas
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 min-h-11 sm:min-h-0 px-3 sm:px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors shrink-0"
        >
          <PlusCircle size={15} aria-hidden="true" />
          Novi zaposlenik
        </button>
      </div>

      <EmployeeTable
        employees={employees}
        logs={weekLogs}
        lastLogDates={lastLogDates}
        isLoading={empLoading || logsLoading || (employees.length > 0 && lastLoading)}
      />

      {showCreate && <CreateEmployeeModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
