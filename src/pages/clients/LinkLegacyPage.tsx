import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { useClientDirectory, useLinkLegacyLocation, useUnlinkedLocations } from '../../hooks/useClients';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SitePicker } from '../../components/clients/SitePicker';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { OFFICE_LOCATION, OFFICE_SITE } from '../../lib/clients';
import { formatRelative } from '../../lib/format-date';
import { errorMessage } from '../../lib/errors';
import { pluralHr } from '../../lib/utils';

/**
 * Jednokratni alat: stari unosi imaju slobodni tekst lokacije. Admin svaku različitu
 * lokaciju poveže s objektom (ili ga kreira), a svi unosi s tim tekstom dobiju site_id.
 */
export function LinkLegacyPage() {
  useDocumentTitle('Povezivanje starih unosa');
  const dir = useClientDirectory();
  const { data: rows = [], isLoading } = useUnlinkedLocations(dir.enabled);
  const [done, setDone] = useState(0);

  if (dir.missingSchema) return <ModuleNotEnabled />;

  const pending = rows.filter(r => r.label !== OFFICE_LOCATION);
  const totalEntries = pending.reduce((s, r) => s + r.count, 0);

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 max-w-4xl">
      <nav aria-label="Putanja">
        <ol className="flex items-center gap-1.5 text-sm text-slate-600">
          <li><Link to="/klijenti" className="hover:text-slate-900 hover:underline">Klijenti</Link></li>
          <li aria-hidden="true"><ChevronRight size={14} className="text-slate-400" /></li>
          <li aria-current="page" className="font-medium text-slate-900">Povezivanje starih unosa</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">Povezivanje starih unosa</h1>
        <p className="text-sm text-slate-700 mt-1 max-w-2xl">
          Unosi prije uvođenja klijenata imaju lokaciju upisanu kao slobodni tekst. Za svaku lokaciju odaberite
          objekt (ili ga kreirajte) – svi unosi s tim tekstom bit će povezani s njim.
        </p>
        {!isLoading && (
          <p className="text-sm text-slate-600 mt-2" aria-live="polite">
            {pending.length === 0
              ? 'Sve lokacije su povezane.'
              : <>Preostalo {pending.length} {pluralHr(pending.length, 'lokacija', 'lokacije', 'lokacija')} ({totalEntries} {pluralHr(totalEntries, 'unos', 'unosa', 'unosa')}){done > 0 && <>, povezano u ovoj sesiji: {done}</>}.</>}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : pending.length === 0 ? (
        <div className="flex items-center gap-2 text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} aria-hidden="true" /> Svi stari unosi su povezani s objektima.
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map(r => <LegacyRow key={r.label} label={r.label} count={r.count} last={r.last} onLinked={() => setDone(d => d + 1)} />)}
        </ul>
      )}
    </div>
  );
}

function LegacyRow({ label, count, last, onLinked }: { label: string; count: number; last: string; onLinked: () => void }) {
  const link = useLinkLegacyLocation();
  const [site, setSite] = useState('');

  const apply = async () => {
    if (!site || site === OFFICE_SITE) return;
    try {
      const r = await link.mutateAsync({ location: label, siteId: site });
      toast.success(`Povezano ${r.updated} ${pluralHr(r.updated, 'unos', 'unosa', 'unosa')}`, { description: label });
      onLinked();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <li className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 items-start">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 break-words">„{label}”</p>
        <p className="text-xs text-slate-600 mt-0.5">{count} {pluralHr(count, 'unos', 'unosa', 'unosa')}, zadnji {formatRelative(last)}</p>
      </div>
      <div className="space-y-2">
        <label className="sr-only" htmlFor={`legacy-${label}`}>Objekt za „{label}”</label>
        <SitePicker id={`legacy-${label}`} value={site} onChange={setSite} />
        {site && site !== OFFICE_SITE && (
          <button type="button" onClick={() => void apply()} disabled={link.isPending}
            className="min-h-10 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
            {link.isPending ? 'Povezivanje…' : `Poveži ${count} ${pluralHr(count, 'unos', 'unosa', 'unosa')}`}
          </button>
        )}
        {site === OFFICE_SITE && <p className="text-xs text-slate-600">Unosi bez klijenta mogu ostati nepovezani – nije potrebna radnja.</p>}
      </div>
    </li>
  );
}
