import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSaveCrew, useVehicles, useAddVehicle, type Crew } from '../../hooks/useCrews';

const ADD_VEHICLE = '__add__';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { employeeColorMap } from '../../lib/colors';
import { errorMessage } from '../../lib/errors';
import { cn, todayISO } from '../../lib/utils';
import { Dialog } from '../ui/Dialog';
import { DatePicker } from '../ui/DatePicker';
import { Field, FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { PersonAvatar } from './PersonAvatar';

/** Nova ekipa ili uređivanje: naziv, članovi, voditelj, vozilo, stalna ili privremena. */
export function CrewFormDialog({ crew, initialMembers, onClose, onSaved }: {
  crew?: Crew | null;
  /** Predlošci članova (npr. iz naloga „Spremi kao ekipu”) */
  initialMembers?: string[];
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const save = useSaveCrew();
  const directory = useStaffDirectory();
  const membersLabel = useId();
  const kindLabel = useId();
  const staff = useMemo(() => {
    const all = directory.entries.filter(e => !e.isAdmin).map(e => e.emp);
    const active = new Set(directory.activeStaff.map(e => e.id));
    const keep = new Set(crew?.members ?? []);
    return all.filter(e => active.has(e.id) || keep.has(e.id));
  }, [directory.entries, directory.activeStaff, crew]);
  const colors = useMemo(() => employeeColorMap(directory.entries.filter(e => !e.isAdmin).map(e => e.emp)), [directory.entries]);

  const [name, setName] = useState(crew?.name ?? '');
  const [members, setMembers] = useState<string[]>(crew?.members ?? initialMembers ?? []);
  const [lead, setLead] = useState<string>(crew?.lead_id ?? '');
  const [vehicle, setVehicle] = useState(crew?.vehicle ?? '');
  const vehiclesQ = useVehicles();
  const addVehicle = useAddVehicle();
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState('');
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  // Popis + trenutno vozilo ekipe ako (još) nije na popisu
  const vehicleOptions = useMemo(() => {
    const names = (vehiclesQ.data ?? []).map(v => v.name);
    const cur = vehicle.trim();
    return cur && !names.some(n => n.toLowerCase() === cur.toLowerCase()) ? [cur, ...names] : names;
  }, [vehiclesQ.data, vehicle]);
  const addVehicleNow = async () => {
    const n = newVehicle.trim();
    if (n.length < 2) { setVehicleError('Upišite naziv vozila'); return; }
    const existing = (vehiclesQ.data ?? []).find(v => v.name.toLowerCase() === n.toLowerCase());
    if (existing) { setVehicle(existing.name); setAddingVehicle(false); return; }
    try {
      const v = await addVehicle.mutateAsync(n);
      setVehicle(v.name);
      setAddingVehicle(false);
      toast.success('Vozilo dodano na popis');
    } catch (err) {
      setVehicleError(errorMessage(err));
    }
  };
  const [temporary, setTemporary] = useState(!!crew?.valid_until);
  const [until, setUntil] = useState(crew?.valid_until ?? todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggle = (id: string) => setMembers(ms => {
    const next = ms.includes(id) ? ms.filter(m => m !== id) : [...ms, id];
    if (!next.includes(lead)) setLead('');
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Upišite naziv, npr. Ekipa 1';
    if (members.length < 2) errs.members = 'Odaberite barem dva člana';
    if (temporary && !until) errs.until = 'Odaberite do kada ekipa vrijedi';
    if (temporary && until && until < todayISO()) errs.until = 'Datum je već prošao';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const id = await save.mutateAsync({
        id: crew?.id, name: name.trim(), lead_id: lead || null, vehicle: vehicle.trim(),
        valid_until: temporary ? until : null, members,
      });
      toast.success(crew ? 'Ekipa spremljena' : 'Ekipa dodana', { description: name.trim() });
      onSaved?.(id);
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={crew ? 'Uredi ekipu' : 'Nova ekipa'} className="sm:max-w-lg">
      <form onSubmit={submit} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <Field label="Naziv" required error={errors.name}>
          {p => <input {...p} value={name} onChange={e => setName(e.target.value)} placeholder="npr. Ekipa 1, Montaža Osijek"
            className={inputClass(!!errors.name)} />}
        </Field>

        <fieldset aria-describedby={errors.members ? `${membersLabel}-err` : undefined}>
          <legend id={membersLabel} className="text-sm font-medium text-slate-700 mb-1">
            Članovi <span className="text-red-600" aria-hidden="true">*</span>
          </legend>
          <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {staff.map(e => {
              const checked = members.includes(e.id);
              return (
                <li key={e.id}>
                  <label className="flex items-center gap-3 px-3 min-h-11 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} className="w-4 h-4 accent-blue-600" />
                    <PersonAvatar name={e.full_name} color={colors[e.id]} />
                    <span className="text-sm text-slate-900">{e.full_name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {errors.members && <p id={`${membersLabel}-err`} role="alert" className="mt-1 text-xs font-medium text-red-600">{errors.members}</p>}
        </fieldset>

        <Field label="Voditelj" optional>
          {p => (
            <select {...p} value={lead} onChange={e => setLead(e.target.value)} className={inputClass(false)} disabled={members.length === 0}>
              <option value="">Bez voditelja</option>
              {staff.filter(e => members.includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          )}
        </Field>

        {vehiclesQ.data == null ? (
          <Field label="Vozilo" optional>
            {p => <input {...p} value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="npr. Kombi OS-123-AB" className={inputClass(false)} />}
          </Field>
        ) : addingVehicle ? (
          <Field label="Novo vozilo" error={vehicleError ?? undefined} hint="Vozilo ostaje na popisu za sve ekipe.">
            {p => (
              <div className="flex gap-2">
                <input {...p} value={newVehicle} autoFocus maxLength={60} placeholder="npr. Kombi OS-123-AB"
                  onChange={e => { setNewVehicle(e.target.value); setVehicleError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addVehicleNow(); } if (e.key === 'Escape') { e.stopPropagation(); setAddingVehicle(false); } }}
                  className={inputClass(!!vehicleError, 'flex-1 min-w-0')} />
                <button type="button" onClick={() => void addVehicleNow()} disabled={addVehicle.isPending}
                  className="shrink-0 min-h-10 sm:min-h-9 px-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
                  Dodaj
                </button>
                <button type="button" onClick={() => { setAddingVehicle(false); setVehicleError(null); }}
                  className="shrink-0 min-h-10 sm:min-h-9 px-3 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg">
                  Odustani
                </button>
              </div>
            )}
          </Field>
        ) : (
          <Field label="Vozilo" optional>
            {p => (
              <select {...p} value={vehicle}
                onChange={e => { if (e.target.value === ADD_VEHICLE) { setNewVehicle(''); setAddingVehicle(true); } else setVehicle(e.target.value); }}
                className={inputClass(false)}>
                <option value="">Bez vozila</option>
                {vehicleOptions.map(v => <option key={v} value={v}>{v}</option>)}
                <option value={ADD_VEHICLE}>+ Dodaj vozilo…</option>
              </select>
            )}
          </Field>
        )}

        <div>
          <p id={kindLabel} className="text-sm font-medium text-slate-700 mb-1">Trajanje</p>
          <div role="radiogroup" aria-labelledby={kindLabel} className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            {[{ v: false, l: 'Stalna' }, { v: true, l: 'Privremena' }].map(o => (
              <button key={o.l} type="button" role="radio" aria-checked={temporary === o.v} onClick={() => setTemporary(o.v)}
                className={cn('min-h-10 sm:min-h-9 text-sm font-medium rounded-md',
                  temporary === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                {o.l}
              </button>
            ))}
          </div>
          {temporary && (
            <Field label="Vrijedi do (uključivo)" error={errors.until} className="mt-3">
              {p => <DatePicker {...p} value={until} onChange={setUntil} />}
            </Field>
          )}
        </div>

        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions onCancel={onClose} isPending={save.isPending} submitLabel={crew ? 'Spremi ekipu' : 'Dodaj ekipu'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
