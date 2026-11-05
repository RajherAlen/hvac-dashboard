import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePeriod } from '../../hooks/usePeriod';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { usePlan } from '../../hooks/useWorkOrders';
import {
  useAbsences, useCalendarOverrides, useDecideAbsence, usePendingAbsences, useSetCalendarOverride, useWorkCalendar,
} from '../../hooks/useAbsences';
import { PeriodStepper } from '../../components/PeriodNav';
import { Dialog } from '../../components/ui/Dialog';
import { DatePicker } from '../../components/ui/DatePicker';
import { Field, FormActions, FormError, Spinner } from '../../components/ui/form';
import { inputClass } from '../../components/ui/styles';
import { AbsenceDialog } from '../../components/absences/AbsenceDialog';
import { AbsenceCellPopover } from '../../components/absences/AbsenceCellPopover';
import { AbsencesNotEnabled } from '../../components/absences/AbsencesNotEnabled';
import { ABSENCE_TONE, HOLIDAY_CELL } from '../../components/absences/absenceStyle';
import { ABSENCE_CODE, ABSENCE_LABEL, croatianHolidays, type WorkCalendar } from '../../lib/workCalendar';
import { employeeColorMap } from '../../lib/colors';
import { capitalize, formatDayLong, formatShort, formatShortRange, formatWeekdayShort } from '../../lib/format-date';
import { cn, pluralHr, todayISO } from '../../lib/utils';
import type { Absence, Profile } from '../../types';

