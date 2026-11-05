/**
 * Jedini izvor formatiranja datuma u aplikaciji (hrvatski standard).
 *
 *   formatDay        → 4. studenoga 2026.
 *   formatDayLong    → srijeda, 4. studenoga 2026.
 *   formatShort      → 4. 11.
 *   formatNumeric    → 4. 11. 2026.
 *   formatWeekday    → sri, 4. 11.
 *   formatMonth      → studeni 2026.
 *   formatRange      → 2. – 8. studenoga 2026.
 *   formatWeekBucket → T45 · 2.–8. 11.
 *   formatRelative   → danas / jučer / prije 3 dana / 12. 10. 2026.
 *   formatDateTime   → 4. 11. 2026. u 14:05
 *
 * Nazivi mjeseci i dana su ručno definirani (umjesto Intl/date-fns) kako bi
 * izlaz bio identičan u svim preglednicima: date-fns daje "studenog", a Intl
 * ovisi o ICU verziji preglednika.
 */
import { parseISO, getISOWeek, differenceInCalendarDays, format } from 'date-fns';

export type DateInput = string | Date;

/** Genitiv – "4. studenoga" */
const MONTHS_GEN = [
  'siječnja', 'veljače', 'ožujka', 'travnja', 'svibnja', 'lipnja',
  'srpnja', 'kolovoza', 'rujna', 'listopada', 'studenoga', 'prosinca',
];
/** Nominativ – "studeni 2026." */
const MONTHS_NOM = [
  'siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj',
  'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac',
];
const WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];
const WEEKDAYS_SHORT = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];

export function toDate(d: DateInput): Date {
  return typeof d === 'string' ? parseISO(d) : d;
}

/** 'yyyy-MM-dd' u lokalnoj vremenskoj zoni. */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Prvo slovo veliko – za početak rečenice ili naslova. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 4. studenoga 2026. */
export function formatDay(input: DateInput): string {
  const d = toDate(input);
  return `${d.getDate()}. ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}.`;
}

/** srijeda, 4. studenoga 2026. */
export function formatDayLong(input: DateInput): string {
  const d = toDate(input);
  return `${WEEKDAYS[d.getDay()]}, ${formatDay(d)}`;
}

/** 4. 11. */
export function formatShort(input: DateInput): string {
  const d = toDate(input);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** 4. 11. 2026. */
export function formatNumeric(input: DateInput): string {
  const d = toDate(input);
  return `${formatShort(d)} ${d.getFullYear()}.`;
}

/** sri, 4. 11. */
export function formatWeekday(input: DateInput): string {
  const d = toDate(input);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${formatShort(d)}`;
}

/** sri */
export function formatWeekdayShort(input: DateInput): string {
  return WEEKDAYS_SHORT[toDate(input).getDay()];
}

/** studeni 2026. */
export function formatMonth(input: DateInput): string {
  const d = toDate(input);
  return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}.`;
}

/**
 * 2. – 8. studenoga 2026.
 * 27. listopada – 2. studenoga 2026.
 * 29. prosinca 2025. – 4. siječnja 2026.
 */
export function formatRange(startInput: DateInput, endInput: DateInput): string {
  const a = toDate(startInput);
  const b = toDate(endInput);
  if (toISODate(a) === toISODate(b)) return formatDay(a);
  if (a.getFullYear() !== b.getFullYear()) return `${formatDay(a)} – ${formatDay(b)}`;
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()}. ${MONTHS_GEN[a.getMonth()]} – ${formatDay(b)}`;
  }
  return `${a.getDate()}. – ${formatDay(b)}`;
}

/** 3. 11. · 3.–7. 11. · 28. 10.–3. 11. */
export function formatShortRange(startInput: DateInput, endInput: DateInput): string {
  const a = toDate(startInput);
  const b = toDate(endInput);
  if (toISODate(a) === toISODate(b)) return formatShort(a);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()}.–${formatShort(b)}`
    : `${formatShort(a)}–${formatShort(b)}`;
}

/** T45 · 2.–8. 11.  (ISO tjedan, pon–ned; raspon može biti odrezan rubom perioda) */
export function formatWeekBucket(startInput: DateInput, endInput: DateInput): string {
  const a = toDate(startInput);
  const b = toDate(endInput);
  const week = `T${getISOWeek(a)}`;
  if (toISODate(a) === toISODate(b)) return `${week} · ${formatShort(a)}`;
  const range = a.getMonth() === b.getMonth()
    ? `${a.getDate()}.–${formatShort(b)}`
    : `${formatShort(a)}–${formatShort(b)}`;
  return `${week} · ${range}`;
}

/** danas / jučer / prije 3 dana / 12. 10. 2026. (nakon 13 dana puni datum) */
export function formatRelative(input: DateInput, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(now, toDate(input));
  if (diff === 0) return 'danas';
  if (diff === 1) return 'jučer';
  if (diff > 1 && diff < 14) return `prije ${diff} dana`;
  return formatNumeric(input);
}

/** 4. 11. 2026. u 14:05 */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  return `${formatNumeric(d)} u ${format(d, 'HH:mm')}`;
}
