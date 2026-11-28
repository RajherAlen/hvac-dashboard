import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Phone, Wind } from 'lucide-react';
import { useSubmitServiceRequest, type PublicRequestInput } from '../../hooks/useServiceRequests';
import { PUBLIC_DEVICE_OPTIONS, REQUEST_KIND_LABEL } from '../../lib/requests';
import { errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import type { RequestKind } from '../../types';
import { Field, FormError, Spinner } from '../../components/ui/form';
import { inputClass } from '../../components/ui/styles';

/** Naziv i telefon tvrtke na formi (neobavezno, iz .env). */
const COMPANY_NAME = (import.meta.env.VITE_COMPANY_NAME as string | undefined)?.trim() || 'Thermo-Vent Đakovo';
const COMPANY_PHONE = (import.meta.env.VITE_COMPANY_PHONE as string | undefined)?.trim() || '';

const KINDS = Object.keys(REQUEST_KIND_LABEL) as RequestKind[];

const EMPTY: PublicRequestInput = {
  full_name: '', phone: '', email: '', address: '', city: '',
  device_kind: '', device_brand: '', device_model: '',
  request_kind: '', description: '', preferred_time: '', website: '',
};

/** Javna forma za klijente: link /zahtjev, bez prijave. */
export function ServiceRequestPage() {
  // Javna stranica: bez "HVAC Admin" u naslovu taba
  useEffect(() => { document.title = `${COMPANY_NAME} – zahtjev za servis ili popravak`; }, []);
  const submit = useSubmitServiceRequest();
  const [v, setV] = useState<PublicRequestInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof PublicRequestInput, string>>>({});
  const [sent, setSent] = useState(false);
  const set = <K extends keyof PublicRequestInput>(k: K, val: PublicRequestInput[K]) => {
    setV(prev => ({ ...prev, [k]: val }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: undefined }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (v.full_name.trim().length < 2) errs.full_name = 'Upišite ime i prezime';
    const digits = v.phone.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) errs.phone = 'Upišite broj telefona, npr. 091 234 5678';
    if (v.email.trim() && !/^\S+@\S+\.\S+$/.test(v.email.trim())) errs.email = 'Provjerite e-mail adresu';
    if (v.address.trim().length < 2) errs.address = 'Upišite ulicu i kućni broj';
    if (v.city.trim().length < 2) errs.city = 'Upišite mjesto';
    if (!v.request_kind) errs.request_kind = 'Odaberite što vam treba';
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] button`)?.focus();
      return;
    }
    try {
      await submit.mutateAsync(v);
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch { /* FormError */ }
  };

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="max-w-xl mx-auto px-4 pt-8 pb-10 sm:pt-10">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-11 h-11 bg-blue-600 rounded-xl shadow-lg shrink-0">
              <Wind size={22} aria-hidden="true" />
            </div>
            {COMPANY_NAME && <p className="font-semibold text-lg leading-tight">{COMPANY_NAME}</p>}
          </div>
          <h1 className="mt-5 text-2xl font-bold">Zahtjev za servis ili popravak</h1>
          <p className="mt-1.5 text-slate-300 text-sm">Ispunite podatke i javit ćemo vam se radi dogovora termina.</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 -mt-5 pb-10">
        {sent ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center" role="status">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-bold text-slate-900">Hvala, zahtjev je zaprimljen</h2>
            <p className="mt-2 text-slate-600">Javit ćemo vam se na broj <strong className="text-slate-900">{v.phone}</strong> što prije.</p>
            {COMPANY_PHONE && (
              <p className="mt-4 text-sm text-slate-600">Za hitne slučajeve nazovite nas: <a className="font-semibold text-blue-700 underline" href={`tel:${COMPANY_PHONE.replace(/\s/g, '')}`}>{COMPANY_PHONE}</a></p>
            )}
            <button type="button" onClick={() => { setV(EMPTY); setSent(false); submit.reset(); }}
              className="mt-6 min-h-11 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
              Pošalji još jedan zahtjev
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Section title="Što vam treba?">
              <div data-field="request_kind">
                <div role="radiogroup" aria-label="Što vam treba" aria-invalid={errors.request_kind ? true : undefined}
                  aria-describedby={errors.request_kind ? 'rk-error' : undefined} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KINDS.map(k => (
                    <button key={k} type="button" role="radio" aria-checked={v.request_kind === k} onClick={() => set('request_kind', k)}
                      className={cn('min-h-12 px-4 text-left text-base sm:text-sm font-medium rounded-xl border-2 transition-colors',
                        v.request_kind === k ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300')}>
                      {REQUEST_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                {errors.request_kind && <p id="rk-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.request_kind}</p>}
              </div>
              <Field label="Opišite ukratko" optional hint="Npr. „klima curi”, „peć se gasi”, „godišnji servis”">
                {p => <textarea {...p} rows={3} maxLength={2000} value={v.description} onChange={e => set('description', e.target.value)} className={inputClass(false, 'resize-y')} />}
              </Field>
            </Section>

            <Section title="Uređaj">
              <Field label="Vrsta uređaja" optional>
                {p => (
                  <select {...p} value={v.device_kind} onChange={e => set('device_kind', e.target.value)} className={inputClass()}>
                    <option value="">— odaberite —</option>
                    {PUBLIC_DEVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Marka" optional>
                  {p => <input {...p} maxLength={60} placeholder="npr. Daikin" value={v.device_brand} onChange={e => set('device_brand', e.target.value)} className={inputClass()} />}
                </Field>
                <Field label="Model" optional hint="Piše na naljepnici uređaja">
                  {p => <input {...p} maxLength={80} value={v.device_model} onChange={e => set('device_model', e.target.value)} className={inputClass()} />}
                </Field>
              </div>
            </Section>

            <Section title="Vaši podaci">
              <div data-field="full_name">
                <Field label="Ime i prezime" required error={errors.full_name}>
                  {p => <input {...p} autoComplete="name" maxLength={100} value={v.full_name} onChange={e => set('full_name', e.target.value)} className={inputClass(!!errors.full_name)} />}
                </Field>
              </div>
              <div data-field="phone">
                <Field label="Telefon" required error={errors.phone}>
                  {p => <input {...p} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="091 234 5678" value={v.phone} onChange={e => set('phone', e.target.value)} className={inputClass(!!errors.phone)} />}
                </Field>
              </div>
              <div data-field="email">
                <Field label="E-mail" optional error={errors.email}>
                  {p => <input {...p} type="email" inputMode="email" autoComplete="email" maxLength={120} value={v.email} onChange={e => set('email', e.target.value)} className={inputClass(!!errors.email)} />}
                </Field>
              </div>
              <div data-field="address">
                <Field label="Ulica i kućni broj" required error={errors.address}>
                  {p => <input {...p} autoComplete="street-address" maxLength={150} placeholder="npr. Ilica 34" value={v.address} onChange={e => set('address', e.target.value)} className={inputClass(!!errors.address)} />}
                </Field>
              </div>
              <div data-field="city">
                <Field label="Mjesto" required error={errors.city}>
                  {p => <input {...p} autoComplete="address-level2" maxLength={80} placeholder="npr. Zagreb" value={v.city} onChange={e => set('city', e.target.value)} className={inputClass(!!errors.city)} />}
                </Field>
              </div>
              <Field label="Kada vam odgovara dolazak?" optional hint="Npr. „radnim danom poslije 15 h”">
                {p => <input {...p} maxLength={200} value={v.preferred_time} onChange={e => set('preferred_time', e.target.value)} className={inputClass()} />}
              </Field>
            </Section>

            {/* Zamka za botove: ljudi je ne vide ni ne dohvaćaju tipkovnicom */}
            <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
              <label>Web stranica<input tabIndex={-1} autoComplete="off" value={v.website} onChange={e => set('website', e.target.value)} /></label>
            </div>

            <FormError message={submit.error ? errorMessage(submit.error) : null} />

            <button type="submit" disabled={submit.isPending} aria-busy={submit.isPending || undefined}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 px-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl shadow-sm">
              {submit.isPending && <Spinner />}
              {submit.isPending ? 'Šaljem…' : 'Pošalji zahtjev'}
            </button>
            <p className="text-xs text-slate-600 text-center">Podatke koristimo samo za dogovor i obavljanje usluge.</p>
            {COMPANY_PHONE && (
              <p className="text-sm text-slate-600 text-center inline-flex w-full items-center justify-center gap-1.5">
                <Phone size={14} aria-hidden="true" /> Hitno? <a className="font-semibold text-blue-700 underline" href={`tel:${COMPANY_PHONE.replace(/\s/g, '')}`}>{COMPANY_PHONE}</a>
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
