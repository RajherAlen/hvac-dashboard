import { startOfISOWeek, parseISO, isWeekend, format, addDays } from 'date-fns';
import { formatWeekBucket } from './format-date';
import { holidayName, type WorkCalendar } from './workCalendar';
import type { WorkLog } from '../types';

export interface Bucket {
  key: string;
  label: string;
  days: string[];
}

/**
 * Radni dan: pon–pet koji nije državni praznik.
 * S kalendarom (`cal`) uzimaju se u obzir i neradni dani tvrtke.
 */
export function isWorkday(day: string, cal?: WorkCalendar): boolean {
  if (cal) return cal.isWorkday(day);
  return !isWeekend(parseISO(day)) && !holidayName(day);
}

/**
 * Broj radnih dana u periodu koji su već počeli – uključujući danas.
 * Koristi se kao nazivnik za "prosj. sati / dan". Uz `employeeId` se izostavljaju i njegove odobrene odsutnosti.
 */
export function elapsedWorkdays(days: string[], today: string, cal?: WorkCalendar, employeeId?: string): number {
  return days.filter(d => d <= today && expectedDay(d, cal, employeeId)).length;
}

/** Broj radnih dana strogo između dva datuma (bez rubnih dana). */
export function workdaysBetween(fromExclusive: string, toExclusive: string, cal?: WorkCalendar, employeeId?: string): number {
  let n = 0;
  for (let d = addDays(parseISO(fromExclusive), 1); format(d, 'yyyy-MM-dd') < toExclusive; d = addDays(d, 1)) {
    if (expectedDay(format(d, 'yyyy-MM-dd'), cal, employeeId)) n++;
  }
  return n;
}

function expectedDay(day: string, cal?: WorkCalendar, employeeId?: string): boolean {
  if (cal && employeeId) return cal.expected(employeeId, day, 1) > 0;
  return isWorkday(day, cal);
}

/** Grupira dane u ISO tjedne (pon–ned). Rubni tjedni su odrezani granicama perioda. */
export function isoWeekBuckets(days: string[]): Bucket[] {
  const map = new Map<string, string[]>();
  for (const d of days) {
    const key = format(startOfISOWeek(parseISO(d)), 'yyyy-MM-dd');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return [...map.entries()].map(([key, ds]) => ({
    key,
    label: formatWeekBucket(ds[0], ds[ds.length - 1]),
    days: ds,
  }));
}

export function sumHours(logs: Pick<WorkLog, 'hours_worked'>[]): number {
  return logs.reduce((s, l) => s + Number(l.hours_worked), 0);
}

/** Admini ne evidentiraju rad – isključuju se iz KPI-ja, grafova i legendi. */
export function isStaff(p: { role?: string | null } | null | undefined): boolean {
  return p?.role !== 'admin';
}
