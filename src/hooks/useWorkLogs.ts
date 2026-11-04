import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { WorkLogFilters, WorkLogFormValues } from '../types';

const QUERY_KEY = 'work_logs';

export function useWorkLogs(filters: WorkLogFilters = {}) {
  return useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      let q = supabase
        .from('work_logs')
        .select('*, profiles(id, full_name, email, role, phone)')
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.startDate) q = q.gte('log_date', filters.startDate);
      if (filters.endDate)   q = q.lte('log_date', filters.endDate);
      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters.locationSearch)
        q = q.ilike('location', `%${filters.locationSearch}%`);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Zadnji evidentirani unos (bilo kojeg zaposlenika) – za prazno stanje "Današnja aktivnost". */
export function useLatestWorkLog() {
  return useQuery({
    queryKey: [QUERY_KEY, 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('*, profiles(id, full_name, role)')
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Prijedlozi lokacija iz prethodnih unosa – jedinstveni bez obzira na velika/mala slova
 * i razmake, sortirani po učestalosti. Zadržava se najnoviji zapis svake lokacije.
 */
export function useLocationSuggestions() {
  return useQuery({
    queryKey: [QUERY_KEY, 'locations'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('location')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const byKey = new Map<string, { label: string; count: number }>();
      for (const { location } of data ?? []) {
        const label = location.trim().replace(/\s+/g, ' ');
        if (!label) continue;
        const key = label.toLocaleLowerCase('hr');
        const hit = byKey.get(key);
        if (hit) hit.count++;
        else byKey.set(key, { label, count: 1 });
      }
      return [...byKey.values()].sort((a, b) => b.count - a.count).map(v => v.label);
    },
  });
}

/**
 * Datum zadnjeg unosa po zaposleniku (neovisno o periodu).
 * Jedan `limit(1)` upit po zaposleniku – tvrtka ima malo zaposlenika, a izbjegavamo
 * da stariji unosi "nestanu" zbog limita redova na velikom upitu.
 */
export function useLastLogDates(employeeIds: string[]) {
  const ids = [...employeeIds].sort();
  return useQuery({
    queryKey: [QUERY_KEY, 'last-dates', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(id =>
          supabase
            .from('work_logs')
            .select('log_date')
            .eq('employee_id', id)
            .order('log_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      );
      const out: Record<string, string | null> = {};
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        out[ids[i]] = r.data?.log_date ?? null;
      });
      return out;
    },
  });
}

/** Ukupan broj unosa zaposlenika – za potvrdu brisanja. */
export function useWorkLogCount(employeeId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'count', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('work_logs')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useAddWorkLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: WorkLogFormValues & { employee_id: string }) => {
      const { data, error } = await supabase
        .from('work_logs')
        .insert({
          employee_id: values.employee_id,
          log_date: values.log_date,
          task_description: values.task_description,
          location: values.location,
          hours_worked: values.hours_worked,
          notes: values.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateWorkLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<WorkLogFormValues> }) => {
      const { data, error } = await supabase
        .from('work_logs')
        .update({
          log_date: values.log_date,
          task_description: values.task_description,
          location: values.location,
          hours_worked: values.hours_worked,
          notes: values.notes || null,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteWorkLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
