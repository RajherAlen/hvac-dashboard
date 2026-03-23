import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, User } from 'lucide-react';
import { useUpdateProfile } from '../hooks/useProfile';
import { useAuth } from '../hooks/useAuth';
import { useEmployee } from '../hooks/useEmployees';

const schema = z
  .object({
    phone: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((data) => !data.password || data.password.length >= 8, {
    message: 'Lozinka mora imati najmanje 8 znakova',
    path: ['password'],
  })
  .refine((data) => !data.password || data.password === data.confirmPassword, {
    message: 'Lozinke se ne podudaraju',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

interface EditProfileModalProps {
  onClose: () => void;
}

export function EditProfileModal({ onClose }: EditProfileModalProps) {
  const { user } = useAuth();
  const { data: profile } = useEmployee(user?.id);
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      phone: profile?.phone ?? '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    await updateProfile.mutateAsync({
      phone: values.phone,
      password: values.password || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Zaglavlje */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Uredi profil</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Forma */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Informacije o korisniku (samo za čitanje) */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full shrink-0">
              <User size={20} className="text-blue-600" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-slate-800 truncate">
                {profile?.full_name ?? '—'}
              </p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Telefon <span className="text-slate-400 font-normal">(neobavezno)</span>
            </label>
            <input
              type="tel"
              {...register('phone')}
              placeholder="+385 91 234 5678"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Nova lozinka */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nova lozinka{' '}
              <span className="text-slate-400 font-normal">(ostavite prazno bez promjene)</span>
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

          {/* Potvrda lozinke */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Potvrdi novu lozinku
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

          {/* API greška */}
          {updateProfile.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {(updateProfile.error as Error).message}
            </p>
          )}

          {/* Akcije */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isSubmitting ? 'Spremanje...' : 'Spremi promjene'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
