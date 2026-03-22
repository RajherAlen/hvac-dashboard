import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';
import { MapPin, Clock, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import type { WorkLog, WorkLogWithEmployee } from '../types';
import { formatHours } from '../lib/utils';
import { useDeleteWorkLog } from '../hooks/useWorkLogs';
import { WorkLogForm } from './WorkLogForm';

interface EmployeeTimelineProps {
  logs: WorkLogWithEmployee[];
  canEdit?: boolean;
}

function groupByDate(logs: WorkLogWithEmployee[]) {
  const groups: Record<string, WorkLogWithEmployee[]> = {};
  for (const log of logs) {
    if (!groups[log.log_date]) groups[log.log_date] = [];
    groups[log.log_date].push(log);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function DayGroup({
  date,
  logs,
  canEdit,
}: {
  date: string;
  logs: WorkLogWithEmployee[];
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editLog, setEditLog] = useState<WorkLog | null>(null);
  const deleteLog = useDeleteWorkLog();

  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const parsedDate = parseISO(date);
  const isToday = format(new Date(), 'yyyy-MM-dd') === date;

  const handleDelete = (id: string) => {
    if (window.confirm('Obrisati ovaj radni zapis?')) {
      deleteLog.mutate(id);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Day header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-left">
            <span className="text-sm font-semibold text-slate-800">
              {format(parsedDate, 'EEEE, d MMMM yyyy', { locale: hr })}
            </span>
            {isToday && (
              <span className="ml-2 text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                Danas
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">
            {formatHours(totalHours)}
          </span>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Log entries */}
      {expanded && (
        <div className="divide-y divide-slate-100">
          {logs.map(log => (
            <div key={log.id} className="px-4 py-3 bg-white group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-snug">
                    {log.task_description}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={12} className="flex-shrink-0" />
                      {log.location}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock size={12} className="flex-shrink-0" />
                      {formatHours(Number(log.hours_worked))}
                    </span>
                  </div>
                  {log.notes && (
                    <p className="mt-1.5 text-xs text-slate-400 italic">{log.notes}</p>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditLog(log)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Uredi"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Obriši"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editLog && (
        <WorkLogForm editLog={editLog} onClose={() => setEditLog(null)} />
      )}
    </div>
  );
}

export function EmployeeTimeline({ logs, canEdit = false }: EmployeeTimelineProps) {
  const grouped = groupByDate(logs);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p className="text-base">Nema radnih zapisa</p>
        <p className="text-sm mt-1">Prilagodite filtre ili dodajte novi unos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(([date, dayLogs]) => (
        <DayGroup key={date} date={date} logs={dayLogs} canEdit={canEdit} />
      ))}
    </div>
  );
}
