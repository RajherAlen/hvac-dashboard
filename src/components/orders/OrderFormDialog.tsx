import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { useClientDirectory } from '../../hooks/useClients';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { usePlan, useSaveOrder, type OrderDetail } from '../../hooks/useWorkOrders';
import { DAY_CAPACITY, KIND_DEFAULTS, KIND_LABEL } from '../../lib/orders';
import { OFFICE_SITE } from '../../lib/clients';
import { errorMessage } from '../../lib/errors';
import { formatWeekday } from '../../lib/format-date';
import { cn, formatHours, hoursToInput, parseHours, todayISO } from '../../lib/utils';
import { moneyToInput, parseMoney } from '../../lib/money';
import type { WorkOrderKind } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Field, FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { DatePicker } from '../ui/DatePicker';
import { SitePicker } from '../clients/SitePicker';
import { DevicePicker } from '../clients/DevicePicker';
import { KindIcon } from './KindIcon';

const KINDS = Object.keys(KIND_LABEL) as WorkOrderKind[];
const QUICK = [2, 4, 6, 8];

export interface OrderPreset {
  employee_id?: string;
  day?: string;
  site_id?: string | null;
  device_ids?: string[];
  kind?: WorkOrderKind;
  title?: string;
  service_case_id?: string | null;
}

type Row = { key: string; id?: string; employee_id: string; day: string; hours: string };

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

