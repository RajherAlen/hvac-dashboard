import { useEffect, useId, useMemo } from 'react';
import { useForm, Controller, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, MapPin, Plus, X, History, CalendarOff } from 'lucide-react';
import { useWorkCalendar } from '../hooks/useAbsences';
import { ABSENCE_LABEL } from '../lib/workCalendar';
import { useAddWorkLogs, useUpdateWorkLog, useWorkLogs, useLocationSuggestions } from '../hooks/useWorkLogs';
import { useClientDirectory, useRecentSites, useWorkLogDevices } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { todayISO, parseHours, hoursToInput, formatHours, cn, pluralHr } from '../lib/utils';
import { errorMessage } from '../lib/errors';
import { OFFICE_LOCATION, OFFICE_SITE, siteLabel } from '../lib/clients';
import type { WorkLog } from '../types';
import { Dialog } from './ui/Dialog';
import { Field, FormActions, FormError } from './ui/form';
import { inputClass } from './ui/styles';
import { DatePicker } from './ui/DatePicker';
import { SitePicker } from './clients/SitePicker';
import { DevicePicker } from './clients/DevicePicker';
import { useWorkLogIsService } from '../hooks/useServiceCases';

/** Iznad ovoga dnevnog zbroja upozoravamo (ne blokiramo). */
const DAILY_WARN_HOURS = 12;
const QUICK_HOURS = [2, 4, 6, 8];
const MAX_ITEMS = 8;

const hoursSchema = z
  .string()
  .trim()
  .min(1, 'Upišite broj sati')
  .refine(v => parseHours(v) !== null, 'Upišite npr. 8, 7,5 ili 7:30')
  .refine(v => {
    const h = parseHours(v);
    return h === null || (h >= 0.25 && h <= 24);
  }, 'Između 15 min i 24 h');

/**
 * Jedna stavka = jedan objekt klijenta (ili "Ured / ostalo"), s opisom, satima i
 * neobaveznim popisom servisiranih uređaja. Dok modul klijenata nije uključen,
 * stavka koristi slobodni tekst lokacije kao prije.
 */
const itemSchema = z.object({
  site: z.string(),
  device_ids: z.array(z.string()),
  is_service: z.boolean(),
  /** Unos iz naloga (prazno = običan unos) */
  assignment_id: z.string(),
  order_done: z.boolean(),
  order_label: z.string(),
  location: z.string(),
  task_description: z.string().trim().min(3, 'Opišite posao (najmanje 3 znaka)'),
  hours: hoursSchema,
});

type FormValues = { log_date: string; items: z.infer<typeof itemSchema>[]; notes: string };

function makeSchema(clientsMode: boolean, legacyEdit: boolean) {
  return z.object({
    log_date: z.string().min(1, 'Odaberite datum'),
    items: z.array(itemSchema.superRefine((it, ctx) => {
      if (clientsMode) {
        if (!it.site && !legacyEdit) ctx.addIssue({ code: 'custom', path: ['site'], message: 'Odaberite objekt ili „Ured / ostalo”' });
      } else if (it.location.trim().length < 2) {
        ctx.addIssue({ code: 'custom', path: ['location'], message: 'Upišite lokaciju' });
      }
    })).min(1),
    notes: z.string(),
  });
}

const EMPTY_ITEM = {
  site: '', device_ids: [] as string[], is_service: true,
  assignment_id: '', order_done: false, order_label: '',
  location: '', task_description: '', hours: '',
};

/** Stavka unaprijed popunjena iz naloga ("Upiši rad" / "Upiši cijeli dan") */
export interface PresetItem {
  site: string;
  device_ids: string[];
  task: string;
  hours: number;
  is_service: boolean;
  assignment_id: string;
  order_done: boolean;
  label: string;
}

interface WorkLogFormProps {
  editLog?: WorkLog | null;
  onClose: () => void;
  /** Admin može unositi za drugog zaposlenika; inače je to trenutni korisnik */
  employeeId?: string;
  /** Unaprijed odabran objekt (npr. "Upiši rad ovdje" na stranici klijenta) */
  presetSiteId?: string;
  /** Unaprijed odabrani uređaji i opis (npr. "Upiši servis" iz nadolazećih servisa) */
  presetDeviceIds?: string[];
  presetTask?: string;
  presetItems?: PresetItem[];
  /** Datum unosa (npr. neupisani nalog od jučer) */
  presetDate?: string;
}

