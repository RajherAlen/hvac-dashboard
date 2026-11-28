import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { CrewRow } from '../types';
import { isMissingAuditSchema } from './useWorkLogChanges';

export const CREWS_KEY = 'crews';

export type Crew = CrewRow & { members: string[] };

/** Tablice ekipa ne postoje (migracija 20261113 nije pokrenuta). */
function missing(err: { code?: string; message?: string } | null): boolean {
  return !!err && (isMissingAuditSchema(err) || /crew/.test(err.message ?? '') && /does not exist|could not find/i.test(err.message ?? ''));
}

/** Ekipa vrijedi tog dana: stalna ili privremena kojoj rok još nije prošao. */
export function crewActiveOn(c: Pick<CrewRow, 'valid_until'>, day: string): boolean {
  return !c.valid_until || c.valid_until >= day;
}

/** Sve ekipe s članovima. `data === null` → modul ekipa nije uključen. */
export function useCrews(enabled = true) {
  return useQuery({
    queryKey: [CREWS_KEY],
    enabled,
    staleTime: 60_000,
    retry: (count, err) => !missing(err as { message?: string }) && count < 2,
    queryFn: async (): Promise<Crew[] | null> => {
      const { data, error } = await supabase
        .from('crews')
        .select('*, crew_members(employee_id)')
        .order('position')
        .order('created_at');
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return ((data ?? []) as unknown as (CrewRow & { crew_members: { employee_id: string }[] })[])
        .map(({ crew_members, ...c }) => ({ ...c, members: crew_members.map(m => m.employee_id) }));
    },
  });
}

export interface SaveCrewInput {
  id?: string;
  name: string;
  lead_id: string | null;
  vehicle: string;
  valid_until: string | null;
  members: string[];
}

export function useSaveCrew() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: SaveCrewInput) => {
      const { data, error } = await supabase.rpc('save_crew', {
        p_crew: { id: v.id ?? null, name: v.name, lead_id: v.lead_id, vehicle: v.vehicle, valid_until: v.valid_until },
        p_members: v.members,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [CREWS_KEY] }),
  });
}

export function useDeleteCrew() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crews').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [CREWS_KEY] }),
  });
}

/** Ekipa koja ima točno ove članove (redoslijed nije bitan). */
export function crewWithMembers(crews: Crew[], ids: string[]): Crew | undefined {
  const set = new Set(ids);
  return crews.find(c => c.members.length === set.size && c.members.every(m => set.has(m)));
}
