import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Jedinstveni format sati u cijeloj aplikaciji: "33 h", "4 h 45 min", "30 min".
 * (KPI, tablice, tooltipovi, povijest, PDF)
 */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} h`;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

/**
 * Parsira unos sati: "8", "7,5", "7.5", "7:30", "7 h 30 min". Vraća null ako nije prepoznato.
 * Rezultat je zaokružen na 2 decimale (stupac je NUMERIC(5,2)).
 */
export function parseHours(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return round2(Number(m[1]) + Number(m[2]) / 60);
  m = s.match(/^(\d{1,2})\s*h(?:\s*(\d{1,2})\s*(?:min|m))?$/);
  if (m) return round2(Number(m[1]) + Number(m[2] ?? 0) / 60);
  m = s.match(/^\d{1,2}(?:[.,]\d{1,2})?$/);
  if (m) return round2(Number(s.replace(',', '.')));
  return null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Prikaz broja sati u polju za unos: 7,5 */
export function hoursToInput(h: number): string {
  return String(h).replace('.', ',');
}

/**
 * Hrvatska množina: 1 unos, 2 unosa, 5 unosa, 21 unos, 12 unosa…
 * `few` vrijedi za 2–4 (osim 12–14), `many` za ostalo.
 */
export function pluralHr(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const end = endOfWeek(now, { weekStartsOn: 1 });
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

export function getLast7Days(): string[] {
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(format(d, 'yyyy-MM-dd'));
  }
  return result;
}

export function getWeekDays(weekStart: Date): string[] {
  const start = startOfWeek(weekStart, { weekStartsOn: 1 });
  const end = endOfWeek(weekStart, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  return {
    start: format(startOfMonth(now), 'yyyy-MM-dd'),
    end: format(endOfMonth(now), 'yyyy-MM-dd'),
  };
}
