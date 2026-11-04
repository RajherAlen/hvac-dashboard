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
  /** Objekt klijenta (null = "Ured / ostalo"; undefined = modul klijenata nije aktivan) */
  site_id?: string | null;
  /** Servisirani uređaji (neobavezno) */
  device_ids?: string[];
  /** Redovni servis (pomiče rok sljedećeg servisa) ili popravak */
  is_service?: boolean;
}

export type Client = Tables<'clients'>;
export type Site = Tables<'sites'>;
export type Device = Tables<'devices'>;
export type { DeviceKind, ServiceCaseStatus } from './database';
export type ServiceCase = Tables<'service_cases'>;

export interface SiteWithDevices extends Site {
  devices: Device[];
}
export interface ClientWithSites extends Client {
  sites: SiteWithDevices[];
}
