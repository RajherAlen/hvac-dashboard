import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAbsences, useCalendarOverrides, useCancelAbsence } from '../../hooks/useAbsences';
import { AbsenceDialog } from '../../components/absences/AbsenceDialog';
import { AbsencesNotEnabled } from '../../components/absences/AbsencesNotEnabled';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ABSENCE_TONE, STATUS_LABEL, STATUS_PILL } from '../../components/absences/absenceStyle';
import { ABSENCE_LABEL, buildWorkCalendar } from '../../lib/workCalendar';
import { formatRange } from '../../lib/format-date';
import { cn, pluralHr, todayISO } from '../../lib/utils';
import type { Absence } from '../../types';

export function MyAbsencesPage() {
  useDocumentTitle('Odsutnosti');
  const { user } = useAuth();
  const today = todayISO();
  const year = today.slice(0, 4);
  const absQ = useAbsences({ employeeId: user?.id }, !!user?.id);
  const ovQ = useCalendarOverrides();
  const cal = buildWorkCalendar({ overrides: ovQ.data ?? [] });
  const [open, setOpen] = useState(false);
  const [withdraw, setWithdraw] = useState<Absence | null>(null);
  const cancel = useCancelAbsence();

  if (absQ.data === null) return <AbsencesNotEnabled />;
  const all = absQ.data ?? [];

  const pending = all.filter(a => a.status === 'pending');
  const upcoming = all.filter(a => a.status === 'approved' && a.end_date >= today);
  const past = all.filter(a => !(a.status === 'pending') && !(a.status === 'approved' && a.end_date >= today))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  // Iskorišteno ove godine: odobreni radni dani u tekućoj godini
  const usedDays = (kind: Absence['kind']) => all
    .filter(a => a.status === 'approved' && a.kind === kind)
    .reduce((n, a) => n + cal.workdaysIn(a.start_date, a.end_date).filter(d => d.startsWith(year)).length, 0);
  const go = usedDays('godisnji');
  const bo = usedDays('bolovanje');

  const canWithdraw = (a: Absence) => a.status === 'pending' || (a.status === 'approved' && a.start_date > today);

  const group = (title: string, items: Absence[], empty?: string) => (
    <section aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-800 mb-2">{title}</h2>
      {items.length === 0 ? (
        empty ? <p className="text-sm text-slate-600">{empty}</p> : null
      ) : (
        <ul className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {items.map(a => {
            const wd = cal.workdaysIn(a.start_date, a.end_date).length;
            return (
              <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                <span className={cn('mt-1 w-2.5 h-2.5 rounded-full shrink-0', ABSENCE_TONE[a.kind].dot)} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-semibold text-slate-900">{ABSENCE_LABEL[a.kind]}</span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium border', STATUS_PILL[a.status])}>{STATUS_LABEL[a.status]}</span>
                  </p>
                  <p className="text-sm text-slate-700 mt-0.5">
                    {formatRange(a.start_date, a.end_date)} · {wd} {pluralHr(wd, 'radni dan', 'radna dana', 'radnih dana')}
                  </p>
                  {a.note && <p className="text-xs text-slate-600 mt-0.5">Napomena: {a.note}</p>}
                  {a.status === 'rejected' && a.decision_note && (
                    <p className="text-sm text-red-800 bg-red-50 rounded-md px-2 py-1 mt-1.5">Razlog: {a.decision_note}</p>
                  )}
                </div>
                {canWithdraw(a) && (
                  <button type="button" onClick={() => setWithdraw(a)}
                    className="shrink-0 min-h-10 sm:min-h-8 px-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                    Povuci zahtjev
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-5 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Odsutnosti</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Ove godine: <strong className="font-semibold text-slate-900">{go}</strong> {pluralHr(go, 'radni dan', 'radna dana', 'radnih dana')} godišnjeg,
            {' '}<strong className="font-semibold text-slate-900">{bo}</strong> {pluralHr(bo, 'dan', 'dana', 'dana')} bolovanja
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
          <Plus size={16} aria-hidden="true" /> Zatraži odsutnost
        </button>
      </div>

      {absQ.isLoading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : all.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-sm text-slate-800">Još nemaš nijednu odsutnost.</p>
          <p className="text-sm text-slate-600 mt-1">Za godišnji, bolovanje ili slobodan dan pošalji zahtjev – administrator ga odobrava.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && group('Na čekanju', pending)}
          {group('Nadolazeće', upcoming, 'Nema odobrenih odsutnosti u nadolazećem razdoblju.')}
          {past.length > 0 && group('Prošlo', past)}
        </>
      )}

      {open && user && <AbsenceDialog asAdmin={false} employeeId={user.id} onClose={() => setOpen(false)} />}
      <ConfirmDialog
        open={!!withdraw}
        onOpenChange={o => { if (!o) { setWithdraw(null); cancel.reset(); } }}
        title="Povuci zahtjev?"
        description={withdraw ? `${ABSENCE_LABEL[withdraw.kind]}, ${formatRange(withdraw.start_date, withdraw.end_date)}` : ''}
        confirmLabel="Povuci zahtjev"
        pendingLabel="Povlačenje…"
        tone="neutral"
        error={cancel.error?.message}
        onConfirm={async () => {
          if (!withdraw) return;
          await cancel.mutateAsync(withdraw.id);
          toast('Zahtjev povučen');
        }}
      />
    </div>
  );
}
