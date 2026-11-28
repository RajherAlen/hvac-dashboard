import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Car, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { useCrews, useDeleteCrew, type Crew } from '../../hooks/useCrews';
import { usePlan } from '../../hooks/useWorkOrders';
import { CrewFormDialog } from '../../components/crews/CrewFormDialog';
import { PersonAvatar } from '../../components/crews/PersonAvatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { crewDurationLabel, matchCrew } from '../../lib/crews';
import { employeeColorMap } from '../../lib/colors';
import { errorMessage } from '../../lib/errors';
import { formatShort } from '../../lib/format-date';
import { getCurrentWeekRange, cn, pluralHr, todayISO } from '../../lib/utils';
import { DAY_CAPACITY } from '../../lib/orders';

const short = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;

export function CrewsPage() {
  useDocumentTitle('Ekipe');
  const today = todayISO();
  const crewsQ = useCrews();
  const del = useDeleteCrew();
  const directory = useStaffDirectory();
  const week = getCurrentWeekRange();
  const { data: plan } = usePlan(week.start, week.end);
  const [editing, setEditing] = useState<Crew | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Crew | null>(null);

  const staff = useMemo(() => directory.entries.filter(e => !e.isAdmin).map(e => e.emp), [directory.entries]);
  const colors = useMemo(() => employeeColorMap(staff), [staff]);
  const nameOf = (id: string) => staff.find(e => e.id === id)?.full_name ?? '—';
  const crews = useMemo(() => crewsQ.data ?? [], [crewsQ.data]);

  // Sati naloga ekipe ovaj tjedan (svaki nalog-dan jednom, po najvećoj procjeni među članovima)
  const weekHours = useMemo(() => {
    const groups = new Map<string, { emps: string[]; day: string; h: number }>();
    for (const a of plan ?? []) {
      const k = `${a.work_order_id}|${a.day}`;
      const g = groups.get(k) ?? { emps: [], day: a.day, h: 0 };
      g.emps.push(a.employee_id);
      g.h = Math.max(g.h, Number(a.planned_hours));
      groups.set(k, g);
    }
    const m = new Map<string, number>();
    for (const g of groups.values()) {
      const c = matchCrew(g.emps, crews, g.day);
      if (c) m.set(c.id, (m.get(c.id) ?? 0) + g.h);
    }
    return m;
  }, [plan, crews]);

  if (crewsQ.data === null) return <CrewsNotEnabled />;

  const active = crews.filter(c => !crewDurationLabel(c, today, formatShort).expired);
  const expired = crews.filter(c => crewDurationLabel(c, today, formatShort).expired);

  const card = (c: Crew) => {
    const dur = crewDurationLabel(c, today, formatShort);
    const members = [...c.members].sort((a, b) => (a === c.lead_id ? -1 : b === c.lead_id ? 1 : nameOf(a).localeCompare(nameOf(b), 'hr')));
    return (
      <li key={c.id} className={cn('bg-white rounded-xl border shadow-sm p-4 sm:p-5 flex flex-col gap-3', dur.expired ? 'border-slate-200 opacity-80' : 'border-slate-200')}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{c.name}</h2>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
            !c.valid_until ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : dur.expired ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-900 border-amber-200')}>
            {dur.text}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Članovi">
          {members.map(id => (
            <li key={id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full pl-0.5 pr-2.5 py-0.5 text-sm text-slate-800">
              <PersonAvatar name={nameOf(id)} color={colors[id]} size="sm" />
              {nameOf(id)}
              {id === c.lead_id && <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 rounded px-1.5">voditelj</span>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
          {c.vehicle && <span className="inline-flex items-center gap-1"><Car size={13} aria-hidden="true" /> {c.vehicle}</span>}
          {!dur.expired && <span className="tabular-nums">Ovaj tjedan: {short(weekHours.get(c.id) ?? 0)} / {short(5 * DAY_CAPACITY)} naloga ekipe</span>}
        </p>
        <div className="flex gap-2 mt-auto">
          <button type="button" onClick={() => setEditing(c)}
            className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-3 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg">
            <Pencil size={14} aria-hidden="true" /> Uredi<span className="sr-only"> {c.name}</span>
          </button>
          <button type="button" onClick={() => setDeleting(c)}
            className="inline-flex items-center gap-1.5 min-h-10 sm:min-h-9 px-3 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg">
            <Trash2 size={14} aria-hidden="true" /> Obriši<span className="sr-only"> {c.name}</span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-4 sm:gap-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Ekipe</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Spremljene grupe tehničara. Nalog dodijeljen ekipi u <Link to="/raspored?prikaz=ekipe" className="text-blue-700 hover:underline">rasporedu</Link> prikazuje se jednom, u redu ekipe.
          </p>
        </div>
        <button type="button" onClick={() => setEditing('new')}
          className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap">
          <Plus size={16} aria-hidden="true" /> Nova ekipa
        </button>
      </div>

      {crewsQ.isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : crews.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <Users size={28} className="mx-auto text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-700">Još nema ekipa. Dodajte prvu ili u obrascu naloga odaberite više tehničara pa „Spremi kao ekipu”.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && <ul className="grid sm:grid-cols-2 gap-3">{active.map(card)}</ul>}
          {expired.length > 0 && (
            <section aria-labelledby="expired-crews">
              <h2 id="expired-crews" className="text-sm font-semibold text-slate-700 mb-2">
                Istekle privremene ekipe · {expired.length} {pluralHr(expired.length, 'ekipa', 'ekipe', 'ekipa')}
              </h2>
              <ul className="grid sm:grid-cols-2 gap-3">{expired.map(card)}</ul>
            </section>
          )}
        </>
      )}

      {editing && <CrewFormDialog crew={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => { if (!o) setDeleting(null); }}
        title={`Obrisati ekipu „${deleting?.name ?? ''}”?`}
        description="Nalozi i dodjele tehničarima ostaju; u rasporedu se samo više ne grupiraju pod ovu ekipu."
        confirmLabel="Obriši ekipu"
        error={del.error ? errorMessage(del.error) : null}
        onConfirm={async () => {
          if (!deleting) return;
          await del.mutateAsync(deleting.id);
          toast.success('Ekipa obrisana', { description: deleting.name });
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CrewsNotEnabled() {
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <Users size={32} className="text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Ekipe još nisu uključene</h1>
      <p className="mt-2 text-sm text-slate-700">
        Potrebno je jednom pokrenuti migraciju baze
        {' '}<code className="px-1 py-0.5 bg-slate-100 rounded text-xs">supabase/migrations/20261113_crews.sql</code>{' '}
        u Supabase SQL editoru. Do tada nalog s više tehničara i dalje radi u prikazu po zaposlenicima.
      </p>
    </div>
  );
}
