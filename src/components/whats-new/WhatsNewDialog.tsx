import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Step {
  title: string;
  text: string;
  bullets: string[];
  visual: ReactNode;
}

const Avatar = ({ initials, color, size = 'md' }: { initials: string; color: string; size?: 'sm' | 'md' }) => (
  <span className={cn('inline-flex items-center justify-center rounded-full text-white font-bold border-2 border-white shrink-0',
    size === 'md' ? 'w-6 h-6 text-[9px]' : 'w-[22px] h-[22px] text-[9px] border-0', color)}>
    {initials}
  </span>
);

const Chip = ({ initials, color, name }: { initials: string; color: string; name: string }) => (
  <span className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full py-1 pl-1 pr-2.5 text-[13px]">
    <Avatar initials={initials} color={color} size="sm" />{name}
  </span>
);

const BeforeAfter = (
  <div className="flex items-center gap-4 sm:gap-9">
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-slate-400">PRIJE</div>
      <div className="flex flex-col gap-1.5 opacity-70">
        {[['Boris', 'text-indigo-500'], ['Ivan Š.', 'text-red-600'], ['Lovro', 'text-pink-600']].map(([n, c]) => (
          <div key={n} className="w-32 sm:w-[190px] bg-white text-slate-900 rounded-lg px-2.5 py-1.5 text-xs font-semibold flex justify-between">
            Bosch <span className={c}>{n}</span>
          </div>
        ))}
      </div>
    </div>
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" stroke="#4ade80" strokeWidth="2.5" className="shrink-0 w-8 sm:w-12">
      <path d="M2 12h42M34 3l10 9-10 9" />
    </svg>
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold text-green-400">SADA</div>
      <div className="w-40 sm:w-60 bg-white text-slate-900 rounded-[10px] px-3.5 py-3 flex flex-col gap-1.5 ring-[3px] ring-green-400/35">
        <div className="text-sm font-bold">Bosch</div>
        <div className="text-xs text-slate-600">Redovni servis · 2 h</div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            <Avatar initials="BR" color="bg-indigo-500" />
            <Avatar initials="IŠ" color="bg-red-600" />
            <Avatar initials="LJ" color="bg-pink-600" />
          </div>
          <span className="text-[11px] text-blue-700 bg-blue-100 rounded-md px-1.5 py-0.5 font-semibold">Ekipa 1</span>
        </div>
      </div>
    </div>
  </div>
);

const CrewCard = (
  <div className="w-full max-w-[420px] bg-white text-slate-900 rounded-xl p-4 sm:p-[18px] flex flex-col gap-3">
    <div className="flex justify-between items-center">
      <div className="font-bold text-[15px]">Ekipa 1</div>
      <span className="text-[11px] text-green-700 bg-green-100 rounded-full px-2.5 py-0.5 font-semibold">Stalna</span>
    </div>
    <div className="flex flex-wrap gap-2">
      <Chip initials="BR" color="bg-indigo-500" name="Boris ★" />
      <Chip initials="IŠ" color="bg-red-600" name="Ivan Š." />
      <Chip initials="LJ" color="bg-pink-600" name="Lovro" />
      <span className="inline-flex items-center justify-center border border-dashed border-slate-400 text-slate-600 rounded-full w-[30px] h-[30px] font-semibold">+</span>
    </div>
    <div className="text-xs text-slate-500">★ voditelj · Izbornik Ekipe › + Nova ekipa</div>
  </div>
);

const AssignCard = (
  <div className="w-full max-w-[420px] bg-white text-slate-900 rounded-xl p-4 sm:p-[18px] flex flex-col gap-2.5">
    <div className="grid grid-cols-2 bg-slate-100 rounded-[9px] p-[3px]">
      <span className="bg-white rounded-[7px] text-center py-1.5 text-[13px] font-semibold shadow-sm">Ekipi</span>
      <span className="text-center py-1.5 text-[13px] text-slate-600">Pojedincima</span>
    </div>
    {([['Boris Rajher', false], ['Ivan Šarlija', true], ['Lovro Juras', false]] as const).map(([name, off]) => (
      <div key={name} className={cn('flex items-center gap-2.5 text-[13px]', off && 'text-slate-400')}>
        <span className={cn('w-4 h-4 rounded', off ? 'border-[1.5px] border-slate-300' : 'bg-blue-600')} />
        {name}
        <span className={cn('ml-auto text-xs', off ? 'text-violet-600 font-semibold' : 'text-slate-500')}>
          {off ? 'Bolovanje' : '21 / 40 h'}
        </span>
      </div>
    ))}
  </div>
);

