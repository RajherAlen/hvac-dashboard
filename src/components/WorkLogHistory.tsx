import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, PencilLine, PlusCircle, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useClientDirectory } from '../hooks/useClients';
import { useProfileNames, useWorkLogChanges, type WorkLogChange } from '../hooks/useWorkLogChanges';
import { DEVICE_KIND_LABEL, siteLabel } from '../lib/clients';
import { formatDateTime, formatNumeric, formatRelative } from '../lib/format-date';
import { cn, formatHours, pluralHr } from '../lib/utils';
import type { WorkLog } from '../types';
import { Dialog } from './ui/Dialog';

type Names = ReturnType<typeof useProfileNames>;
type Dir = ReturnType<typeof useClientDirectory>;

const FIELD_LABEL: Record<string, string> = {
  log_date: 'Datum',
  employee_id: 'Zaposlenik',
  site_id: 'Objekt',
  location: 'Lokacija',
  task_description: 'Opis',
  hours_worked: 'Sati',
  notes: 'Bilješka',
  device_ids: 'Uređaji',
};
const FIELD_ORDER = Object.keys(FIELD_LABEL);
/** Kratke vrijednosti stanu u jedan red (staro → novo), duge idu jedna ispod druge. */
const INLINE_FIELDS = new Set(['log_date', 'hours_worked', 'employee_id']);

const REASON_LABEL: Record<string, string> = {
  merge_sites: 'Spajanje duplikata objekata',
  link_legacy: 'Povezivanje stare lokacije s objektom',
};

/** "danas u 14:32", "jučer u 9:05", "4. 11. 2026. u 14:32" */
function when(iso: string): string {
  const rel = formatRelative(iso);
  if (rel === 'danas' || rel === 'jučer') return `${rel} u ${formatDateTime(iso).split(' u ')[1]}`;
  return formatDateTime(iso);
}

function personName(id: string | null | undefined, names: Names): string {
  if (!id) return 'Sustav';
  return names.get(id)?.name ?? 'Nepoznat korisnik';
}

