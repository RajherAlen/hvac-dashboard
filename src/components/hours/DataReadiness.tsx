import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn, formatHours } from '../../lib/utils';

interface Props {
  /** Svi sati u razdoblju */
  totalHours: number;
  /** Sati upisani bez naloga */
  noOrderHours: number;
  /** Sati na nalozima s cijenom */
  pricedHours: number;
  /** Modul naloga postoji (migracija 20261109) */
  hasOrders: boolean;
  /** Cijene naloga postoje (migracija 20261110) */
  hasPrice: boolean;
}

/** Korak je ispunjen kad je pokriveno barem 90 % sati – nekoliko starih unosa ne smije blokirati prikaz. */
const DONE_AT = 0.9;
const STORAGE_KEY = 'hv-readiness-collapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* privatni način rada */ }
}

/**
 * Spremnost podataka: zašto stranica još ne pokazuje zaradu po poslu i što točno nedostaje.
 * Mjeri se na stvarnim podacima razdoblja i nestaje kad su oba koraka ispunjena.
 */
export function DataReadiness({ totalHours, noOrderHours, pricedHours, hasOrders, hasPrice }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const orderHours = Math.max(0, totalHours - noOrderHours);
  const orderShare = hasOrders && totalHours > 0 ? orderHours / totalHours : 0;
  const priceShare = hasPrice && orderHours > 0 ? pricedHours / orderHours : 0;
  const step1 = hasOrders && totalHours > 0 && orderShare >= DONE_AT;
  const step2 = hasPrice && orderHours > 0 && priceShare >= DONE_AT;
  const done = Number(step1) + Number(step2);

  if (step1 && step2) return null;

  const toggle = () => setCollapsed(c => { writeCollapsed(!c); return !c; });

  return (
    <section aria-labelledby="hv-ready-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 id="hv-ready-title" className="text-base font-semibold text-slate-900">
            Zarada po poslu vidjet će se kad se rad upisuje na naloge s cijenom
          </h2>
          {!collapsed && (
            <p className="mt-1 text-sm text-slate-600 max-w-[68ch]">
              Sada stranica pokazuje koliko je sati otišlo kojem klijentu. Kad su oba koraka ispunjena,
              pokazat će i koliko je svaki posao zaradio po satu te koji su poslovi ispod prosjeka.
            </p>
          )}
        </div>
        <span className="shrink-0 mt-0.5 text-xs font-medium text-slate-600 tabular-nums">{done} od 2</span>
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls="hv-ready-body"
          className="shrink-0 -mr-2 -mt-1 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <ChevronDown size={18} className={cn('transition-transform', collapsed && '-rotate-90')} aria-hidden="true" />
          <span className="sr-only">{collapsed ? 'Prikaži korake' : 'Sakrij korake'}</span>
        </button>
      </div>

      {!collapsed && (
        <div id="hv-ready-body">
          <ol className="grid sm:grid-cols-2 border-t border-slate-100 sm:divide-x divide-y sm:divide-y-0 divide-slate-100">
            <Step
              n={1}
              done={step1}
              title="Tehničari upisuju rad na nalog"
              text="U Unosu rada tehničar odabere nalog iz Rasporeda umjesto slobodnog teksta. Tako se zna na koji je posao vrijeme otišlo i koja je vrsta posla."
              share={orderShare}
              meter={!hasOrders
                ? 'Raspored naloga još nije uključen'
                : totalHours === 0 ? 'U razdoblju još nema sati'
                : `${formatHours(orderHours)} od ${formatHours(totalHours)} na nalozima`}
              action={<Link to="/raspored" className="font-medium text-blue-700 hover:underline">Otvori raspored</Link>}
            />
            <Step
              n={2}
              done={step2}
              title="Nalozi imaju dogovorenu cijenu"
              text="Upišite cijenu posla na nalogu. Zarada po satu = cijena ÷ svi sati upisani na taj nalog, npr. 1.200 € ÷ 40 h = 30 €/h."
              share={priceShare}
              meter={!hasPrice
                ? <>Potrebna migracija <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">20261110_work_order_value.sql</code></>
                : orderHours === 0 ? 'Čeka prvi korak: još nema sati na nalozima'
                : `${formatHours(pricedHours)} od ${formatHours(orderHours)} na nalozima s cijenom`}
              action={hasPrice && <Link to="/raspored" className="font-medium text-blue-700 hover:underline">Upiši cijene na nalozima</Link>}
            />
          </ol>
          <p className="px-4 sm:px-6 py-3 border-t border-slate-100 text-xs text-slate-600">
            Korak je ispunjen kad je pokriveno barem 90 % sati u odabranom razdoblju. Stariji unosi bez naloga mogu ostati takvi.
          </p>
        </div>
      )}
    </section>
  );
}

function Step({ n, done, title, text, share, meter, action }: {
  n: number; done: boolean; title: string; text: string; share: number;
  meter: React.ReactNode; action?: React.ReactNode;
}) {
  const pct = Math.round(share * 100);
  return (
    <li className="px-4 sm:px-6 py-4 flex gap-3">
      <span aria-hidden="true" className={cn(
        'mt-0.5 w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold',
        done ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300',
      )}>
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900">
          {title}<span className="sr-only">{done ? ' – ispunjeno' : ' – nije ispunjeno'}</span>
        </h3>
        <p className="mt-0.5 text-sm text-slate-600">{text}</p>
        <div className="mt-3" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className={cn('h-full rounded-full', done ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-transparent')}
              style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>
        <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-slate-700 tabular-nums">
          <span>{meter}{pct > 0 && <span className="text-slate-500"> · {pct} %</span>}</span>
          {!done && action}
        </p>
      </div>
    </li>
  );
}
