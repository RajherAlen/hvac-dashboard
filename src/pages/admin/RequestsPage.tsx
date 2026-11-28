import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Check, ClipboardList, Copy, ExternalLink, Inbox, MapPin, MessageSquare, Phone, RotateCcw, Share2, X,
} from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useClientDirectory } from '../../hooks/useClients';
import { useAcceptRequest, useServiceRequests, useSetRequestStatus } from '../../hooks/useServiceRequests';
import { OrderFormDialog } from '../../components/orders/OrderFormDialog';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FormActions, FormError } from '../../components/ui/form';
import { inputClass } from '../../components/ui/styles';
import {
  REQUEST_FORM_PATH, REQUEST_KIND_LABEL, REQUEST_STATUS_LABEL, REQUEST_TO_ORDER_KIND, requestDeviceText, requestOrderNotes,
} from '../../lib/requests';
import { siteAddress } from '../../lib/clients';
import { normalizePhone } from '../../lib/service';
import { normalize, matchesQuery } from '../../lib/search';
import { formatDateTime, formatRelative } from '../../lib/format-date';
import { errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import type { ClientWithSites, RequestStatus, ServiceRequest, SiteWithDevices } from '../../types';

const STATUS_TONE: Record<RequestStatus, string> = {
  new: 'bg-amber-100 text-amber-900',
  accepted: 'bg-blue-100 text-blue-900',
  done: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-slate-200 text-slate-700',
};

export function RequestsPage() {
  useDocumentTitle('Zahtjevi');
  const q = useServiceRequests();
  const [accepting, setAccepting] = useState<ServiceRequest | null>(null);
  const [ordering, setOrdering] = useState<ServiceRequest | null>(null);
  const [rejecting, setRejecting] = useState<ServiceRequest | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const setStatus = useSetRequestStatus();

  if (q.data === null) return <NotEnabled />;

  const all = q.data ?? [];
  const open = all.filter(r => r.status === 'new' || r.status === 'accepted');
  const handled = all.filter(r => r.status === 'done' || r.status === 'rejected');

  const changeStatus = async (r: ServiceRequest, status: RequestStatus, msg: string) => {
    try {
      await setStatus.mutateAsync({ id: r.id, status });
      toast.success(msg);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-4 sm:gap-5 max-w-4xl">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Zahtjevi klijenata</h1>
        <p className="text-sm text-slate-600 mt-0.5">Prijave s web forme. Prihvaćeni zahtjev dodaje klijenta, objekt i uređaj, a od njega se radi nalog.</p>
      </div>

      <FormLinkCard />

      <section aria-labelledby="open-req" className="flex flex-col gap-3">
        <h2 id="open-req" className="text-sm font-semibold text-slate-800">
          Za obradu{open.length > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-amber-100 text-amber-900 text-xs font-bold tabular-nums">{open.length}</span>}
        </h2>
        {q.isLoading ? (
          <div className="space-y-3" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />)}</div>
        ) : q.isError ? (
          <FormError message={errorMessage(q.error)} />
        ) : open.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
            <Inbox size={28} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
            Nema novih zahtjeva. Pošaljite klijentima link iznad.
          </div>
        ) : (
          open.map(r => (
            <RequestCard key={r.id} r={r}>
              {r.status === 'new' ? (
                <>
                  <ActionButton primary onClick={() => setAccepting(r)} icon={Check}>Prihvati u klijente</ActionButton>
                  <ActionButton onClick={() => setRejecting(r)} icon={X}>Odbij</ActionButton>
                </>
              ) : (
                <>
                  <ActionButton primary onClick={() => setOrdering(r)} icon={ClipboardList}>Napravi nalog</ActionButton>
                  <ActionButton onClick={() => changeStatus(r, 'done', 'Zahtjev označen kao riješen')} icon={Check}>Riješeno bez naloga</ActionButton>
                </>
              )}
            </RequestCard>
          ))
        )}
      </section>

      {handled.length > 0 && (
        <section aria-labelledby="handled-req" className="flex flex-col gap-3">
          <button type="button" id="handled-req" aria-expanded={showHandled} onClick={() => setShowHandled(s => !s)}
            className="self-start text-sm font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline">
            {showHandled ? 'Sakrij obrađene' : `Prikaži obrađene (${handled.length})`}
          </button>
          {showHandled && handled.map(r => (
            <RequestCard key={r.id} r={r} muted>
              {r.status === 'rejected' && (
                <ActionButton onClick={() => changeStatus(r, 'new', 'Zahtjev vraćen u nove')} icon={RotateCcw}>Vrati u nove</ActionButton>
              )}
            </RequestCard>
          ))}
        </section>
      )}

      {accepting && (
        <AcceptDialog r={accepting} onClose={() => setAccepting(null)}
          onAccepted={updated => { setAccepting(null); setOrdering(updated); }} />
      )}

      {ordering && ordering.site_id && (
        <OrderFormDialog
          preset={{
            site_id: ordering.site_id,
            device_ids: ordering.device_id ? [ordering.device_id] : [],
            kind: REQUEST_TO_ORDER_KIND[ordering.request_kind],
            notes: requestOrderNotes(ordering),
          }}
          onClose={() => setOrdering(null)}
          onSaved={async (_day, orderId) => {
            try {
              await setStatus.mutateAsync({ id: ordering.id, status: 'done', work_order_id: orderId ?? null });
            } catch (err) {
              toast.error(`Nalog je spremljen, ali zahtjev nije označen riješenim: ${errorMessage(err)}`);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={o => { if (!o) setRejecting(null); }}
        title="Odbiti zahtjev?"
        description={rejecting ? `${rejecting.full_name}, ${rejecting.address}. Zahtjev se može vratiti među nove.` : ''}
        confirmLabel="Odbij"
        pendingLabel="Odbijam…"
        tone="danger"
        onConfirm={async () => {
          if (!rejecting) return;
          await setStatus.mutateAsync({ id: rejecting.id, status: 'rejected' });
          toast.success('Zahtjev odbijen');
          setRejecting(null);
        }}
      />
    </div>
  );
}

// ─── Link za klijente ────────────────────────────────────────────────────────

function FormLinkCard() {
  const url = `${window.location.origin}${REQUEST_FORM_PATH}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiran');
    } catch {
      toast.error('Kopiranje nije uspjelo – označite link i kopirajte ručno.');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Thermo-Vent – zahtjev za servis ili popravak', text: 'Za servis ili popravak ispunite kratki obrazac:', url });
    } catch { /* korisnik odustao */ }
  };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5" aria-labelledby="link-title">
      <h2 id="link-title" className="text-sm font-semibold text-slate-800">Link za klijente</h2>
      <p className="text-sm text-slate-600 mt-0.5">Isti link za sve: SMS, WhatsApp, e-mail, web stranica ili Facebook.</p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} aria-label="Link na formu" onFocus={e => e.currentTarget.select()} className={inputClass(false, 'font-mono sm:flex-1')} />
        <div className="flex gap-2">
          <ActionButton onClick={copy} icon={Copy}>Kopiraj</ActionButton>
          {canShare && <ActionButton onClick={share} icon={Share2}>Podijeli</ActionButton>}
          <a href={REQUEST_FORM_PATH} target="_blank" rel="noopener"
            className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap">
            <ExternalLink size={15} aria-hidden="true" /> Otvori
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Kartica zahtjeva ────────────────────────────────────────────────────────

function RequestCard({ r, muted, children }: { r: ServiceRequest; muted?: boolean; children?: React.ReactNode }) {
  const tel = normalizePhone(r.phone);
  return (
    <article className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5', muted && 'opacity-90')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{r.full_name}</h3>
          <p className="text-xs text-slate-600" title={formatDateTime(r.created_at)}>Zaprimljeno {formatRelative(r.created_at)}, {formatDateTime(r.created_at).split(' u ')[1]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center px-2 h-6 rounded-full text-xs font-semibold bg-slate-900 text-white">{REQUEST_KIND_LABEL[r.request_kind]}</span>
          <span className={cn('inline-flex items-center px-2 h-6 rounded-full text-xs font-semibold', STATUS_TONE[r.status])}>{REQUEST_STATUS_LABEL[r.status]}</span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <dt className="sr-only">Telefon</dt>
          <Phone size={14} className="text-slate-500 shrink-0" aria-hidden="true" />
          <dd>{tel ? <a href={`tel:${tel}`} className="text-blue-700 font-medium hover:underline">{r.phone}</a> : r.phone}
            {r.email && <> · <a href={`mailto:${r.email}`} className="text-blue-700 hover:underline break-all">{r.email}</a></>}</dd>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <dt className="sr-only">Adresa</dt>
          <MapPin size={14} className="text-slate-500 shrink-0" aria-hidden="true" />
          <dd className="truncate">{[r.address, r.city].filter(Boolean).join(', ')}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="sr-only">Uređaj</dt>
          <dd className="text-slate-800">{requestDeviceText(r)}</dd>
        </div>
        {r.description && (
          <div className="sm:col-span-2 flex gap-2">
            <dt className="sr-only">Opis</dt>
            <MessageSquare size={14} className="text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
            <dd className="text-slate-700 whitespace-pre-line">{r.description}</dd>
          </div>
        )}
        {r.preferred_time && (
          <div className="sm:col-span-2 text-slate-700"><dt className="inline font-medium">Termin: </dt><dd className="inline">{r.preferred_time}</dd></div>
        )}
      </dl>

      {(children || r.client_id) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {children}
          {r.client_id && (
            <Link to={`/klijenti/${r.client_id}`} className="ml-auto text-sm font-medium text-blue-700 hover:underline">Kartica klijenta →</Link>
          )}
        </div>
      )}
    </article>
  );
}

function ActionButton({ onClick, icon: Icon, primary, children }: {
  onClick: () => void; icon: typeof Check; primary?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium rounded-lg whitespace-nowrap transition-colors',
        primary ? 'text-white bg-blue-600 hover:bg-blue-700 font-semibold' : 'text-slate-700 bg-slate-100 hover:bg-slate-200')}>
      <Icon size={15} aria-hidden="true" /> {children}
    </button>
  );
}

// ─── Prihvaćanje: novi klijent ili postojeći objekt ─────────────────────────

type Target = { mode: 'new' } | { mode: 'client'; clientId: string } | { mode: 'site'; siteId: string };
type Match = { client: ClientWithSites; site?: SiteWithDevices; why: string };

const lastDigits = (p: string | null | undefined) => (normalizePhone(p) ?? '').replace(/\D/g, '').slice(-8);

function AcceptDialog({ r, onClose, onAccepted }: { r: ServiceRequest; onClose: () => void; onAccepted: (r: ServiceRequest) => void }) {
  const dir = useClientDirectory();
  const accept = useAcceptRequest();
  const [search, setSearch] = useState('');

  const clients = useMemo(() => dir.clients.filter(c => !c.archived_at), [dir.clients]);

  // Prijedlozi: isti broj telefona ili ista adresa
  const matches = useMemo<Match[]>(() => {
    const phone = lastDigits(r.phone);
    const addr = normalize(r.address);
    const out: Match[] = [];
    for (const c of clients) {
      const samePhone = phone.length >= 6 && lastDigits(c.phone) === phone;
      const sites = c.sites.filter(s => !s.archived_at);
      const sameAddr = sites.filter(s => normalize(s.address) === addr);
      if (sameAddr.length) sameAddr.forEach(s => out.push({ client: c, site: s, why: samePhone ? 'isti telefon i adresa' : 'ista adresa' }));
      else if (samePhone) {
        sites.forEach(s => out.push({ client: c, site: s, why: 'isti telefon' }));
        out.push({ client: c, why: 'isti telefon' });
      }
    }
    return out.slice(0, 8);
  }, [clients, r.phone, r.address]);

  const [target, setTarget] = useState<Target | null>(null);
  const effective: Target = target ?? (matches[0]?.site ? { mode: 'site', siteId: matches[0].site.id } : { mode: 'new' });

  const searchResults = useMemo(() => search.trim().length < 2 ? [] : clients
    .filter(c => matchesQuery([c.name, c.phone, ...c.sites.flatMap(s => [s.address, s.city])].filter(Boolean).join(' '), search))
    .slice(0, 6), [clients, search]);

  // Uređaji na odabranom postojećem objektu
  const site = effective.mode === 'site' ? dir.siteIndex.get(effective.siteId)?.site : undefined;
  const siteDevices = (site?.devices ?? []).filter(d => !d.archived_at);
  const [deviceChoice, setDeviceChoice] = useState<string>(''); // '' = novi iz zahtjeva / ništa
  const deviceValue = siteDevices.some(d => d.id === deviceChoice) ? deviceChoice : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await accept.mutateAsync({
        id: r.id,
        client_id: effective.mode === 'client' ? effective.clientId : null,
        site_id: effective.mode === 'site' ? effective.siteId : null,
        device_id: effective.mode === 'site' && deviceValue ? deviceValue : null,
      });
      toast.success('Zahtjev prihvaćen', { description: 'Sad mu napravite nalog.' });
      onAccepted({ ...r, status: 'accepted', client_id: res.client_id, site_id: res.site_id, device_id: res.device_id });
    } catch { /* FormError */ }
  };

  const isSel = (t: Target) => JSON.stringify(t) === JSON.stringify(effective);
  const option = ({ t, title, subtitle, badge, key }: { t: Target; title: string; subtitle: string; badge?: string; key?: string | number }) => (
    <label key={key} className={cn('flex items-start gap-3 p-3 rounded-lg border cursor-pointer',
      isSel(t) ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')}>
      <input type="radio" name="target" checked={isSel(t)} onChange={() => setTarget(t)} className="mt-1" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}{badge && <span className="ml-2 text-xs font-normal text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">{badge}</span>}</span>
        <span className="block text-xs text-slate-600">{subtitle}</span>
      </span>
    </label>
  );

  return (
    <Dialog onClose={onClose} title="Prihvati zahtjev" description={`${r.full_name} · ${[r.address, r.city].filter(Boolean).join(', ')}`} className="sm:max-w-lg">
      <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 mb-1">Kamo ga dodati?</legend>
          {matches.length > 0 && <p className="text-xs text-slate-600">Možda već postoji:</p>}
          {matches.map((m, i) => m.site
            ? option({ key: i, t: { mode: 'site', siteId: m.site.id }, title: m.client.name, subtitle: `Postojeći objekt: ${siteAddress(m.site)}`, badge: m.why })
            : option({ key: i, t: { mode: 'client', clientId: m.client.id }, title: m.client.name, subtitle: 'Novi objekt s adresom iz zahtjeva', badge: m.why }))}
          {option({ t: { mode: 'new' }, title: 'Novi klijent', subtitle: `${r.full_name}, ${r.phone} · novi objekt i uređaj iz zahtjeva` })}

          <div className="pt-2">
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ili potražite drugog klijenta…"
              aria-label="Potraži klijenta" className={inputClass()} />
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-2">
                {searchResults.flatMap(c => [
                  ...c.sites.filter(s => !s.archived_at).map(s =>
                    option({ key: s.id, t: { mode: 'site', siteId: s.id }, title: c.name, subtitle: `Postojeći objekt: ${siteAddress(s)}` })),
                  option({ key: c.id, t: { mode: 'client', clientId: c.id }, title: c.name, subtitle: 'Novi objekt s adresom iz zahtjeva' }),
                ])}
              </div>
            )}
          </div>
        </fieldset>

        {effective.mode === 'site' && siteDevices.length > 0 && (
          <div>
            <label htmlFor="acc-device" className="block text-sm font-medium text-slate-700 mb-1">Uređaj</label>
            <select id="acc-device" value={deviceValue} onChange={e => setDeviceChoice(e.target.value)} className={inputClass()}>
              <option value="">{r.device_kind ? `Dodaj novi: ${requestDeviceText(r)}` : 'Bez uređaja'}</option>
              {siteDevices.map(d => (
                <option key={d.id} value={d.id}>Postojeći: {[d.brand, d.model].filter(Boolean).join(' ') || d.kind}{d.placement ? `, ${d.placement}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        <FormError message={accept.error ? errorMessage(accept.error) : null} />
        <FormActions onCancel={onClose} submitLabel="Prihvati i napravi nalog" pendingLabel="Spremam…" isPending={accept.isPending} />
      </form>
    </Dialog>
  );
}

function NotEnabled() {
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <Inbox size={32} className="text-slate-400" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Zahtjevi još nisu uključeni</h1>
      <p className="mt-1 text-sm text-slate-600">
        Administrator treba jednom pokrenuti migraciju <code className="px-1 bg-slate-100 rounded">20261116_service_requests.sql</code> u Supabase SQL editoru.
      </p>
    </div>
  );
}
