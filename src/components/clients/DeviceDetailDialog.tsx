import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DeviceNameplate } from './DeviceNameplate';
import { DeviceFormDialog } from './ClientForms';
import { useDeviceLogs, useSetEntityFlags } from '../../hooks/useClients';
import { useAuth } from '../../hooks/useAuth';
import { DEVICE_KIND_LABEL } from '../../lib/clients';
import { capitalize, formatDayLong } from '../../lib/format-date';
import { formatHours } from '../../lib/utils';
import { errorMessage } from '../../lib/errors';
import type { Device } from '../../types';

export function DeviceDetailDialog({ device, service, onClose }: {
  device: Device;
  service?: { last: string | null; next: string | null };
  onClose: () => void;
}) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { data: logs = [], isLoading } = useDeviceLogs(device.id);
  const flags = useSetEntityFlags();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const title = [device.brand, device.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[device.kind];

  if (editing) return <DeviceFormDialog siteId={device.site_id} device={device} onClose={() => { setEditing(false); onClose(); }} />;

  return (
    <>
      <Dialog onClose={onClose} title={title} description={device.placement ?? DEVICE_KIND_LABEL[device.kind]} className="sm:max-w-lg">
        <div className="px-5 sm:px-6 py-5 space-y-5">
          <DeviceNameplate device={device} service={service} static />
          {device.notes && <p className="text-sm text-slate-700 whitespace-pre-line">{device.notes}</p>}
          {device.archived_at && (
            <p className="text-sm text-slate-700 bg-slate-100 rounded-lg px-3 py-2">Uređaj je arhiviran (više nije u upotrebi).</p>
          )}

          <section aria-labelledby="dev-history">
            <h3 id="dev-history" className="text-sm font-semibold text-slate-800 mb-2">Servisna povijest</h3>
            {isLoading ? (
              <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-600">Još nema zabilježenih servisa. Odaberite ovaj uređaj pri unosu rada.</p>
            ) : (
              <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                {logs.map(l => (
                  <li key={l.id} className="pl-4 relative">
                    <span aria-hidden="true" className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
                    <p className="text-xs text-slate-600">{capitalize(formatDayLong(l.log_date))} · {l.profiles?.full_name ?? '—'}</p>
                    <p className="text-sm text-slate-900">{l.task_description} <span className="text-slate-600 tabular-nums">({formatHours(Number(l.hours_worked))})</span></p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
                <Pencil size={14} aria-hidden="true" /> Uredi
              </button>
              {device.archived_at ? (
                <button type="button"
                  onClick={() => flags.mutate({ table: 'devices', id: device.id, archived: false }, { onSuccess: () => { toast.success('Uređaj vraćen iz arhive'); onClose(); } })}
                  className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
                  <ArchiveRestore size={14} aria-hidden="true" /> Vrati iz arhive
                </button>
              ) : (
                <button type="button" onClick={() => setArchiving(true)}
                  className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg">
                  <Archive size={14} aria-hidden="true" /> Arhiviraj
                </button>
              )}
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        tone="neutral"
        title="Arhivirati uređaj?"
        description="Uređaj se više neće nuditi pri unosu rada niti ulaziti u servisne rokove. Servisna povijest ostaje sačuvana."
        confirmLabel="Arhiviraj"
        pendingLabel="Arhiviranje…"
        error={flags.error ? errorMessage(flags.error) : null}
        onConfirm={async () => {
          await flags.mutateAsync({ table: 'devices', id: device.id, archived: true });
          toast.success('Uređaj arhiviran');
          onClose();
        }}
      />
    </>
  );
}
