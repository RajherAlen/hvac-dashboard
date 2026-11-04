import { Link } from 'react-router-dom';
import { MapPin, ChevronRight } from 'lucide-react';
import type { WorkLogWithEmployee } from '../types';
import { Dialog } from './ui/Dialog';
import { LogLocation } from './clients/LogLocation';
import { formatHours, initials, pluralHr } from '../lib/utils';
import { formatDayLong, formatRange, capitalize } from '../lib/format-date';
import { sumHours } from '../lib/period';
import type { Bucket } from '../lib/period';

interface Props {
  bucket: Bucket;
  /** Unosi perioda – dijalog sam filtrira na dane stupca. */
  logs: WorkLogWithEmployee[];
  onClose: () => void;
  /** Link na profil zaposlenika (izostavi na stranici jednog zaposlenika). */
  employeeHref?: (employeeId: string) => string;
}

/** Unosi za kliknuti stupac grafa (dan ili tjedan), grupirani po danu pa po zaposleniku. */
export function BucketEntriesDialog({ bucket, logs, onClose, employeeHref }: Props) {
  const days = new Set(bucket.days);
  const entries = logs.filter(l => days.has(l.log_date));
  const single = bucket.days.length === 1;
  const title = single
    ? capitalize(formatDayLong(bucket.days[0]))
    : `${bucket.label.split(' · ')[0]} · ${formatRange(bucket.days[0], bucket.days[bucket.days.length - 1])}`;

  const byDate = new Map<string, WorkLogWithEmployee[]>();
  for (const l of [...entries].sort((a, b) => b.log_date.localeCompare(a.log_date))) {
    if (!byDate.has(l.log_date)) byDate.set(l.log_date, []);
    byDate.get(l.log_date)!.push(l);
  }

  return (
    <Dialog
      onClose={onClose}
      title={title}
      description={`${entries.length} ${pluralHr(entries.length, 'unos', 'unosa', 'unosa')} · ukupno ${formatHours(sumHours(entries))}`}
      className="sm:max-w-lg"
    >
      <div className="px-5 sm:px-6 py-4 space-y-5" data-autofocus tabIndex={-1}>
        {entries.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">Nema unosa.</p>}
        {[...byDate.entries()].map(([date, dayLogs]) => {
          const byEmp = new Map<string, WorkLogWithEmployee[]>();
          for (const l of dayLogs) {
            if (!byEmp.has(l.employee_id)) byEmp.set(l.employee_id, []);
            byEmp.get(l.employee_id)!.push(l);
          }
          return (
            <section key={date}>
              {!single && (
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  {capitalize(formatDayLong(date))} · {formatHours(sumHours(dayLogs))}
                </h3>
              )}
              <ul className="space-y-3">
                {[...byEmp.entries()].map(([empId, empLogs]) => {
                  const name = empLogs[0].profiles?.full_name ?? '—';
                  const header = (
                    <>
                      <span className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0" aria-hidden="true">
                        <span className="text-[11px] font-bold text-blue-800">{initials(name)}</span>
                      </span>
                      <span className="flex-1 text-sm font-medium text-slate-900 truncate">{name}</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatHours(sumHours(empLogs))}</span>
                    </>
                  );
                  return (
                    <li key={empId} className="border border-slate-200 rounded-xl overflow-hidden">
                      {employeeHref ? (
                        <Link to={employeeHref(empId)} onClick={onClose}
                          className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 hover:bg-slate-100">
                          {header}
                          <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50">{header}</div>
                      )}
                      <ul className="divide-y divide-slate-100">
                        {empLogs.map(l => (
                          <li key={l.id} className="px-3 py-2">
                            <div className="flex justify-between gap-3">
                              <p className="text-sm text-slate-800">{l.task_description}</p>
                              <span className="text-sm text-slate-700 tabular-nums shrink-0">{formatHours(Number(l.hours_worked))}</span>
                            </div>
                            <p className="flex items-center gap-1 text-xs text-slate-600 mt-0.5">
                              <MapPin size={11} aria-hidden="true" />
                              <span className="sr-only">Lokacija:</span>
                              <LogLocation log={l} />
                            </p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