export function AbsencesPage() {
  useDocumentTitle('Odsutnosti');
  const today = todayISO();
  const period = usePeriod('month', ['month'], { allowFuture: true });
  const { start, end, days, label } = period;
  const directory = useStaffDirectory();
  const staffAll = useMemo(() => directory.entries.filter(e => !e.isAdmin).map(e => e.emp), [directory.entries]);
  const colors = useMemo(() => employeeColorMap(staffAll), [staffAll]);
  const nameOf = useMemo(() => new Map(staffAll.map(e => [e.id, e.full_name ?? '—'])), [staffAll]);

  const pendingQ = usePendingAbsences();
  const monthQ = useAbsences({ from: start, to: end, statuses: ['approved', 'pending'] });
  const { cal } = useWorkCalendar(start, end);
  const [dialog, setDialog] = useState<{ employeeId?: string; day?: string } | null>(null);

  if (pendingQ.data === null || monthQ.data === null) return <AbsencesNotEnabled />;

  // Redovi kalendara: aktivni + svi koji u mjesecu imaju odsutnost
  const withAbsence = new Set((monthQ.data ?? []).map(a => a.employee_id));
  const activeIds = new Set(directory.activeStaff.map(e => e.id));
  const rows = staffAll.filter(e => activeIds.has(e.id) || withAbsence.has(e.id));

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Odsutnosti</h1>
          <p className="text-sm text-slate-600 mt-0.5">Godišnji, bolovanja i neradni dani ne računaju se kao propušteni unos ni u normu.</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodStepper period={period} />
          <button type="button" onClick={() => setDialog({})}
            className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap">
            <Plus size={16} aria-hidden="true" /> Upiši odsutnost
          </button>
        </div>
      </div>

      <PendingQueue pending={pendingQ.data ?? []} loading={pendingQ.isLoading} nameOf={nameOf} colors={colors} cal={cal} />

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 min-w-0" aria-labelledby="team-cal-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 id="team-cal-title" className="text-sm font-semibold text-slate-800">Tko je odsutan · {label}</h2>
          <span className="text-xs text-slate-600 hidden md:inline">Kliknite prazan dan za upis, traku za detalje</span>
        </div>
        {directory.isLoading || monthQ.isLoading ? (
          <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600 py-4">Nema zaposlenika koji evidentiraju rad.</p>
        ) : (
          <>
            <TeamCalendar rows={rows} days={days} today={today} cal={cal} absences={monthQ.data ?? []} colors={colors}
              onEmptyDay={(employeeId, day) => setDialog({ employeeId, day })}
              onMoreDays={(employeeId, day) => setDialog({ employeeId, day })} />
            <MonthList rows={rows} absences={monthQ.data ?? []} start={start} end={end} cal={cal} colors={colors} />
          </>
        )}
      </section>

      <HolidaysSection year={Number(start.slice(0, 4))} />

      {dialog && (
        <AbsenceDialog
          asAdmin
          employeeId={dialog.employeeId}
          employees={directory.activeStaff}
          initialStart={dialog.day}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ─── Zahtjevi na čekanju: jedino što čeka administratora ─────────────────────

function PendingQueue({ pending, loading, nameOf, colors, cal }: {
  pending: Absence[]; loading: boolean; nameOf: Map<string, string>; colors: Record<string, string>; cal: WorkCalendar;
}) {
  const decide = useDecideAbsence();
  const [rejecting, setRejecting] = useState<Absence | null>(null);
  const from = pending.reduce((m, a) => (a.start_date < m ? a.start_date : m), pending[0]?.start_date ?? '');
  const to = pending.reduce((m, a) => (a.end_date > m ? a.end_date : m), pending[0]?.end_date ?? '');
  const planQ = usePlan(from, to, pending.length > 0);
  const ordersFor = (a: Absence) => new Set((planQ.data ?? [])
    .filter(p => p.employee_id === a.employee_id && p.day >= a.start_date && p.day <= a.end_date)
    .map(p => p.work_order_id)).size;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="pending-title">
      <h2 id="pending-title" className="px-4 sm:px-5 pt-4 pb-3 text-sm font-semibold text-slate-800">
        Čeka odobrenje{pending.length > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-amber-100 text-amber-900 text-xs font-bold tabular-nums">{pending.length}</span>}
      </h2>
      {loading ? (
        <div className="px-4 sm:px-5 pb-4" aria-busy="true"><div className="h-14 bg-slate-100 rounded-lg animate-pulse" /></div>
      ) : pending.length === 0 ? (
        <p className="px-4 sm:px-5 pb-4 text-sm text-slate-600">Nema zahtjeva na čekanju.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {pending.map(a => {
            const wd = cal.workdaysIn(a.start_date, a.end_date).length;
            const orders = ordersFor(a);
            return (
              <li key={a.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[a.employee_id] }} aria-hidden="true" />
                    <span className="font-semibold text-slate-900">{nameOf.get(a.employee_id) ?? '—'}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold border', ABSENCE_TONE[a.kind].pill)}>{ABSENCE_LABEL[a.kind]}</span>
                    <span className="text-slate-800 tabular-nums">{formatShortRange(a.start_date, a.end_date)}</span>
                    <span className="text-slate-600">{wd} {pluralHr(wd, 'radni dan', 'radna dana', 'radnih dana')}</span>
                  </p>
                  {a.note && <p className="mt-1 ml-[18px] text-sm text-slate-700">„{a.note}”</p>}
                  {orders > 0 && (
                    <p className="mt-1 ml-[18px] flex items-center gap-1.5 text-xs text-amber-900">
                      <AlertTriangle size={13} aria-hidden="true" />
                      {orders} {pluralHr(orders, 'nalog', 'naloga', 'naloga')} u rasporedu u tom periodu ·
                      <Link to={`/raspored?date=${a.start_date}`} className="font-medium underline">Raspored</Link>
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setRejecting(a)} disabled={decide.isPending}
                    className="flex-1 sm:flex-none min-h-11 sm:min-h-9 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-60">
                    Odbij
                  </button>
                  <button type="button" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: a.id, approve: true }, {
                      onSuccess: () => toast.success('Zahtjev odobren', { description: `${nameOf.get(a.employee_id)}, ${ABSENCE_LABEL[a.kind].toLowerCase()} ${formatShortRange(a.start_date, a.end_date)}` }),
                      onError: e => toast.error(e.message),
                    })}
                    className="flex-1 sm:flex-none min-h-11 sm:min-h-9 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 inline-flex items-center justify-center gap-2">
                    {decide.isPending && decide.variables?.id === a.id && decide.variables.approve && <Spinner />}
                    Odobri
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rejecting && <RejectDialog absence={rejecting} name={nameOf.get(rejecting.employee_id) ?? ''} onClose={() => setRejecting(null)} />}
    </section>
  );
}

function RejectDialog({ absence, name, onClose }: { absence: Absence; name: string; onClose: () => void }) {
  const decide = useDecideAbsence();
  const [note, setNote] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    decide.mutate({ id: absence.id, approve: false, note }, {
      onSuccess: () => { toast('Zahtjev odbijen'); onClose(); },
    });
  };
  return (
    <Dialog onClose={onClose} title="Odbij zahtjev"
      description={`${name} · ${ABSENCE_LABEL[absence.kind]} ${formatShortRange(absence.start_date, absence.end_date)}`}>
      <form onSubmit={submit} className="px-5 sm:px-6 py-4 flex flex-col gap-4">
        <Field label="Razlog" optional hint="Zaposlenik će vidjeti razlog uz zahtjev.">
          {p => <textarea {...p} rows={3} value={note} onChange={e => setNote(e.target.value)} className={inputClass(false, 'resize-none')} placeholder="npr. Taj tjedan je montaža u Splitu" />}
        </Field>
        <FormError message={decide.error?.message} />
        <FormActions onCancel={onClose} submitLabel="Odbij zahtjev" pendingLabel="Spremanje…" isPending={decide.isPending} destructive />
      </form>
    </Dialog>
  );
}

// ─── Timski kalendar: trake preko dana (kontinuitet raspona je bitan) ────────

function TeamCalendar({ rows, days, today, cal, absences, colors, onEmptyDay, onMoreDays }: {
  rows: Profile[]; days: string[]; today: string; cal: WorkCalendar; absences: Absence[];
  colors: Record<string, string>;
  onEmptyDay: (employeeId: string, day: string) => void;
  onMoreDays: (employeeId: string, day: string) => void;
}) {
  const cols = `minmax(8rem,10rem) repeat(${days.length}, minmax(1.6rem,1fr))`;
  const first = days[0];
  const last = days[days.length - 1];
  const idx = (d: string) => days.indexOf(d);

  return (
    <div className="hidden md:block overflow-x-auto -mx-1 px-1">
      <div className="min-w-[48rem]" role="table" aria-label="Odsutnosti po zaposleniku i danu">
        {/* Zaglavlje */}
        <div className="grid gap-px" style={{ gridTemplateColumns: cols }} role="row">
          <span role="columnheader" className="text-xs font-medium text-slate-600 px-1 self-end">Zaposlenik</span>
          {days.map(d => {
            const info = cal.dayInfo(d);
            return (
              <span key={d} role="columnheader" title={capitalize(formatDayLong(d)) + (info.type === 'holiday' ? ` · ${info.label}` : '')}
                className={cn('text-center text-[11px] leading-tight pb-1', d === today ? 'font-bold text-slate-900' : info.type === 'workday' ? 'text-slate-600' : 'text-slate-400')}>
                <span className="block">{formatWeekdayShort(d).slice(0, 2)}</span>
                {Number(d.slice(8))}.
              </span>
            );
          })}
        </div>
        {rows.map(emp => {
          const mine = absences.filter(a => a.employee_id === emp.id);
          return (
            <div key={emp.id} className="grid gap-px border-t border-slate-100" style={{ gridTemplateColumns: cols, gridTemplateRows: '2.25rem' }} role="row">
              <span role="rowheader" className="flex items-center gap-2 px-1 text-sm font-medium text-slate-800 truncate" style={{ gridColumn: 1, gridRow: 1 }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
                <span className="truncate">{emp.full_name}</span>
              </span>
              {/* Pozadina dana: vikend i praznik prigušeni, radni dan klikom otvara upis */}
              {days.map((d, i) => {
                const info = cal.dayInfo(d);
                const work = info.type === 'workday';
                return work ? (
                  <button key={d} type="button" role="cell" onClick={() => onEmptyDay(emp.id, d)}
                    aria-label={`${emp.full_name}, ${formatDayLong(d)}: upiši odsutnost`}
                    className={cn('my-1 rounded hover:bg-blue-50 focus-visible:bg-blue-50', d === today && 'bg-slate-50')}
                    style={{ gridColumn: i + 2, gridRow: 1 }} />
                ) : (
                  <span key={d} role="cell" aria-label={`${formatDayLong(d)}: ${info.label ?? 'vikend'}`}
                    className={cn('my-0.5 rounded-sm', info.type === 'holiday' ? HOLIDAY_CELL : 'bg-slate-50')}
                    style={{ gridColumn: i + 2, gridRow: 1 }} />
                );
              })}
              {/* Trake odsutnosti */}
              {mine.map(a => {
                const s = a.start_date < first ? first : a.start_date;
                const e = a.end_date > last ? last : a.end_date;
                const span = idx(e) - idx(s) + 1;
                const pending = a.status === 'pending';
                const wd = cal.workdaysIn(a.start_date, a.end_date).length;
                return (
                  <div key={a.id} className="relative z-10 my-1 min-w-0" style={{ gridColumn: `${idx(s) + 2} / span ${span}`, gridRow: 1 }}>
                    <AbsenceCellPopover employeeId={emp.id} employeeName={emp.full_name ?? ''} day={s}
                      absence={pending ? null : a} pending={pending ? a : null} onMoreDays={onMoreDays}>
                      <button type="button"
                        aria-label={`${emp.full_name}: ${ABSENCE_LABEL[a.kind]} ${formatShortRange(a.start_date, a.end_date)}, ${wd} radnih dana${pending ? ', čeka odobrenje' : ''}`}
                        className={cn('w-full h-full flex items-center gap-1 px-1.5 rounded-md text-xs font-semibold overflow-hidden whitespace-nowrap',
                          'hover:ring-2 hover:ring-slate-300 data-[state=open]:ring-2 data-[state=open]:ring-blue-500',
                          pending ? ABSENCE_TONE[a.kind].pending : ABSENCE_TONE[a.kind].approved,
                          a.start_date < first && 'rounded-l-none', a.end_date > last && 'rounded-r-none')}>
                        {ABSENCE_CODE[a.kind]}{pending && '?'}
                        {span >= 4 && <span className="font-medium truncate">{ABSENCE_LABEL[a.kind]}{pending ? ' · čeka' : ''}</span>}
                      </button>
                    </AbsenceCellPopover>
                  </div>
                );
              })}
            </div>
          );
        })}
        <Legend cal={cal} days={days} />
      </div>
    </div>
  );
}

function Legend({ cal, days }: { cal: WorkCalendar; days: string[] }) {
  const holidays = days.filter(d => cal.dayInfo(d).type === 'holiday');
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-600" aria-label="Legenda">
      {(['godisnji', 'bolovanje', 'slobodan'] as const).map(k => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn('w-3 h-3 rounded-sm border', ABSENCE_TONE[k].swatch)} aria-hidden="true" />{ABSENCE_CODE[k]} {ABSENCE_LABEL[k].toLowerCase()}
        </li>
      ))}
      <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-dashed border-slate-400" aria-hidden="true" />čeka odobrenje</li>
      {holidays.length > 0 && (
        <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" aria-hidden="true" />
          {holidays.map(d => `${formatShort(d)} ${cal.dayInfo(d).label}`).join(', ')}
        </li>
      )}
    </ul>
  );
}

/** Mobitel: popis po osobi umjesto vodoravnog kalendara. */
function MonthList({ rows, absences, start, end, cal, colors }: {
  rows: Profile[]; absences: Absence[]; start: string; end: string; cal: WorkCalendar; colors: Record<string, string>;
}) {
  const holidays = cal.holidaysIn(start, end);
  const people = rows.filter(e => absences.some(a => a.employee_id === e.id));
  return (
    <div className="md:hidden">
      {people.length === 0 ? (
        <p className="text-sm text-slate-600">Ovaj mjesec nema upisanih odsutnosti.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {people.map(emp => (
            <li key={emp.id} className="py-2.5">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[emp.id] }} aria-hidden="true" />{emp.full_name}
              </p>
              <ul className="mt-1 ml-[18px] space-y-1">
                {absences.filter(a => a.employee_id === emp.id).map(a => {
                  const wd = cal.workdaysIn(a.start_date, a.end_date).length;
                  return (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold', a.status === 'pending' ? ABSENCE_TONE[a.kind].pending : ABSENCE_TONE[a.kind].approved)}>
                        {ABSENCE_CODE[a.kind]}{a.status === 'pending' && '?'}
                      </span>
                      <span className="text-slate-800 tabular-nums">{formatShortRange(a.start_date, a.end_date)}</span>
                      <span className="text-slate-600">{wd} rd{a.status === 'pending' ? ' · čeka' : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {holidays.length > 0 && (
        <p className="mt-3 text-xs text-slate-600">Praznici: {holidays.map(h => `${formatShort(h.day)} ${h.label}`).join(', ')}</p>
      )}
    </div>
  );
}

// ─── Praznici i neradni dani tvrtke ──────────────────────────────────────────

function HolidaysSection({ year }: { year: number }) {
  const overridesQ = useCalendarOverrides();
  const setOverride = useSetCalendarOverride();
  const [day, setDay] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const overrides = overridesQ.data ?? [];
  const off = new Set(overrides.filter(o => o.kind === 'radni').map(o => o.day));
  const holidays = [...croatianHolidays(year).entries()].sort(([a], [b]) => a.localeCompare(b));
  const companyDays = overrides.filter(o => o.kind === 'neradni' && o.day.startsWith(String(year)));

  const toggle = (d: string, name: string, on: boolean) =>
    setOverride.mutate({ day: d, kind: on ? null : 'radni', label: on ? null : name }, {
      onSuccess: () => toast(on ? `${name} je neradni dan` : `${name} se radi`),
      onError: e => toast.error(e.message),
    });

  const add = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!day) return setError('Odaberite datum.');
    if (!label.trim()) return setError('Upišite naziv, npr. Badnjak.');
    setOverride.mutate({ day, kind: 'neradni', label: label.trim() }, {
      onSuccess: () => { toast.success('Neradni dan dodan'); setDay(''); setLabel(''); },
      onError: err => setError(err.message),
    });
  };

  return (
    <details className="group bg-white rounded-xl border border-slate-200 shadow-sm">
      <summary className="flex items-center gap-2 px-4 sm:px-5 py-4 cursor-pointer list-none text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true" />
        Praznici i neradni dani {year}.
        <span className="ml-auto text-xs font-normal text-slate-600">
          {holidays.length - off.size} praznika{companyDays.length > 0 ? ` · ${companyDays.length} ${pluralHr(companyDays.length, 'dan', 'dana', 'dana')} tvrtke` : ''}
        </span>
      </summary>
      <div className="px-4 sm:px-5 pb-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-slate-800 mb-2">Državni praznici</h3>
          <ul className="divide-y divide-slate-100">
            {holidays.map(([d, name]) => {
              const on = !off.has(d);
              return (
                <li key={d} className="flex items-center gap-3 py-2">
                  <span className="w-20 text-sm tabular-nums text-slate-700">{formatShort(d)} <span className="text-slate-500">{formatWeekdayShort(d)}</span></span>
                  <span className={cn('flex-1 text-sm', on ? 'text-slate-900' : 'text-slate-500 line-through')}>{name}</span>
                  <button type="button" role="switch" aria-checked={on} aria-label={`${name}: neradni dan`}
                    onClick={() => toggle(d, name, !on)} disabled={setOverride.isPending}
                    className={cn('relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60', on ? 'bg-blue-600' : 'bg-slate-300')}>
                    <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-800 mb-2">Neradni dani tvrtke</h3>
          {companyDays.length === 0 ? (
            <p className="text-sm text-slate-600 mb-3">Dodajte dane kad nitko ne radi, npr. Badnjak ili kolektivni godišnji.</p>
          ) : (
            <ul className="divide-y divide-slate-100 mb-3">
              {companyDays.map(o => (
                <li key={o.day} className="flex items-center gap-3 py-2">
                  <span className="w-20 text-sm tabular-nums text-slate-700">{formatShort(o.day)} <span className="text-slate-500">{formatWeekdayShort(o.day)}</span></span>
                  <span className="flex-1 text-sm text-slate-900">{o.label}</span>
                  <button type="button" aria-label={`Ukloni ${o.label}`} disabled={setOverride.isPending}
                    onClick={() => setOverride.mutate({ day: o.day, kind: null }, { onError: e => toast.error(e.message) })}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <Field label="Datum" className="sm:w-52">{p => <DatePicker {...p} value={day} onChange={setDay} size="sm" />}</Field>
            <Field label="Naziv" className="flex-1">
              {p => <input {...p} value={label} onChange={e => setLabel(e.target.value)} placeholder="Badnjak" className={inputClass(false, 'sm:py-1.5 sm:text-xs')} />}
            </Field>
            <button type="submit" disabled={setOverride.isPending}
              className="min-h-11 sm:min-h-0 sm:h-[34px] px-3 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg disabled:opacity-60">
              Dodaj neradni dan
            </button>
          </form>
          <div className="mt-2"><FormError message={error} /></div>
        </div>
      </div>
    </details>
  );
}
