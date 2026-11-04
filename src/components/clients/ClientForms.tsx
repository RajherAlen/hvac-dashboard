import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog } from '../ui/Dialog';
import { Field, FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { DatePicker } from '../ui/DatePicker';
import { useSaveClient, useSaveSite, useSaveDevice } from '../../hooks/useClients';
import { errorMessage } from '../../lib/errors';
import { DEVICE_KIND_LABEL } from '../../lib/clients';
import { cn } from '../../lib/utils';
import type { Client, Site, Device, DeviceKind } from '../../types';

const opt = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

// ─── Klijent (+ prvi objekt kod kreiranja) ───────────────────────────────────

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Upišite ime ili naziv tvrtke'),
  kind: z.enum(['private', 'company']),
  phone: z.string().optional(),
  email: z.string().trim().email('Neispravna e-mail adresa').or(z.literal('')).optional(),
  oib: z.string().trim().regex(/^(\d{11})?$/, 'OIB ima 11 znamenki').optional(),
  notes: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});
type ClientValues = z.infer<typeof clientSchema>;

export function ClientFormDialog({ client, onClose, onCreated }: {
  client?: Client;
  onClose: () => void;
  onCreated?: (clientId: string) => void;
}) {
  const save = useSaveClient();
  const saveSite = useSaveSite();
  const isEdit = !!client;
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    mode: 'onTouched',
    defaultValues: {
      name: client?.name ?? '', kind: client?.kind ?? 'private', phone: client?.phone ?? '',
      email: client?.email ?? '', oib: client?.oib ?? '', notes: client?.notes ?? '', address: '', city: '',
    },
  });
  const kind = useWatch({ control, name: 'kind' });

  const onSubmit = async (v: ClientValues) => {
    if (!isEdit && (!v.address || v.address.trim().length < 2)) {
      setError('address', { message: 'Upišite adresu prvog objekta' });
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: client?.id,
        values: { name: v.name.trim(), kind: v.kind, phone: opt(v.phone), email: opt(v.email), oib: opt(v.oib), notes: opt(v.notes) },
      });
      if (!isEdit) {
        await saveSite.mutateAsync({ values: { client_id: saved.id, address: v.address!.trim(), city: opt(v.city) } });
        toast.success('Klijent dodan');
        onCreated?.(saved.id);
      } else {
        toast.success('Promjene spremljene');
      }
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={isEdit ? 'Uredi klijenta' : 'Novi klijent'}>
      <form onSubmit={e => { e.stopPropagation(); void handleSubmit(onSubmit)(e); }} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-1">Vrsta</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['private', 'company'] as const).map(k => (
              <label key={k} className={cn(
                'min-h-11 flex items-center justify-center rounded-lg border text-sm font-medium cursor-pointer',
                kind === k ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50',
              )}>
                <input type="radio" value={k} {...register('kind')} className="sr-only" />
                {k === 'private' ? 'Privatna osoba' : 'Tvrtka'}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={kind === 'company' ? 'Naziv tvrtke' : 'Ime i prezime'} required error={errors.name?.message}>
          {p => <input {...p} {...register('name')} required autoComplete="off" className={inputClass(!!errors.name)}
            placeholder={kind === 'company' ? 'npr. Horvat d.o.o.' : 'npr. Ana Kovač'} />}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefon" optional>
            {p => <input {...p} {...register('phone')} type="tel" inputMode="tel" className={inputClass(false)} placeholder="091 234 5678" />}
          </Field>
          <Field label="E-mail" optional error={errors.email?.message}>
            {p => <input {...p} {...register('email')} type="email" inputMode="email" className={inputClass(!!errors.email)} />}
          </Field>
        </div>
        {kind === 'company' && (
          <Field label="OIB" optional error={errors.oib?.message}>
            {p => <input {...p} {...register('oib')} inputMode="numeric" maxLength={11} className={inputClass(!!errors.oib, 'tabular-nums')} />}
          </Field>
        )}

        {!isEdit && (
          <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Prvi objekt</legend>
            <p className="-mt-1 text-xs text-slate-600">Uređaje na ovoj adresi (klime, plamenike) dodajete odmah nakon spremanja.</p>
            <Field label="Adresa" required error={errors.address?.message}>
              {p => <input {...p} {...register('address')} required className={inputClass(!!errors.address)} placeholder="npr. Ilica 34" />}
            </Field>
            <Field label="Mjesto" optional>
              {p => <input {...p} {...register('city')} className={inputClass(false)} placeholder="npr. Zagreb" />}
            </Field>
          </fieldset>
        )}

        <Field label="Napomene" optional>
          {p => <textarea {...p} {...register('notes')} rows={2} className={inputClass(false, 'resize-none')} />}
        </Field>

        <FormError message={save.error || saveSite.error ? errorMessage(save.error || saveSite.error) : null} />
        <FormActions onCancel={onClose} isPending={isSubmitting} submitLabel={isEdit ? 'Spremi promjene' : 'Dodaj klijenta'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}

