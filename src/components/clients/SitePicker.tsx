import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, MapPin, Building, Plus, X, History } from 'lucide-react';
import { useClientDirectory, useCreateSiteQuick } from '../../hooks/useClients';
import { matchesQuery, normalize } from '../../lib/search';
import { siteAddress, OFFICE_LOCATION, OFFICE_SITE } from '../../lib/clients';
import { errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { inputClass } from '../ui/styles';
import { Spinner } from '../ui/form';
import type { FieldControlProps } from '../ui/form';


interface Option {
  key: string;
  kind: 'site' | 'office' | 'create';
  siteId?: string;
  title: string;
  subtitle?: string;
  group?: string;
}

interface Props extends Partial<FieldControlProps> {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  recentSiteIds?: string[];
}

/**
 * Odabir objekta klijenta (ARIA combobox). Odabrani objekt prikazuje se kao kartica s
 * "Promijeni"; lista se otvara ispod polja (ne kao plutajući sloj) da je dijalog ne odreže.
 */
export function SitePicker({ value, onChange, onBlur, recentSiteIds = [], id, ...aria }: Props) {
  // aria-required je dopušten na comboboxu, ali ne na gumbu "Promijeni"
  const { 'aria-required': _req, ...buttonAria } = aria; // eslint-disable-line @typescript-eslint/no-unused-vars
  const dir = useClientDirectory();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, { title: string; subtitle: string }>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const autoId = useId();
  const inputId = id ?? autoId;

  const allSites = useMemo(() => dir.clients
    .filter(c => !c.archived_at)
    .flatMap(c => c.sites.filter(s => !s.archived_at).map(s => ({
      site: s, client: c,
      text: [c.name, s.address, s.city, s.label, ...s.devices.flatMap(d => [d.brand, d.model, d.serial_number])].filter(Boolean).join(' '),
    }))), [dir.clients]);

  const options = useMemo<Option[]>(() => {
    const toOpt = (x: (typeof allSites)[number], group?: string): Option => ({
      key: x.site.id, kind: 'site', siteId: x.site.id, group,
      title: x.client.name,
      subtitle: siteAddress(x.site) + (x.site.label ? ` (${x.site.label})` : ''),
    });
    const out: Option[] = [];
    if (!q.trim()) {
      for (const sid of recentSiteIds) {
        const x = allSites.find(s => s.site.id === sid);
        if (x) out.push(toOpt(x, 'Nedavno'));
      }
    } else {
      const nq = normalize(q);
      const hits = allSites.filter(s => matchesQuery(s.text, q))
        .sort((a, b) => Number(!normalize(a.client.name).startsWith(nq)) - Number(!normalize(b.client.name).startsWith(nq))
          || a.client.name.localeCompare(b.client.name, 'hr'))
        .slice(0, 8);
      out.push(...hits.map(h => toOpt(h, 'Rezultati')));
    }
    if (!q.trim() || matchesQuery('ured ostalo skladište edukacija', q)) {
      out.push({ key: OFFICE_SITE, kind: 'office', title: OFFICE_LOCATION, subtitle: 'Skladište, edukacija, rad bez klijenta' });
    }
    out.push({ key: '__create__', kind: 'create', title: q.trim() ? `Novi klijent ili objekt „${q.trim()}”` : 'Novi klijent ili objekt' });
    return out;
  }, [q, allSites, recentSiteIds]);

  const choose = (o: Option) => {
    if (o.kind === 'create') { setCreating(q.trim()); setOpen(false); return; }
    onChange(o.kind === 'office' ? OFFICE_SITE : o.siteId!);
    setQ(''); setOpen(false);
    onBlur?.();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); const o = options[active]; if (o) choose(o); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  // ── Odabrano ──
  if (value && !creating) {
    const hit = value === OFFICE_SITE ? null : dir.siteIndex.get(value);
    const title = value === OFFICE_SITE ? OFFICE_LOCATION : hit?.client.name ?? created[value]?.title ?? 'Objekt';
    const subtitle = value === OFFICE_SITE ? 'Rad bez klijenta' : hit ? siteAddress(hit.site) + (hit.site.label ? ` (${hit.site.label})` : '') : created[value]?.subtitle;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
        {value === OFFICE_SITE
          ? <Building size={17} className="text-blue-700 shrink-0" aria-hidden="true" />
          : <MapPin size={17} className="text-blue-700 shrink-0" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
          {subtitle && <p className="text-xs text-slate-600 truncate">{subtitle}</p>}
        </div>
        <button
          id={inputId}
          type="button"
          {...buttonAria}
          aria-label={`Promijeni objekt (odabrano: ${title}${subtitle ? `, ${subtitle}` : ''})`}
          onClick={() => { onChange(''); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          className="shrink-0 px-2.5 py-1.5 min-h-10 sm:min-h-0 text-sm font-medium text-blue-700 hover:bg-blue-100 rounded-md"
        >
          Promijeni
        </button>
      </div>
    );
  }

  // ── Brzo dodavanje ──
  if (creating !== null) {
    return (
      <QuickCreate
        initial={creating}
        clientNames={dir.clients.filter(c => !c.archived_at).map(c => ({ id: c.id, name: c.name }))}
        onCancel={() => { setCreating(null); setTimeout(() => inputRef.current?.focus(), 0); }}
        onCreated={(siteId, title, subtitle) => {
          setCreated(c => ({ ...c, [siteId]: { title, subtitle } }));
          setCreating(null);
          onChange(siteId);
        }}
      />
    );
  }

  // ── Pretraga ──
  let lastGroup: string | undefined;
  return (
    <div>
      <div className="relative">
        <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          ref={inputRef}
          id={inputId}
          {...aria}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => { setOpen(false); onBlur?.(); }, 150)}
          placeholder={dir.isLoading ? 'Učitavanje klijenata…' : 'Klijent, adresa ili mjesto'}
          autoComplete="off"
          className={inputClass(!!aria['aria-invalid'], 'pl-9')}
        />
        {dir.isLoading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Objekti" className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm py-1">
          {options.map((o, i) => {
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.key} role="presentation">
                {header && (
                  <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-medium text-slate-500" aria-hidden="true">
                    {header === 'Nedavno' && <History size={12} />}{header}
                  </p>
                )}
                {o.kind !== 'site' && i > 0 && options[i - 1].kind === 'site' && <div className="my-1 border-t border-slate-100" aria-hidden="true" />}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cn('flex items-start gap-2.5 px-3 py-2 min-h-11 cursor-pointer', i === active && 'bg-slate-100')}
                >
                  {o.kind === 'site' && <MapPin size={15} className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />}
                  {o.kind === 'office' && <Building size={15} className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />}
                  {o.kind === 'create' && <Plus size={15} className="text-blue-700 mt-0.5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className={cn('block text-sm truncate', o.kind === 'create' ? 'font-medium text-blue-700' : 'text-slate-900')}>{o.title}</span>
                    {o.subtitle && <span className="block text-xs text-slate-600 truncate">{o.subtitle}</span>}
                  </span>
                </div>
              </li>
            );
          })}
          {q.trim() && options.every(o => o.kind !== 'site') && (
            <li role="presentation" className="px-3 py-1.5 text-xs text-slate-500">Nema postojećeg objekta za „{q.trim()}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Mini-forma: novi klijent/objekt bez napuštanja unosa rada ──────────────

function QuickCreate({ initial, clientNames, onCancel, onCreated }: {
  initial: string;
  clientNames: { id: string; name: string }[];
  onCancel: () => void;
  onCreated: (siteId: string, title: string, subtitle: string) => void;
}) {
  const create = useCreateSiteQuick();
  const [client, setClient] = useState(initial);
  const [kind, setKind] = useState<'private' | 'company'>('private');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [errors, setErrors] = useState<{ client?: string; address?: string }>({});
  const uid = useId();
  const existing = clientNames.find(c => normalize(c.name) === normalize(client));

  const submit = async () => {
    const e: typeof errors = {};
    if (client.trim().length < 2) e.client = 'Upišite ime klijenta';
    if (address.trim().length < 2) e.address = 'Upišite adresu';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const r = await create.mutateAsync({
        clientId: existing?.id ?? null, clientName: existing ? null : client.trim(), clientKind: kind,
        address, city, label: '',
      });
      onCreated(r.site_id, existing?.name ?? client.trim(), [address.trim(), city.trim()].filter(Boolean).join(', '));
    } catch { /* prikaz ispod */ }
  };

  return (
    <div
      className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3"
      onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); void submit(); } }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Novi objekt</p>
        <button type="button" onClick={onCancel} aria-label="Odustani od dodavanja" className="-mr-1 p-1.5 rounded-md text-slate-500 hover:bg-white">
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div>
        <label htmlFor={`${uid}-c`} className="block text-sm font-medium text-slate-700 mb-1">Klijent<span className="text-red-600" aria-hidden="true">*</span></label>
        <input id={`${uid}-c`} value={client} onChange={e => setClient(e.target.value)} list={`${uid}-cl`} autoFocus autoComplete="off"
          aria-invalid={!!errors.client || undefined} aria-describedby={`${uid}-ch`}
          className={inputClass(!!errors.client)} placeholder="Ime osobe ili naziv tvrtke" />
        <datalist id={`${uid}-cl`}>{clientNames.map(c => <option key={c.id} value={c.name} />)}</datalist>
        <p id={`${uid}-ch`} className={cn('mt-1 text-xs', errors.client ? 'text-red-600 font-medium' : 'text-slate-600')}>
          {errors.client ?? (existing ? `Dodaje se novi objekt postojećem klijentu ${existing.name}.` : client.trim().length >= 2 ? 'Bit će kreiran novi klijent.' : 'Postojeći klijent ili novi.')}
        </p>
      </div>

      {!existing && client.trim().length >= 2 && (
        <div role="radiogroup" aria-label="Vrsta klijenta" className="grid grid-cols-2 gap-2">
          {(['private', 'company'] as const).map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn('min-h-10 rounded-lg border text-sm font-medium', kind === k ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700')}>
              {k === 'private' ? 'Privatna osoba' : 'Tvrtka'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
        <div>
          <label htmlFor={`${uid}-a`} className="block text-sm font-medium text-slate-700 mb-1">Adresa<span className="text-red-600" aria-hidden="true">*</span></label>
          <input id={`${uid}-a`} value={address} onChange={e => setAddress(e.target.value)} autoComplete="off"
            aria-invalid={!!errors.address || undefined} aria-describedby={errors.address ? `${uid}-ae` : undefined}
            className={inputClass(!!errors.address)} placeholder="npr. Ilica 34" />
          {errors.address && <p id={`${uid}-ae`} className="mt-1 text-xs font-medium text-red-600">{errors.address}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-m`} className="block text-sm font-medium text-slate-700 mb-1">Mjesto</label>
          <input id={`${uid}-m`} value={city} onChange={e => setCity(e.target.value)} autoComplete="off" className={inputClass(false)} />
        </div>
      </div>

      {create.error && <p role="alert" className="text-sm text-red-700">{errorMessage(create.error)}</p>}
      <p className="text-xs text-slate-600">Administrator će provjeriti nove podatke. Uređaje i kontakt možete dodati kasnije.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit()} disabled={create.isPending}
          className="inline-flex items-center gap-2 min-h-10 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
          {create.isPending && <Spinner />} Dodaj objekt
        </button>
        <button type="button" onClick={onCancel} className="min-h-10 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white rounded-lg">Odustani</button>
      </div>
    </div>
  );
}
