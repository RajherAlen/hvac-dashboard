import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useAddWorkLog, useUpdateWorkLog } from '../hooks/useWorkLogs';
import { useAuth } from '../hooks/useAuth';
import { todayISO } from '../lib/utils';
import type { WorkLog } from '../types';

const schema = z.object({
  log_date: z.string().min(1, 'Datum je obavezan'),
  task_description: z.string().min(3, 'Opišite zadatak (min. 3 znaka)'),
  location: z.string().min(2, 'Lokacija je obavezna'),
  hours_worked: z.number()
    .min(0.25, 'Minimum 15 minuta (0.25)')
    .max(24, 'Ne može biti više od 24 sata'),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface WorkLogFormProps {
  editLog?: WorkLog | null;
  onClose: () => void;
  /** Admin can override employee_id; otherwise it's the current user */
  employeeId?: string;
}

export function WorkLogForm({ editLog, onClose, employeeId }: WorkLogFormProps) {
  const { user } = useAuth();
  const addLog = useAddWorkLog();
  const updateLog = useUpdateWorkLog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      log_date: todayISO(),
      task_description: '',
      location: '',
      hours_worked: 8,
      notes: '',
    },
  });

  useEffect(() => {
    if (editLog) {
      reset({
        log_date: editLog.log_date,
        task_description: editLog.task_description,
        location: editLog.location,
        hours_worked: Number(editLog.hours_worked),
        notes: editLog.notes ?? '',
      });
    }
  }, [editLog, reset]);

  const onSubmit = async (values: FormValues) => {
    if (editLog) {
      await updateLog.mutateAsync({ id: editLog.id, values });
    } else {
      await addLog.mutateAsync({
        ...values,
        employee_id: employeeId ?? user!.id,
      });
    }
    onClose();
  };

  const error = addLog.error || updateLog.error;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">
            {editLog ? 'Uredi radni zapis' : 'Unos rada'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Datum</label>
            <input
              type="date"
              {...register('log_date')}
              max={todayISO()}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.log_date && (
              <p className="mt-1 text-xs text-red-500">{errors.log_date.message}</p>
            )}
          </div>

          {/* Task description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Opis zadatka</label>
            <textarea
              {...register('task_description')}
              rows={2}
              placeholder="npr. Servis klime kod Klijenta, Pregled kotlovnice..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {errors.task_description && (
              <p className="mt-1 text-xs text-red-500">{errors.task_description.message}</p>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lokacija</label>
            <input
              type="text"
              {...register('location')}
              placeholder="npr. Ilica 34, Zagreb | Ured | Daljinski"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.location && (
              <p className="mt-1 text-xs text-red-500">{errors.location.message}</p>
            )}
          </div>

          {/* Hours */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sati rada</label>
            <input
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              {...register('hours_worked', { valueAsNumber: true })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.hours_worked && (
              <p className="mt-1 text-xs text-red-500">{errors.hours_worked.message}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Napomene <span className="text-slate-400 font-normal">(neobavezno)</span>
            </label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Dodatne napomene..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* API error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {(error as Error).message}
            </p>
          )}

          {/* Actions */}
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
              {isSubmitting ? 'Spremanje...' : editLog ? 'Spremi promjene' : 'Dodaj unos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
