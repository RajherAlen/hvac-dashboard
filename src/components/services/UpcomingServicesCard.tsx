import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, MapPin, Phone, Wrench, PlusCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useServiceBoard, type ServiceItem } from '../../hooks/useServiceCases';
import { mapsUrl, siteAddress } from '../../lib/clients';
import { deviceDisplayName, dueText, visitDayLabel } from '../../lib/service';
import { cn, pluralHr } from '../../lib/utils';
import { WorkLogForm } from '../WorkLogForm';

const SOON_DAYS = 30;
const SOON_INITIAL = 4;

/**
 * Tehničarev pogled: servisi zakazani za njega (ili za bilo koga) i objekti kojima
 * servis uskoro dospijeva. "Upiši servis" otvara unos s objektom i uređajima.
 */
export function UpcomingServicesCard({ hideScheduled = false }: { hideScheduled?: boolean } = {}) {
  const { user } = useAuth();
  const board = useServiceBoard();
  const [logging, setLogging] = useState<ServiceItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { today } = board;

  if (board.isLoading || !board.enabled) return null;

  const scheduled = board.items
    .filter(i => !hideScheduled && i.sc.status === 'scheduled' && (!i.sc.assigned_to || i.sc.assigned_to === user?.id))
    .sort((a, b) => (a.sc.scheduled_for ?? '').localeCompare(b.sc.scheduled_for ?? ''));
  const soon = board.items
    .filter(i => (i.sc.status === 'due' || i.sc.status === 'contacted') && dueText(i.sc.due_date, today).days <= SOON_DAYS)
    .sort((a, b) => a.sc.due_date.localeCompare(b.sc.due_date));
  const soonShown = showAll ? soon : soon.slice(0, SOON_INITIAL);
  // Uz "Moje naloge" (zakazani servisi su nalozi) prikazuje se samo popis koji uskoro dospijeva
  if (hideScheduled && soon.length === 0) return null;

  return (
    <section aria-labelledby="upcoming-services" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 id="upcoming-services" className="text-sm font-semibold text-slate-800">Nadolazeći servisi</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {hideScheduled
              ? `Dospijeva u idućih ${SOON_DAYS} dana, još nije zakazano`
              : scheduled.length > 0
              ? `${scheduled.length} ${pluralHr(scheduled.length, 'zakazan', 'zakazana', 'zakazanih')} za vas`
              : 'Nema zakazanih servisa za vas'}
          </p>
        </div>
        <Wrench size={16} className="text-slate-400" aria-hidden="true" />
      </div>

      {scheduled.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {scheduled.map(item => {
            const day = item.sc.scheduled_for ?? today;
            const past = day < today;
            return (
              <li key={item.sc.id} className="px-4 py-3.5 sm:px-5 flex gap-3">
                <div className={cn('w-14 shrink-0 rounded-xl border text-center py-1.5 self-start',
                  day === today ? 'bg-blue-600 border-blue-600 text-white' : past ? 'bg-red-50 border-red-200 text-red-800' : 'bg-slate-50 border-slate-200 text-slate-800')}>
                  <span className="block text-xs font-semibold leading-tight">{visitDayLabel(day, today)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/klijenti/${item.client.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                    {item.client.name}
                  </Link>
                  <p className="text-sm text-slate-700">
                    <a href={mapsUrl(item.site)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      <MapPin size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
                      {siteAddress(item.site)}<span className="sr-only"> (otvara kartu)</span>
                    </a>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{item.devices.map(deviceDisplayName).join(' · ')}</p>
                  {item.client.phone && (
                    <a href={`tel:${item.client.phone.replace(/\s/g, '')}`} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-700 hover:underline tabular-nums">
                      <Phone size={12} aria-hidden="true" /> {item.client.phone}
                    </a>
                  )}
                  {item.site.access_notes && <p className="text-xs text-slate-700 mt-1">Pristup: {item.site.access_notes}</p>}
                  {item.sc.note && <p className="text-xs text-slate-700 mt-1 italic">„{item.sc.note}”</p>}
                  <button type="button" onClick={() => setLogging(item)}
                    className="mt-2.5 inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg">
                    <PlusCircle size={15} aria-hidden="true" /> Upiši servis
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {soon.length > 0 && (
        <div className={cn(scheduled.length > 0 && 'border-t border-slate-100')}>
          <h3 className="px-4 sm:px-5 pt-3 text-xs font-semibold text-slate-600">
            Uskoro dospijeva · {soon.length}
          </h3>
          <ul className="divide-y divide-slate-100">
            {soonShown.map(item => {
              const due = dueText(item.sc.due_date, today);
              return (
                <li key={item.sc.id}>
                  <Link to={`/klijenti/${item.client.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate">{item.client.name}</span>
                      <span className="block text-xs text-slate-600 truncate">{[item.site.city || siteAddress(item.site), item.devices.map(deviceDisplayName).join(', ')].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
                      due.late ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200')}>
                      <CalendarClock size={11} aria-hidden="true" /> {due.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {soon.length > SOON_INITIAL && (
            <button type="button" onClick={() => setShowAll(v => !v)}
              className="w-full min-h-11 text-sm font-medium text-blue-700 hover:bg-blue-50 border-t border-slate-100">
              {showAll ? 'Prikaži manje' : `Prikaži sve (${soon.length})`}
            </button>
          )}
        </div>
      )}

      {scheduled.length === 0 && soon.length === 0 && (
        <p className="px-4 sm:px-5 py-5 text-sm text-slate-600">Nijedan servis ne dospijeva u idućih {SOON_DAYS} dana.</p>
      )}

      {logging && (
        <WorkLogForm
          onClose={() => setLogging(null)}
          presetSiteId={logging.site.id}
          presetDeviceIds={logging.devices.map(d => d.id)}
          presetTask="Redovni servis"
        />
      )}
    </section>
  );
}
