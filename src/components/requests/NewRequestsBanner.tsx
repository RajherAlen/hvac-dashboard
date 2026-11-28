import { Link } from 'react-router-dom';
import { ChevronRight, Inbox } from 'lucide-react';
import { useServiceRequests } from '../../hooks/useServiceRequests';
import { REQUEST_KIND_LABEL } from '../../lib/requests';
import { formatRelative } from '../../lib/format-date';
import { pluralHr } from '../../lib/utils';

/** Nadzorna ploča: obavijest o novim zahtjevima s web forme. Ne prikazuje se kad ih nema. */
export function NewRequestsBanner() {
  const { data } = useServiceRequests();
  const fresh = (data ?? []).filter(r => r.status === 'new');
  if (fresh.length === 0) return null;

  const latest = fresh[0]; // sortirano od najnovijeg
  const n = fresh.length;

  return (
    <Link
      to="/zahtjevi"
      className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-3 shadow-sm transition-colors"
    >
      <span className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg bg-amber-400 text-slate-900 shrink-0">
        <Inbox size={20} aria-hidden="true" />
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold tabular-nums">
          {n}
        </span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900">
          {n} {pluralHr(n, 'novi zahtjev klijenta', 'nova zahtjeva klijenata', 'novih zahtjeva klijenata')} za pregled
        </span>
        <span className="block text-sm text-slate-700 truncate">
          {n === 1 ? 'Od' : 'Zadnji od'} {latest.full_name} · {REQUEST_KIND_LABEL[latest.request_kind]} · {formatRelative(latest.created_at)}
        </span>
      </span>
      <span className="hidden sm:inline text-sm font-semibold text-amber-900">Pregledaj</span>
      <ChevronRight size={18} className="text-amber-900 shrink-0" aria-hidden="true" />
    </Link>
  );
}
