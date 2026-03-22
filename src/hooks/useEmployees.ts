import { useQuery } from '@tanstack/react-query';
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
