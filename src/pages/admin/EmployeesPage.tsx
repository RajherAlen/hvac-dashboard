import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
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

  const directory = useStaffDirectory();
  const { data: weekLogs = [], isLoading: logsLoading } = useWorkLogs({ startDate: weekStart, endDate: weekEnd });

  const staff = directory.entries.filter(e => !e.isAdmin);
  const nActive = staff.filter(e => e.status === 'aktivan').length;
  const nInvited = staff.filter(e => e.status === 'pozvan').length;
  const activeToday = new Set(weekLogs.filter(l => l.log_date === today && isStaff(l.profiles)).map(l => l.employee_id)).size;

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Zaposlenici</h1>
          {!directory.isLoading && (
            <p className="text-sm text-slate-600 mt-0.5">
              {nActive} {pluralHr(nActive, 'aktivan zaposlenik', 'aktivna zaposlenika', 'aktivnih zaposlenika')}
              {nInvited > 0 && <> · {nInvited} {pluralHr(nInvited, 'pozvan', 'pozvana', 'pozvanih')}</>}
              {' · '}
              {activeToday} danas {pluralHr(activeToday, 'upisao', 'upisala', 'upisalo')} rad
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

      <EmployeeTable entries={directory.entries} logs={weekLogs} isLoading={directory.isLoading || logsLoading} />

      {showCreate && <CreateEmployeeModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
