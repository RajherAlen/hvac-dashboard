import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { useMerge } from '../../hooks/useClients';
import { matchesQuery } from '../../lib/search';
import { errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';

export interface MergeOption { id: string; title: string; subtitle?: string }

/**
 * Spajanje duplikata: odabrani zapis se arhivira, a njegovi objekti/unosi/uređaji
 * prelaze na ciljni zapis.
 */
export function MergeDialog({ kind, from, options, onClose, onMerged }: {
  kind: 'clients' | 'sites';
  from: MergeOption;
  options: MergeOption[];
  onClose: () => void;
  onMerged?: (intoId: string) => void;
}) {
  const merge = useMerge();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const searchId = useId();
  const list = options.filter(o => o.id !== from.id && (!q || matchesQuery(`${o.title} ${o.subtitle ?? ''}`, q))).slice(0, 30);
  const noun = kind === 'clients' ? 'klijenta' : 'objekt';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!target) return;
    try {
      await merge.mutateAsync({ kind, fromId: from.id, intoId: target });
      toast.success(kind === 'clients' ? 'Klijenti spojeni' : 'Objekti spojeni');
      onMerged?.(target);
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog
      onClose={onClose}
      title={`Spoji ${kind === 'clients' ? 'klijenta' : 'objekt'}`}
      description={<>„{from.title}” bit će arhiviran, a {kind === 'clients' ? 'svi njegovi objekti i posjeti' : 'svi unosi i uređaji'} prelaze na {noun} koji odaberete.</>}
    >
      <form onSubmit={submit} className="px-5 sm:px-6 py-5 space-y-3">
        <label htmlFor={searchId} className="block text-sm font-medium text-slate-700">Spoji u</label>
        <div className="relative">
          <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input id={searchId} value={q} onChange={e => setQ(e.target.value)} type="search" autoComplete="off"
            placeholder="Pretraži…" className={inputClass(false, 'pl-9')} />
        </div>
        <fieldset className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          <legend className="sr-only">Odaberite {noun}</legend>
          {list.length === 0 && <p className="px-3 py-4 text-sm text-slate-600">Nema rezultata.</p>}
          {list.map(o => (
            <label key={o.id} className={cn('flex items-start gap-3 px-3 py-2.5 cursor-pointer', target === o.id ? 'bg-blue-50' : 'hover:bg-slate-50')}>
              <input type="radio" name="merge-target" value={o.id} checked={target === o.id} onChange={() => setTarget(o.id)} className="mt-1 accent-blue-600" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 truncate">{o.title}</span>
                {o.subtitle && <span className="block text-xs text-slate-600 truncate">{o.subtitle}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <FormError message={merge.error ? errorMessage(merge.error) : null} />
        <FormActions onCancel={onClose} isPending={merge.isPending} disabled={!target} submitLabel="Spoji" pendingLabel="Spajanje…" />
      </form>
    </Dialog>
  );
}
