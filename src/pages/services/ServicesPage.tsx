import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarCheck, CalendarClock, ChevronDown, MessageSquare, MoreHorizontal, Undo2, Wrench, XCircle, CheckCircle2, HelpCircle,
} from 'lucide-react';
import { useServiceBoard, useUpdateServiceCase, type ServiceItem } from '../../hooks/useServiceCases';
import { useProfileNames } from '../../hooks/useWorkLogChanges';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ContactDialog, ScheduleDialog } from '../../components/services/ServiceDialogs';
import { OrderFormDialog } from '../../components/orders/OrderFormDialog';
import { usePlan } from '../../hooks/useWorkOrders';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { siteAddress } from '../../lib/clients';
import { errorMessage } from '../../lib/errors';
import { formatNumeric, formatRelative } from '../../lib/format-date';
import { deviceDisplayName, dueText, visitDayLabel, SERVICE_HORIZON_DAYS } from '../../lib/service';
import { cn, pluralHr, todayISO } from '../../lib/utils';
import type { ServiceCase } from '../../types';

type Tab = 'contact' | 'scheduled' | 'snoozed' | 'declined';

const TABS: { key: Tab; label: string }[] = [
  { key: 'contact', label: 'Za kontakt' },
  { key: 'scheduled', label: 'Zakazano' },
  { key: 'snoozed', label: 'Odgođeno' },
  { key: 'declined', label: 'Odbili' },
];

