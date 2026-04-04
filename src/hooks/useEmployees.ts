import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
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
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export interface CreateEmployeePayload {
  full_name: string;
  email: string;
  password: string;
  role: 'admin' | 'employee';
}

export function useDeleteEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await supabase.rpc('delete_employee', {
        employee_id: employeeId,
      });
      if (error) throw new Error(error.message);
      const result = data as { error?: string } | null;
      if (result?.error) throw new Error(result.error);
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useCreateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateEmployeePayload) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Service role key not configured');
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await adminClient.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          full_name: payload.full_name,
          role: payload.role,
        },
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
