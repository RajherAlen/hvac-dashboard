import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, X, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle } from 'lucide-react';
import type { Profile, WorkLog } from '../types';
import type { DirectoryEntry } from '../hooks/useStaffDirectory';
import { STATUS_LABEL, type EmployeeStatus } from '../lib/employeeStatus';
import { formatHours, todayISO, initials, cn } from '../lib/utils';
import { formatRelative, formatDayLong, capitalize } from '../lib/format-date';
import { workdaysBetween } from '../lib/period';

interface EmployeeTableProps {
  entries: DirectoryEntry[];
  /** Unosi tekućeg tjedna */
  logs: WorkLog[];
  isLoading?: boolean;
}

type StatusFilter = 'current' | 'pozvan' | 'neaktivan' | 'all';
const FILTERS: { key: StatusFilter; label: string; match: (s: EmployeeStatus) => boolean }[] = [
  { key: 'current', label: 'Aktivni', match: s => s === 'aktivan' },
  { key: 'pozvan', label: 'Pozvani', match: s => s === 'pozvan' },
  { key: 'neaktivan', label: 'Neaktivni', match: s => s === 'neaktivan' },
  { key: 'all', label: 'Svi', match: () => true },
];

type SortKey = 'name' | 'today' | 'week' | 'last';
type SortDir = 'asc' | 'desc';

/** Zaposlenik bez unosa više od ovoliko radnih dana se ističe. */
const STALE_WORKDAYS = 2;

interface Row {
  emp: Profile;
  todayHours: number;
  weekHours: number;
  lastDate: string | null;
  staleDays: number;
  isAdmin: boolean;
  status: EmployeeStatus;
}

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'name', label: 'Zaposlenik', align: 'left' },
  { key: 'today', label: 'Danas', align: 'right' },
  { key: 'week', label: 'Ovaj tjedan', align: 'right' },
  { key: 'last', label: 'Zadnji unos', align: 'left' },
];