const STEPS: Step[] = [
  {
    title: 'Upoznajte Ekipe',
    text: 'Nalog koji radi više tehničara sada je jedan nalog, a ne tri kopije. U rasporedu se prikazuje jednom, s avatarima svih koji na njemu rade.',
    bullets: ['Manje dupliciranja i grešaka pri izmjenama', 'Izmjena termina ili opisa vrijedi za sve članove odjednom', 'Sati se i dalje upisuju svakom tehničaru zasebno'],
    visual: BeforeAfter,
  },
  {
    title: 'Napravite ekipu',
    text: 'Spremite tehničare koji često rade zajedno kao ekipu. Odaberite voditelja, a po želji dodajte i vozilo.',
    bullets: ['Novi izbornik Ekipe u bočnoj traci (pod Planiranje)', 'Stalna ekipa ili privremena (npr. do petka)', 'Jedan tehničar može biti u više ekipa'],
    visual: CrewCard,
  },
  {
    title: 'Dodijelite nalog ekipi',
    text: 'Kod novog naloga birate „Ekipi” ili „Pojedincima”. Za pojedini nalog možete isključiti člana koji ne ide.',
    bullets: ['Članovi na godišnjem ili bolovanju automatski su isključeni', 'Odaberete li 2+ pojedinca, ponudit ćemo „Spremi kao ekipu?”', 'Kapacitet svakog člana računa se automatski'],
    visual: AssignCard,
  },
];

/**
 * Najava značajke Ekipe ("Što je novo"), prema dizajnu na platnu.
 * onDismiss(true) = trajno (zadnji korak ili "Ne prikazuj ponovno"), false = samo za ovu sesiju.
 */
export function WhatsNewDialog({ onDismiss }: { onDismiss: (permanent: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const navigate = useNavigate();
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const close = () => onDismiss(dontShow);
  const finish = () => { onDismiss(true); navigate('/ekipe'); };
  const go = (n: number) => setStep(Math.min(STEPS.length - 1, Math.max(0, n)));

  return (
    <D.Root open onOpenChange={o => { if (!o) close(); }}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-slate-900/55 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content
          onOpenAutoFocus={e => {
            // Fokus na "Dalje" umjesto na X u kutu
            const btn = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-autofocus]');
            if (btn) { e.preventDefault(); btn.focus(); }
          }}
          onKeyDown={e => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1); }
          }}
          className={cn(
            'fixed z-50 bg-white flex flex-col overflow-hidden focus:outline-none shadow-[0_30px_80px_rgba(2,6,23,.35)]',
            'inset-x-0 bottom-0 max-h-[94dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
            'sm:inset-0 sm:m-auto sm:h-fit sm:w-[calc(100%-2rem)] sm:max-w-[760px] sm:rounded-[20px] sm:max-h-[92dvh] sm:pb-0',
            'data-[state=open]:animate-[sheet-in_180ms_ease-out] sm:data-[state=open]:animate-[fade-in_150ms_ease-out]',
          )}
        >
          {/* Vizualno područje */}
          <div className="relative shrink-0 h-56 sm:h-[290px] bg-slate-900 flex items-center justify-center px-4 sm:px-7 pt-12 pb-6 sm:py-7">
            <span className="absolute top-[18px] left-[22px] text-[11px] font-bold tracking-[.08em] text-green-950 bg-green-400 rounded-full px-2.5 py-1">
              NOVO · {step + 1} / {STEPS.length}
            </span>
            <D.Close className="absolute top-3 right-3 w-11 h-11 rounded-[10px] text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center"
              aria-label="Zatvori">
              <X size={20} aria-hidden="true" />
            </D.Close>
            <div aria-hidden="true" className="w-full flex justify-center">{s.visual}</div>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {/* Tekst */}
            <div className="px-5 sm:px-9 pt-6 sm:pt-7 pb-2 flex flex-col gap-2.5 sm:min-h-[190px]">
              <D.Title className="m-0 text-xl sm:text-2xl font-bold text-slate-900">{s.title}</D.Title>
              <D.Description className="m-0 text-[15px] text-slate-600 leading-relaxed">{s.text}</D.Description>
              <ul className="mt-1 pl-5 list-disc text-sm text-slate-700 leading-7">
                {s.bullets.map(b => <li key={b}>{b}</li>)}
              </ul>
            </div>

            {/* Podnožje */}
            <div className="px-5 sm:px-9 pt-5 pb-5 sm:pb-7 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2 justify-center sm:justify-start" role="group" aria-label={`Korak ${step + 1} od ${STEPS.length}`}>
                {STEPS.map((_, n) => (
                  <button key={n} type="button" onClick={() => go(n)} aria-label={`Korak ${n + 1}`} aria-current={n === step ? 'step' : undefined}
                    className="py-[18px] -my-[18px] px-0.5">
                    <span className={cn('block h-2 rounded-full transition-all', n === step ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400')} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <label className="flex items-center gap-2 text-[13px] text-slate-600 mr-auto sm:mr-2 cursor-pointer min-h-11">
                  <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-400 accent-blue-600" />
                  Ne prikazuj ponovno
                </label>
                {step === 0 ? (
                  <button type="button" onClick={close}
                    className="min-h-11 px-3.5 rounded-[10px] text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    Preskoči
                  </button>
                ) : (
                  <button type="button" onClick={() => go(step - 1)}
                    className="min-h-11 px-[18px] rounded-[10px] text-sm font-semibold text-slate-900 border border-slate-300 bg-white hover:bg-slate-50">
                    Natrag
                  </button>
                )}
                <button type="button" data-autofocus onClick={last ? finish : () => go(step + 1)}
                  className="min-h-11 px-5 rounded-[10px] text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700">
                  {last ? 'Otvori Ekipe' : 'Dalje'}
                </button>
              </div>
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
