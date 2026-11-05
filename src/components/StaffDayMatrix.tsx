import { Link } from 'react-router-dom';
import type { Absence, Profile, WorkLog } from '../types';
import { formatShort, formatWeekdayShort, formatDayLong, capitalize } from '../lib/format-date';
import { ABSENCE_CODE, ABSENCE_LABEL, BASE_CALENDAR, type WorkCalendar } from '../lib/workCalendar';
import { cn, formatHours } from '../lib/utils';
import { ABSENCE_TONE, HOLIDAY_CELL } from './absences/absenceStyle';
import { AbsenceCellPopover } from './absences/AbsenceCellPopover';

interface Props {
  logs: Pick<WorkLog, 'employee_id' | 'log_date' | 'hours_worked'>[];
  /** Redovi: zaposlenici (redoslijed se zadržava) */
  staff: Profile[];
  days: string[];
  today: string;
  colors: Record<string, string>;
  normPerDay?: number;
  employeeHref?: (id: string) => string;
  /** Klik na ćeliju s unosima */
  onCellClick?: (employeeId: string, day: string) => void;
  /** Planirani sati iz rasporeda, ključ "zaposlenik|dan". Kad postoji, cilj ćelije je plan umjesto norme. */
  plan?: Map<string, number>;
  /** Radni kalendar (praznici, neradni dani, odsutnosti). Bez njega se koriste samo državni praznici. */
  cal?: WorkCalendar;
  /** Admin: prazne ćelije i odsutnosti otvaraju izbornik odsutnosti; ovo otvara dijalog za više dana */
  onAbsenceMoreDays?: (employeeId: string, day: string) => void;
}

type CellKind = 'full' | 'part' | 'miss' | 'today' | 'future' | 'weekend' | 'holiday' | 'absence' | 'pending';

const CELL: Record<Exclude<CellKind, 'absence' | 'pending'>, string> = {
  full: 'bg-emerald-50 text-emerald-800',
  part: 'bg-amber-50 text-amber-900',
  miss: 'bg-red-50 text-red-800',
  today: 'text-slate-700 bg-[repeating-linear-gradient(135deg,#eef2f7_0_5px,#f8fafc_5px_10px)]',
  future: 'bg-slate-50 text-slate-400 font-normal',
  weekend: 'bg-slate-50/60 text-slate-400 font-normal',
  holiday: HOLIDAY_CELL,
};

/** 7 h / 7,5 h; u gustom (mjesečnom) prikazu bez jedinice */
function compact(v: number, unit: boolean): string {
  const n = String(Math.round(v * 10) / 10).replace('.', ',');
  return unit ? `${n} h` : n;
}

/**
 * Matrica Zaposlenik × Dan: tko je koji dan koliko upisao, obojeno prema normi.
 * Odmah se vidi "rupa" (npr. neupisan utorak) koja se iz grafa ne može pročitati.
 * Praznici i odsutnosti nisu rupa: imaju vlastitu oznaku (šifra + šrafura) i ne ulaze u normu.
 */