export function EmployeeTable({ entries, logs, isLoading }: EmployeeTableProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('current');
  const [showAdmins, setShowAdmins] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const today = todayISO();

  const rows: Row[] = useMemo(() => entries.map(({ emp, isAdmin, status, lastLogDate }) => {
    const own = logs.filter(l => l.employee_id === emp.id);
    return {
      emp,
      isAdmin,
      status,
      todayHours: own.filter(l => l.log_date === today).reduce((s, l) => s + Number(l.hours_worked), 0),
      weekHours: own.reduce((s, l) => s + Number(l.hours_worked), 0),
      lastDate: lastLogDate,
      staleDays: !isAdmin && status === 'aktivan' && lastLogDate ? workdaysBetween(lastLogDate, today) : 0,
    };
  }), [entries, logs, today]);

  const staffRows = rows.filter(r => !r.isAdmin);
  const adminCount = rows.length - staffRows.length;
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, staffRows.filter(r => f.match(r.status)).length])) as Record<StatusFilter, number>;

  const q = search.trim().toLocaleLowerCase('hr');
  const visible = useMemo(() => {
    const match = FILTERS.find(f => f.key === filter)!.match;
    const filtered = rows
      .filter(r => (r.isAdmin ? showAdmins : match(r.status)))
      .filter(r => !q || r.emp.full_name.toLocaleLowerCase('hr').includes(q) || r.emp.email.toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // Administratori uvijek na dnu
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? 1 : -1;
      switch (sort.key) {
        case 'name': return dir * a.emp.full_name.localeCompare(b.emp.full_name, 'hr');
        case 'today': return dir * (a.todayHours - b.todayHours);
        case 'week': return dir * (a.weekHours - b.weekHours);
        case 'last': return dir * (a.lastDate ?? '').localeCompare(b.lastDate ?? '');
      }
    });
  }, [rows, q, sort, filter, showAdmins]);

  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2" aria-busy="true">
        <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)}
        <span className="sr-only">Učitavanje zaposlenika…</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Pretraga + sortiranje (mobitel) */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <label htmlFor="employee-search" className="sr-only">Pretraži zaposlenike</label>
          <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            id="employee-search"
            type="search"
            placeholder="Pretraži po imenu ili e-mailu…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full min-h-11 sm:min-h-0 pl-9 pr-10 py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Obriši pretragu"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <label className="md:hidden flex items-center gap-2 text-sm text-slate-700">
          <span className="shrink-0">Sortiraj:</span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={e => { const [key, dir] = e.target.value.split(':'); setSort({ key: key as SortKey, dir: dir as SortDir }); }}
            className="flex-1 min-h-11 px-2 text-base border border-slate-300 rounded-lg bg-white"
          >
            <option value="name:asc">Ime (A–Ž)</option>
            <option value="week:desc">Ovaj tjedan (najviše)</option>
            <option value="last:desc">Zadnji unos (najnoviji)</option>
            <option value="last:asc">Zadnji unos (najstariji)</option>
          </select>
        </label>
      </div>

      {/* Filter statusa + administratori */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Filtriraj po statusu" className="flex flex-wrap gap-1">
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'min-h-9 px-3 py-1 text-sm font-medium rounded-full border transition-colors',
                  active ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-700 border-slate-200 hover:bg-slate-50',
                )}
              >
                {f.label} <span className={cn('tabular-nums', active ? 'text-slate-300' : 'text-slate-500')}>{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        {adminCount > 0 && (
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAdmins}
              onChange={e => setShowAdmins(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-blue-600"
            />
            Prikaži administratore ({adminCount})
          </label>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {q ? `${visible.length} rezultata za „${search.trim()}”` : ''}
      </p>

      {/* Zaglavlje (desktop) */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1.3fr_24px] gap-4 px-5 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
        {COLUMNS.map(c => {
          const active = sort.key === c.key;
          const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleSort(c.key)}
              className={cn('flex items-center gap-1 uppercase tracking-wider hover:text-slate-900 py-1', c.align === 'right' && 'justify-end', active && 'text-slate-900')}
              aria-label={`Sortiraj po: ${c.label}${active ? (sort.dir === 'asc' ? ', uzlazno' : ', silazno') : ''}`}
            >
              {c.label}
              <Icon size={12} aria-hidden="true" className={active ? '' : 'opacity-40'} />
            </button>
          );
        })}
        <span />
      </div>

      {visible.length === 0 ? (
        <div className="py-10 px-4 text-center">
          {q ? (
            <>
              <p className="text-sm text-slate-700">Nema rezultata za „{search.trim()}”.</p>
              <button type="button" onClick={() => setSearch('')}
                className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-900 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                Obriši pretragu
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {filter === 'current' && counts.pozvan > 0 ? 'Nema aktivnih zaposlenika – pogledajte karticu „Pozvani”.'
                : filter === 'pozvan' ? 'Nema pozvanih zaposlenika koji se još nisu prijavili.'
                : filter === 'neaktivan' ? 'Nema deaktiviranih zaposlenika.'
                : 'Još nema zaposlenika.'}
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map(r => <EmployeeRow key={r.emp.id} row={r} />)}
        </ul>
      )}
    </div>
  );
}

function EmployeeRow({ row: r }: { row: Row }) {
  const active = r.todayHours > 0;
  const stale = r.staleDays > STALE_WORKDAYS;
  const inactive = r.status === 'neaktivan';
  const lastText = r.isAdmin ? 'ne evidentira' : r.lastDate ? formatRelative(r.lastDate) : 'još nema unosa';
  const lastTitle = r.lastDate ? capitalize(formatDayLong(r.lastDate)) : undefined;

  const aria = [
    `Detalji: ${r.emp.full_name}`,
    r.isAdmin ? 'administrator' : STATUS_LABEL[r.status].toLowerCase(),
    !r.isAdmin ? `danas ${formatHours(r.todayHours)}` : null,
    !r.isAdmin ? `ovaj tjedan ${formatHours(r.weekHours)}` : null,
    !r.isAdmin ? `zadnji unos ${lastText}` : null,
    stale ? `bez unosa ${r.staleDays} radnih dana` : null,
  ].filter(Boolean).join(', ');

  return (
    <li>
      <Link
        to={`/admin/employees/${r.emp.id}`}
        aria-label={aria}
        className={cn(inactive && 'opacity-70', "group grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1.3fr_24px] gap-x-4 gap-y-1 items-center px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors focus-visible:outline-offset-[-2px]")}
      >
        {/* Ime, e-mail, uloga */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0" aria-hidden="true">
            <span className="text-xs font-bold text-blue-800">{initials(r.emp.full_name)}</span>
            {active && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <span className="truncate">{r.emp.full_name}</span>
              {r.isAdmin && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 shrink-0">Admin</span>
              )}
              {!r.isAdmin && r.status !== 'aktivan' && (
                <span className={cn(
                  'text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0',
                  r.status === 'pozvan' ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700',
                )}>
                  {STATUS_LABEL[r.status]}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600 truncate">{r.emp.email}</p>
          </div>
        </div>

        {/* Mobitel: sažetak desno */}
        <div className="md:hidden text-right">
          <p className="text-sm font-semibold text-slate-900 tabular-nums">{r.isAdmin || r.status === 'pozvan' ? '—' : formatHours(r.weekHours)}</p>
          <p className="text-[11px] text-slate-600">ovaj tjedan</p>
        </div>
        <p className={cn('md:hidden col-span-2 pl-12 text-xs flex items-center gap-1', stale ? 'text-amber-800' : 'text-slate-600')}>
          {active && <span className="text-green-700 font-medium">Danas {formatHours(r.todayHours)} · </span>}
          {stale && <AlertCircle size={12} aria-hidden="true" />}
          Zadnji unos: {lastText}
        </p>

        {/* Desktop stupci */}
        <div className="hidden md:flex items-center justify-end gap-2 tabular-nums">
          {active && <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />}
          <span className={cn('text-sm', active ? 'font-semibold text-green-800' : 'text-slate-500')}>
            {r.isAdmin || r.status === 'pozvan' ? '—' : formatHours(r.todayHours)}
          </span>
        </div>
        <div className="hidden md:block text-right text-sm font-semibold text-slate-900 tabular-nums">
          {r.isAdmin || r.status === 'pozvan' ? <span className="font-normal text-slate-500">—</span> : formatHours(r.weekHours)}
        </div>
        <div className="hidden md:flex items-center gap-1.5 min-w-0" title={lastTitle}>
          {stale && <AlertCircle size={13} aria-hidden="true" className="text-amber-600 shrink-0" />}
          <span className={cn('text-sm truncate', stale ? 'text-amber-800 font-medium' : r.isAdmin ? 'text-slate-500' : 'text-slate-700')}>
            {lastText}
          </span>
        </div>
        <ChevronRight size={16} aria-hidden="true" className="hidden md:block text-slate-400 group-hover:text-slate-600" />
      </Link>
    </li>
  );
}
