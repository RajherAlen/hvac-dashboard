import { CircleDot, Drill, Hammer, ScanSearch, Wrench, type LucideProps } from 'lucide-react';
import type { WorkOrderKind } from '../../types';

const ICON = { servis: Wrench, montaza: Drill, popravak: Hammer, dijagnostika: ScanSearch, ostalo: CircleDot } as const;

/** Vrsta naloga se prikazuje ikonom i riječju, ne bojom (boja nosi identitet osobe). */
export function KindIcon({ kind, ...props }: { kind: WorkOrderKind } & LucideProps) {
  const Icon = ICON[kind] ?? CircleDot;
  return <Icon aria-hidden="true" {...props} />;
}
