import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, Check } from 'lucide-react';
import { useUpdateProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { useEmployee } from '../hooks/useEmployees';
import { errorMessage } from '../lib/errors';
import { initials } from '../lib/utils';
import { Dialog } from './ui/Dialog';
import { Field, FormActions, FormError } from './ui/form';
import { inputClass } from './ui/styles';

const schema = z
  .object({
    phone: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(d => !d.password || d.password.length >= 8, {
    message: 'Lozinka mora imati najmanje 8 znakova',
    path: ['password'],
  })
  .refine(d => !d.password || d.password === d.confirmPassword, {
    message: 'Lozinke se ne podudaraju',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useEmployee(user?.id);
  const updateProfile = useUpdateProfile();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange', // živa provjera podudaranja lozinki
    values: { phone: profile?.phone ?? '', password: '', confirmPassword: '' },
    resetOptions: { keepDirtyValues: true },
  });

  const [password, confirm] = useWatch({ control, name: ['password', 'confirmPassword'] });
  const passwordsMatch = !!password && password.length >= 8 && password === confirm;

  const onSubmit = async (values: FormValues) => {
    try {
      await updateProfile.mutateAsync({ phone: values.phone, password: values.password || undefined });
      toast.success(values.password ? 'Profil i lozinka spremljeni' : 'Profil spremljen');
      onClose();
    } catch {
      /* FormError */
    }
  };

  const pwType = showPassword ? 'text' : 'password';

  return (
    <Dialog onClose={onClose} title="Uredi profil">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        {/* Ime i e-mail – samo za čitanje */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full shrink-0" aria-hidden="true">
            <span className="text-sm font-bold text-blue-700">{initials(profile?.full_name)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">{profile?.full_name ?? '—'}</p>
            <p className="text-xs text-slate-600 truncate">{user?.email}</p>
          </div>
          <span className="flex items-center gap-1 text-xs text-slate-600 shrink-0" title="Ime i e-mail mijenja administrator">
            <Lock size={12} aria-hidden="true" /> Samo za čitanje
          </span>
        </div>
        <p className="-mt-2 text-xs text-slate-600">Za promjenu imena ili e-maila obratite se administratoru.</p>

        <Field label="Telefon" optional>
          {p => (
            <input {...p} {...register('phone')} type="tel" autoComplete="tel" inputMode="tel"
              placeholder="+385 91 234 5678" className={inputClass(false)} />
          )}
        </Field>

        <fieldset className="space-y-4 pt-1">
          <legend className="text-sm font-semibold text-slate-800 mb-2">Promjena lozinke</legend>
          <Field label="Nova lozinka" error={errors.password?.message} hint="Ostavite prazno ako ne mijenjate lozinku. Najmanje 8 znakova.">
            {p => (
              <div className="relative">
                <input {...p} {...register('password', { deps: ['confirmPassword'] })} type={pwType} autoComplete="new-password"
                  className={inputClass(!!errors.password, 'pr-11')} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-1 my-auto h-9 p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  aria-label={showPassword ? 'Sakrij lozinke' : 'Prikaži lozinke'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            )}
          </Field>

          <Field
            label="Potvrdi novu lozinku"
            error={errors.confirmPassword?.message}
            hint={passwordsMatch ? <span className="flex items-center gap-1 text-green-700"><Check size={13} aria-hidden="true" /> Lozinke se podudaraju</span> : undefined}
          >
            {p => (
              <input {...p} {...register('confirmPassword')} type={pwType} autoComplete="new-password"
                disabled={!password} className={inputClass(!!errors.confirmPassword, 'disabled:bg-slate-50 disabled:cursor-not-allowed')} />
            )}
          </Field>
        </fieldset>

        <FormError message={updateProfile.error ? errorMessage(updateProfile.error) : null} />

        <FormActions onCancel={onClose} isPending={isSubmitting} submitLabel="Spremi promjene" pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
