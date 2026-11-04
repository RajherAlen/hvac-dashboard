import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X, PlusCircle, ChevronRight, AlertTriangle, CalendarClock, Link2, Building2 } from 'lucide-react';
import { useClientDirectory, useDeviceServiceStatus, useLastVisitBySite } from '../../hooks/useClients';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ClientFormDialog } from '../../components/clients/ClientForms';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { matchesQuery } from '../../lib/search';
import { serviceState, siteAddress, CLIENT_KIND_LABEL, type ServiceState } from '../../lib/clients';
import { formatRelative } from '../../lib/format-date';
import { cn, pluralHr, todayISO } from '../../lib/utils';
import type { ClientWithSites } from '../../types';

type Filter = 'all' | 'service' | 'review' | 'archived';

const RANK: Record<ServiceState, number> = { overdue: 0, soon: 1, ok: 2, unknown: 3 };

export function ClientsPage() {
  useDocumentTitle('Klijenti');
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const dir = useClientDirectory();
  const { data: service = {} } = useDeviceServiceStatus(dir.enabled && !dir.isLoading);
  const { data: lastVisit = {} } = useLastVisitBySite(dir.enabled && !dir.isLoading);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const today = todayISO();

  const rows = useMemo(() => dir.clients.map(c => {
    const sites = (c.sites ?? []).filter(s => !s.archived_at);
    const devices = sites.flatMap(s => (s.devices ?? []).filter(d => !d.archived_at));
    let worst: { state: ServiceState; days: number | null } = { state: 'unknown', days: null };
    for (const d of devices) {
      const st = serviceState(service[d.id]?.next, today);
      if (RANK[st.state] < RANK[worst.state] || (st.state === worst.state && (st.days ?? 1e9) < (worst.days ?? 1e9))) worst = st;
    }
    const visits = sites.map(s => lastVisit[s.id]).filter(Boolean).sort();
    const needsReview = c.needs_review || sites.some(s => s.needs_review) || devices.some(d => d.needs_review);
    const haystack = [c.name, c.phone, c.email, c.oib, ...sites.flatMap(s => [s.address, s.city, s.label]),
      ...devices.flatMap(d => [d.brand, d.model, d.serial_number])].filter(Boolean).join(' ');
    return { c, sites, devices, worst, lastVisit: visits[visits.length - 1] ?? null, needsReview, haystack };
  }), [dir.clients, service, lastVisit, today]);

  const counts = {
    all: rows.filter(r => !r.c.archived_at).length,
    service: rows.filter(r => !r.c.archived_at && (r.worst.state === 'overdue' || r.worst.state === 'soon')).length,
    review: rows.filter(r => !r.c.archived_at && r.needsReview).length,
    archived: rows.filter(r => r.c.archived_at).length,
  };

  const visible = rows
    .filter(r => {
      if (filter === 'archived') return !!r.c.archived_at;
      if (r.c.archived_at) return false;
      if (filter === 'service') return r.worst.state === 'overdue' || r.worst.state === 'soon';
      if (filter === 'review') return r.needsReview;
      return true;
    })
    .filter(r => !q || matchesQuery(r.haystack, q))
    .sort((a, b) => filter === 'service'
      ? RANK[a.worst.state] - RANK[b.worst.state] || (a.worst.days ?? 0) - (b.worst.days ?? 0)
      : a.c.name.localeCompare(b.c.name, 'hr'));

  if (dir.missingSchema) return <ModuleNotEnabled />;

  const filters: { key: Filter; label: string; adminOnly?: boolean }[] = [
    { key: 'all', label: 'Svi' },
    { key: 'service', label: 'Servis uskoro' },
    { key: 'review', label: 'Novo – provjeriti', adminOnly: true },
    { key: 'archived', label: 'Arhiva', adminOnly: true },
  ];

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Klijenti</h1>
          {!dir.isLoading && (
            <p className="text-sm text-slate-600 mt-0.5">
              {counts.all} {pluralHr(counts.all, 'klijent', 'klijenta', 'klijenata')}
              {counts.service > 0 && <>, {counts.service} s rokom servisa unutar 30 dana</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Link to="/klijenti/povezivanje"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
              <Link2 size={15} aria-hidden="true" /> Poveži stare unose
            </Link>
          )}
          <button type="button" onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-3 sm:px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            <PlusCircle size={15} aria-hidden="true" /> Novi klijent
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 space-y-3">
          <div className="relative">
            <label htmlFor="client-search" className="sr-only">Pretraži klijente</label>
            <Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              id="client-search"
              type="search"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Ime, adresa, mjesto, model ili serijski broj"
              className="w-full min-h-12 pl-10 pr-10 text-base border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Obriši pretragu"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:bg-slate-100">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div role="group" aria-label="Filtar" className="flex flex-wrap gap-1.5">
            {filters.filter(f => isAdmin || !f.adminOnly).map(f => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                className={cn('min-h-9 px-3 py-1 text-sm font-medium rounded-full border',
                  filter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-700 border-slate-200 hover:bg-slate-50')}>
                {f.label} <span className={cn('tabular-nums', filter === f.key ? 'text-slate-300' : 'text-slate-500')}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">{q ? `${visible.length} rezultata` : ''}</p>

        {dir.isLoading ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <Building2 size={28} className="mx-auto text-slate-300" aria-hidden="true" />
            {q ? (
              <p className="mt-2 text-sm text-slate-700">Nema klijenta za „{q.trim()}”.{' '}
                <button type="button" onClick={() => setCreating(true)} className="font-medium text-blue-700 hover:underline">Dodaj novog klijenta</button>
              </p>
            ) : filter === 'all' ? (
              <p className="mt-2 text-sm text-slate-700">Još nema klijenata. Dodajte prvog ili ih kreirajte izravno iz unosa rada.</p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Ovdje trenutno nema nikoga.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map(r => <ClientRow key={r.c.id} {...r} />)}
          </ul>
        )}
      </div>

      {creating && (
        <ClientFormDialog onClose={() => setCreating(false)}
          onCreated={id => navigate(`/klijenti/${id}?uredaj=1`)} />
      )}
    </div>
  );
}

function ClientRow({ c, sites, devices, worst, lastVisit, needsReview }: {
  c: ClientWithSites; sites: ClientWithSites['sites']; devices: unknown[];
  worst: { state: ServiceState; days: number | null }; lastVisit: string | null; needsReview: boolean;
}) {
  const first = sites[0];
  const where = first ? siteAddress(first) + (sites.length > 1 ? ` i još ${sites.length - 1}` : '') : 'Nema objekata';
  const serviceBadge = worst.state === 'overdue'
    ? { cls: 'bg-red-50 text-red-800 border-red-200', Icon: AlertTriangle, text: 'Servis kasni' }
    : worst.state === 'soon'
      ? { cls: 'bg-amber-50 text-amber-900 border-amber-200', Icon: CalendarClock, text: worst.days === 0 ? 'Servis danas' : `Servis za ${worst.days} ${pluralHr(worst.days!, 'dan', 'dana', 'dana')}` }
      : null;

  return (
    <li>
      <Link to={`/klijenti/${c.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto_20px] gap-x-4 gap-y-1 items-center px-4 md:px-5 py-3 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <span className="truncate">{c.name}</span>
            {c.kind === 'company' && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">{CLIENT_KIND_LABEL.company}</span>}
            {needsReview && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0">Novo</span>}
          </p>
          <p className="text-xs text-slate-600 truncate">{where}</p>
        </div>
        <p className="hidden md:block text-sm text-slate-700 truncate">
          {devices.length} {pluralHr(devices.length, 'uređaj', 'uređaja', 'uređaja')}
          {lastVisit && <span className="text-slate-500">, zadnji posjet {formatRelative(lastVisit)}</span>}
        </p>
        <div className="justify-self-end">
          {serviceBadge && (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap', serviceBadge.cls)}>
              <serviceBadge.Icon size={12} aria-hidden="true" /> {serviceBadge.text}
            </span>
          )}
        </div>
        <ChevronRight size={16} aria-hidden="true" className="hidden md:block text-slate-400 group-hover:text-slate-600" />
      </Link>
    </li>
  );
}