export function WorkLogForm({ editLog, onClose, employeeId, presetSiteId, presetDeviceIds, presetTask, presetItems, presetDate }: WorkLogFormProps) {
  const { user } = useAuth();
  const addLogs = useAddWorkLogs();
  const updateLog = useUpdateWorkLog();
  const dir = useClientDirectory();
  const clientsMode = dir.enabled;
  const targetEmployee = editLog?.employee_id ?? employeeId ?? user?.id;
  const { data: recent = [] } = useRecentSites(targetEmployee, clientsMode);
  const { data: locations = [] } = useLocationSuggestions();
  const { data: editDevices } = useWorkLogDevices(editLog ? [editLog.id] : [], clientsMode && !!editLog);
  const { data: editIsService } = useWorkLogIsService(clientsMode && editLog ? editLog.id : undefined);
  const locationListId = useId();
  const isEdit = !!editLog;
  const legacyEdit = isEdit && !editLog?.site_id && editLog?.location !== OFFICE_LOCATION;

  const schema = useMemo(() => makeSchema(clientsMode, legacyEdit), [clientsMode, legacyEdit]);

  const {
    register, handleSubmit, reset, control, setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      log_date: presetDate ?? todayISO(),
      items: presetItems?.length
        ? presetItems.map(p => ({
          ...EMPTY_ITEM, site: p.site, device_ids: p.device_ids, task_description: p.task, hours: hoursToInput(p.hours),
          is_service: p.is_service, assignment_id: p.assignment_id, order_done: p.order_done, order_label: p.label,
        }))
        : [{ ...EMPTY_ITEM, site: presetSiteId ?? '', device_ids: presetDeviceIds ?? [], task_description: presetTask ?? '', hours: presetTask ? '' : '8' }],
      notes: '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    if (editLog) {
      reset({
        log_date: editLog.log_date,
        items: [{
          site: editLog.site_id ?? (editLog.location === OFFICE_LOCATION ? OFFICE_SITE : ''),
          device_ids: editDevices?.[editLog.id] ?? [],
          is_service: editIsService ?? true,
          assignment_id: '', order_done: false, order_label: '',
          location: editLog.location,
          task_description: editLog.task_description,
          hours: hoursToInput(Number(editLog.hours_worked)),
        }],
        notes: editLog.notes ?? '',
      });
    }
  }, [editLog, editDevices, editIsService, reset]);

  // Koliko je zaposlenik već upisao odabrani dan (bez ovog unosa ako ga uređujemo)
  const [logDate, items] = useWatch({ control, name: ['log_date', 'items'] });
  const { data: dayLogs = [] } = useWorkLogs({ employeeId: targetEmployee, startDate: logDate, endDate: logDate });
  const alreadyLogged = dayLogs.filter(l => l.id !== editLog?.id).reduce((s, l) => s + Number(l.hours_worked), 0);
  const newHours = (items ?? []).reduce((s, it) => s + (parseHours(it?.hours ?? '') ?? 0), 0);
  const projected = alreadyLogged + newHours;
  const overLimit = projected > DAILY_WARN_HOURS;
  // Praznik ili odobrena odsutnost: samo napomena, unos se ne blokira
  const { cal } = useWorkCalendar(logDate, logDate, !!logDate);
  const dayNote = (() => {
    if (!logDate) return null;
    const own = targetEmployee === user?.id;
    const away = targetEmployee ? cal.absenceOf(targetEmployee, logDate) : null;
    if (away) return `Za ovaj dan ${own ? 'imaš' : 'je'} odobren${away.kind === 'bolovanje' ? 'o' : ''} ${ABSENCE_LABEL[away.kind].toLowerCase()}.`;
    const info = cal.dayInfo(logDate);
    if (info.type === 'holiday') return `${info.label} – neradni dan. Rad se i dalje može upisati.`;
    return null;
  })();

  const fromOrder = (it: FormValues['items'][number]) =>
    it.assignment_id ? { assignment_id: it.assignment_id, order_done: it.order_done } : {};
  const resolve = (it: FormValues['items'][number]) => {
    if (!clientsMode) return { location: it.location.trim().replace(/\s+/g, ' ') };
    if (it.site === OFFICE_SITE) return { location: OFFICE_LOCATION, site_id: null, device_ids: [], ...fromOrder(it) };
    if (!it.site) return { location: it.location }; // stari unos ostaje nepovezan
    const hit = dir.siteIndex.get(it.site);
    return {
      location: hit ? siteLabel(hit.site, hit.client) : it.location || 'Objekt',
      site_id: it.site,
      device_ids: it.device_ids,
      ...(it.device_ids.length > 0 ? { is_service: it.is_service } : {}),
      ...fromOrder(it),
    };
  };

  const onSubmit = async (values: FormValues) => {
    const rows = values.items.map(it => ({
      log_date: values.log_date,
      task_description: it.task_description.trim(),
      hours_worked: parseHours(it.hours)!,
      notes: values.notes,
      ...resolve(it),
    }));
    try {
      if (editLog) {
        await updateLog.mutateAsync({ id: editLog.id, values: rows[0] });
        toast.success('Promjene spremljene');
      } else {
        await addLogs.mutateAsync(rows.map(r => ({ ...r, employee_id: targetEmployee! })));
        const total = rows.reduce((s, r) => s + r.hours_worked, 0);
        toast.success(rows.length === 1 ? 'Unos dodan' : `Dodano ${rows.length} ${pluralHr(rows.length, 'stavka', 'stavke', 'stavki')}`, {
          description: `${formatHours(total)} · ${rows.map(r => r.location).join(', ')}`,
        });
      }
      onClose();
    } catch {
      /* prikazuje se kroz FormError */
    }
  };

  const apiError = addLogs.error || updateLog.error;
  const placeNoun = clientsMode ? 'objekt' : 'lokaciju';

  return (
    <Dialog onClose={onClose} title={isEdit ? 'Uredi radni zapis' : 'Unos rada'} className="sm:max-w-lg">
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
        {dayNote && (
          <p className="-mt-2 flex items-center gap-2 text-sm text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2" role="status">
            <CalendarOff size={15} className="shrink-0" aria-hidden="true" />{dayNote}
          </p>
        )}

        {!clientsMode && (
          <datalist id={locationListId}>
            {locations.map(l => <option key={l} value={l} />)}
          </datalist>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700 mb-1">
            {isEdit ? 'Posao' : clientsMode ? 'Posao po objektima' : 'Posao po lokacijama'}
          </legend>
          {!isEdit && (
            <p className="-mt-1 text-xs text-slate-600">
              Radili ste na više mjesta? Dodajte svaki {placeNoun} kao zasebnu stavku sa svojim satima.
            </p>
          )}

          {fields.map((field, i) => {
            const e = errors.items?.[i];
            const item = items?.[i];
            const itemHours = parseHours(item?.hours ?? '');
            const realSite = item?.site && item.site !== OFFICE_SITE ? item.site : null;
            return (
              <div key={field.id} className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4 space-y-3">
                {fields.length > 1 && (
                  <div className="flex items-center justify-between -mt-1">
                    <span className="text-xs font-semibold text-slate-600">Stavka {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="-mr-2 p-2 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                      aria-label={`Ukloni stavku ${i + 1}`}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}

                {item?.assignment_id && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white border border-blue-200 rounded-lg px-2.5 py-2">
                    <span className="text-slate-700">Iz naloga: <strong className="font-semibold text-slate-900">{item.order_label}</strong></span>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                      <input type="checkbox" {...register(`items.${i}.order_done`)} className="h-5 w-5 sm:h-4 sm:w-4 rounded border-slate-400 accent-blue-600" />
                      Nalog je završen
                    </label>
                  </div>
                )}

                {clientsMode ? (
                  <>
                    {legacyEdit && !item?.site && (
                      <p className="flex items-start gap-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-2">
                        <History size={13} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                        <span>Stara lokacija: <strong className="font-medium">{editLog?.location}</strong>. Odaberite objekt da povežete unos s klijentom (neobavezno).</span>
                      </p>
                    )}
                    <Field label="Objekt" required={!legacyEdit} error={e?.site?.message}>
                      {p => (
                        <Controller
                          control={control}
                          name={`items.${i}.site`}
                          render={({ field }) => (
                            <SitePicker
                              {...p}
                              value={field.value}
                              onChange={v => { field.onChange(v); setValue(`items.${i}.device_ids`, []); }}
                              onBlur={field.onBlur}
                              recentSiteIds={recent}
                            />
                          )}
                        />
                      )}
                    </Field>
                    {realSite && (
                      <div>
                        <p id={`${field.id}-dev`} className="text-sm font-medium text-slate-700 mb-1">
                          Servisirani uređaji <span className="font-normal text-slate-500">(neobavezno)</span>
                        </p>
                        <Controller
                          control={control}
                          name={`items.${i}.device_ids`}
                          render={({ field: f }) => (
                            <DevicePicker siteId={realSite} value={f.value} onChange={f.onChange} labelId={`${field.id}-dev`} />
                          )}
                        />
                        {(item?.device_ids?.length ?? 0) > 0 && (
                          <label className="mt-2.5 flex items-start gap-2.5 text-sm text-slate-800 cursor-pointer">
                            <input type="checkbox" {...register(`items.${i}.is_service`)}
                              className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 shrink-0 rounded border-slate-400 accent-blue-600" />
                            <span>
                              Redovni servis
                              <span className="block text-xs text-slate-600">Pomiče rok sljedećeg servisa. Isključite ako je bio samo popravak.</span>
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <Field label="Lokacija" required error={e?.location?.message}>
                    {p => (
                      <div className="relative">
                        <MapPin size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                          {...p}
                          {...register(`items.${i}.location`)}
                          type="text"
                          required
                          list={locationListId}
                          autoComplete="off"
                          placeholder="npr. Gradište"
                          className={inputClass(!!e?.location, 'pl-9')}
                        />
                      </div>
                    )}
                  </Field>
                )}

                <Field label="Što je napravljeno" required error={e?.task_description?.message}>
                  {p => (
                    <input
                      {...p}
                      {...register(`items.${i}.task_description`)}
                      type="text"
                      required
                      placeholder="npr. Redovni servis, čišćenje filtera"
                      className={inputClass(!!e?.task_description)}
                    />
                  )}
                </Field>

                <Field label="Sati" required error={e?.hours?.message}>
                  {p => (
                    <div className="flex flex-wrap gap-2">
                      <input
                        {...p}
                        {...register(`items.${i}.hours`)}
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="0"
                        className={inputClass(!!e?.hours, 'w-24 flex-none text-right tabular-nums')}
                      />
                      <div className="flex gap-1.5 flex-1" role="group" aria-label={`Brzi odabir sati, stavka ${i + 1}`}>
                        {QUICK_HOURS.map(h => (
                          <button
                            key={h}
                            type="button"
                            aria-pressed={itemHours === h}
                            onClick={() => setValue(`items.${i}.hours`, String(h), { shouldValidate: true, shouldDirty: true })}
                            className={cn(
                              'flex-1 min-h-11 sm:min-h-9 px-2 text-sm font-medium rounded-lg border transition-colors',
                              itemHours === h ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            {h} h
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Field>
              </div>
            );
          })}

          {!isEdit && fields.length < MAX_ITEMS && (
            <button
              type="button"
              onClick={() => append({ ...EMPTY_ITEM }, { shouldFocus: false })}
              className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-blue-700 border border-dashed border-blue-300 hover:bg-blue-50 rounded-xl"
            >
              <Plus size={15} aria-hidden="true" /> {clientsMode ? 'Dodaj još jedan objekt' : 'Dodaj još jednu lokaciju'}
            </button>
          )}
        </fieldset>

        {/* Zbroj dana */}
        <div
          role="status"
          className={cn(
            'flex items-start gap-2 text-sm px-3 py-2 rounded-lg border',
            overLimit ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-slate-700 bg-slate-50 border-slate-200',
          )}
        >
          {overLimit && <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <p>
            {fields.length > 1 && <>Ovaj unos: <strong className="tabular-nums">{formatHours(newHours)}</strong>. </>}
            {alreadyLogged > 0
              ? <>Već upisano taj dan: <strong className="tabular-nums">{formatHours(alreadyLogged)}</strong> · ukupno <strong className="tabular-nums">{formatHours(projected)}</strong>.</>
              : <>Ukupno za dan: <strong className="tabular-nums">{formatHours(projected)}</strong>.</>}
            {overLimit && <> Više od {DAILY_WARN_HOURS} h – provjerite unos.</>}
          </p>
        </div>

        <Field label="Napomene" optional hint={fields.length > 1 ? 'Napomena se dodaje svim stavkama.' : undefined}>
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
          submitLabel={isEdit ? 'Spremi promjene' : fields.length > 1 ? `Spremi ${fields.length} ${pluralHr(fields.length, 'stavku', 'stavke', 'stavki')}` : 'Dodaj unos'}
          pendingLabel="Spremanje…"
        />
      </form>
    </Dialog>
  );
}