/** Novi nalog ili uređivanje: objekt, uređaji, vrsta, opis i dodjele (tehničar · dan · sati). */
export function OrderFormDialog({ order, preset, onClose, onSaved }: {
  order?: OrderDetail | null;
  preset?: OrderPreset;
  onClose: () => void;
  /** Nakon spremanja: prvi dan dodjele (npr. da raspored prijeđe na taj tjedan) */
  onSaved?: (firstDay?: string) => void;
}) {
  const save = useSaveOrder();
  const dir = useClientDirectory();
  const { activeStaff } = useStaffDirectory();
  const devLabel = useId();
  const isEdit = !!order;

  const initialKind: WorkOrderKind = order?.kind ?? preset?.kind ?? 'servis';
  const [kind, setKind] = useState<WorkOrderKind>(initialKind);
  const [site, setSite] = useState<string>(() =>
    order ? (order.site_id ?? OFFICE_SITE) : preset?.site_id === null ? OFFICE_SITE : preset?.site_id ?? '');
  const [devices, setDevices] = useState<string[]>(order?.work_order_devices.map(d => d.device_id) ?? preset?.device_ids ?? []);
  const [title, setTitle] = useState(order?.title ?? preset?.title ?? KIND_DEFAULTS[initialKind].title);
  const [titleTouched, setTitleTouched] = useState(!!order || !!preset?.title);
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [estimate, setEstimate] = useState(hoursToInput(Number(order?.estimate_hours ?? KIND_DEFAULTS[initialKind].hours)));
  const [price, setPrice] = useState(moneyToInput(order?.price));
  const [rows, setRows] = useState<Row[]>(() => {
    if (order) return [...order.work_order_assignments]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(a => ({ key: newKey(), id: a.id, employee_id: a.employee_id, day: a.day, hours: hoursToInput(Number(a.planned_hours)) }));
    if (preset?.employee_id || preset?.day) {
      return [{ key: newKey(), employee_id: preset.employee_id ?? '', day: preset.day ?? todayISO(), hours: String(KIND_DEFAULTS[initialKind].hours) }];
    }
    return [];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Zauzeće drugih naloga za dane u formi (upozorenje kapaciteta)
  const days = rows.map(r => r.day).filter(Boolean).sort();
  const { data: plan } = usePlan(days[0] ?? '', days[days.length - 1] ?? '', days.length > 0);
  const otherLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of plan ?? []) {
      if (order && a.work_order_id === order.id) continue;
      const k = `${a.employee_id}|${a.day}`;
      m.set(k, (m.get(k) ?? 0) + Number(a.planned_hours));
    }
    return m;
  }, [plan, order]);

  const chooseKind = (k: WorkOrderKind) => {
    setKind(k);
    if (!titleTouched) setTitle(KIND_DEFAULTS[k].title);
  };

  const updateRow = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => {
    const last = rs[rs.length - 1];
    const used = new Set(rs.filter(r => r.day === last?.day).map(r => r.employee_id));
    const next = activeStaff.find(e => !used.has(e.id));
    return [...rs, { key: newKey(), employee_id: next?.id ?? '', day: last?.day ?? todayISO(), hours: last?.hours ?? estimate }];
  });

  const realSite = site && site !== OFFICE_SITE ? site : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 2) errs.title = 'Upišite kratki opis posla';
    if (!site) errs.site = 'Odaberite objekt ili „Ured / ostalo”';
    const est = parseHours(estimate);
    if (rows.length === 0 && (est === null || est <= 0)) errs.estimate = 'Upišite procjenu, npr. 2 ili 1,5';
    const priceValue = parseMoney(price);
    if (priceValue !== null && (Number.isNaN(priceValue) || priceValue < 0 || priceValue >= 1e8)) errs.price = 'Upišite iznos u eurima, npr. 450 ili 1.250,50';
    const parsed = rows.map(r => {
      const h = parseHours(r.hours);
      if (!r.employee_id) errs[`${r.key}-emp`] = 'Odaberite tehničara';
      if (!r.day) errs[`${r.key}-day`] = 'Odaberite dan';
      if (h === null || h <= 0 || h > 24) errs[`${r.key}-h`] = 'Između 15 min i 24 h';
      return { id: r.id, employee_id: r.employee_id, day: r.day, planned_hours: h ?? 0 };
    });
    const dup = new Set<string>();
    for (const r of rows) {
      const k = `${r.employee_id}|${r.day}`;
      if (dup.has(k)) errs[`${r.key}-emp`] = 'Ovaj tehničar već ima taj dan u nalogu';
      dup.add(k);
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      await save.mutateAsync({
        id: order?.id,
        site_id: realSite,
        kind,
        title: title.trim(),
        notes,
        estimate_hours: rows.length ? parsed[0].planned_hours : est!,
        price: priceValue,
        service_case_id: order?.service_case_id ?? preset?.service_case_id ?? null,
        device_ids: realSite ? devices : [],
        assignments: parsed,
      });
      toast.success(isEdit ? 'Nalog spremljen' : rows.length ? 'Nalog dodan u raspored' : 'Nalog dodan na čekanje');
      onClose();
      onSaved?.([...parsed].map(a => a.day).sort()[0]);
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={isEdit ? 'Uredi nalog' : 'Novi nalog'} className="sm:max-w-xl">
      <form onSubmit={submit} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <div role="radiogroup" aria-label="Vrsta posla" className="flex flex-wrap gap-1.5">
          {KINDS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => chooseKind(k)}
              className={cn('inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-3 text-sm font-medium rounded-lg border',
                kind === k ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}>
              <KindIcon kind={k} size={14} /> {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <Field label="Objekt" required error={errors.site}>
          {p => (
            <SitePicker {...p} value={site} onChange={v => { setSite(v); setDevices([]); }} onBlur={() => {}} recentSiteIds={[]} />
          )}
        </Field>

        {realSite && dir.siteIndex.has(realSite) && (
          <div>
            <p id={devLabel} className="text-sm font-medium text-slate-700 mb-1">Uređaji <span className="font-normal text-slate-500">(neobavezno)</span></p>
            <DevicePicker siteId={realSite} value={devices} onChange={setDevices} labelId={devLabel} />
          </div>
        )}

        <Field label="Što treba napraviti" required error={errors.title}>
          {p => (
            <input {...p} value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }}
              placeholder="npr. Montaža 2× split, Daikin" className={inputClass(!!errors.title)} />
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 mb-1">Tko i kada</legend>
          {rows.length === 0 && (
            <p className="text-xs text-slate-600 -mt-1">Bez dodjele nalog ide na čekanje i možete ga kasnije povući u raspored.</p>
          )}
          {rows.map((r, i) => {
            const h = parseHours(r.hours) ?? 0;
            const sameRows = rows.filter(x => x.employee_id === r.employee_id && x.day === r.day).reduce((s, x) => s + (parseHours(x.hours) ?? 0), 0);
            const other = otherLoad.get(`${r.employee_id}|${r.day}`) ?? 0;
            const total = other + sameRows;
            const name = activeStaff.find(e => e.id === r.employee_id)?.full_name.split(' ')[0];
            return (
              <div key={r.key} role="group" aria-label={`Dodjela ${i + 1}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                  <Field label="Tehničar" error={errors[`${r.key}-emp`]}>
                    {p => (
                      <select {...p} value={r.employee_id} onChange={e => updateRow(r.key, { employee_id: e.target.value })}
                        className={inputClass(!!errors[`${r.key}-emp`])}>
                        <option value="">Odaberite…</option>
                        {activeStaff.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Dan" error={errors[`${r.key}-day`]}>
                    {p => <DatePicker {...p} value={r.day} onChange={v => updateRow(r.key, { day: v })} />}
                  </Field>
                  <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                    className="sm:mt-6 justify-self-end p-2.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                    aria-label={`Ukloni dodjelu ${i + 1}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <Field label="Procjena sati" error={errors[`${r.key}-h`]}>
                  {p => (
                    <div className="flex flex-wrap gap-2">
                      <input {...p} value={r.hours} onChange={e => updateRow(r.key, { hours: e.target.value })} inputMode="decimal"
                        className={inputClass(!!errors[`${r.key}-h`], 'w-20 flex-none text-right tabular-nums')} />
                      <div className="flex gap-1.5 flex-1" role="group" aria-label={`Brzi odabir sati, dodjela ${i + 1}`}>
                        {QUICK.map(q => (
                          <button key={q} type="button" aria-pressed={h === q} onClick={() => updateRow(r.key, { hours: String(q) })}
                            className={cn('flex-1 min-h-10 sm:min-h-9 text-sm font-medium rounded-lg border',
                              h === q ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}>
                            {q} h
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Field>
                {r.employee_id && r.day && total > DAY_CAPACITY && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" role="status">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {name} {formatWeekday(r.day)} {other > 0 ? `već ima ${formatHours(other)} → ukupno ` : 'ima '}
                    {formatHours(total)}, više od {DAY_CAPACITY} h.
                  </p>
                )}
              </div>
            );
          })}
          <button type="button" onClick={addRow}
            className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-blue-700 border border-dashed border-blue-300 hover:bg-blue-50 rounded-xl">
            <Plus size={15} aria-hidden="true" /> {rows.length === 0 ? 'Dodijeli tehničaru' : 'Dodaj tehničara ili dan'}
          </button>
          {rows.length === 0 && (
            <Field label="Procjena sati" error={errors.estimate} hint="Koristi se kad nalog povučete u raspored.">
              {p => <input {...p} value={estimate} onChange={e => setEstimate(e.target.value)} inputMode="decimal"
                className={inputClass(!!errors.estimate, 'w-24 text-right tabular-nums')} />}
            </Field>
          )}
        </fieldset>

        <Field label="Cijena posla" optional error={errors.price} hint="Dogovoreni iznos u eurima. Ostavite prazno ako još nije poznat.">
          {p => (
            <div className="relative w-40">
              <input {...p} value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="npr. 450"
                className={inputClass(!!errors.price, 'pr-8 text-right tabular-nums')} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">€</span>
            </div>
          )}
        </Field>

        <Field label="Napomena za tehničara" optional>
          {p => <textarea {...p} value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="npr. ključ na porti, nazvati prije dolaska" className={inputClass(false, 'resize-none')} />}
        </Field>

        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions onCancel={onClose} isPending={save.isPending}
          submitLabel={isEdit ? 'Spremi nalog' : rows.length ? 'Dodaj u raspored' : 'Spremi na čekanje'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
