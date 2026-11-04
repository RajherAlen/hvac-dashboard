import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Wand2, Copy, Check } from 'lucide-react';
import { useCreateEmployee } from '../hooks/useEmployees';
import { errorMessage } from '../lib/errors';
import { Dialog } from './ui/Dialog';
import { Field, FormActions, FormError } from './ui/form';
import { inputClass } from './ui/styles';

const MIN_PASSWORD = 8;

const schema = z.object({
  full_name: z.string().trim().min(2, 'Upišite ime i prezime (najmanje 2 znaka)'),
  email: z.string().trim().min(1, 'Upišite e-mail adresu').email('Neispravan format e-mail adrese (npr. ime@tvrtka.hr)'),
  password: z.string().min(MIN_PASSWORD, `Lozinka mora imati najmanje ${MIN_PASSWORD} znakova`),
  role: z.enum(['employee', 'admin']),
});

type FormValues = z.infer<typeof schema>;

/** 14 znakova bez lako zamjenjivih (0/O, 1/l/I). */
function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function CreateEmployeeModal({ onClose }: { onClose: () => void }) {
  const createEmployee = useCreateEmployee();
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { full_name: '', email: '', password: '', role: 'employee' },
  });

  const handleGenerate = () => {
    setValue('password', generatePassword(), { shouldValidate: true, shouldDirty: true });
    setShowPassword(true);
    setCopied(false);
  };

  const handleCopy = async () => {
    const pw = getValues('password');
    if (!pw) return;
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      toast.success('Lozinka kopirana');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Kopiranje nije uspjelo – označite lozinku i kopirajte ručno.');
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await createEmployee.mutateAsync({ ...values, full_name: values.full_name.trim(), email: values.email.trim() });
      toast.success('Zaposlenik kreiran', {
        description: `${values.full_name} se može prijaviti s ${values.email}. Lozinku proslijedite sigurnim kanalom.`,
      });
      onClose();
    } catch {
      /* prikazuje se kroz FormError */
    }
  };

  return (
    <Dialog onClose={onClose} title="Novi zaposlenik">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <Field label="Ime i prezime" required error={errors.full_name?.message}>
          {p => (
            <input {...p} {...register('full_name')} type="text" required autoComplete="off"
              placeholder="npr. Marko Marković" className={inputClass(!!errors.full_name)} />
          )}
        </Field>

        <Field label="E-mail" required error={errors.email?.message}>
          {p => (
            <input {...p} {...register('email')} type="email" required autoComplete="off" inputMode="email"
              placeholder="marko@tvrtka.hr" className={inputClass(!!errors.email)} />
          )}
        </Field>

        <Field
          label="Početna lozinka"
          required
          error={errors.password?.message}
          hint={`Najmanje ${MIN_PASSWORD} znakova. Zaposlenik je može promijeniti u "Uredi profil".`}
        >
          {p => (
            <div className="space-y-2">
              <div className="relative">
                <input
                  {...p}
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  className={inputClass(!!errors.password, 'pr-20 font-mono')}
                />
                <div className="absolute inset-y-0 right-1 flex items-center">
                  <button type="button" onClick={handleCopy}
                    className="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    aria-label="Kopiraj lozinku">
                    {copied ? <Check size={16} className="text-green-600" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  </button>
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    aria-label={showPassword ? 'Sakrij lozinku' : 'Prikaži lozinku'} aria-pressed={showPassword}>
                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button type="button" onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-0 px-2.5 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg">
                <Wand2 size={14} aria-hidden="true" /> Generiraj lozinku
              </button>
            </div>
          )}
        </Field>

        <Field label="Uloga" required error={errors.role?.message}
          hint="Administratori ne evidentiraju rad i ne ulaze u statistike.">
          {p => (
            <select {...p} {...register('role')} className={inputClass(!!errors.role)}>
              <option value="employee">Zaposlenik</option>
              <option value="admin">Administrator</option>
            </select>
          )}
        </Field>

        <FormError message={createEmployee.error ? errorMessage(createEmployee.error) : null} />

        <FormActions onCancel={onClose} isPending={isSubmitting} submitLabel="Kreiraj zaposlenika" pendingLabel="Kreiranje…" />
      </form>
    </Dialog>
  );
}
