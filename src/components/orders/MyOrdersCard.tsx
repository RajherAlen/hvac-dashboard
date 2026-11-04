import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, parseISO } from 'date-fns';
import { CheckCircle2, CircleAlert, ClipboardList, MapPin, Phone, PlusCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClientDirectory } from '../../hooks/useClients';
import { useProfileNames } from '../../hooks/useWorkLogChanges';
import { usePlan, type PlanAssignment } from '../../hooks/useWorkOrders';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { mapsUrl, OFFICE_LOCATION, OFFICE_SITE, siteAddress } from '../../lib/clients';
import { toISODate } from '../../lib/format-date';
import { assignmentState, KIND_LABEL } from '../../lib/orders';
import { deviceDisplayName, visitDayLabel } from '../../lib/service';
import { cn, formatHours, pluralHr, todayISO } from '../../lib/utils';
import { WorkLogForm, type PresetItem } from '../WorkLogForm';
import { UpcomingServicesCard } from '../services/UpcomingServicesCard';
import { KindIcon } from './KindIcon';

/**
 * Tehničarevi nalozi: neupisani iz proteklih dana, danas, sutra i ostatak tjedna.
 * "Upiši rad" otvara unos popunjen iz naloga; "Upiši cijeli dan" svim današnjim nalozima.
 * Bez migracije naloga prikazuje se dosadašnja kartica servisa.
 */
