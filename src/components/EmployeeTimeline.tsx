import { useMemo, useState, useId } from 'react';
import { toast } from 'sonner';
import { MapPin, Clock, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { WorkLog, WorkLogWithEmployee } from '../types';
import { formatHours, todayISO, cn, pluralHr } from '../lib/utils';
import { formatDayLong, formatWeekday, capitalize } from '../lib/format-date';
import { errorMessage } from '../lib/errors';
import { useDeleteWorkLog, useAddWorkLog } from '../hooks/useWorkLogs';
import { WorkLogForm } from './WorkLogForm';
import { LogLocation } from './clients/LogLocation';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { EditStamp, WorkLogHistoryDialog } from './WorkLogHistory';

interface EmployeeTimelineProps {
  logs: WorkLogWithEmployee[];
  canEdit?: boolean;
  /** Koliko dana prikazati prije "Prikaži još" (umjesto unutarnjeg scrolla). */
  pageSize?: number;
}

function groupByDate(logs: WorkLogWithEmployee[]) {
  const groups: Record<string, WorkLogWithEmployee[]> = {};
  for (const log of logs) (groups[log.log_date] ??= []).push(log);
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export function EmployeeTimeline({ logs, canEdit = false, pageSize = 10 }: EmployeeTimelineProps) {
  const grouped = useMemo(() => groupByDate(logs), [logs]);
  const [visibleDays, setVisibleDays] = useState(pageSize);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editLog, setEditLog] = useState<WorkLog | null>(null);
  const [deleting, setDeleting] = useState<WorkLog | null>(null);
  const [historyOf, setHistoryOf] = useState<WorkLog | null>(null);
  const deleteLog = useDeleteWorkLog();
  const addLog = useAddWorkLog();

  const multiDates = grouped.filter(([, l]) => l.length > 1).map(([d]) => d);
  const allExpanded = multiDates.every(d => !collapsed.has(d));

  const toggle = (date: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const handleDelete = async () => {
    if (!deleting) return;
    const removed = deleting;
    await deleteLog.mutateAsync(removed.id);
    toast.success('Unos obrisan', {
      description: `${removed.task_description} · ${formatHours(Number(removed.hours_worked))}`,
      duration: 8000,
      action: {
        label: 'Poništi',
        onClick: () =>
          addLog.mutate(
            {
              // Isti ID → povijest unosa ostaje cjelovita ("Obrisano", pa "Vraćeno")
              id: removed.id,
              ...(removed.site_id !== undefined ? { site_id: removed.site_id } : {}),
              employee_id: removed.employee_id,
              log_date: removed.log_date,
              task_description: removed.task_description,
              location: removed.location,
              hours_worked: Number(removed.hours_worked),
              notes: removed.notes ?? '',
            },
            {
              onSuccess: () => toast.success('Unos vraćen'),
              onError: e => toast.error(errorMessage(e)),
            },
          ),
      },
    });
  };

  if (grouped.length === 0) {
    return (
      <div className="text-center py-10 text-slate-600">
        <p className="text-sm">Nema radnih zapisa.</p>
        {canEdit && <p className="text-xs mt-1 text-slate-500">Prilagodite period ili dodajte novi unos.</p>}
      </div>
    );
  }

  const shown = grouped.slice(0, visibleDays);
  const remaining = grouped.length - shown.length;

  return (
    <div className="space-y-3">
      {multiDates.length > 0 && (
        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setCollapsed(allExpanded ? new Set(multiDates) : new Set())}
            className="text-xs font-medium text-blue-700 hover:text-blue-900 px-2 py-1 rounded"
          >
            {allExpanded ? 'Sažmi sve' : 'Proširi sve'}
          </button>
        </div>
      )}

      {shown.map(([date, dayLogs]) => (
        <DayGroup
          key={date}
          date={date}
          logs={dayLogs}
          canEdit={canEdit}
          expanded={!collapsed.has(date)}
          onToggle={() => toggle(date)}
          onEdit={setEditLog}
          onDelete={setDeleting}
          onHistory={setHistoryOf}
        />
      ))}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleDays(v => v + pageSize)}
          className="w-full min-h-11 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl"
        >
          Prikaži još ({remaining} {pluralHr(remaining, 'dan', 'dana', 'dana')})
        </button>
      )}

      {editLog && <WorkLogForm editLog={editLog} onClose={() => setEditLog(null)} />}
      {historyOf && <WorkLogHistoryDialog log={historyOf} onClose={() => setHistoryOf(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => { if (!o) { setDeleting(null); deleteLog.reset(); } }}
        title="Obrisati unos?"
        description={
          deleting && (
            <>
              <strong className="font-medium text-slate-800">{deleting.task_description}</strong>
              {' '}({formatHours(Number(deleting.hours_worked))}, {formatWeekday(deleting.log_date)}, {deleting.location}).
              {' '}Brisanje možete poništiti odmah nakon toga.
            </>
          )
        }
        confirmLabel="Obriši unos"
        onConfirm={handleDelete}
        error={deleteLog.error ? errorMessage(deleteLog.error) : null}
      />
    </div>
  );
}

function DayGroup({
  date, logs, canEdit, expanded, onToggle, onEdit, onDelete, onHistory,
}: {
  date: string;
  logs: WorkLogWithEmployee[];
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (l: WorkLog) => void;
  onDelete: (l: WorkLog) => void;
  onHistory: (l: WorkLog) => void;
}) {
  const panelId = useId();
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const isToday = todayISO() === date;
  const collapsible = logs.length > 1;

  const headerContent = (
    <>
      <span className="flex items-center gap-2 min-w-0 text-left">
        <span className="text-sm font-semibold text-slate-800">{capitalize(formatDayLong(date))}</span>
        {isToday && (
          <span className="text-xs font-medium text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">Danas</span>
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {collapsible && (
          <span className="text-xs text-slate-600">{logs.length} {pluralHr(logs.length, 'unos', 'unosa', 'unosa')} ·</span>
        )}
        <span className="text-sm font-semibold text-slate-800 tabular-nums">{formatHours(totalHours)}</span>
        {collapsible && (
          <ChevronDown size={16} aria-hidden="true" className={cn('text-slate-500 transition-transform', expanded && 'rotate-180')} />
        )}
      </span>
    </>
  );

  return (
    <section className="border border-slate-200 rounded-xl overflow-hidden" aria-label={capitalize(formatDayLong(date))}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">{headerContent}</div>
      )}

      {expanded && (
        <ul id={panelId} className="divide-y divide-slate-100">
          {logs.map(log => (
            <li key={log.id} className="px-4 py-3 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{log.task_description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <MapPin size={12} className="shrink-0" aria-hidden="true" />
                      <span className="sr-only">Lokacija:</span>
                      <LogLocation log={log} />
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-600 tabular-nums">
                      <Clock size={12} className="shrink-0" aria-hidden="true" />
                      <span className="sr-only">Trajanje:</span>
                      {formatHours(Number(log.hours_worked))}
                    </span>
                  </div>
                  {log.notes && <p className="mt-1.5 text-xs text-slate-600 italic">{log.notes}</p>}
                  <EditStamp log={log} onOpen={() => onHistory(log)} />
                </div>

                {canEdit && (
                  <div className="flex items-center -mr-2 -mt-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(log)}
                      className="w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                      aria-label={`Uredi unos: ${log.task_description}`}
                      title="Uredi"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(log)}
                      className="w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                      aria-label={`Obriši unos: ${log.task_description}`}
                      title="Obriši"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
