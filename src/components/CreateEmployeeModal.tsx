import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useCreateEmployee } from '../hooks/useEmployees';

const schema = z.object({
  full_name: z.string().min(2, 'Ime i prezime moraju imati najmanje 2 znaka'),
  email: z.string().email('Unesite valjanu e-mail adresu'),
  password: z.string().min(8, 'Lozinka mora imati najmanje 8 znakova'),
  phone: z.string().optional(),
  role: z.enum(['employee', 'admin']),
});

type FormValues = z.infer<typeof schema>;

interface CreateEmployeeModalProps {
  onClose: () => void;
}

export function CreateEmployeeModal({ onClose }: CreateEmployeeModalProps) {
  const createEmployee = useCreateEmployee();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role: 'employee',
    },
  });

  const onSubmit = async (values: FormValues) => {
    await createEmployee.mutateAsync({
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
      role: values.role,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Zaglavlje */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Novi zaposlenik</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Forma */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">

          {/* Ime i prezime */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ime i prezime
            </label>
            <input
              type="text"
              {...register('full_name')}
              placeholder="npr. Marko Marković"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.full_name && (
              <p className="mt-1 text-xs text-red-500">{errors.full_name.message}</p>
            )}
          </div>

          {/* E-mail */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input
              type="email"
              {...register('email')}
              placeholder="marko@tvrtka.hr"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Lozinka */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lozinka</label>
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

          {/* Uloga */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Uloga</label>
            <select
              {...register('role')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="employee">Zaposlenik</option>
              <option value="admin">Administrator</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-xs text-red-500">{errors.role.message}</p>
            )}
          </div>

          {/* API greška */}
          {createEmployee.error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {(createEmployee.error as Error).message}
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
              {isSubmitting ? 'Dodavanje...' : 'Dodaj zaposlenika'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
