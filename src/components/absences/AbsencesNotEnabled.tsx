import { CalendarOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/** Prikaz dok migracija za odsutnosti nije pokrenuta. Državni praznici rade i bez nje. */
export function AbsencesNotEnabled() {
  const { role } = useAuth();
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <CalendarOff size={32} className="text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Odsutnosti još nisu uključene</h1>
      {role === 'admin' ? (
        <p className="mt-2 text-sm text-slate-700">
          Za godišnje, bolovanja i neradne dane tvrtke potrebno je jednom pokrenuti migraciju baze
          {' '}<code className="px-1 py-0.5 bg-slate-100 rounded text-xs">supabase/migrations/20261111_absences.sql</code>{' '}
          u Supabase SQL editoru. Državni praznici se već sada ne računaju kao propušteni unos.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-700">Administrator još nije uključio ovaj modul. Za godišnji ili bolovanje javite se izravno.</p>
      )}
    </div>
  );
}
