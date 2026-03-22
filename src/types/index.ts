import type { Tables } from './database';

export type Profile = Tables<'profiles'>;
export type WorkLog = Tables<'work_logs'>;
export type Role = 'admin' | 'employee';

export interface WorkLogWithEmployee extends WorkLog {
  profiles?: Partial<Profile> | null;
}

export interface WorkLogFilters {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  locationSearch?: string;
}

export interface DailyHours {
  date: string;        // 'YYYY-MM-DD'
  label: string;       // 'Mon', 'Tue', etc.
  totalHours: number;
  [employeeId: string]: string | number; // dynamic per-employee keys for stacked chart
}

export interface WorkLogFormValues {
  log_date: string;
  task_description: string;
  location: string;
  hours_worked: number;
  notes: string;
}
