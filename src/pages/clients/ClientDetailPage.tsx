import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import {
  ChevronRight, Phone, Mail, MapPin, KeyRound, ExternalLink, Plus, MoreHorizontal, Pencil,
  Archive, ArchiveRestore, Merge, CheckCircle2, Download, PlusCircle, Clock,
} from 'lucide-react';
import {
  useClientDirectory, useDeviceServiceStatus, useSiteLogs, useWorkLogDevices, useSetEntityFlags,
} from '../../hooks/useClients';
import { useAuth } from '../../hooks/useAuth';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { Field } from '../../components/ui/form';
import { DatePicker } from '../../components/ui/DatePicker';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DeviceNameplate } from '../../components/clients/DeviceNameplate';
import { DeviceDetailDialog } from '../../components/clients/DeviceDetailDialog';
import { ClientFormDialog, SiteFormDialog, DeviceFormDialog } from '../../components/clients/ClientForms';
import { MergeDialog } from '../../components/clients/MergeDialog';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { WorkLogForm } from '../../components/WorkLogForm';
import { CLIENT_KIND_LABEL, DEVICE_KIND_LABEL, mapsUrl, siteAddress } from '../../lib/clients';
import { capitalize, formatDayLong } from '../../lib/format-date';
import { formatHours, initials, pluralHr, todayISO } from '../../lib/utils';
import { sumHours } from '../../lib/period';
import { errorMessage } from '../../lib/errors';
import { exportClientPdf, reportExport } from '../../lib/exportPdf';
import type { Device, Site } from '../../types';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const today = todayISO();
  const dir = useClientDirectory();
  const client = dir.clients.find(c => c.id === id);
  useDocumentTitle(client?.name ?? (dir.isLoading ? null : 'Klijent nije pronađen'));

  const period = usePeriod('month');
  const [showArchived, setShowArchived] = useState(false);
  const sites = (client?.sites ?? []).filter(s => showArchived || !s.archived_at);
  const siteIds = (client?.sites ?? []).map(s => s.id);
  const { data: service = {} } = useDeviceServiceStatus(dir.enabled && !!client);
  const { data: logs = [], isLoading: logsLoading } = useSiteLogs(siteIds, period.start, period.end);
  const { data: logDevices = {} } = useWorkLogDevices(logs.map(l => l.id));

  const flags = useSetEntityFlags();
  const [editClient, setEditClient] = useState(false);
  const [mergeClient, setMergeClient] = useState(false);
  const [archiveClient, setArchiveClient] = useState(false);
  const [siteForm, setSiteForm] = useState<{ site?: Site } | null>(null);
  const [mergeSite, setMergeSite] = useState<Site | null>(null);
  const [deviceForm, setDeviceForm] = useState<{ siteId: string } | null>(null);
  // Nakon stvaranja novog klijenta (?uredaj=1) odmah se nudi unos prvog uređaja
  const [searchParams, setSearchParams] = useSearchParams();
  const askFirstDevice = searchParams.get('uredaj') === '1' ? sites.find(s => !s.archived_at) : undefined;
  const [openDevice, setOpenDevice] = useState<Device | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);

  const visits = new Set(logs.map(l => l.log_date)).size;
  const techs = new Set(logs.map(l => l.employee_id)).size;

  const byDateMap = new Map<string, typeof logs>();
  for (const l of logs) {
    if (!byDateMap.has(l.log_date)) byDateMap.set(l.log_date, []);
    byDateMap.get(l.log_date)!.push(l);
  }
  const byDate = [...byDateMap.entries()];

  if (dir.missingSchema) return <ModuleNotEnabled />;
  if (dir.isLoading) {
    return (
      <div className="px-4 py-4 sm:p-6 space-y-4" aria-busy="true">
        <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid lg:grid-cols-2 gap-4"><div className="h-64 bg-slate-100 rounded-2xl animate-pulse" /><div className="h-64 bg-slate-100 rounded-2xl animate-pulse" /></div>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="px-4 py-4 sm:p-6">
        <p className="text-slate-700">Klijent nije pronađen.</p>
        <Link to="/klijenti" className="text-blue-700 text-sm mt-2 inline-block hover:underline">Natrag na klijente</Link>
      </div>
    );
  }

  const needsReview = client.needs_review || client.sites.some(s => s.needs_review || s.devices.some(d => d.needs_review));
  const markReviewed = async () => {
    await Promise.all([
      flags.mutateAsync({ table: 'clients', id: client.id, reviewed: true }),
      ...client.sites.filter(s => s.needs_review).map(s => flags.mutateAsync({ table: 'sites', id: s.id, reviewed: true })),
      ...client.sites.flatMap(s => s.devices.filter(d => d.needs_review).map(d => flags.mutateAsync({ table: 'devices', id: d.id, reviewed: true }))),
    ]);
    toast.success('Podaci potvrđeni');
  };
  const siteName = (siteId: string | null | undefined) => {
    const s = client.sites.find(x => x.id === siteId);
    return s ? siteAddress(s) + (s.label ? ` (${s.label})` : '') : '';
  };
  const deviceName = (deviceId: string) => {
    const d = client.sites.flatMap(s => s.devices).find(x => x.id === deviceId);
    return d ? [d.brand, d.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[d.kind] : '';
  };

  const menuItem = 'flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100';

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-5">
      <nav aria-label="Putanja">
        <ol className="flex items-center gap-1.5 text-sm text-slate-600">
          <li><Link to="/klijenti" className="hover:text-slate-900 hover:underline">Klijenti</Link></li>
          <li aria-hidden="true"><ChevronRight size={14} className="text-slate-400" /></li>
          <li aria-current="page" className="font-medium text-slate-900 truncate">{client.name}</li>
        </ol>
      </nav>

      {/* Zaglavlje */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">{client.name}</h1>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{CLIENT_KIND_LABEL[client.kind]}</span>
              {client.archived_at && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">Arhiviran</span>}
              {needsReview && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">Novo – provjeriti</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-700">
              {client.phone && <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-700"><Phone size={14} aria-hidden="true" />{client.phone}</a>}
              {client.email && <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-blue-700"><Mail size={14} aria-hidden="true" />{client.email}</a>}
              {client.oib && <span className="tabular-nums">OIB {client.oib}</span>}
            </div>
            {client.notes && <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{client.notes}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isAdmin && sites.length > 0 && (
              <button type="button" onClick={() => setLogFor(sites[0].id)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                <PlusCircle size={15} aria-hidden="true" /> Upiši rad ovdje
              </button>
            )}
            {isAdmin && needsReview && (
              <button type="button" onClick={() => void markReviewed().catch(e => toast.error(errorMessage(e)))}
                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg">
                <CheckCircle2 size={15} aria-hidden="true" /> Potvrdi podatke
              </button>
            )}
            <button type="button" disabled={logsLoading}
              onClick={() => reportExport(exportClientPdf(client, logs, period.label, logDevices))}
              aria-label={`Izvezi PDF za klijenta ${client.name}, ${period.label}`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg">
              <Download size={15} aria-hidden="true" /> <span className="hidden sm:inline">PDF</span>
            </button>
            {isAdmin && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger aria-label="Više radnji"
                  className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-2.5 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg data-[state=open]:bg-slate-100">
                  <MoreHorizontal size={16} aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                    <DropdownMenu.Item className={menuItem} onSelect={() => setEditClient(true)}><Pencil size={15} className="text-slate-500" aria-hidden="true" />Uredi klijenta</DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setMergeClient(true)}><Merge size={15} className="text-slate-500" aria-hidden="true" />Spoji s drugim klijentom…</DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setShowArchived(v => !v)}><Archive size={15} className="text-slate-500" aria-hidden="true" />{showArchived ? 'Sakrij arhivirane objekte' : 'Prikaži arhivirane objekte'}</DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                    {client.archived_at ? (
                      <DropdownMenu.Item className={menuItem}
                        onSelect={() => flags.mutate({ table: 'clients', id: client.id, archived: false }, { onSuccess: () => toast.success('Klijent vraćen iz arhive') })}>
                        <ArchiveRestore size={15} className="text-slate-500" aria-hidden="true" />Vrati iz arhive
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item className={menuItem} onSelect={() => setArchiveClient(true)}><Archive size={15} className="text-slate-500" aria-hidden="true" />Arhiviraj klijenta…</DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      </div>

      {/* Period + brojke */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 sm:px-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle period={period} views={['week', 'month', 'custom']} />
        {period.view === 'custom' ? (
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <Field label="Od" className="[&_label]:text-xs [&_label]:mb-0.5">{p => <DatePicker {...p} size="sm" value={period.start} max={period.end} onChange={v => period.setCustomRange(v, period.end)} />}</Field>
            <Field label="Do" className="[&_label]:text-xs [&_label]:mb-0.5">{p => <DatePicker {...p} size="sm" value={period.end} min={period.start} max={today} onChange={v => period.setCustomRange(period.start, v)} />}</Field>
          </div>
        ) : <PeriodStepper period={period} />}
        <p className="w-full sm:w-auto sm:ml-auto text-sm text-slate-700">
          {logsLoading ? 'Učitavanje…' : <><strong className="tabular-nums">{formatHours(sumHours(logs))}</strong> u {visits} {pluralHr(visits, 'posjetu', 'posjeta', 'posjeta')}{techs > 0 && <>, {techs} {pluralHr(techs, 'tehničar', 'tehničara', 'tehničara')}</>}</>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-start">
        {/* Objekti i uređaji */}
        <section aria-labelledby="sites-title" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="sites-title" className="text-base font-semibold text-slate-900">
              {sites.length === 1 ? 'Objekt' : `Objekti (${sites.length})`}
            </h2>
            <button type="button" onClick={() => setSiteForm({})}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 px-2 py-1 rounded-lg">
              <Plus size={15} aria-hidden="true" /> Dodaj objekt
            </button>
          </div>

          {sites.map(site => {
            const devices = site.devices.filter(d => showArchived || !d.archived_at);
            return (
              <article key={site.id} className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${site.archived_at ? 'opacity-70' : ''}`}>
                <header className="flex items-start gap-3 px-4 sm:px-5 pt-4">
                  <MapPin size={18} className="text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {siteAddress(site)}
                      {site.label && <span className="font-normal text-slate-600"> ({site.label})</span>}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs">
                      <a href={mapsUrl(site)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                        Otvori u Google kartama <ExternalLink size={11} aria-hidden="true" /><span className="sr-only">(nova kartica)</span>
                      </a>
                      {site.needs_review && <span className="font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">Novo</span>}
                      {site.archived_at && <span className="font-semibold text-slate-700 bg-slate-200 px-1.5 py-0.5 rounded">Arhiviran</span>}
                    </div>
                    {site.access_notes && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                        <KeyRound size={12} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                        <span><span className="sr-only">Pristup: </span>{site.access_notes}</span>
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger aria-label={`Radnje za objekt ${siteAddress(site)}`}
                        className="-mr-2 p-2 rounded-lg text-slate-500 hover:bg-slate-100 data-[state=open]:bg-slate-100">
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={12} className="z-50 min-w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                          <DropdownMenu.Item className={menuItem} onSelect={() => setSiteForm({ site })}><Pencil size={15} className="text-slate-500" aria-hidden="true" />Uredi objekt</DropdownMenu.Item>
                          <DropdownMenu.Item className={menuItem} onSelect={() => setMergeSite(site)}><Merge size={15} className="text-slate-500" aria-hidden="true" />Spoji s objektom…</DropdownMenu.Item>
                          <DropdownMenu.Item className={menuItem}
                            onSelect={() => flags.mutate({ table: 'sites', id: site.id, archived: !site.archived_at }, { onSuccess: () => toast.success(site.archived_at ? 'Objekt vraćen' : 'Objekt arhiviran') })}>
                            {site.archived_at ? <ArchiveRestore size={15} className="text-slate-500" aria-hidden="true" /> : <Archive size={15} className="text-slate-500" aria-hidden="true" />}
                            {site.archived_at ? 'Vrati iz arhive' : 'Arhiviraj objekt'}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  )}
                </header>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  {devices.map(d => (
                    <DeviceNameplate key={d.id} device={d} service={service[d.id]} onOpen={() => setOpenDevice(d)} />
                  ))}
                  <button type="button" onClick={() => setDeviceForm({ siteId: site.id })}
                    className="min-h-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/40">
                    <Plus size={18} aria-hidden="true" />
                    {devices.length === 0 ? 'Dodaj prvi uređaj' : 'Dodaj uređaj'}
                  </button>
                </div>
              </article>
            );
          })}
          {sites.length === 0 && <p className="text-sm text-slate-600">Klijent nema nijedan aktivan objekt.</p>}
        </section>

        {/* Povijest posjeta */}
        <section aria-labelledby="visits-title" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
            <h2 id="visits-title" className="text-sm font-semibold text-slate-800">Povijest posjeta</h2>
            <p className="text-xs text-slate-600 mt-0.5">{period.label}</p>
          </div>
          <div className="p-4 sm:p-5">
            {logsLoading ? (
              <div className="space-y-3" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : byDate.length === 0 ? (
              <p className="text-sm text-slate-600 py-6 text-center">U ovom periodu nije bilo posjeta.</p>
            ) : (
              <ol className="space-y-4">
                {byDate.map(([date, dayLogs]) => (
                  <li key={date}>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">{capitalize(formatDayLong(date))} · {formatHours(sumHours(dayLogs))}</p>
                    <ul className="space-y-2">
                      {dayLogs.map(l => (
                        <li key={l.id} className="flex gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                          <span className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0" aria-hidden="true">
                            <span className="text-[11px] font-bold text-blue-800">{initials(l.profiles?.full_name)}</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-2">
                              <p className="text-sm text-slate-900">{l.task_description}</p>
                              <span className="text-sm text-slate-700 tabular-nums shrink-0 inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />{formatHours(Number(l.hours_worked))}</span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {l.profiles?.full_name ?? '—'}
                              {client.sites.length > 1 && <>, {siteName(l.site_id)}</>}
                            </p>
                            {(logDevices[l.id] ?? []).length > 0 && (
                              <p className="text-xs text-slate-600 mt-1 flex flex-wrap gap-1">
                                {logDevices[l.id].map(did => <span key={did} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{deviceName(did)}</span>)}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {editClient && <ClientFormDialog client={client} onClose={() => setEditClient(false)} />}
      {siteForm && <SiteFormDialog clientId={client.id} site={siteForm.site} onClose={() => setSiteForm(null)} />}
      {deviceForm && <DeviceFormDialog siteId={deviceForm.siteId} onClose={() => setDeviceForm(null)} />}
      {!deviceForm && askFirstDevice && (
        <DeviceFormDialog siteId={askFirstDevice.id} onClose={() => setSearchParams({}, { replace: true })} />
      )}
      {openDevice && <DeviceDetailDialog device={openDevice} service={service[openDevice.id]} onClose={() => setOpenDevice(null)} />}
      {logFor && <WorkLogForm presetSiteId={logFor} onClose={() => setLogFor(null)} />}
      {mergeClient && (
        <MergeDialog kind="clients" from={{ id: client.id, title: client.name }}
          options={dir.clients.filter(c => !c.archived_at).map(c => ({ id: c.id, title: c.name, subtitle: c.sites.map(siteAddress).join('; ') }))}
          onClose={() => setMergeClient(false)} onMerged={into => navigate(`/klijenti/${into}`)} />
      )}
      {mergeSite && (
        <MergeDialog kind="sites" from={{ id: mergeSite.id, title: siteAddress(mergeSite) }}
          options={dir.clients.filter(c => !c.archived_at).flatMap(c => c.sites.filter(s => !s.archived_at).map(s => ({ id: s.id, title: siteAddress(s), subtitle: c.name })))}
          onClose={() => setMergeSite(null)} />
      )}
      <ConfirmDialog
        open={archiveClient}
        onOpenChange={setArchiveClient}
        tone="neutral"
        title={`Arhivirati klijenta ${client.name}?`}
        description="Klijent i njegovi objekti više se neće nuditi pri unosu rada. Povijest posjeta i uređaji ostaju sačuvani; klijenta možete vratiti iz arhive."
        confirmLabel="Arhiviraj"
        pendingLabel="Arhiviranje…"
        error={flags.error ? errorMessage(flags.error) : null}
        onConfirm={async () => {
          await flags.mutateAsync({ table: 'clients', id: client.id, archived: true });
          toast.success('Klijent arhiviran');
        }}
      />
    </div>
  );
}
