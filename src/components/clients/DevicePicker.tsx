import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useClientDirectory } from '../../hooks/useClients';
import { DEVICE_KIND_LABEL } from '../../lib/clients';
import { cn } from '../../lib/utils';
import { DeviceFormDialog } from './ClientForms';

/** Neobavezni višestruki odabir servisiranih uređaja na odabranom objektu. */
export function DevicePicker({ siteId, value, onChange, labelId }: {
  siteId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  labelId: string;
}) {
  const dir = useClientDirectory();
  const [adding, setAdding] = useState(false);
  const devices = (dir.siteIndex.get(siteId)?.site.devices ?? []).filter(d => !d.archived_at);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
      {devices.map(d => {
        const on = value.includes(d.id);
        const name = [d.brand, d.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[d.kind];
        return (
          <button key={d.id} type="button" aria-pressed={on} onClick={() => toggle(d.id)}
            className={cn('inline-flex items-center gap-1.5 min-h-10 sm:min-h-8 px-2.5 py-1 text-sm rounded-lg border text-left',
              on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50')}>
            {on && <Check size={13} aria-hidden="true" />}
            <span>{name}{d.placement && <span className={on ? 'text-white' : 'text-slate-500'}>, {d.placement}</span>}</span>
          </button>
        );
      })}
      <button type="button" onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1 min-h-10 sm:min-h-8 px-2.5 py-1 text-sm font-medium text-blue-700 rounded-lg border border-dashed border-blue-300 hover:bg-blue-50">
        <Plus size={13} aria-hidden="true" /> {devices.length === 0 ? 'Dodaj uređaj' : 'Uređaj'}
      </button>
      {adding && <DeviceFormDialog siteId={siteId} onClose={() => setAdding(false)} />}
    </div>
  );
}