export function StaffDayMatrix({ logs, staff, days, today, colors, normPerDay = 8, employeeHref, onCellClick, plan, cal = BASE_CALENDAR, onAbsenceMoreDays }: Props) {
  const dense = days.length > 10;
  const hours = new Map<string, number>();
  for (const l of logs) {
    const k = `${l.employee_id}|${l.log_date}`;
    hours.set(k, (hours.get(k) ?? 0) + Number(l.hours_worked));
  }
  const get = (emp: string, day: string) => hours.get(`${emp}|${day}`) ?? 0;
  const planned = (emp: string, day: string) => plan?.get(`${emp}|${day}`) ?? 0;
  const hasPlan = !!plan && plan.size > 0;
  /** Cilj ćelije: plan iz rasporeda, a bez plana norma radnog dana. Odobrena odsutnost = 0. */
  const target = (emp: string, day: string) => {
    if (cal.absenceOf(emp, day)) return 0;
    const p = planned(emp, day);
    if (p > 0) return p;
    return hasPlan ? 0 : cal.isWorkday(day) ? normPerDay : 0;
  };

  const kindOf = (emp: string, v: number, day: string, goal: number): CellKind => {
    if (v === 0) {
      if (cal.absenceOf(emp, day)) return 'absence';
      if (cal.pendingOf(emp, day)) return 'pending';
      if (cal.dayInfo(day).type === 'holiday' && goal === 0) return 'holiday';
    }
    if (day > today) return 'future';
    if (day === today) return goal > 0 && v >= goal ? 'full' : 'today';
    if (goal === 0) return v === 0 ? 'weekend' : 'full';
    return v >= goal ? 'full' : v > 0 ? 'part' : 'miss';
  };

  const absenceText = (a: Absence, pending: boolean) => `${ABSENCE_LABEL[a.kind].toLowerCase()}${pending ? ' (zahtjev na čekanju)' : ' (odobreno)'}`;

  const cellLabel = (name: string, emp: string, day: string, v: number, kind: CellKind) => {
    const d = capitalize(formatDayLong(day));
    const abs = cal.absenceOf(emp, day);
    if (kind === 'absence' && abs) return `${name}, ${d}: ${absenceText(abs, false)}`;
    const pend = cal.pendingOf(emp, day);
    if (kind === 'pending' && pend) return `${name}, ${d}: ${absenceText(pend, true)}`;
    if (kind === 'holiday') return `${name}, ${d}: ${cal.dayInfo(day).label ?? 'praznik'}`;
    if (kind === 'future') return `${name}, ${d}: još nije prošlo`;
    if (kind === 'today' && v === 0) return `${name}, ${d}: danas, još nema unosa`;
    if (kind === 'weekend' && v === 0) return `${name}, ${d}: ${cal.isWorkday(day) ? 'ništa planirano' : 'vikend'}`;
    if (kind === 'miss') return `${name}, ${d}: nema unosa`;
    return `${name}, ${d}: ${formatHours(v)}${abs ? `, upisano tijekom odsutnosti (${ABSENCE_LABEL[abs.kind].toLowerCase()})` : ''}`;
  };

  const colTotals = days.map(d => staff.reduce((s, e) => s + get(e.id, d), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const holidayCols = days.filter(d => cal.dayInfo(d).type === 'holiday');
  const anyAbsence = staff.some(e => days.some(d => cal.absenceOf(e.id, d) || cal.pendingOf(e.id, d)));

  return (
    <div>
      <div className="relative overflow-x-auto -mx-1 px-1">
        <table className={cn('w-full border-separate', dense ? 'border-spacing-[2px]' : 'border-spacing-1')}>
          <caption className="sr-only">Sati po zaposleniku i danu. {hasPlan ? 'Ćelija pokazuje upisano / planirano.' : `Norma ${normPerDay} h po radnom danu.`} Praznici i odsutnosti se ne računaju u normu.</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white text-left text-xs font-medium text-slate-600 pr-2">Zaposlenik</th>
              {days.map(d => {
                const isToday = d === today;
                const info = cal.dayInfo(d);
                const holiday = info.type === 'holiday';
                return (
                  <th key={d} scope="col" title={holiday ? info.label ?? undefined : undefined}
                    className={cn('text-center font-medium px-0.5', dense ? 'text-[11px] min-w-8' : 'text-xs min-w-12',
                      isToday ? 'text-slate-900 font-bold' : holiday ? 'text-slate-400' : cal.isWorkday(d) ? 'text-slate-600' : 'text-slate-500')}>
                    {dense ? (
                      <span title={capitalize(formatDayLong(d)) + (holiday ? ` · ${info.label}` : '')}>
                        {Number(d.slice(8))}.
                        {holiday && <span className="block mx-auto mt-0.5 w-1 h-1 rounded-full bg-slate-400" aria-hidden="true" />}
                      </span>
                    ) : (
                      <>
                        {formatWeekdayShort(d)}
                        <span className={cn('block text-[11px]', isToday ? 'text-slate-700' : 'text-slate-500')}>{formatShort(d)}</span>
                      </>
                    )}
                    {holiday && <span className="sr-only"> ({info.label})</span>}
                    {isToday && <span className="sr-only"> (danas)</span>}
                  </th>
                );
              })}
              <th scope="col" className="text-right text-xs font-medium text-slate-600 pl-2">Ukupno</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(emp => {
              const sum = days.reduce((s, d) => s + get(emp.id, d), 0);
              // Postotak cilja (plan ili norma) za dane koji su završili; danas se ne računa dok traje
              const pastDays = days.filter(d => d < today);
              const goalSum = pastDays.reduce((s, d) => s + target(emp.id, d), 0);
              const doneSum = pastDays.filter(d => target(emp.id, d) > 0).reduce((s, d) => s + get(emp.id, d), 0);
              const pct = goalSum > 0 ? Math.round((doneSum / goalSum) * 100) : null;
              return (
                <tr key={emp.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-white text-left text-sm font-medium text-slate-800 pr-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
                      {employeeHref ? (
                        <Link to={employeeHref(emp.id)} className="hover:text-blue-700 hover:underline">{emp.full_name}</Link>
                      ) : emp.full_name}
                    </span>
                  </th>
                  {days.map(d => {
                    const v = get(emp.id, d);
                    const p = planned(emp.id, d);
                    const kind = kindOf(emp.id, v, d, target(emp.id, d));
                    const abs = cal.absenceOf(emp.id, d);
                    const pend = kind === 'pending' ? cal.pendingOf(emp.id, d) : null;

                    let text: string;
                    let tone: string;
                    if (kind === 'absence' && abs) {
                      text = dense ? ABSENCE_CODE[abs.kind] : ABSENCE_LABEL[abs.kind].split(' ')[0];
                      tone = ABSENCE_TONE[abs.kind].approved;
                    } else if (kind === 'pending' && pend) {
                      text = `${ABSENCE_CODE[pend.kind]}?`;
                      tone = ABSENCE_TONE[pend.kind].pending;
                    } else {
                      text = kind === 'holiday' ? (dense ? '' : 'praznik')
                        : kind === 'future' || (kind === 'weekend' && v === 0) ? '·'
                        : kind === 'today' && v === 0 ? '—' : compact(v, !dense && p === 0);
                      if (p > 0 && kind !== 'holiday') text = kind === 'future' ? compact(p, false) : `${compact(v, false)}/${compact(p, false)}`;
                      tone = CELL[kind as keyof typeof CELL];
                    }

                    const label = cellLabel(emp.full_name, emp.id, d, v, kind) + (p > 0 ? `, plan ${formatHours(p)}` : '');
                    const cls = cn('relative block w-full rounded-md text-center font-semibold tabular-nums', dense ? 'py-1.5 text-[11px]' : 'py-2 text-[13px]', tone);
                    // Upisani sati tijekom odsutnosti: kutić u boji odsutnosti
                    const corner = v > 0 && abs && (
                      <span className={cn('absolute top-0 right-0 w-1.5 h-1.5 rounded-bl-sm rounded-tr-md', ABSENCE_TONE[abs.kind].dot)} aria-hidden="true" />
                    );

                    const absenceMenu = !!onAbsenceMoreDays && v === 0
                      && (kind === 'absence' || kind === 'pending' || kind === 'miss' || kind === 'today' || (kind === 'future' && cal.isWorkday(d)));

                    return (
                      <td key={d} className="p-0">
                        {v > 0 && onCellClick ? (
                          <button type="button" onClick={() => onCellClick(emp.id, d)} aria-label={`${label}. Prikaži unose`}
                            className={cn(cls, 'hover:ring-2 hover:ring-slate-300')}>
                            {text}{corner}
                          </button>
                        ) : absenceMenu ? (
                          <AbsenceCellPopover employeeId={emp.id} employeeName={emp.full_name ?? ''} day={d}
                            absence={abs} pending={pend ?? cal.pendingOf(emp.id, d)} onMoreDays={onAbsenceMoreDays!}>
                            <button type="button" aria-label={`${label}. ${kind === 'absence' || kind === 'pending' ? 'Prikaži odsutnost' : 'Označi odsutnost'}`}
                              aria-haspopup="dialog"
                              className={cn(cls, 'hover:ring-2 hover:ring-slate-300 data-[state=open]:ring-2 data-[state=open]:ring-blue-500')}>
                              {text}
                            </button>
                          </AbsenceCellPopover>
                        ) : (
                          <span className={cls} aria-label={label} role="img">{text}{corner}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right pl-2 whitespace-nowrap">
                    <span className="block text-sm font-bold text-slate-900 tabular-nums">{compact(sum, true)}</span>
                    {pct !== null && (
                      <span className={cn('block text-[11px] font-medium tabular-nums', pct < 80 ? 'text-amber-700' : 'text-emerald-700')}>
                        {pct} %<span className="sr-only"> norme</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-white text-left text-xs font-medium text-slate-600 pt-2 border-t border-slate-200">Ukupno</th>
              {colTotals.map((t, i) => (
                <td key={days[i]} className={cn('text-center tabular-nums text-slate-600 pt-2 border-t border-slate-200', dense ? 'text-[11px]' : 'text-xs')}>
                  {days[i] <= today && t > 0 ? compact(t, !dense) : ''}
                </td>
              ))}
              <td className="text-right text-sm font-bold text-slate-900 tabular-nums pt-2 pl-2 border-t border-slate-200">{compact(grand, true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-600" aria-label="Legenda boja">
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200" aria-hidden="true" />{hasPlan ? 'plan ostvaren' : `${normPerDay} h i više`}</li>
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200" aria-hidden="true" />djelomično</li>
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200" aria-hidden="true" />nema unosa (radni dan)</li>
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-200 bg-[repeating-linear-gradient(135deg,#eef2f7_0_3px,#f8fafc_3px_6px)]" aria-hidden="true" />danas</li>
        {(anyAbsence || cal.absencesEnabled) && (
          <li className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded-sm border', ABSENCE_TONE.godisnji.swatch)} aria-hidden="true" />GO godišnji
            <span className={cn('ml-1.5 w-3 h-3 rounded-sm border', ABSENCE_TONE.bolovanje.swatch)} aria-hidden="true" />BO bolovanje
            <span className={cn('ml-1.5 w-3 h-3 rounded-sm border', ABSENCE_TONE.slobodan.swatch)} aria-hidden="true" />SD slobodan
          </li>
        )}
        {anyAbsence && (
          <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-dashed border-sky-400" aria-hidden="true" />zahtjev na čekanju</li>
        )}
        {holidayCols.length > 0 && (
          <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" aria-hidden="true" />
            praznik ({holidayCols.map(d => `${formatShort(d)} ${cal.dayInfo(d).label}`).join(', ')})
          </li>
        )}
      </ul>
    </div>
  );
}
