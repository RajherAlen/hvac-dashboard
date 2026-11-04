import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Wrench, ChevronRight } from 'lucide-react';
import { useClientDirectory, useDeviceServiceStatus } from '../../hooks/useClients';
import { DEVICE_KIND_LABEL, serviceState, siteAddress, SERVICE_SOON_DAYS } from '../../lib/clients';
import { formatNumeric } from '../../lib/format-date';
import { cn, pluralHr, todayISO } from '../../lib/utils';

const INITIAL = 6;

/** Uređaji kojima servis kasni ili dospijeva u idućih 30 dana. Skriva se ako ih nema. */
export function ServiceDueCard() {
  const dir = useClientDirectory();
  const { data: service, isLoading } = useDeviceServiceStatus(dir.enabled && !dir.isLoading);
  const [all, setAll] = useState(false);
  const today = todayISO();

  if (!dir.enabled || dir.isLoading || isLoading || !service) return null;

  const due = [...dir.deviceIndex.values()]
    .filter(x => !x.device.archived_at && !x.site.archived_at && !x.client.archived_at)
    .map(x => ({ ...x, next: service[x.device.id]?.next ?? null, ...serviceState(service[x.device.id]?.next, today) }))
    .filter(x => x.state === 'overdue' || x.state === 'soon')
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  if (due.length === 0) return null;
  const overdue = due.filter(d => d.state === 'overdue').length;
  const shown = all ? due : due.slice(0, INITIAL);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="service-due-title">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 id="service-due-title" className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Wrench size={15} className="text-slate-400" aria-hidden="true" /> Servisi u idućih {SERVICE_SOON_DAYS} dana
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {due.length} {pluralHr(due.length, 'uređaj', 'uređaja', 'uređaja')}
            {overdue > 0 && <span className="text-red-700 font-medium">, {overdue} {pluralHr(overdue, 'kasni', 'kasne', 'kasni')}</span>}
          </p>
        </div>
        <Link to="/servisi" className="shrink-0 inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
          Svi servisi <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {shown.map(x => {
          const name = [x.device.brand, x.device.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[x.device.kind];
          const late = x.state === 'overdue';
          return (
            <li key={x.device.id}>
              <Link to={`/klijenti/${x.client.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 focus-visible:outline-offset-[-2px]">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{x.client.name}</p>
                  <p className="text-xs text-slate-600 truncate">
                    {name}{x.device.placement && `, ${x.device.placement}`} · {siteAddress(x.site)}
                  </p>
                </div>
                <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap shrink-0',
                  late ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200')}>
                  {late ? <AlertTriangle size={12} aria-hidden="true" /> : <CalendarClock size={12} aria-hidden="true" />}
                  {late
                    ? `kasni ${Math.abs(x.days!)} ${pluralHr(Math.abs(x.days!), 'dan', 'dana', 'dana')}`
                    : x.days === 0 ? 'danas' : `${formatNumeric(x.next!)}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {due.length > INITIAL && (
        <button type="button" onClick={() => setAll(v => !v)}
          className="w-full min-h-11 text-sm font-medium text-blue-700 hover:bg-blue-50 border-t border-slate-100">
          {all ? 'Prikaži manje' : `Prikaži sve (${due.length})`}
        </button>
      )}
    </section>
  );
}
