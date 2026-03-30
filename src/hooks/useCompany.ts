import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useCompany() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