function deviceName(id: string, dir: Dir): string {
  const hit = dir.deviceIndex.get(id);
  if (!hit) return 'Uklonjen uređaj';
  const d = hit.device;
  const name = [d.brand, d.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[d.kind];
  return d.placement ? `${name}, ${d.placement}` : name;
}

function formatValue(field: string, value: unknown, dir: Dir, names: Names): string {
  if (field === 'device_ids') {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    return ids.length ? ids.map(id => deviceName(id, dir)).join('; ') : '—';
  }
  if (value === null || value === undefined || value === '') return field === 'site_id' ? 'Bez objekta' : '—';
  switch (field) {
    case 'log_date': return formatNumeric(String(value));
    case 'hours_worked': return formatHours(Number(value));
    case 'employee_id': return personName(String(value), names);
    case 'site_id': {
      const hit = dir.siteIndex.get(String(value));
      return hit ? siteLabel(hit.site, hit.client) : 'Nepoznat objekt';
    }
    default: return String(value);
  }
}

function Diff({ field, from, to }: { field: string; from: string; to: string }) {
  const inline = INLINE_FIELDS.has(field);
  return (
    <div className={cn('text-sm', inline ? 'flex flex-wrap items-baseline gap-x-2' : 'space-y-0.5')}>
      <dt className="text-xs font-medium text-slate-600 w-20 shrink-0">{FIELD_LABEL[field]}</dt>
      <dd className={cn(inline ? 'flex flex-wrap items-baseline gap-x-1.5' : 'space-y-0.5')}>
        <span className="text-slate-500 line-through decoration-slate-400 break-words">
          <span className="sr-only">prije: </span>{from}
        </span>
        <span aria-hidden="true" className={cn('text-slate-400', !inline && 'hidden')}>→</span>
        <span className={cn('text-slate-900 font-medium break-words', !inline && 'block')}>
          <span className="sr-only">sada: </span>{to}
        </span>
      </dd>
    </div>
  );
}

function Snapshot({ changes, dir, names }: { changes: Record<string, unknown>; dir: Dir; names: Names }) {
  const fields = FIELD_ORDER.filter(f =>
    f !== 'employee_id' && f in changes &&
    // Lokacija je kod vezanog unosa samo tekstualna kopija objekta
    !(f === 'location' && changes.site_id) &&
    !(f === 'site_id' && !changes.site_id) &&
    !(f === 'device_ids' && !(changes.device_ids as unknown[] | undefined)?.length) &&
    !(f === 'notes' && !changes.notes));
  return (
    <dl className="mt-2 space-y-1">
      {fields.map(f => (
        <div key={f} className="flex gap-2 text-sm">
          <dt className="text-xs font-medium text-slate-600 w-20 shrink-0 pt-px">{FIELD_LABEL[f]}</dt>
          <dd className="text-slate-800 break-words min-w-0">{formatValue(f, changes[f], dir, names)}</dd>
        </div>
      ))}
    </dl>
  );
}

function UpdateDetails({ changes, dir, names }: { changes: Record<string, unknown>; dir: Dir; names: Names }) {
  const pairs = FIELD_ORDER.filter(f => Array.isArray(changes[f]) && !(f === 'location' && changes.site_id));
  const added = (changes.devices_added as string[] | undefined) ?? [];
  const removed = (changes.devices_removed as string[] | undefined) ?? [];
  return (
    <dl className="mt-2 space-y-2">
      {pairs.map(f => {
        const [from, to] = changes[f] as [unknown, unknown];
        return <Diff key={f} field={f} from={formatValue(f, from, dir, names)} to={formatValue(f, to, dir, names)} />;
      })}
      {(added.length > 0 || removed.length > 0) && (
        <div className="text-sm space-y-0.5">
          <dt className="text-xs font-medium text-slate-600">Uređaji</dt>
          {added.map(id => (
            <dd key={`a${id}`} className="text-slate-900"><span className="text-emerald-700 font-semibold" aria-hidden="true">+ </span><span className="sr-only">dodan: </span>{deviceName(id, dir)}</dd>
          ))}
          {removed.map(id => (
            <dd key={`r${id}`} className="text-slate-500 line-through decoration-slate-400"><span className="sr-only">uklonjen: </span>{deviceName(id, dir)}</dd>
          ))}
        </div>
      )}
    </dl>
  );
}

const ACTION_META = {
  insert:  { label: 'Upisano',     Icon: PlusCircle, dot: 'bg-slate-100 text-slate-600' },
  restore: { label: 'Vraćeno',     Icon: RotateCcw,  dot: 'bg-slate-100 text-slate-600' },
  update:  { label: 'Izmijenjeno', Icon: PencilLine, dot: 'bg-blue-50 text-blue-700' },
  delete:  { label: 'Obrisano',    Icon: Trash2,     dot: 'bg-red-50 text-red-700' },
} as const;

function ChangeItem({ change, kind, context, ownerId, dir, names }: {
  change: WorkLogChange;
  kind: keyof typeof ACTION_META;
  /** Na koji se unos odnosi (u popisu svih izmjena zaposlenika). */
  context?: ReactNode;
  ownerId?: string | null;
  dir: Dir;
  names: Names;
}) {
  const meta = ACTION_META[kind];
  const byOther = !!change.changed_by && !!ownerId && change.changed_by !== ownerId;
  const actor = personName(change.changed_by, names);
  const reason = change.reason ? REASON_LABEL[change.reason] ?? change.reason : null;
  return (
    <li className="group/item relative pl-9 pb-5 last:pb-0">
      <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200 group-last/item:hidden" />
      <span aria-hidden="true" className={cn('absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center', meta.dot)}>
        <meta.Icon size={14} />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
        <p className="text-xs text-slate-600 tabular-nums">
          <time dateTime={change.changed_at} title={formatDateTime(change.changed_at)}>{when(change.changed_at)}</time>
        </p>
      </div>
      <p className="text-xs text-slate-600 mt-0.5">
        {actor}
        {byOther && names.get(change.changed_by!)?.isAdmin && <span className="ml-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">administrator</span>}
        {reason && <> · {reason}</>}
      </p>
      {context && <div className="mt-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">{context}</div>}
      {change.action === 'update'
        ? <UpdateDetails changes={change.changes} dir={dir} names={names} />
        : <Snapshot changes={change.changes} dir={dir} names={names} />}
    </li>
  );
}

/** Upis koji slijedi brisanje istog unosa je "Vraćeno" (poništeno brisanje). */
function kindsOf(changes: WorkLogChange[]): Map<number, keyof typeof ACTION_META> {
  const kinds = new Map<number, keyof typeof ACTION_META>();
  const deleted = new Set<string>();
  for (const c of [...changes].sort((a, b) => a.changed_at.localeCompare(b.changed_at) || a.id - b.id)) {
    kinds.set(c.id, c.action === 'insert' && deleted.has(c.work_log_id) ? 'restore' : c.action);
    if (c.action === 'delete') deleted.add(c.work_log_id);
  }
  return kinds;
}

function NotEnabled() {
  return (
    <p className="text-sm text-slate-600 py-6 text-center">
      Evidencija izmjena još nije uključena. Administrator treba pokrenuti migraciju <code className="text-xs">20261106_work_log_audit.sql</code>.
    </p>
  );
}

/** Mala oznaka ispod unosa: tko je i kada zadnji put mijenjao unos. Klik otvara povijest. */
export function EditStamp({ log, onOpen }: { log: WorkLog; onOpen: () => void }) {
  const names = useProfileNames();
  const createdByOther = !!log.created_by && log.created_by !== log.employee_id;
  if (!log.edited_at && !createdByOther) return null;

  let text: string;
  if (log.edited_at) {
    const other = log.edited_by && log.edited_by !== log.employee_id;
    text = `Izmijenjeno ${when(log.edited_at)}${other ? ` · ${personName(log.edited_by, names)}` : ''}`;
  } else {
    text = `Upisano · ${personName(log.created_by, names)}`;
  }
  return (
    <button type="button" onClick={onOpen}
      className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-blue-700 hover:underline underline-offset-2 rounded text-left"
      aria-label={`${text}. Prikaži povijest izmjena`}>
      <History size={12} className="shrink-0" aria-hidden="true" />
      {text}
    </button>
  );
}

/** Povijest jednog unosa, od prvog upisa do zadnje izmjene. */
export function WorkLogHistoryDialog({ log, onClose }: { log: WorkLog; onClose: () => void }) {
  const { data, isLoading, error } = useWorkLogChanges({ workLogId: log.id });
  const names = useProfileNames();
  const dir = useClientDirectory();
  const kinds = kindsOf(data ?? []);
  const hasInsert = (data ?? []).some(c => c.action === 'insert');

  return (
    <Dialog onClose={onClose} title="Povijest izmjena"
      description={`${log.task_description} · ${formatNumeric(log.log_date)} · ${formatHours(Number(log.hours_worked))}`}
      className="sm:max-w-lg">
      <div className="px-5 sm:px-6 py-4 focus:outline-none" data-autofocus tabIndex={-1}>
        {isLoading && <p className="text-sm text-slate-600 py-6 text-center">Učitavanje…</p>}
        {error && <p className="text-sm text-red-700 py-6 text-center">Povijest se ne može učitati.</p>}
        {data === null && <NotEnabled />}
        {data && (
          <ol className="pt-1">
            {!hasInsert && log.created_at && (
              <li className="relative pl-9 pb-5">
                <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200" />
                <span aria-hidden="true" className="absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 text-slate-600"><PlusCircle size={14} /></span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold text-slate-900">Upisano</p>
                  <p className="text-xs text-slate-600 tabular-nums">{when(log.created_at)}</p>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">Prije uvođenja evidencije izmjena, autor nije zabilježen</p>
              </li>
            )}
            {data.map(c => (
              <ChangeItem key={c.id} change={c} kind={kinds.get(c.id) ?? c.action} ownerId={log.employee_id} dir={dir} names={names} />
            ))}
            {data.length === 0 && !log.edited_at && (
              <li className="pl-9 text-sm text-slate-600">Unos nije mijenjan.</li>
            )}
          </ol>
        )}
      </div>
    </Dialog>
  );
}

type Filter = 'edits' | 'all';

/** Sve izmjene i brisanja unosa jednog zaposlenika (admin). */
export function EmployeeChangesDialog({ employeeId, employeeName, onClose }: {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('edits');
  const { data, isLoading, error } = useWorkLogChanges({ employeeId });
  const names = useProfileNames();
  const dir = useClientDirectory();
  const kinds = kindsOf(data ?? []);
  const shown = (data ?? []).filter(c => filter === 'all' || kinds.get(c.id) !== 'insert');

  // Kontekst (na koji se unos izmjena odnosi) za unose koji još postoje
  const ids = [...new Set(shown.filter(c => c.action === 'update').map(c => c.work_log_id))];
  const { data: current } = useQuery({
    queryKey: ['work_logs', 'context', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('work_logs').select('id, log_date, task_description').in('id', ids);
      if (error) throw error;
      return new Map((data ?? []).map(l => [l.id, l]));
    },
  });

  const edits = (data ?? []).filter(c => c.action !== 'insert').length;

  return (
    <Dialog onClose={onClose} title="Povijest izmjena"
      description={data ? `${employeeName} · ${edits} ${pluralHr(edits, 'izmjena', 'izmjene', 'izmjena')} i brisanja` : employeeName}
      className="sm:max-w-xl">
      <div className="px-5 sm:px-6 py-4 space-y-4 focus:outline-none" data-autofocus tabIndex={-1}>
        {data && (
          <div role="group" aria-label="Prikaz" className="inline-flex p-0.5 bg-slate-100 rounded-lg">
            {([['edits', 'Izmjene i brisanja'], ['all', 'Sve promjene']] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
                className={cn('min-h-9 px-3 text-sm font-medium rounded-md',
                  filter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                {label}
              </button>
            ))}
          </div>
        )}
        {isLoading && <p className="text-sm text-slate-600 py-6 text-center">Učitavanje…</p>}
        {error && <p className="text-sm text-red-700 py-6 text-center">Povijest se ne može učitati.</p>}
        {data === null && <NotEnabled />}
        {data && shown.length === 0 && (
          <p className="text-sm text-slate-600 py-6 text-center">
            {filter === 'edits' ? 'Nijedan unos nije mijenjan ni brisan.' : 'Nema zabilježenih promjena.'}
          </p>
        )}
        {data && shown.length > 0 && (
          <ol>
            {shown.map(c => {
              const cur = current?.get(c.work_log_id);
              const context = c.action === 'update'
                ? cur ? <>Unos za {formatNumeric(cur.log_date)}: {cur.task_description}</> : <>Unos je u međuvremenu obrisan</>
                : undefined;
              return (
                <ChangeItem key={c.id} change={c} kind={kinds.get(c.id) ?? c.action} context={context}
                  ownerId={employeeId} dir={dir} names={names} />
              );
            })}
          </ol>
        )}
      </div>
    </Dialog>
  );
}
