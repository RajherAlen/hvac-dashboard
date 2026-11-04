import { Building2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/** Prikaz dok migracija za klijente nije pokrenuta. */
export function ModuleNotEnabled() {
  const { role } = useAuth();
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <Building2 size={32} className="text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Klijenti još nisu uključeni</h1>
      {role === 'admin' ? (
        <p className="mt-2 text-sm text-slate-700">
          Za evidenciju klijenata, objekata i uređaja potrebno je jednom pokrenuti migraciju baze
          {' '}<code className="px-1 py-0.5 bg-slate-100 rounded text-xs">supabase/migrations/20261105_clients.sql</code>{' '}
          u Supabase SQL editoru. Do tada se unos rada i dalje vodi sa slobodnim tekstom lokacije.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-700">Administrator još nije uključio ovaj modul. Lokaciju rada i dalje upisujete slobodnim tekstom.</p>
      )}
    </div>
  );
}
