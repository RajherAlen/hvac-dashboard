import { useEmployees } from '../../hooks/useEmployees';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { EmployeeTable } from '../../components/EmployeeTable';
import { getCurrentWeekRange } from '../../lib/utils';

export function AdminEmployeesPage() {
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();

  const { data: employees = [], isLoading: empLoading } = useEmployees();
  const { data: weekLogs = [], isLoading: logsLoading } = useWorkLogs({
    startDate: weekStart,
    endDate: weekEnd,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Zaposlenici</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {employees.length} zaposlenik{employees.length === 1 ? '' : employees.length >= 2 && employees.length <= 4 ? 'a' : 'a'} — kliknite red za detalje
        </p>
      </div>

      <EmployeeTable
        employees={employees}
        logs={weekLogs}
        isLoading={empLoading || logsLoading}
      />
    </div>
  );
}
