import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ['employees', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export interface CreateEmployeePayload {
  full_name: string;
  email: string;
  role: 'admin' | 'employee';
}

export function useDeleteEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-employee', {
        body: { employee_id: employeeId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useDeactivateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, active }: { employeeId: string; active: boolean }) => {
      const { data, error } = await supabase.functions.invoke('deactivate-employee', {
        body: { employee_id: employeeId, active },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, { employeeId }) => {
      client.invalidateQueries({ queryKey: ['employees'] });
      client.invalidateQueries({ queryKey: ['employees', employeeId] });
    },
  });
}

export function useCreateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeePayload) => {
      const { data, error } = await supabase.functions.invoke('invite-employee', {
        body: {
          ...payload,
          redirect_to: `${window.location.origin}/accept-invite`,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