const inTab = (sc: ServiceCase, tab: Tab) =>
  tab === 'contact' ? sc.status === 'due' || sc.status === 'contacted'
    : tab === 'scheduled' ? sc.status === 'scheduled'
      : tab === 'snoozed' ? sc.status === 'snoozed'
        : sc.status === 'declined';

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ServicesPage() {
  useDocumentTitle('Servisi');
  const board = useServiceBoard();
  const names = useProfileNames();
  const [tab, setTab] = useState<Tab>('contact');
  const [city, setCity] = useState('');
  const [contacting, setContacting] = useState<ServiceItem | null>(null);
  const [scheduling, setScheduling] = useState<ServiceItem | null>(null);
  const navigate = useNavigate();
  // S rasporedom naloga zakazivanje servisa stvara nalog, a postojeći termin se mijenja u rasporedu
  const ordersProbe = usePlan(todayISO(), todayISO());
  const ordersOn = ordersProbe.data !== undefined && ordersProbe.data !== null;
  const schedule = (item: ServiceItem) => {
    if (ordersOn && item.sc.status === 'scheduled' && item.sc.scheduled_for) {
      navigate(`/raspored?view=week&date=${item.sc.scheduled_for}`);
      return;
    }
    setScheduling(item);
  };
  const [declining, setDeclining] = useState<ServiceItem | null>(null);
  const update = useUpdateServiceCase();
  const { today } = board;

  const cities = useMemo(
    () => [...new Set(board.items.map(i => i.site.city?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'hr')),
    [board.items],
  );
  const filtered = board.items.filter(i => !city || i.site.city?.trim() === city);
  const counts = Object.fromEntries(TABS.map(t => [t.key, filtered.filter(i => inTab(i.sc, t.key)).length])) as Record<Tab, number>;
  const shown = filtered.filter(i => inTab(i.sc, tab));

  if (!board.isLoading && board.clientsMissing) return <ModuleNotEnabled />;
  if (!board.isLoading && board.casesMissing) return <NotEnabled />;

  /** Promjena statusa s mogućnošću poništavanja. */
  const change = (item: ServiceItem, patch: Partial<ServiceCase>, message: string) => {
    const prev: Partial<ServiceCase> = {
      status: item.sc.status, snooze_until: item.sc.snooze_until, scheduled_for: item.sc.scheduled_for,
      assigned_to: item.sc.assigned_to, contacted_at: item.sc.contacted_at,
    };
    return update.mutateAsync({ id: item.sc.id, patch }).then(() => {
      toast.success(message, {
        description: item.client.name,
        action: { label: 'Poništi', onClick: () => update.mutate({ id: item.sc.id, patch: prev }) },
      });
    });
  };

  const groups: { key: string; title: string; items: ServiceItem[] }[] = [];
  if (tab === 'contact') {
    const late = shown.filter(i => i.sc.due_date < today);
    const month = today.slice(0, 7);
    const thisMonth = shown.filter(i => i.sc.due_date >= today && i.sc.due_date.slice(0, 7) === month);
    const later = shown.filter(i => i.sc.due_date >= today && i.sc.due_date.slice(0, 7) !== month);
    groups.push({ key: 'late', title: 'Kasni', items: late }, { key: 'month', title: 'Ovaj mjesec', items: thisMonth }, { key: 'later', title: 'Uskoro', items: later });
  } else if (tab === 'scheduled') {
    const byDay = new Map<string, ServiceItem[]>();
    for (const i of [...shown].sort((a, b) => (a.sc.scheduled_for ?? '').localeCompare(b.sc.scheduled_for ?? ''))) {
      const k = i.sc.scheduled_for ?? '';
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(i);
    }
    for (const [d, items] of byDay) {
      groups.push({ key: d, title: d ? `${visitDayLabel(d, today)}${d < today ? ' · termin je prošao' : ''}` : 'Bez datuma', items });
    }
  } else {
    groups.push({ key: tab, title: '', items: shown });
  }

  return (
    <div className="px-4 py-5 sm:p-6 lg:p-8 space-y-5 max-w-5xl">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Servisi</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Godišnji servisi klima i plamenika. Objekt se pojavi ovdje {SERVICE_HORIZON_DAYS} dana prije roka,
          a nestaje sam kad tehničar upiše servis.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div role="tablist" aria-label="Stanje servisa" className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cn('shrink-0 min-h-10 px-3 text-sm font-medium rounded-lg whitespace-nowrap',
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
              {t.label} <span className={cn('ml-1 tabular-nums', tab === t.key ? 'text-slate-600' : 'text-slate-500')}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {cities.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span>Grad</span>
            <select value={city} onChange={e => setCity(e.target.value)}
              className="min-h-10 px-3 pr-8 text-sm bg-white border border-slate-300 rounded-lg">
              <option value="">Svi gradovi</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      {board.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Učitavanje">
          {[0, 1, 2].map(i => <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-6">
          {groups.filter(g => g.items.length > 0).map(g => (
            <section key={g.key} aria-labelledby={g.title ? `g-${g.key}` : undefined}>
              {g.title && (
                <h2 id={`g-${g.key}`} className={cn('text-sm font-semibold mb-2 flex items-center gap-1.5',
                  g.key === 'late' ? 'text-red-800' : 'text-slate-800')}>
                  {g.key === 'late' && <AlertTriangle size={14} aria-hidden="true" />}
                  {g.title} <span className="font-normal text-slate-600">· {g.items.length}</span>
                </h2>
              )}
              <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm">
                {g.items.map(item => (
                  <CaseRow key={item.sc.id} item={item} today={today} assignee={item.sc.assigned_to ? names.get(item.sc.assigned_to)?.name ?? null : null}
                    onContact={() => setContacting(item)}
                    onSchedule={() => schedule(item)}
                    onDecline={() => setDeclining(item)}
                    onChange={(patch, msg) => { void change(item, patch, msg).catch(e => toast.error(errorMessage(e))); }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {board.noDueDevices.length > 0 && <NoDueNotice devices={board.noDueDevices} />}

      {contacting && (
        <ContactDialog item={contacting} onClose={() => setContacting(null)}
          onSchedule={() => { const it = contacting; setContacting(null); schedule(it); }} />
      )}
      {scheduling && (ordersOn ? (
        <OrderFormDialog
          preset={{ kind: 'servis', site_id: scheduling.site.id, device_ids: scheduling.devices.map(d => d.id), title: 'Redovni servis', service_case_id: scheduling.sc.id }}
          onClose={() => setScheduling(null)}
        />
      ) : <ScheduleDialog item={scheduling} onClose={() => setScheduling(null)} />)}
      <ConfirmDialog
        open={!!declining}
        onOpenChange={o => { if (!o) setDeclining(null); }}
        tone="neutral"
        title="Klijent ne želi servis?"
        description={declining && <>{declining.client.name} nestaje s popisa i ponovno se pojavljuje za otprilike godinu dana.</>}
        confirmLabel="Klijent odbio"
        onConfirm={async () => { if (declining) await change(declining, { status: 'declined' }, 'Označeno: klijent odbio'); }}
        error={update.error ? errorMessage(update.error) : null}
      />
    </div>
  );
}

function CaseRow({ item, today, assignee, onContact, onSchedule, onDecline, onChange }: {
  item: ServiceItem;
  today: string;
  assignee: string | null;
  onContact: () => void;
  onSchedule: () => void;
  onDecline: () => void;
  onChange: (patch: Partial<ServiceCase>, message: string) => void;
}) {
  const { sc, client, site } = item;
  const due = dueText(sc.due_date, today);
  const open = sc.status === 'due' || sc.status === 'contacted';

  let statusLine: React.ReactNode;
  if (sc.status === 'scheduled') statusLine = <>Zakazano {sc.scheduled_for ? formatNumeric(sc.scheduled_for) : ''}{assignee ? ` · ${assignee}` : ' · bilo koji tehničar'}</>;
  else if (sc.status === 'contacted') statusLine = <>Kontaktiran {sc.contacted_at ? formatRelative(sc.contacted_at) : ''}, čeka se termin</>;
  else if (sc.status === 'snoozed') statusLine = <>Odgođeno do {sc.snooze_until ? formatNumeric(sc.snooze_until) : '—'}</>;
  else if (sc.status === 'declined') statusLine = <>Klijent odbio {sc.closed_at ? formatRelative(sc.closed_at) : ''}</>;
  else statusLine = <span className="text-slate-700">Nije kontaktiran</span>;

  return (
    <li className="px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link to={`/klijenti/${client.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">{client.name}</Link>
          <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
            due.late ? 'bg-red-50 text-red-800 border-red-200' : due.days <= 14 ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200')}>
            {due.late ? <AlertTriangle size={11} aria-hidden="true" /> : <CalendarClock size={11} aria-hidden="true" />}
            {due.text}
          </span>
        </div>
        <p className="text-sm text-slate-700 mt-0.5">{siteAddress(site)}{site.label ? ` (${site.label})` : ''}</p>
        <p className="text-xs text-slate-600 mt-1">
          {item.devices.map(deviceDisplayName).join(' · ') || 'Bez uređaja'}
          {item.lastService && <> · zadnji servis {formatNumeric(item.lastService)}</>}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          {statusLine}
          {client.phone && <> · <a href={`tel:${client.phone.replace(/\s/g, '')}`} className="tabular-nums hover:underline">{client.phone}</a></>}
        </p>
        {sc.note && <p className="text-xs text-slate-700 mt-1 italic">„{sc.note}”</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {open && (
          <button type="button" onClick={onContact}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            <MessageSquare size={15} aria-hidden="true" /> Kontaktiraj
          </button>
        )}
        {(open || sc.status === 'scheduled') && (
          <button type="button" onClick={onSchedule}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
            <CalendarCheck size={15} aria-hidden="true" /> {sc.status === 'scheduled' ? 'Promijeni termin' : 'Zakaži'}
          </button>
        )}
        {(sc.status === 'snoozed' || sc.status === 'declined') && (
          <button type="button"
            onClick={() => onChange({ status: sc.contacted_at ? 'contacted' : 'due' }, 'Vraćeno na popis za kontakt')}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
            <Undo2 size={15} aria-hidden="true" /> Vrati na popis
          </button>
        )}
        {(open || sc.status === 'scheduled') && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label={`Više radnji: ${client.name}`}
              className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg data-[state=open]:bg-slate-100">
              <MoreHorizontal size={16} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12}
                className="z-50 min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                {sc.status === 'due' && (
                  <MenuItem icon={CheckCircle2} onSelect={() => onChange({ status: 'contacted', contacted_at: new Date().toISOString() }, 'Označeno kao kontaktiran')}>
                    Označi kao kontaktiran
                  </MenuItem>
                )}
                {sc.status === 'scheduled' && (
                  <MenuItem icon={XCircle} onSelect={() => onChange({ status: 'contacted' }, 'Termin otkazan')}>Otkaži termin</MenuItem>
                )}
                {open && (
                  <>
                    <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-medium text-slate-600">Odgodi</DropdownMenu.Label>
                    {([[7, '1 tjedan'], [14, '2 tjedna'], [30, '1 mjesec']] as const).map(([n, l]) => (
                      <MenuItem key={n} icon={CalendarClock}
                        onSelect={() => { const until = addDays(today, n); onChange({ status: 'snoozed', snooze_until: until }, `Odgođeno do ${formatNumeric(until)}`); }}>
                        Za {l}
                      </MenuItem>
                    ))}
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                    <MenuItem icon={XCircle} onSelect={onDecline}>Klijent odbio…</MenuItem>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </li>
  );
}

function MenuItem({ icon: Icon, onSelect, children }: { icon: typeof Wrench; onSelect: () => void; children: React.ReactNode }) {
  return (
    <DropdownMenu.Item onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100">
      <Icon size={15} className="text-slate-500 shrink-0" aria-hidden="true" />
      {children}
    </DropdownMenu.Item>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const text: Record<Tab, string> = {
    contact: 'Nikoga ne treba kontaktirati. Novi objekti stižu na popis 45 dana prije roka servisa.',
    scheduled: 'Nema zakazanih servisa. Zakažite ih s popisa „Za kontakt”.',
    snoozed: 'Nema odgođenih servisa.',
    declined: 'Nijedan klijent nije odbio servis.',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-10 text-center">
      <Wrench size={26} className="mx-auto text-slate-300" aria-hidden="true" />
      <p className="mt-2 text-sm text-slate-700 max-w-sm mx-auto">{text[tab]}</p>
    </div>
  );
}

function NoDueNotice({ devices }: { devices: ReturnType<typeof useServiceBoard>['noDueDevices'] }) {
  const byClient = new Map<string, { name: string; n: number }>();
  for (const d of devices) {
    const cur = byClient.get(d.client.id) ?? { name: d.client.name, n: 0 };
    cur.n++;
    byClient.set(d.client.id, cur);
  }
  return (
    <details className="group bg-white border border-slate-200 rounded-xl">
      <summary className="flex items-start gap-2 px-4 py-3 sm:px-5 cursor-pointer list-none text-sm text-slate-700">
        <HelpCircle size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="flex-1">
          <strong className="font-semibold text-slate-900">{devices.length} {pluralHr(devices.length, 'uređaj nema', 'uređaja nemaju', 'uređaja nema')} rok servisa</strong>
          {' '}jer nemaju datum ugradnje ni upisan servis. Dopunite ih da se pojave na popisu.
        </span>
        <ChevronDown size={16} className="mt-0.5 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="px-4 sm:px-5 pb-3 flex flex-wrap gap-2">
        {[...byClient.entries()].map(([id, c]) => (
          <li key={id}>
            <Link to={`/klijenti/${id}`} className="inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800">
              {c.name} <span className="text-slate-500 tabular-nums">{c.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function NotEnabled() {
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <Wrench size={32} className="text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Servisi još nisu uključeni</h1>
      <p className="mt-2 text-sm text-slate-700">
        Pokrenite migraciju <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">supabase/migrations/20261107_service_cases.sql</code> u Supabase SQL editoru.
        Do tada nadzorna ploča i dalje prikazuje karticu servisa koji uskoro dospijevaju.
      </p>
    </div>
  );
}
