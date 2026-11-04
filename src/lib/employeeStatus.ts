import type { Profile } from '../types';

export type EmployeeStatus = 'aktivan' | 'pozvan' | 'neaktivan';

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  aktivan: 'Aktivan',
  pozvan: 'Pozvan',
  neaktivan: 'Neaktivan',
};

/**
 * neaktivan – admin ga je deaktivirao (povijest sati ostaje)
 * pozvan    – račun postoji, ali se još nikad nije prijavio
 * aktivan   – ostalo
 *
 * Ako migracija s `employee_auth_status()` još nije pokrenuta (authStatus = null),
 * "pozvan" se procjenjuje kao "nema nijednog unosa".
 */
export function employeeStatus(
  emp: Pick<Profile, 'id' | 'deactivated_at'>,
  authStatus: Record<string, { lastSignInAt: string | null }> | null,
  lastLogDate: string | null | undefined,
): EmployeeStatus {
  if (emp.deactivated_at) return 'neaktivan';
  if (authStatus) {
    const s = authStatus[emp.id];
    if (s && !s.lastSignInAt) return 'pozvan';
    return 'aktivan';
  }
  return lastLogDate ? 'aktivan' : 'pozvan';
}
