import type { AbsenceKind, AbsenceStatus } from '../../types';

/**
 * Vizualni jezik odsutnosti: odsutnost nije status (crveno/žuto/zeleno), nego razlog.
 * Zato ima vlastiti oblik – šifra + dijagonalna šrafura – umjesto samo druge boje.
 * Zahtjev na čekanju: ista šifra, isprekidan obrub, bez ispune.
 */
export const ABSENCE_TONE: Record<AbsenceKind, { approved: string; pending: string; dot: string; pill: string; swatch: string }> = {
  godisnji: {
    approved: 'text-sky-800 bg-[repeating-linear-gradient(135deg,#e0f2fe_0_4px,#f0f9ff_4px_8px)]',
    pending: 'text-sky-700 bg-white outline outline-1 -outline-offset-1 outline-dashed outline-sky-400',
    dot: 'bg-sky-500',
    pill: 'bg-sky-50 text-sky-800 border-sky-200',
    swatch: 'bg-[repeating-linear-gradient(135deg,#bae6fd_0_2px,#f0f9ff_2px_4px)] border-sky-200',
  },
  bolovanje: {
    approved: 'text-violet-800 bg-[repeating-linear-gradient(135deg,#ede9fe_0_4px,#f5f3ff_4px_8px)]',
    pending: 'text-violet-700 bg-white outline outline-1 -outline-offset-1 outline-dashed outline-violet-400',
    dot: 'bg-violet-500',
    pill: 'bg-violet-50 text-violet-800 border-violet-200',
    swatch: 'bg-[repeating-linear-gradient(135deg,#ddd6fe_0_2px,#f5f3ff_2px_4px)] border-violet-200',
  },
  slobodan: {
    approved: 'text-slate-700 bg-[repeating-linear-gradient(135deg,#e2e8f0_0_4px,#f1f5f9_4px_8px)]',
    pending: 'text-slate-600 bg-white outline outline-1 -outline-offset-1 outline-dashed outline-slate-400',
    dot: 'bg-slate-500',
    pill: 'bg-slate-50 text-slate-700 border-slate-200',
    swatch: 'bg-[repeating-linear-gradient(135deg,#cbd5e1_0_2px,#f1f5f9_2px_4px)] border-slate-300',
  },
};

/** Stupac praznika / neradnog dana */
export const HOLIDAY_CELL = 'bg-slate-100 text-slate-500 font-normal';

export const STATUS_LABEL: Record<AbsenceStatus, string> = {
  pending: 'Na čekanju',
  approved: 'Odobreno',
  rejected: 'Odbijeno',
  cancelled: 'Povučeno',
};

export const STATUS_PILL: Record<AbsenceStatus, string> = {
  pending: 'bg-amber-50 text-amber-900 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  cancelled: 'bg-slate-50 text-slate-600 border-slate-200',
};
