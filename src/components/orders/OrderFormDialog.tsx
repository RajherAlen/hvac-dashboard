import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { useClientDirectory } from '../../hooks/useClients';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { usePlan, useSaveOrder, type OrderDetail } from '../../hooks/useWorkOrders';
import { crewActiveOn, crewWithMembers, useCrews, useSaveCrew } from '../../hooks/useCrews';
import { useWorkCalendar } from '../../hooks/useAbsences';
import { ABSENCE_LABEL } from '../../lib/workCalendar';
import { employeeColorMap } from '../../lib/colors';
import { PersonAvatar } from '../crews/PersonAvatar';
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
  /** Nalog se dodjeljuje ekipi (npr. „+” u redu ekipe u rasporedu) */
  crew_id?: string;
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

  // Dodjela ekipi: jedan dan, isti sati svima, članovi se mogu isključiti
  const crewsQ = useCrews();
  const saveCrew = useSaveCrew();
  const crews = crewsQ.data ?? [];
  const [mode, setMode] = useState<'people' | 'crew'>(!order && preset?.crew_id ? 'crew' : 'people');
  const [crewId, setCrewId] = useState(preset?.crew_id ?? '');
  const [crewDay, setCrewDay] = useState(preset?.day ?? todayISO());
  const [crewHours, setCrewHours] = useState(String(KIND_DEFAULTS[initialKind].hours));
  const [memberOverride, setMemberOverride] = useState<Map<string, boolean>>(new Map());
  const { cal } = useWorkCalendar(crewDay, crewDay);
  const crew = crews.find(c => c.id === crewId) ?? null;
  const crewOptions = crews.filter(c => crewActiveOn(c, crewDay) || c.id === crewId);
  const memberChecked = (id: string) => memberOverride.get(id) ?? !cal.absenceOf(id, crewDay);
  const crewMembers = crew ? crew.members.filter(memberChecked) : [];
  const staffColors = useMemo(() => employeeColorMap(activeStaff), [activeStaff]);
  const nameOf = (id: string) => activeStaff.find(e => e.id === id)?.full_name ?? '—';

  // „Spremi kao ekipu?” kad su ručno odabrana barem dva tehničara koja još nisu ekipa
  const pickedPeople = [...new Set(rows.map(r => r.employee_id).filter(Boolean))];
  const offerCrew = mode === 'people' && crewsQ.data != null && pickedPeople.length >= 2 && !crewWithMembers(crews, pickedPeople);
  const [saveAsCrew, setSaveAsCrew] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');

  // Zauzeće drugih naloga za dane u formi (upozorenje kapaciteta)
  const days = (mode === 'crew' ? [crewDay] : rows.map(r => r.day)).filter(Boolean).sort();
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
    let parsed: { id?: string; employee_id: string; day: string; planned_hours: number }[];
    if (mode === 'crew') {
      const h = parseHours(crewHours);
      if (!crew) errs.crew = 'Odaberite ekipu';
      else if (crewMembers.length === 0) errs.crew = 'Uključite barem jednog člana';
      if (!crewDay) errs.crewDay = 'Odaberite dan';
      if (h === null || h <= 0 || h > 24) errs.crewHours = 'Između 15 min i 24 h';
      parsed = crewMembers.map(employee_id => ({ employee_id, day: crewDay, planned_hours: h ?? 0 }));
    } else {
      parsed = rows.map(r => {
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
      if (offerCrew && saveAsCrew && newCrewName.trim().length < 2) errs.newCrew = 'Upišite naziv ekipe';
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
        estimate_hours: parsed.length ? parsed[0].planned_hours : est!,
        price: priceValue,
        service_case_id: order?.service_case_id ?? preset?.service_case_id ?? null,
        device_ids: realSite ? devices : [],
        assignments: parsed,
      });
      toast.success(isEdit ? 'Nalog spremljen' : parsed.length ? 'Nalog dodan u raspored' : 'Nalog dodan na čekanje');
      if (offerCrew && saveAsCrew) {
        // Prije zatvaranja: povratni pozivi mutate() ne stižu nakon što se dijalog ukloni
        try {
          await saveCrew.mutateAsync({ name: newCrewName.trim(), lead_id: null, vehicle: '', valid_until: null, members: pickedPeople });
          toast.success('Ekipa spremljena', { description: newCrewName.trim() });
        } catch (err) {
          toast.error(`Nalog je spremljen, ali ekipa nije: ${errorMessage(err)}`);
        }
      }
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
          {!isEdit && crewsQ.data != null && crews.length > 0 && (
            <div role="radiogroup" aria-label="Način dodjele" className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              {([['crew', 'Ekipi'], ['people', 'Pojedincima']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                  className={cn('min-h-10 sm:min-h-9 text-sm font-medium rounded-md',
                    mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {mode === 'crew' ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
                <Field label="Ekipa" error={errors.crew}>
                  {p => (
                    <select {...p} value={crewId} onChange={e => { setCrewId(e.target.value); setMemberOverride(new Map()); }}
                      className={inputClass(!!errors.crew)}>
                      <option value="">Odaberite…</option>
                      {crewOptions.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {c.members.map(m => nameOf(m).split(' ')[0]).join(', ')}</option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Dan" error={errors.crewDay}>
                  {p => <DatePicker {...p} value={crewDay} onChange={v => { setCrewDay(v); setMemberOverride(new Map()); }} />}
                </Field>
              </div>
              {crew && (
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 mb-1">Članovi na ovom nalogu</legend>
                  <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {crew.members.map(id => {
                      const away = cal.absenceOf(id, crewDay);
                      const load = otherLoad.get(`${id}|${crewDay}`) ?? 0;
                      return (
                        <li key={id}>
                          <label className="flex items-center gap-3 px-3 min-h-11 cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={memberChecked(id)} className="w-4 h-4 accent-blue-600"
                              onChange={e => setMemberOverride(m => new Map(m).set(id, e.target.checked))} />
                            <PersonAvatar name={nameOf(id)} color={staffColors[id]} size="sm" faded={!!away} />
                            <span className="text-sm text-slate-900">
                              {nameOf(id)}
                              {crew.lead_id === id && <span className="ml-1.5 text-[11px] font-semibold text-blue-800 bg-blue-50 rounded px-1.5">voditelj</span>}
                            </span>
                            <span className={cn('ml-auto text-xs tabular-nums', away ? 'text-violet-800 font-medium' : 'text-slate-600')}>
                              {away ? ABSENCE_LABEL[away.kind] : `već ${formatHours(load)}`}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              <Field label="Procjena sati (svakom članu)" error={errors.crewHours}>
                {p => (
                  <div className="flex flex-wrap gap-2">
                    <input {...p} value={crewHours} onChange={e => setCrewHours(e.target.value)} inputMode="decimal"
                      className={inputClass(!!errors.crewHours, 'w-20 flex-none text-right tabular-nums')} />
                    <div className="flex gap-1.5 flex-1" role="group" aria-label="Brzi odabir sati">
                      {QUICK.map(q => (
                        <button key={q} type="button" aria-pressed={parseHours(crewHours) === q} onClick={() => setCrewHours(String(q))}
                          className={cn('flex-1 min-h-10 sm:min-h-9 text-sm font-medium rounded-lg border',
                            parseHours(crewHours) === q ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}>
                          {q} h
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Field>
              {crew && crewMembers.length > 0 && (parseHours(crewHours) ?? 0) > 0 && (
                <p className="text-xs text-slate-700">
                  Jedan nalog, {formatHours(parseHours(crewHours)!)}. Svakom od {crewMembers.length} {crewMembers.length === 1 ? 'člana' : 'članova'} upisuje se
                  {' '}{formatHours(parseHours(crewHours)!)} u kapacitet (ukupno {formatHours(parseHours(crewHours)! * crewMembers.length)} rada).
                </p>
              )}
            </div>
          ) : <>
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
          {offerCrew && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
              <label className="flex items-center gap-2.5 text-sm text-slate-900 cursor-pointer min-h-9">
                <input type="checkbox" checked={saveAsCrew} onChange={e => setSaveAsCrew(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                Spremi ove tehničare kao ekipu ({pickedPeople.map(id => nameOf(id).split(' ')[0]).join(', ')})
              </label>
              {saveAsCrew && (
                <Field label="Naziv ekipe" error={errors.newCrew}>
                  {p => <input {...p} value={newCrewName} onChange={e => setNewCrewName(e.target.value)} placeholder="npr. Ekipa 2"
                    className={inputClass(!!errors.newCrew)} />}
                </Field>
              )}
            </div>
          )}
          </>}
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
          submitLabel={isEdit ? 'Spremi nalog' : mode === 'crew' ? 'Dodijeli ekipi' : rows.length ? 'Dodaj u raspored' : 'Spremi na čekanje'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
