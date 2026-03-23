import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ phone, password }: { phone?: string; password?: string }) => {
      // Update password if provided
      if (password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      }

      // Update phone in profiles table
      if (phone !== undefined) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('profiles')
            .update({ phone: phone.trim() || null })
            .eq('id', user.id);
          if (error) throw new Error(error.message);
        }
      }
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
