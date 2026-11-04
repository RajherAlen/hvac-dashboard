import { useEffect, useId } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useAddWorkLog, useUpdateWorkLog, useWorkLogs, useLocationSuggestions } from '../hooks/useWorkLogs';
import { useAuth } from '../hooks/useAuth';
import { todayISO, parseHours, hoursToInput, formatHours, cn } from '../lib/utils';
import { errorMessage } from '../lib/errors';
import type { WorkLog } from '../types';
import { Dialog } from './ui/Dialog';
import { Field, FormActions, FormError } from './ui/form';
import { inputClass } from './ui/styles';
import { DatePicker } from './ui/DatePicker';

/** Iznad ovoga dnevnog zbroja upozoravamo (ne blokiramo). */
const DAILY_WARN_HOURS = 12;
const QUICK_HOURS = [4, 6, 7, 8];

const schema = z.object({
  log_date: z.string().min(1, 'Odaberite datum'),
  task_description: z.string().trim().min(3, 'Opišite zadatak (najmanje 3 znaka)'),
  location: z.string().trim().min(2, 'Upišite lokaciju'),
  hours: z
    .string()
    .trim()
    .min(1, 'Upišite broj sati')
    .refine(v => parseHours(v) !== null, 'Upišite npr. 8, 7,5 ili 7:30')
    .refine(v => {
      const h = parseHours(v);
      return h === null || (h >= 0.25 && h <= 24);
    }, 'Između 15 min i 24 h'),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface WorkLogFormProps {
  editLog?: WorkLog | null;
  onClose: () => void;
  /** Admin može unositi za drugog zaposlenika; inače je to trenutni korisnik */
  employeeId?: string;
}

export function WorkLogForm({ editLog, onClose, employeeId }: WorkLogFormProps) {
  const { user } = useAuth();
  const addLog = useAddWorkLog();
  const updateLog = useUpdateWorkLog();
  const { data: locations = [] } = useLocationSuggestions();
  const locationListId = useId();
  const targetEmployee = editLog?.employee_id ?? employeeId ?? user?.id;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      log_date: todayISO(),
      task_description: '',
      location: '',
      hours: '8',
      notes: '',
    },
  });

  useEffect(() => {
    if (editLog) {
      reset({
        log_date: editLog.log_date,
        task_description: editLog.task_description,
        location: editLog.location,
        hours: hoursToInput(Number(editLog.hours_worked)),
        notes: editLog.notes ?? '',
      });
    }
  }, [editLog, reset]);

  // Koliko je zaposlenik već upisao odabrani dan (bez ovog unosa ako ga uređujemo)
  const [logDate, hoursInput] = useWatch({ control, name: ['log_date', 'hours'] });
  const { data: dayLogs = [] } = useWorkLogs({ employeeId: targetEmployee, startDate: logDate, endDate: logDate });
  const alreadyLogged = dayLogs
    .filter(l => l.id !== editLog?.id)
    .reduce((s, l) => s + Number(l.hours_worked), 0);
  const newHours = parseHours(hoursInput ?? '') ?? 0;
  const projected = alreadyLogged + newHours;
  const overLimit = projected > DAILY_WARN_HOURS;

  const onSubmit = async (values: FormValues) => {
    const payload = {
      log_date: values.log_date,
      task_description: values.task_description,
      location: values.location.trim().replace(/\s+/g, ' '),
      hours_worked: parseHours(values.hours)!,
      notes: values.notes,
    };
    try {
      if (editLog) {
        await updateLog.mutateAsync({ id: editLog.id, values: payload });
        toast.success('Promjene spremljene');
      } else {
        await addLog.mutateAsync({ ...payload, employee_id: targetEmployee! });
        toast.success('Unos dodan', { description: `${formatHours(payload.hours_worked)} · ${payload.location}` });
      }
      onClose();
    } catch {
      /* prikazuje se kroz FormError */
    }
  };

  const apiError = addLog.error || updateLog.error;

  return (
    <Dialog
      onClose={onClose}
      title={editLog ? 'Uredi radni zapis' : 'Unos rada'}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <Field label="Datum" required error={errors.log_date?.message}>
          {p => (
            <Controller
              control={control}
              name="log_date"
              render={({ field }) => (
                <DatePicker {...p} value={field.value} onChange={field.onChange} onBlur={field.onBlur} max={todayISO()} quickPicks />
              )}
            />
          )}
        </Field>

        <Field label="Opis zadatka" required error={errors.task_description?.message}>
          {p => (
            <textarea
              {...p}
              {...register('task_description')}
              required
              rows={2}
              placeholder="npr. Servis klime, pregled kotlovnice…"
              className={inputClass(!!errors.task_description, 'resize-none')}
            />
          )}
        </Field>

        <Field label="Lokacija" required error={errors.location?.message} hint={locations.length > 0 ? 'Počnite tipkati za prijedloge iz prethodnih unosa' : undefined}>
          {p => (
            <>
              <input
                {...p}
                {...register('location')}
                type="text"
                required
                list={locationListId}
                autoComplete="off"
                placeholder="npr. Ilica 34, Zagreb"
                className={inputClass(!!errors.location)}
              />
              <datalist id={locationListId}>
                {locations.map(l => <option key={l} value={l} />)}
              </datalist>
            </>
          )}
        </Field>

        <Field
          label="Sati rada"
          required
          error={errors.hours?.message}
          hint={
            alreadyLogged > 0 ? (
              <span className={cn(overLimit && 'text-amber-800')}>
                Već upisano taj dan: <strong>{formatHours(alreadyLogged)}</strong>
                {newHours > 0 && <> · ukupno s ovim unosom: <strong>{formatHours(projected)}</strong></>}
              </span>
            ) : 'Npr. 8, 7,5 ili 7:30'
          }
        >
          {p => (
            <div className="flex flex-wrap gap-2">
              <input
                {...p}
                {...register('hours')}
                type="text"
                inputMode="decimal"
                required
                className={inputClass(!!errors.hours, 'w-24 flex-none text-right tabular-nums')}
              />
              <div className="flex gap-1.5 flex-1" role="group" aria-label="Brzi odabir sati">
                {QUICK_HOURS.map(h => {
                  const active = newHours === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setValue('hours', String(h), { shouldValidate: true, shouldDirty: true })}
                      className={cn(
                        'flex-1 min-h-11 sm:min-h-9 px-2 text-sm font-medium rounded-lg border transition-colors',
                        active ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {h} h
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Field>

        {overLimit && !errors.hours && (
          <p role="status" className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
            Ukupno bi za taj dan bilo {formatHours(projected)} – više od {DAILY_WARN_HOURS} h. Provjerite unos.
          </p>
        )}

        <Field label="Napomene" optional>
          {p => (
            <textarea
              {...p}
              {...register('notes')}
              rows={2}
              placeholder="Dodatne napomene…"
              className={inputClass(false, 'resize-none')}
            />
          )}
        </Field>

        <FormError message={apiError ? errorMessage(apiError) : null} />

        <FormActions
          onCancel={onClose}
          isPending={isSubmitting}
          submitLabel={editLog ? 'Spremi promjene' : 'Dodaj unos'}
          pendingLabel="Spremanje…"
        />
      </form>
    </Dialog>
  );
}
