import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, Inbox, Wrench } from 'lucide-react';
import { useUnscheduledOrders } from '../../hooks/useWorkOrders';
import { useClientDirectory } from '../../hooks/useClients';
import { useServiceBoard } from '../../hooks/useServiceCases';
import { KIND_LABEL } from '../../lib/orders';
import { deviceDisplayName, dueText } from '../../lib/service';
import { siteAddress } from '../../lib/clients';
import { formatRelative } from '../../lib/format-date';
import { cn, pluralHr } from '../../lib/utils';
import { KindIcon } from './KindIcon';
import { OrderDrawer } from './OrderDrawer';

const INITIAL = 5;
const hours = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;

/**
 * Lista čekanja, kao u Rasporedu: otvoreni nalozi bez ijedne dodjele i servisi koji
 * dospijevaju, a još nisu zakazani. Skriva se ako nijedan od ta dva modula nije uključen.
 */
export function WaitingListCard() {
  const { data, isLoading } = useUnscheduledOrders();
  const dir = useClientDirectory();
  const board = useServiceBoard();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  if (isLoading || board.isLoading) return null;
  if (!data && !board.enabled) return null;

  // Najstariji prvi: najduže čekaju
  const orders = [...(data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const services = board.items
    .filter(i => i.sc.status === 'due' || i.sc.status === 'contacted')
    .sort((a, b) => a.sc.due_date.localeCompare(b.sc.due_date));
  const total = orders.reduce((s, o) => s + Number(o.estimate_hours || 0), 0);
  const count = orders.length + services.length;
  const placeOf = (siteId: string | null) => (siteId ? dir.siteIndex.get(siteId)?.client.name ?? 'Objekt' : 'Ured / ostalo');
  const shownOrders = all ? orders : orders.slice(0, INITIAL);
  const shownServices = all ? services : services.slice(0, INITIAL);
  const hidden = orders.length - shownOrders.length + services.length - shownServices.length;

  const summary = [
    orders.length > 0 && `${orders.length} ${pluralHr(orders.length, 'nalog', 'naloga', 'naloga')} bez dana (${hours(total)})`,
    services.length > 0 && `${services.length} ${pluralHr(services.length, 'servis', 'servisa', 'servisa')} za zakazati`,
  ].filter(Boolean).join(' · ');

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="waiting-list-title">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 id="waiting-list-title" className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Inbox size={15} className="text-slate-400" aria-hidden="true" /> Na čekanju
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">{count === 0 ? 'Sve je raspoređeno' : summary}</p>
        </div>
        <Link to="/raspored" className="shrink-0 inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
          Raspored <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {orders.length > 0 && (
        <div>
          <h3 className="px-4 sm:px-5 pt-3 text-xs font-semibold text-slate-600">Nalozi bez dana · {orders.length}</h3>
          <ul className="divide-y divide-slate-100">
            {shownOrders.map(o => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpen(o.id)}
                  className="w-full text-left flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
                  <KindIcon kind={o.kind} size={16} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900 truncate">{placeOf(o.site_id)}</span>
                    <span className="block text-xs text-slate-600 truncate">
                      {KIND_LABEL[o.kind]} · {o.title} · {hours(Number(o.estimate_hours))}
                    </span>
                  </span>
                  <span className="text-xs text-slate-600 whitespace-nowrap shrink-0">{formatRelative(o.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {services.length > 0 && (
        <div className={cn(orders.length > 0 && 'border-t border-slate-100')}>
          <h3 className="px-4 sm:px-5 pt-3 text-xs font-semibold text-slate-600">Servis dospijeva · {services.length}</h3>
          <ul className="divide-y divide-slate-100">
            {shownServices.map(s => {
              const due = dueText(s.sc.due_date, board.today);
              return (
                <li key={s.sc.id}>
                  <Link to={`/klijenti/${s.client.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
                    <Wrench size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate">{s.client.name}</span>
                      <span className="block text-xs text-slate-600 truncate">
                        {[s.site.city || siteAddress(s.site), s.devices.map(deviceDisplayName).join(', ')].filter(Boolean).join(' · ')}
                        {s.sc.status === 'contacted' && ' · kontaktiran'}
                      </span>
                    </span>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0',
                      due.late ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200')}>
                      <CalendarClock size={11} aria-hidden="true" /> {due.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(hidden > 0 || all) && count > INITIAL && (
        <button type="button" onClick={() => setAll(v => !v)}
          className="w-full min-h-11 text-sm font-medium text-blue-700 hover:bg-blue-50 border-t border-slate-100">
          {all ? 'Prikaži manje' : `Prikaži sve (${count})`}
        </button>
      )}

      {open && <OrderDrawer orderId={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
