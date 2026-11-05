import { useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { toast } from 'sonner';
import { useCancelAbsence, useDecideAbsence, useRequestAbsence } from '../../hooks/useAbsences';
import { ABSENCE_LABEL } from '../../lib/workCalendar';
import { capitalize, formatDayLong, formatShortRange } from '../../lib/format-date';
import { cn } from '../../lib/utils';
import { Spinner } from '../ui/form';
import { ABSENCE_TONE } from './absenceStyle';
import type { Absence, AbsenceKind } from '../../types';

interface Props {
  employeeId: string;
  employeeName: string;
  day: string;
  absence: Absence | null;
  pending: Absence | null;
  /** Otvara dijalog s ovim danom (raspon više dana) */
  onMoreDays: (employeeId: string, day: string) => void;
  /** Okidač (ćelija) – mora prihvatiti ref i props (button) */
  children: ReactNode;
}

const KINDS: AbsenceKind[] = ['godisnji', 'bolovanje', 'slobodan'];

/**
 * Ćelija matrice kao mjesto radnje: tamo gdje se vidi "rupa", tamo se i objasni.
 * Prazan dan → jedan klik upisuje odsutnost; zahtjev na čekanju → odobri/odbij; odsutnost → otkaži.
 */
export function AbsenceCellPopover({ employeeId, employeeName, day, absence, pending, onMoreDays, children }: Props) {
  const [open, setOpen] = useState(false);
  const request = useRequestAbsence();
  const decide = useDecideAbsence();
  const cancel = useCancelAbsence();
  const busy = request.isPending || decide.isPending || cancel.isPending;

  const fail = (err: Error) => toast.error(err.message);

  const quickMark = (kind: AbsenceKind) => {
    request.mutate({ kind, start: day, end: day, employeeId }, {
      onSuccess: id => {
        setOpen(false);
        toast.success(kind === 'bolovanje' ? 'Bolovanje upisano' : `${ABSENCE_LABEL[kind]} upisan`, {
          description: `${employeeName}, ${formatDayLong(day)}`,
          action: { label: 'Poništi', onClick: () => cancel.mutate(id, { onError: fail }) },
        });
      },
      onError: fail,
    });
  };

  const current = pending ?? absence;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm data-[state=open]:animate-[fade-in_120ms_ease-out]"
        >
          <p className="font-semibold text-slate-900">{employeeName}</p>
          <p className="text-xs text-slate-600">{capitalize(formatDayLong(day))}</p>

          {current ? (
            <div className="mt-3">
              <p className="flex items-center gap-2">
                <span className={cn('w-2.5 h-2.5 rounded-full', ABSENCE_TONE[current.kind].dot)} aria-hidden="true" />
                <span className="font-medium text-slate-900">{ABSENCE_LABEL[current.kind]}</span>
                <span className="text-slate-600">{formatShortRange(current.start_date, current.end_date)}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-600">{pending ? 'Zahtjev čeka odobrenje' : 'Odobreno'}</p>
              {current.note && <p className="mt-2 text-slate-700 bg-slate-50 rounded-md px-2 py-1.5">„{current.note}”</p>}
              <div className="mt-3 flex gap-2">
                {pending ? (
                  <>
                    <button type="button" disabled={busy}
                      onClick={() => decide.mutate({ id: pending.id, approve: false }, { onSuccess: () => { setOpen(false); toast('Zahtjev odbijen'); }, onError: fail })}
                      className="flex-1 min-h-10 sm:min-h-9 px-3 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-60">
                      Odbij
                    </button>
                    <button type="button" disabled={busy}
                      onClick={() => decide.mutate({ id: pending.id, approve: true }, { onSuccess: () => { setOpen(false); toast.success('Zahtjev odobren'); }, onError: fail })}
                      className="flex-1 min-h-10 sm:min-h-9 px-3 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 inline-flex items-center justify-center gap-2">
                      {decide.isPending && <Spinner />}Odobri
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy}
                    onClick={() => cancel.mutate(current.id, { onSuccess: () => { setOpen(false); toast('Odsutnost otkazana'); }, onError: fail })}
                    className="flex-1 min-h-10 sm:min-h-9 px-3 font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-60">
                    Otkaži odsutnost
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-slate-700">Nema unosa. Ako je bio odsutan, označite razlog:</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {KINDS.map(k => (
                  <button key={k} type="button" disabled={busy} onClick={() => quickMark(k)}
                    className={cn('min-h-10 sm:min-h-9 px-1 text-xs font-semibold rounded-lg border border-transparent hover:border-slate-300 disabled:opacity-60', ABSENCE_TONE[k].approved)}>
                    {ABSENCE_LABEL[k]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setOpen(false); onMoreDays(employeeId, day); }}
                className="mt-2 w-full min-h-10 sm:min-h-9 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg">
                Više dana…
              </button>
            </div>
          )}
          {request.isPending && <p className="sr-only" aria-live="polite">Spremanje…</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
