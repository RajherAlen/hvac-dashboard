import type { WorkOrderKind } from '../types';

/** Kapacitet tehničara po danu (spremnik u rasporedu, norma na nadzornoj ploči) */
export const DAY_CAPACITY = 8;

export const KIND_LABEL: Record<WorkOrderKind, string> = {
  servis: 'Servis',
  montaza: 'Montaža',
  popravak: 'Popravak',
  dijagnostika: 'Dijagnostika',
  ostalo: 'Ostalo',
};

/** Prijedlog opisa i procjene sati za novu vrstu naloga */
export const KIND_DEFAULTS: Record<WorkOrderKind, { title: string; hours: number }> = {
  servis: { title: 'Redovni servis', hours: 2 },
  montaza: { title: 'Montaža', hours: 6 },
  popravak: { title: 'Popravak', hours: 3 },
  dijagnostika: { title: 'Dijagnostika kvara', hours: 2 },
  ostalo: { title: '', hours: 2 },
};

/** Stanje dodjele za prikaz: obavljen (upisan rad), propušten (dan prošao bez unosa) ili planiran. */
export type AssignmentState = 'done' | 'missed' | 'planned';

export function assignmentState(a: { day: string; done_at: string | null }, hasLog: boolean, today: string): AssignmentState {
  if (a.done_at || hasLog) return 'done';
  return a.day < today ? 'missed' : 'planned';
}
