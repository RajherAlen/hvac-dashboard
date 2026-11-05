import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DayPicker, type DateRange } from 'react-day-picker';
import { hr } from 'react-day-picker/locale/hr';
import 'react-day-picker/style.css';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { parseISO } from 'date-fns';
import { Dialog } from '../ui/Dialog';
import { Field, FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { useAbsences, useCalendarOverrides, useRequestAbsence } from '../../hooks/useAbsences';
import { usePlan } from '../../hooks/useWorkOrders';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { ABSENCE_LABEL, buildWorkCalendar } from '../../lib/workCalendar';
import { formatShort, formatShortRange, toISODate } from '../../lib/format-date';
import { cn, formatHours, pluralHr } from '../../lib/utils';
import type { AbsenceKind, Profile } from '../../types';

const KINDS: AbsenceKind[] = ['godisnji', 'bolovanje', 'slobodan'];

interface Props {
  onClose: () => void;
  /** Admin upisuje (odmah odobreno), zaposlenik šalje zahtjev */
  asAdmin: boolean;
  /** Za koga – zaposlenik uvijek sebe */
  employeeId?: string;
  /** Admin: izbor zaposlenika (ako nije zadan employeeId) */
  employees?: Profile[];
  initialStart?: string;
  initialEnd?: string;
  initialKind?: AbsenceKind;
}

export function AbsenceDialog({ onClose, asAdmin, employeeId: fixedEmployee, employees = [], initialStart, initialEnd, initialKind = 'godisnji' }: Props) {
  const [employeeId, setEmployeeId] = useState(fixedEmployee ?? '');
  const [kind, setKind] = useState<AbsenceKind>(initialKind);
  const [range, setRange] = useState<DateRange | undefined>(
    initialStart ? { from: parseISO(initialStart), to: parseISO(initialEnd ?? initialStart) } : undefined,
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const request = useRequestAbsence();

  const start = range?.from ? toISODate(range.from) : '';
  const end = range?.to ? toISODate(range.to) : start;

  // Postojeće odsutnosti osobe (za označavanje u kalendaru) i kalendar tvrtke
  const existingQ = useAbsences({ employeeId, statuses: ['approved', 'pending'] }, !!employeeId);
  const overridesQ = useCalendarOverrides();
  const cal = useMemo(
    () => buildWorkCalendar({ overrides: overridesQ.data ?? [], absences: existingQ.data ?? [] }),
    [overridesQ.data, existingQ.data],
  );

  const workdays = start ? cal.workdaysIn(start, end) : [];
  const holidays = start ? cal.holidaysIn(start, end) : [];

  // Sukobi (samo admin vidi raspored i tuđe unose)
  const planQ = usePlan(start, end, asAdmin && !!start && !!employeeId);
  const logsQ = useWorkLogs({ startDate: start, endDate: end, employeeId }, asAdmin && !!start && !!employeeId);
  const plannedOrders = new Set((planQ.data ?? []).filter(a => a.employee_id === employeeId).map(a => a.work_order_id)).size;
  const loggedDays = new Map<string, number>();
  if (asAdmin && start && employeeId) {
    for (const l of logsQ.data ?? []) loggedDays.set(l.log_date, (loggedDays.get(l.log_date) ?? 0) + Number(l.hours_worked));
  }

  const name = employees.find(e => e.id === employeeId)?.full_name ?? '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!employeeId) return setError('Odaberite zaposlenika.');
    if (!start) return setError('Odaberite dan ili raspon dana u kalendaru.');
    request.mutate(
      { kind, start, end, note, employeeId: asAdmin ? employeeId : undefined },
      {
        onSuccess: () => {
          toast.success(asAdmin ? 'Odsutnost upisana' : 'Zahtjev poslan');
          onClose();
        },
        onError: err => setError(err.message),
      },
    );
  };

  return (
    <Dialog
      onClose={onClose}
      title={asAdmin ? 'Upiši odsutnost' : 'Zatraži odsutnost'}
      description={asAdmin ? (fixedEmployee && name ? name : 'Upisana odsutnost je odmah odobrena.') : 'Administrator će zahtjev odobriti ili odbiti.'}
    >
      <form onSubmit={submit} className="px-5 sm:px-6 py-4 flex flex-col gap-4">
        {asAdmin && !fixedEmployee && (
          <Field label="Zaposlenik" required>
            {p => (
              <select {...p} value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={inputClass(false)}>
                <option value="">Odaberite…</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            )}
          </Field>
        )}

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-1">Vrsta</legend>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            {KINDS.map(k => (
              <label key={k} className={cn(
                'relative flex items-center justify-center min-h-10 sm:min-h-9 px-2 text-sm font-medium rounded-md cursor-pointer transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500',
                kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}>
                <input type="radio" name="absence-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                {ABSENCE_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="block text-sm font-medium text-slate-700 mb-1" id="absence-range-label">
            Dani <span className="font-normal text-slate-500">– kliknite prvi i zadnji dan</span>
          </p>
          <div className="flex justify-center border border-slate-200 rounded-xl py-2 rdp-hvac rdp-absence" aria-labelledby="absence-range-label">
            <DayPicker
              mode="range"
              locale={hr}
              weekStartsOn={1}
              selected={range}
              onSelect={setRange}
              defaultMonth={range?.from}
              modifiers={{
                weekend: d => d.getDay() === 0 || d.getDay() === 6,
                holiday: d => cal.dayInfo(toISODate(d)).type === 'holiday',
                taken: d => !!employeeId && (!!cal.absenceOf(employeeId, toISODate(d)) || !!cal.pendingOf(employeeId, toISODate(d))),
              }}
              modifiersClassNames={{ weekend: 'rdp-weekend', holiday: 'rdp-holiday', taken: 'rdp-taken' }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-700" aria-live="polite">
            {start ? (
              <>
                <strong className="font-semibold text-slate-900">{workdays.length} {pluralHr(workdays.length, 'radni dan', 'radna dana', 'radnih dana')}</strong>
                {' '}· {formatShortRange(start, end)}
                {holidays.length > 0 && (
                  <span className="text-slate-600"> · {holidays.map(h => `${h.label} ${formatShort(h.day)}`).join(', ')} se ne {holidays.length > 1 ? 'broje' : 'broji'}</span>
                )}
              </>
            ) : <span className="text-slate-500">Još nije odabran nijedan dan.</span>}
          </p>
        </div>

        {asAdmin && (plannedOrders > 0 || loggedDays.size > 0) && (
          <ul className="flex flex-col gap-1.5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {plannedOrders > 0 && (
              <li className="flex gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {name || 'Zaposlenik'} ima {plannedOrders} {pluralHr(plannedOrders, 'nalog', 'naloga', 'naloga')} u rasporedu u tom periodu.
                  {' '}<Link to={`/raspored?date=${start}`} className="font-medium underline">Otvori raspored</Link>
                </span>
              </li>
            )}
            {[...loggedDays.entries()].map(([day, h]) => (
              <li key={day} className="flex gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>Već upisano {formatHours(h)} na {formatShort(day)}</span>
              </li>
            ))}
          </ul>
        )}

        <Field label="Napomena" optional>
          {p => <textarea {...p} rows={2} value={note} onChange={e => setNote(e.target.value)} className={inputClass(false, 'resize-none')} placeholder={kind === 'bolovanje' ? 'npr. doznaka liječnika' : ''} />}
        </Field>

        <FormError message={error} />
        <FormActions
          onCancel={onClose}
          submitLabel={asAdmin ? 'Upiši odsutnost' : 'Pošalji zahtjev'}
          pendingLabel="Spremanje…"
          isPending={request.isPending}
        />
      </form>
    </Dialog>
  );
}
