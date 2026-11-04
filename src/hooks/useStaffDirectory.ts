import { useMemo } from 'react';
import { useEmployees, useEmployeeAuthStatus } from './useEmployees';
import { useLastLogDates } from './useWorkLogs';
import { employeeStatus, type EmployeeStatus } from '../lib/employeeStatus';
import { isStaff } from '../lib/period';
import type { Profile } from '../types';

export interface DirectoryEntry {
  emp: Profile;
  status: EmployeeStatus;
  isAdmin: boolean;
  lastLogDate: string | null;
}

/** Svi korisnici sa statusom (pozvan / aktivan / neaktivan) i datumom zadnjeg unosa. */
export function useStaffDirectory() {
  const employeesQ = useEmployees();
  const authQ = useEmployeeAuthStatus();
  const employees = employeesQ.data;
  const lastQ = useLastLogDates((employees ?? []).map(e => e.id));

  const entries = useMemo<DirectoryEntry[]>(() => (employees ?? []).map(emp => {
    const lastLogDate = lastQ.data?.[emp.id] ?? null;
    return {
      emp,
      isAdmin: !isStaff(emp),
      lastLogDate,
      status: employeeStatus(emp, authQ.data ?? null, lastLogDate),
    };
  }), [employees, authQ.data, lastQ.data]);

  /** Zaposlenici koji evidentiraju rad: bez admina, pozvanih i neaktivnih. */
  const activeStaff = useMemo(
    () => entries.filter(e => !e.isAdmin && e.status === 'aktivan').map(e => e.emp),
    [entries],
  );

  return {
    entries,
    activeStaff,
    /** true ako status dolazi iz baze, false ako je procjena (migracija nije pokrenuta) */
    hasAuthStatus: authQ.data != null,
    isLoading: employeesQ.isLoading || authQ.isLoading || ((employees?.length ?? 0) > 0 && lastQ.isLoading),
  };
}