export function MyOrdersCard() {
  const { user } = useAuth();
  const today = todayISO();
  const from = toISODate(addDays(parseISO(today), -7));
  const to = toISODate(addDays(parseISO(today), 6));
  const planQ = usePlan(from, to);
  const { data: myLogs = [] } = useWorkLogs({ employeeId: user?.id, startDate: from, endDate: today });
  const dir = useClientDirectory();
  const names = useProfileNames();
  const [logging, setLogging] = useState<{ items: PresetItem[]; date: string } | null>(null);

  const all = useMemo(() => planQ.data ?? [], [planQ.data]);
  const logged = useMemo(() => new Set(myLogs.map(l => l.assignment_id).filter(Boolean) as string[]), [myLogs]);
  const mine = all.filter(a => a.employee_id === user?.id && a.work_orders.status !== 'cancelled');

  if (planQ.isLoading) return null;
  if (planQ.data === null) return <UpcomingServicesCard />;

  const stateOf = (a: PlanAssignment) => assignmentState(a, logged.has(a.id), today);
  const missed = mine.filter(a => a.day < today && stateOf(a) === 'missed');
  const todays = mine.filter(a => a.day === today);
  const upcoming = mine.filter(a => a.day > today);
  const todayOpen = todays.filter(a => stateOf(a) !== 'done');

  const preset = (a: PlanAssignment): PresetItem => {
    const o = a.work_orders;
    const later = all.some(x => x.work_order_id === a.work_order_id && x.day > a.day);
    const client = o.site_id ? dir.siteIndex.get(o.site_id)?.client.name : OFFICE_LOCATION;
    return {
      site: o.site_id ?? OFFICE_SITE,
      device_ids: o.work_order_devices.map(d => d.device_id),
      task: o.title,
      hours: Number(a.planned_hours),
      is_service: o.kind === 'servis',
      assignment_id: a.id,
      order_done: !later,
      label: client ? `${o.title}, ${client}` : o.title,
    };
  };

  const item = (a: PlanAssignment) => {
    const o = a.work_orders;
    const hit = o.site_id ? dir.siteIndex.get(o.site_id) : undefined;
    const state = stateOf(a);
    const mates = all.filter(x => x.work_order_id === a.work_order_id && x.day === a.day && x.employee_id !== a.employee_id)
      .map(x => names.get(x.employee_id)?.name.split(' ')[0]).filter(Boolean);
    return (
      <li key={a.id} className="px-4 py-3.5 sm:px-5 flex gap-3">
        <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          state === 'done' ? 'bg-slate-800 text-white' : state === 'missed' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700')}>
          <KindIcon kind={o.kind} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="text-sm font-semibold text-slate-900">
              {hit ? <Link to={`/klijenti/${hit.client.id}`} className="hover:text-blue-700 hover:underline">{hit.client.name}</Link> : OFFICE_LOCATION}
            </p>
            <span className="text-xs text-slate-600 tabular-nums">{KIND_LABEL[o.kind]} · {formatHours(Number(a.planned_hours))}</span>
          </div>
          <p className="text-sm text-slate-800">{o.title}</p>
          {hit && (
            <a href={mapsUrl(hit.site)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-700 hover:underline">
              <MapPin size={12} className="text-slate-500 shrink-0" aria-hidden="true" />{siteAddress(hit.site)}<span className="sr-only"> (otvara kartu)</span>
            </a>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-600">
            {hit?.client.phone && (
              <a href={`tel:${hit.client.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:underline tabular-nums">
                <Phone size={12} aria-hidden="true" />{hit.client.phone}
              </a>
            )}
            {o.work_order_devices.length > 0 && (
              <span>{o.work_order_devices.map(d => { const dev = dir.deviceIndex.get(d.device_id)?.device; return dev ? deviceDisplayName(dev) : 'Uređaj'; }).join(' · ')}</span>
            )}
            {mates.length > 0 && <span>s kolegom: {mates.join(', ')}</span>}
          </div>
          {hit?.site.access_notes && <p className="text-xs text-slate-700 mt-1">Pristup: {hit.site.access_notes}</p>}
          {o.notes && <p className="text-xs text-slate-700 mt-1 italic">„{o.notes}”</p>}
          {state === 'done' ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 size={13} aria-hidden="true" /> Rad upisan</p>
          ) : a.day <= today && (
            <button type="button" onClick={() => setLogging({ items: [preset(a)], date: a.day })}
              className="mt-2.5 inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg">
              <PlusCircle size={15} aria-hidden="true" /> Upiši rad
            </button>
          )}
        </div>
      </li>
    );
  };

  const group = (title: string, items: PlanAssignment[], tone?: 'missed') => items.length > 0 && (
    <div className="border-t border-slate-100 first:border-t-0">
      <h3 className={cn('px-4 sm:px-5 pt-3 text-xs font-semibold', tone === 'missed' ? 'text-red-800' : 'text-slate-700')}>
        {tone === 'missed' && <CircleAlert size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />}{title}
      </h3>
      <ul className="divide-y divide-slate-100">{items.map(item)}</ul>
    </div>
  );

  const byDay = new Map<string, PlanAssignment[]>();
  for (const a of upcoming) { if (!byDay.has(a.day)) byDay.set(a.day, []); byDay.get(a.day)!.push(a); }

  return (
    <>
      <section aria-labelledby="my-orders" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 id="my-orders" className="text-sm font-semibold text-slate-800">Moji nalozi</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {todays.length > 0
                ? `Danas ${todays.length} ${pluralHr(todays.length, 'nalog', 'naloga', 'naloga')} · ${formatHours(todays.reduce((s, a) => s + Number(a.planned_hours), 0))} planirano`
                : 'Danas nemate dodijeljenih naloga'}
            </p>
          </div>
          {todayOpen.length > 1 ? (
            <button type="button" onClick={() => setLogging({ items: todayOpen.map(preset), date: today })}
              className="shrink-0 inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
              <PlusCircle size={15} aria-hidden="true" /> Upiši cijeli dan
            </button>
          ) : <ClipboardList size={16} className="text-slate-400" aria-hidden="true" />}
        </div>
        {group(`Neupisano · ${missed.length}`, missed, 'missed')}
        {group('Danas', todays)}
        {[...byDay.entries()].map(([d, items]) => <div key={d}>{group(visitDayLabel(d, today), items)}</div>)}
        {mine.length === 0 && <p className="px-4 sm:px-5 py-5 text-sm text-slate-600">Za ovaj tjedan još nema dodijeljenih naloga.</p>}
      </section>

      <UpcomingServicesCard hideScheduled />

      {logging && (
        <WorkLogForm onClose={() => setLogging(null)} presetItems={logging.items} presetDate={logging.date} />
      )}
    </>
  );
}
