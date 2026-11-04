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

/**
 * Zadnja prijava po korisniku (iz auth.users preko RPC-a).
 * Vraća null ako migracija još nije pokrenuta – UI tada koristi procjenu.
 */
export function useEmployeeAuthStatus() {
  return useQuery({
    queryKey: ['employees', 'auth-status'],
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, { lastSignInAt: string | null }> | null> => {
      const { data, error } = await supabase.rpc('employee_auth_status');
      if (error) {
        console.warn('[employee_auth_status] nedostupno – pokrenite migraciju 20261104_employee_status.sql', error.message);
        return null;
      }
      const out: Record<string, { lastSignInAt: string | null }> = {};
      for (const r of data ?? []) out[r.id] = { lastSignInAt: r.last_sign_in_at };
      return out;
    },
  });
}

export function useSetEmployeeActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, active }: { employeeId: string; active: boolean }) => {
      const { data, error } = await supabase.rpc('set_employee_active', { employee_id: employeeId, active });
      if (error) {
        if (/function .* does not exist|could not find the function/i.test(error.message)) {
          throw new Error('Deaktivacija još nije omogućena – administrator treba pokrenuti migraciju baze (employee_status).');
        }
        throw new Error(error.message);
      }
      const result = data as { error?: string } | null;
      if (result?.error) throw new Error(result.error);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['employees'] }),
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
