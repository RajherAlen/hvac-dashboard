import { addDays, format, isWeekend, parseISO } from 'date-fns';
import type { Absence, AbsenceKind, CalendarOverride } from '../types';

// ── Državni praznici RH (Zakon o blagdanima, spomendanima i neradnim danima, od 2020.) ──

const FIXED_HOLIDAYS: [string, string][] = [
  ['01-01', 'Nova godina'],
  ['01-06', 'Sveta tri kralja'],
  ['05-01', 'Praznik rada'],
  ['05-30', 'Dan državnosti'],
  ['06-22', 'Dan antifašističke borbe'],
  ['08-05', 'Dan pobjede i domovinske zahvalnosti'],
  ['08-15', 'Velika Gospa'],
  ['11-01', 'Svi sveti'],
  ['11-18', 'Dan sjećanja na žrtve Domovinskog rata'],
  ['12-25', 'Božić'],
  ['12-26', 'Sveti Stjepan'],
];

/** Uskrs (gregorijanski kalendar, algoritam Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const holidayCache = new Map<number, Map<string, string>>();

/** Državni praznici za godinu: datum (yyyy-MM-dd) → naziv. */
export function croatianHolidays(year: number): Map<string, string> {
  const hit = holidayCache.get(year);
  if (hit) return hit;
  const out = new Map<string, string>();
  for (const [md, name] of FIXED_HOLIDAYS) out.set(`${year}-${md}`, name);
  const easter = easterSunday(year);
  out.set(format(easter, 'yyyy-MM-dd'), 'Uskrs');
  out.set(format(addDays(easter, 1), 'yyyy-MM-dd'), 'Uskrsni ponedjeljak');
  out.set(format(addDays(easter, 60), 'yyyy-MM-dd'), 'Tijelovo');
  holidayCache.set(year, out);
  return out;
}

/** Naziv državnog praznika ili null. */
export function holidayName(day: string): string | null {
  return croatianHolidays(Number(day.slice(0, 4))).get(day) ?? null;
}

// ── Kalendar tvrtke + odsutnosti ─────────────────────────────────────────────

export type DayType = 'workday' | 'weekend' | 'holiday';

export interface DayInfo {
  type: DayType;
  /** Naziv praznika ili neradnog dana */
  label: string | null;
  /** Neradni dan koji je tvrtka dodala (nije državni praznik) */
  company?: boolean;
}

export const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  godisnji: 'Godišnji',
  bolovanje: 'Bolovanje',
  slobodan: 'Slobodan dan',
};

/** Šifre kao na evidenciji radnog vremena */
export const ABSENCE_CODE: Record<AbsenceKind, string> = {
  godisnji: 'GO',
  bolovanje: 'BO',
  slobodan: 'SD',
};

export interface WorkCalendar {
  dayInfo(day: string): DayInfo;
  isWorkday(day: string): boolean;
  /** Odobrena odsutnost zaposlenika na taj dan */
  absenceOf(employeeId: string, day: string): Absence | null;
  /** Zahtjev na čekanju koji pokriva taj dan */
  pendingOf(employeeId: string, day: string): Absence | null;
  /** Očekivani sati: 0 za vikend, praznik i odobrenu odsutnost, inače norma */
  expected(employeeId: string, day: string, norm: number): number;
  /** Radni dani u rasponu (uključivo), bez obzira na odsutnosti */
  workdaysIn(start: string, end: string): string[];
  /** Praznici i neradni dani u rasponu (samo oni koji padaju na pon–pet) */
  holidaysIn(start: string, end: string): { day: string; label: string }[];
  /** true ako tablica odsutnosti postoji */
  absencesEnabled: boolean;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(start); format(d, 'yyyy-MM-dd') <= end; d = addDays(d, 1)) out.push(format(d, 'yyyy-MM-dd'));
  return out;
}

export function buildWorkCalendar({
  overrides = [],
  absences = [],
  absencesEnabled = true,
}: {
  overrides?: CalendarOverride[];
  absences?: Absence[];
  absencesEnabled?: boolean;
} = {}): WorkCalendar {
  const ov = new Map(overrides.map(o => [o.day, o]));
  const byEmp = new Map<string, Absence[]>();
  for (const a of absences) {
    if (a.status !== 'approved' && a.status !== 'pending') continue;
    const list = byEmp.get(a.employee_id) ?? [];
    list.push(a);
    byEmp.set(a.employee_id, list);
  }

  const dayInfo = (day: string): DayInfo => {
    const o = ov.get(day);
    const weekend = isWeekend(parseISO(day));
    if (o?.kind === 'neradni') return { type: weekend ? 'weekend' : 'holiday', label: o.label || 'Neradni dan', company: true };
    const name = holidayName(day);
    if (name && o?.kind !== 'radni') return { type: weekend ? 'weekend' : 'holiday', label: name };
    return { type: weekend ? 'weekend' : 'workday', label: name && weekend ? name : null };
  };
  const isWorkday = (day: string) => dayInfo(day).type === 'workday';
  const find = (emp: string, day: string, status: Absence['status']) =>
    byEmp.get(emp)?.find(a => a.status === status && a.start_date <= day && a.end_date >= day) ?? null;

  return {
    dayInfo,
    isWorkday,
    absenceOf: (emp, day) => find(emp, day, 'approved'),
    pendingOf: (emp, day) => find(emp, day, 'pending'),
    expected: (emp, day, norm) => (isWorkday(day) && !find(emp, day, 'approved') ? norm : 0),
    workdaysIn: (start, end) => eachDay(start, end).filter(isWorkday),
    holidaysIn: (start, end) => eachDay(start, end)
      .map(day => ({ day, info: dayInfo(day) }))
      .filter(x => x.info.type === 'holiday')
      .map(x => ({ day: x.day, label: x.info.label ?? '' })),
    absencesEnabled,
  };
}

/** Kalendar samo s državnim praznicima (bez podataka iz baze). */
export const BASE_CALENDAR = buildWorkCalendar({ absencesEnabled: false });