// ─── Objekt ─────────────────────────────────────────────────────────────────

const siteSchema = z.object({
  address: z.string().trim().min(2, 'Upišite adresu'),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  label: z.string().optional(),
  access_notes: z.string().optional(),
});
type SiteValues = z.infer<typeof siteSchema>;

export function SiteFormDialog({ clientId, site, onClose }: { clientId: string; site?: Site; onClose: () => void }) {
  const save = useSaveSite();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SiteValues>({
    resolver: zodResolver(siteSchema),
    mode: 'onTouched',
    defaultValues: {
      address: site?.address ?? '', city: site?.city ?? '', postal_code: site?.postal_code ?? '',
      label: site?.label ?? '', access_notes: site?.access_notes ?? '',
    },
  });

  const onSubmit = async (v: SiteValues) => {
    try {
      await save.mutateAsync({
        id: site?.id,
        values: {
          client_id: clientId, address: v.address.trim(), city: opt(v.city), postal_code: opt(v.postal_code),
          label: opt(v.label), access_notes: opt(v.access_notes),
        },
      });
      toast.success(site ? 'Promjene spremljene' : 'Objekt dodan');
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={site ? 'Uredi objekt' : 'Novi objekt'}>
      <form onSubmit={e => { e.stopPropagation(); void handleSubmit(onSubmit)(e); }} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <Field label="Adresa" required error={errors.address?.message}>
          {p => <input {...p} {...register('address')} required className={inputClass(!!errors.address)} placeholder="npr. Ilica 34" />}
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Mjesto" optional>
            {p => <input {...p} {...register('city')} className={inputClass(false)} />}
          </Field>
          <Field label="Pošt. broj">
            {p => <input {...p} {...register('postal_code')} inputMode="numeric" className={inputClass(false, 'tabular-nums')} />}
          </Field>
        </div>
        <Field label="Naziv objekta" optional hint="Kad klijent ima više objekata, npr. „Kuća”, „Hala 2”, „Vikendica”.">
          {p => <input {...p} {...register('label')} className={inputClass(false)} />}
        </Field>
        <Field label="Pristup" optional hint="Šifra ulaza, gdje je ključ, kome se javiti.">
          {p => <textarea {...p} {...register('access_notes')} rows={2} className={inputClass(false, 'resize-none')} />}
        </Field>
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions onCancel={onClose} isPending={isSubmitting} submitLabel={site ? 'Spremi promjene' : 'Dodaj objekt'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}

// ─── Uređaj ─────────────────────────────────────────────────────────────────

const deviceSchema = z.object({
  kind: z.enum(['split', 'multisplit', 'vrf', 'toplinska_pumpa', 'kotao', 'plamenik', 'ventilacija', 'ostalo']),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  placement: z.string().optional(),
  install_date: z.string().optional(),
  warranty_until: z.string().optional(),
  refrigerant: z.string().optional(),
  capacity_kw: z.string().trim().regex(/^(\d{1,3}([.,]\d{1,2})?)?$/, 'Npr. 3,5').optional(),
  service_interval_months: z.coerce.number().int().min(1, 'Najmanje 1 mjesec').max(120),
  notes: z.string().optional(),
});
type DeviceValues = z.input<typeof deviceSchema>;

const BRANDS = ['Daikin', 'Mitsubishi Electric', 'Toshiba', 'Panasonic', 'LG', 'Samsung', 'Gree', 'Midea', 'Vivax', 'Fujitsu', 'Viessmann', 'Vaillant'];
const REFRIGERANTS = ['R32', 'R410A', 'R290', 'R134a', 'R407C'];

export function DeviceFormDialog({ siteId, device, onClose }: { siteId: string; device?: Device; onClose: () => void }) {
  const save = useSaveDevice();
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<DeviceValues>({
    resolver: zodResolver(deviceSchema),
    mode: 'onTouched',
    defaultValues: {
      kind: device?.kind ?? 'split', brand: device?.brand ?? '', model: device?.model ?? '',
      serial_number: device?.serial_number ?? '', placement: device?.placement ?? '',
      install_date: device?.install_date ?? '', warranty_until: device?.warranty_until ?? '',
      refrigerant: device?.refrigerant ?? '', capacity_kw: device?.capacity_kw != null ? String(device.capacity_kw).replace('.', ',') : '',
      service_interval_months: device?.service_interval_months ?? 12, notes: device?.notes ?? '',
    },
  });

  const onSubmit = async (raw: DeviceValues) => {
    const v = deviceSchema.parse(raw);
    try {
      await save.mutateAsync({
        id: device?.id,
        values: {
          site_id: siteId, kind: v.kind as DeviceKind, brand: opt(v.brand), model: opt(v.model),
          serial_number: opt(v.serial_number)?.toUpperCase() ?? null, placement: opt(v.placement),
          install_date: opt(v.install_date), warranty_until: opt(v.warranty_until), refrigerant: opt(v.refrigerant),
          capacity_kw: v.capacity_kw ? Number(v.capacity_kw.replace(',', '.')) : null,
          service_interval_months: v.service_interval_months, notes: opt(v.notes),
        },
      });
      toast.success(device ? 'Promjene spremljene' : 'Uređaj dodan');
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={device ? 'Uredi uređaj' : 'Novi uređaj'} className="sm:max-w-lg">
      <form onSubmit={e => { e.stopPropagation(); void handleSubmit(onSubmit)(e); }} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <datalist id="hvac-brands">{BRANDS.map(b => <option key={b} value={b} />)}</datalist>
        <datalist id="hvac-refrigerants">{REFRIGERANTS.map(b => <option key={b} value={b} />)}</datalist>

        <Field label="Vrsta uređaja" required>
          {p => (
            <select {...p} {...register('kind')} className={inputClass(false)}>
              {Object.entries(DEVICE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Proizvođač" optional>
            {p => <input {...p} {...register('brand')} list="hvac-brands" autoComplete="off" className={inputClass(false)} />}
          </Field>
          <Field label="Model" optional>
            {p => <input {...p} {...register('model')} autoComplete="off" className={inputClass(false)} placeholder="npr. FTXM35R" />}
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Serijski broj" optional hint="Prepišite s natpisne pločice uređaja.">
            {p => <input {...p} {...register('serial_number')} autoComplete="off" autoCapitalize="characters"
              className={inputClass(false, 'font-mono uppercase')} />}
          </Field>
          <Field label="Gdje se nalazi" optional>
            {p => <input {...p} {...register('placement')} className={inputClass(false)} placeholder="npr. dnevni boravak" />}
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Datum ugradnje" optional>
            {p => <Controller control={control} name="install_date"
              render={({ field }) => <DatePicker {...p} value={field.value ?? ''} onChange={field.onChange} />} />}
          </Field>
          <Field label="Jamstvo do" optional>
            {p => <Controller control={control} name="warranty_until"
              render={({ field }) => <DatePicker {...p} value={field.value ?? ''} onChange={field.onChange} max="2100-12-31" />} />}
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Medij">
            {p => <input {...p} {...register('refrigerant')} list="hvac-refrigerants" className={inputClass(false)} />}
          </Field>
          <Field label="Snaga (kW)" error={errors.capacity_kw?.message}>
            {p => <input {...p} {...register('capacity_kw')} inputMode="decimal" className={inputClass(!!errors.capacity_kw, 'tabular-nums')} />}
          </Field>
          <Field label="Servis (mj.)" error={errors.service_interval_months?.message}>
            {p => <input {...p} {...register('service_interval_months')} type="number" min={1} max={120} inputMode="numeric"
              className={inputClass(!!errors.service_interval_months, 'tabular-nums')} />}
          </Field>
        </div>
        <Field label="Napomene" optional>
          {p => <textarea {...p} {...register('notes')} rows={2} className={inputClass(false, 'resize-none')} />}
        </Field>
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <FormActions onCancel={onClose} isPending={isSubmitting} submitLabel={device ? 'Spremi promjene' : 'Dodaj uređaj'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
