import { startOfISOWeek, parseISO, isWeekend, format } from 'date-fns';
import { formatWeekBucket } from './format-date';
import type { WorkLog } from '../types';

export interface Bucket {
  key: string;
  label: string;
  days: string[];
}

export function isWorkday(day: string): boolean {
  return !isWeekend(parseISO(day));
}

/**
 * Broj radnih dana (pon–pet) u periodu koji su već počeli – uključujući danas.
 * Koristi se kao nazivnik za "prosj. sati / dan".
 */
export function elapsedWorkdays(days: string[], today: string): number {
  return days.filter(d => d <= today && isWorkday(d)).length;
}

/** Broj radnih dana strogo između dva datuma (bez rubnih dana). */
export function workdaysBetween(fromExclusive: string, toExclusive: string): number {
  let n = 0;
  const d = parseISO(fromExclusive);
  const end = parseISO(toExclusive);
  d.setDate(d.getDate() + 1);
  while (d < end) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
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
