import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

const schema = z
  .object({
    password: z.string().min(8, 'Lozinka mora imati najmanje 8 znakova'),
    confirmPassword: z.string(),
    phone: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Lozinke se ne podudaraju',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    // Supabase JS v2 auto-exchanges the invite token from the URL hash.
    // getSession() returns it once processed; onAuthStateChange fires as backup.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && s) {
        setSession(s);
        setIsLoading(false);
      }
    });

    // Timeout — treat as invalid link after 6 s with no session
    const timer = setTimeout(() => setIsLoading(false), 6000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);

    const { error: pwError } = await supabase.auth.updateUser({
      password: values.password,
    });

    if (pwError) {
      setSubmitError(pwError.message);
      return;
    }

    if (values.phone?.trim()) {
      await supabase
        .from('profiles')
        .update({ phone: values.phone.trim() })
        .eq('id', session!.user.id);
    }

    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ─── Invalid / expired link ─── */
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm px-8 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800 mb-2">Nevaljan link</p>
          <p className="text-sm text-slate-500">
            Pozivnica je istekla ili je već iskorištena. Obratite se administratoru.
          </p>
        </div>
      </div>
    );
  }

  /* ─── Registration form ─── */
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-8 pt-8 pb-2">
          <h1 className="text-lg font-semibold text-slate-800">Dobrodošli!</h1>
          <p className="mt-1 text-sm text-slate-500">
            Postavite lozinku kako biste aktivirali svoj račun.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 space-y-4">
          {/* Lozinka */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Lozinka
            </label>
            <input
              type="password"
              {...register('password')}
              placeholder="Minimalno 8 znakova"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* Potvrdi lozinku */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Potvrdi lozinku
            </label>
            <input
              type="password"
              {...register('confirmPassword')}
              placeholder="Ponovite lozinku"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Broj mobitela{' '}
              <span className="text-slate-400 font-normal">(neobavezno)</span>
            </label>
            <input
              type="tel"
              {...register('phone')}
              placeholder="+387 61 234 567"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* API greška */}
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {isSubmitting ? 'Aktiviranje...' : 'Aktiviraj račun'}
          </button>
        </form>
      </div>
    </div>
  );
}
