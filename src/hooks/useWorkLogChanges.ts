import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Tables } from '../types/database';

export const CHANGES_KEY = 'work_log_changes';

export type WorkLogChange = Omit<Tables<'work_log_changes'>, 'changes'> & {
  changes: Record<string, unknown>;
};

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return '';
}

/** Tablica povijesti ne postoji (migracija 20261106 nije pokrenuta). */
export function isMissingAuditSchema(err: unknown): boolean {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  return code === 'PGRST205' || code === '42P01' || /work_log_changes/.test(errText(err)) && /does not exist|could not find/i.test(errText(err));
}

/** RPC ne postoji (migracija nije pokrenuta) – koristi se stari način spremanja. */
export function isMissingFunction(err: unknown): boolean {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(errText(err));
}

/**
 * Povijest izmjena: jednog unosa (workLogId) ili svih unosa zaposlenika (employeeId).
 * `data === null` znači da evidencija još nije uključena u bazi.
 */
export function useWorkLogChanges({ workLogId, employeeId, limit = 200 }: { workLogId?: string; employeeId?: string; limit?: number }) {
  return useQuery({
    queryKey: [CHANGES_KEY, workLogId ?? null, employeeId ?? null, limit],
    enabled: !!(workLogId || employeeId),
    retry: (count, err) => !isMissingAuditSchema(err) && count < 2,
    queryFn: async (): Promise<WorkLogChange[] | null> => {
      let q = supabase.from('work_log_changes').select('*');
      if (workLogId) q = q.eq('work_log_id', workLogId).order('changed_at', { ascending: true }).order('id', { ascending: true });
      else q = q.eq('employee_id', employeeId!).order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      const { data, error } = await q;
      if (error) {
        if (isMissingAuditSchema(error)) return null;
        throw error;
      }
      return (data ?? []) as WorkLogChange[];
    },
  });
}

/** id → ime za prikaz autora izmjena (i bivših/deaktiviranih zaposlenika). */
export function useProfileNames() {
  const q = useQuery({
    queryKey: ['profiles', 'names'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, role');
      if (error) throw error;
      return data ?? [];
    },
  });
  const map = new Map<string, { name: string; isAdmin: boolean }>();
  for (const p of q.data ?? []) map.set(p.id, { name: p.full_name ?? 'Bez imena', isAdmin: p.role === 'admin' });
  return map;
}
