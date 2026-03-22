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
