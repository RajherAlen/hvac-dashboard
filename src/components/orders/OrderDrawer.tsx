import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, CircleAlert, Clock, MapPin, Pencil, Phone, RotateCcw, XCircle } from 'lucide-react';
import { useOrder, useSetOrderStatus } from '../../hooks/useWorkOrders';
import { useClientDirectory } from '../../hooks/useClients';
import { useProfileNames } from '../../hooks/useWorkLogChanges';
import { mapsUrl, siteAddress, OFFICE_LOCATION } from '../../lib/clients';
import { errorMessage } from '../../lib/errors';
import { formatWeekday } from '../../lib/format-date';
import { assignmentState, KIND_LABEL } from '../../lib/orders';
import { deviceDisplayName } from '../../lib/service';
import { cn, formatHours, todayISO } from '../../lib/utils';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { KindIcon } from './KindIcon';
import { OrderFormDialog } from './OrderFormDialog';

/** Detalj naloga: gdje, što, tko kada (plan prema upisanom) i radnje admina. */
export function OrderDrawer({ orderId, onClose, canManage = true }: { orderId: string; onClose: () => void; canManage?: boolean }) {
  const { data, isLoading, error } = useOrder(orderId);
  const dir = useClientDirectory();
  const names = useProfileNames();
  const setStatus = useSetOrderStatus();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const today = todayISO();

  if (editing && data) return <OrderFormDialog order={data.order} onClose={() => setEditing(false)} />;

  const order = data?.order;
  const hit = order?.site_id ? dir.siteIndex.get(order.site_id) : undefined;
  const totalPlan = order?.work_order_assignments.reduce((s, a) => s + Number(a.planned_hours), 0) ?? 0;
  const totalActual = data?.logs.reduce((s, l) => s + Number(l.hours_worked), 0) ?? 0;

  const change = (status: 'open' | 'done' | 'cancelled', msg: string) =>
    setStatus.mutateAsync({ id: orderId, status }).then(() => toast.success(msg));

  return (
    <Dialog onClose={onClose} title={order ? order.title : 'Nalog'}
      description={order ? `${KIND_LABEL[order.kind]}${order.status === 'done' ? ' · obavljen' : order.status === 'cancelled' ? ' · otkazan' : ''}` : undefined}
      className="sm:max-w-lg">
      <div className="px-5 sm:px-6 py-4 space-y-5 focus:outline-none" data-autofocus tabIndex={-1}>
        {isLoading && <p className="text-sm text-slate-600 py-6 text-center">Učitavanje…</p>}
        {error && <p className="text-sm text-red-700 py-6 text-center">{errorMessage(error)}</p>}
        {order && (
          <>
            <section className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <KindIcon kind={order.kind} size={17} className="text-slate-700" />
              </span>
              <div className="min-w-0 text-sm">
                {hit ? (
                  <>
                    <Link to={`/klijenti/${hit.client.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{hit.client.name}</Link>
                    <a href={mapsUrl(hit.site)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-slate-700 hover:underline">
                      <MapPin size={12} className="text-slate-500 shrink-0" aria-hidden="true" />{siteAddress(hit.site)}<span className="sr-only"> (otvara kartu)</span>
                    </a>
                    {hit.client.phone && (
                      <a href={`tel:${hit.client.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 text-slate-700 hover:underline tabular-nums">
                        <Phone size={12} className="text-slate-500" aria-hidden="true" />{hit.client.phone}
                      </a>
                    )}
                    {hit.site.access_notes && <p className="text-slate-700">Pristup: {hit.site.access_notes}</p>}
                  </>
                ) : (
                  <p className="font-semibold text-slate-900">{OFFICE_LOCATION}</p>
                )}
                {order.work_order_devices.length > 0 && (
                  <p className="text-xs text-slate-600 mt-1">
                    {order.work_order_devices.map(d => {
                      const dev = dir.deviceIndex.get(d.device_id)?.device;
                      return dev ? deviceDisplayName(dev) : 'Uređaj';
                    }).join(' · ')}
                  </p>
                )}
                {order.notes && <p className="text-sm text-slate-700 mt-2 italic">„{order.notes}”</p>}
              </div>
            </section>

            <section aria-labelledby="asg-title">
              <div className="flex items-baseline justify-between mb-2">
                <h3 id="asg-title" className="text-sm font-semibold text-slate-800">Tko i kada</h3>
                {order.work_order_assignments.length > 0 && (
                  <span className="text-xs text-slate-600 tabular-nums">upisano {formatHours(totalActual)} od planiranih {formatHours(totalPlan)}</span>
                )}
              </div>
              {order.work_order_assignments.length === 0 ? (
                <p className="text-sm text-slate-600">Nalog još nije dodijeljen. Povucite ga u raspored ili uredite nalog.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {[...order.work_order_assignments].sort((a, b) => a.day.localeCompare(b.day)).map(a => {
                    const logs = data!.logs.filter(l => l.assignment_id === a.id);
                    const actual = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
                    const state = assignmentState(a, logs.length > 0, today);
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <span className="w-24 shrink-0 text-slate-700">{formatWeekday(a.day)}</span>
                        <span className="flex-1 min-w-0 truncate font-medium text-slate-900">{names.get(a.employee_id)?.name ?? '—'}</span>
                        <span className="tabular-nums text-slate-700 whitespace-nowrap">
                          {state === 'done' ? `${formatHours(actual)} / ` : ''}{formatHours(Number(a.planned_hours))}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
                          state === 'done' ? 'text-emerald-800' : state === 'missed' ? 'text-red-700' : 'text-slate-600')}>
                          {state === 'done' ? <CheckCircle2 size={13} aria-hidden="true" /> : state === 'missed' ? <CircleAlert size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
                          {state === 'done' ? 'upisano' : state === 'missed' ? 'bez unosa' : 'planirano'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {canManage && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                  <Pencil size={14} aria-hidden="true" /> Uredi nalog
                </button>
                {order.status === 'open' ? (
                  <button type="button" onClick={() => { void change('done', 'Nalog označen obavljenim').catch(e => toast.error(errorMessage(e))); }}
                    className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
                    <CheckCircle2 size={14} aria-hidden="true" /> Označi obavljenim
                  </button>
                ) : (
                  <button type="button" onClick={() => { void change('open', 'Nalog ponovno otvoren').catch(e => toast.error(errorMessage(e))); }}
                    className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
                    <RotateCcw size={14} aria-hidden="true" /> Ponovno otvori
                  </button>
                )}
                {order.status !== 'cancelled' && (
                  <button type="button" onClick={() => setCancelling(true)}
                    className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg ml-auto">
                    <XCircle size={14} aria-hidden="true" /> Otkaži nalog
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        tone="neutral"
        title="Otkazati nalog?"
        description="Nalog nestaje iz rasporeda. Već upisani sati ostaju u evidenciji."
        confirmLabel="Otkaži nalog"
        onConfirm={async () => { await change('cancelled', 'Nalog otkazan'); onClose(); }}
        error={setStatus.error ? errorMessage(setStatus.error) : null}
      />
    </Dialog>
  );
}
