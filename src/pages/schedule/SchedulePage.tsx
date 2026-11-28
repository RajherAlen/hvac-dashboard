import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, CircleAlert, GripVertical, MoreHorizontal,
  Plus, PlusCircle, Trash2, UserRound, Users, Wrench,
} from 'lucide-react';
import { addDays, parseISO } from 'date-fns';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { crewActiveOn, useCrews, type Crew as Team } from '../../hooks/useCrews';
import { matchCrew } from '../../lib/crews';
import { PersonAvatar } from '../../components/crews/PersonAvatar';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { useClientDirectory } from '../../hooks/useClients';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useServiceBoard, type ServiceItem } from '../../hooks/useServiceCases';
import {
  usePlan, useUnscheduledOrders, useMoveAssignment, useMoveAssignments, useAddAssignment, useRemoveAssignment,
  useRemoveAssignments, useSaveOrder, useSetOrderDayCrew, type PlanAssignment, type OrderWithDevices,
} from '../../hooks/useWorkOrders';
import { PeriodStepper } from '../../components/PeriodNav';
import { OrderFormDialog, type OrderPreset } from '../../components/orders/OrderFormDialog';
import { OrderDrawer } from '../../components/orders/OrderDrawer';
import { KindIcon } from '../../components/orders/KindIcon';
import { ModuleNotEnabled } from '../../components/clients/ModuleNotEnabled';
import { employeeColorMap } from '../../lib/colors';
import { errorMessage } from '../../lib/errors';
import { formatShort, formatWeekday, formatWeekdayShort, toISODate } from '../../lib/format-date';
import { assignmentState, DAY_CAPACITY, KIND_LABEL, type AssignmentState } from '../../lib/orders';
import { isWorkday, isStaff } from '../../lib/period';
import { dueText } from '../../lib/service';
import { cn, todayISO } from '../../lib/utils';
import type { Absence, Profile } from '../../types';
import { useWorkCalendar } from '../../hooks/useAbsences';
import { ABSENCE_LABEL } from '../../lib/workCalendar';
import { ABSENCE_TONE } from '../../components/absences/absenceStyle';

const cellId = (emp: string, day: string) => `c:${emp}|${day}`;

function shiftWorkday(day: string, dir: 1 | -1): string {
  let d = addDays(parseISO(day), dir);
  while (!isWorkday(toISODate(d))) d = addDays(d, dir);
  return toISODate(d);
}

/** 6 h / 7,5 h – kratko za ćelije */
const short = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;

/**
 * Ekipa naloga: sve dodjele istog naloga istog dana. Puna kartica se crta jednom, u redu
 * voditelja (prvi prisutni po redoslijedu tehničara); ostali članovi dobiju samo traku.
 */
type Crew = { key: string; items: PlanAssignment[]; lead: string; present: number; team: Team | null };
type CrewMember = { id: string; asgId: string; name: string; color: string; away: Absence | null };
const crewKey = (a: { work_order_id: string; day: string }) => `${a.work_order_id}|${a.day}`;
const teamCellId = (team: string, day: string) => `t:${team}|${day}`;

const firstName = (name: string) => name.split(' ')[0];

type ViewMode = 'zaposlenici' | 'ekipe';
const VIEW_KEY = 'raspored.prikaz';
function storedView(): ViewMode | null {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'ekipe' || v === 'zaposlenici' ? v : null; } catch { return null; }
}

export function SchedulePage() {
  useDocumentTitle('Raspored');
  const period = usePeriod('week', ['week'], { allowFuture: true });
  const { start, end, days } = period;
  const today = todayISO();
  const directory = useStaffDirectory();
  const dir = useClientDirectory();
  const planQ = usePlan(start, end);
  const unscheduledQ = useUnscheduledOrders();
  const board = useServiceBoard();
  const { data: allLogs = [] } = useWorkLogs({ startDate: start, endDate: end });
  const { cal } = useWorkCalendar(start, end);
  const move = useMoveAssignment();
  const moveMany = useMoveAssignments();
  const addAsg = useAddAssignment();
  const removeAsg = useRemoveAssignment();
  const removeMany = useRemoveAssignments();
  const setDayCrew = useSetOrderDayCrew();
  const saveOrder = useSaveOrder();
  const crewsQ = useCrews();

  const [creating, setCreating] = useState<OrderPreset | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Ekipe aktivne bilo kojeg dana u tjednu
  const teams = useMemo(() => (crewsQ.data ?? []).filter(t => crewActiveOn(t, start)), [crewsQ.data, start]);
  const paramView = params.get('prikaz');
  const view: ViewMode = teams.length === 0 ? 'zaposlenici'
    : paramView === 'ekipe' || paramView === 'zaposlenici' ? paramView : storedView() ?? 'ekipe';
  const setView = (v: ViewMode) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* privatni prozor */ }
    setParams(p => { const n = new URLSearchParams(p); n.set('prikaz', v); return n; }, { replace: true });
  };
  const byTeams = view === 'ekipe';

  const plan = useMemo(() => planQ.data ?? [], [planQ.data]);
  const logs = useMemo(() => allLogs.filter(l => isStaff(l.profiles)), [allLogs]);
  const employees = useMemo(() => directory.entries.filter(e => !e.isAdmin).map(e => e.emp), [directory.entries]);
  const colors = useMemo(() => employeeColorMap(employees), [employees]);
  const staff = useMemo(() => {
    const withPlan = new Set(plan.map(a => a.employee_id));
    const active = new Set(directory.activeStaff.map(e => e.id));
    return employees.filter(e => active.has(e.id) || withPlan.has(e.id));
  }, [employees, plan, directory.activeStaff]);

  const byCell = useMemo(() => {
    const m = new Map<string, PlanAssignment[]>();
    for (const a of plan) {
      const k = `${a.employee_id}|${a.day}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [plan]);
  const actualByCell = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(`${l.employee_id}|${l.log_date}`, (m.get(`${l.employee_id}|${l.log_date}`) ?? 0) + Number(l.hours_worked));
    return m;
  }, [logs]);
  const loggedAsg = useMemo(() => new Set(logs.map(l => l.assignment_id).filter(Boolean) as string[]), [logs]);

  const crews = useMemo(() => {
    const rank = new Map(staff.map((e, i) => [e.id, i]));
    const groups = new Map<string, PlanAssignment[]>();
    for (const a of plan) {
      const k = crewKey(a);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(a);
    }
    const out = new Map<string, Crew>();
    for (const [key, items] of groups) {
      items.sort((x, y) => (rank.get(x.employee_id) ?? 999) - (rank.get(y.employee_id) ?? 999));
      const present = items.filter(a => !cal.absenceOf(a.employee_id, a.day));
      const team = byTeams ? matchCrew(items.map(a => a.employee_id), teams, items[0].day) : null;
      out.set(key, { key, items, lead: (present[0] ?? items[0]).employee_id, present: present.length, team });
    }
    return out;
  }, [plan, staff, cal, byTeams, teams]);

  const pendingServices = board.items.filter(i => i.sc.status === 'due' || i.sc.status === 'contacted');
  const unscheduled = unscheduledQ.data ?? [];

  // Vikend se prikazuje uzak, osim kad ima naloga
  const weekendBusy = (d: string) => plan.some(a => a.day === d);
  // Uski stupac: neradni dan bez naloga (današnji dan uvijek pun, da stane "danas")
  const isNarrow = (d: string) => !isWorkday(d, cal) && !weekendBusy(d) && d !== today;
  const visibleDays = days;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const nameOf = (id: string) => staff.find(e => e.id === id)?.full_name ?? '—';
  const placeOf = (siteId: string | null) => {
    if (!siteId) return 'Ured / ostalo';
    return dir.siteIndex.get(siteId)?.client.name ?? 'Objekt';
  };
  const describe = (id: string) => {
    if (id.startsWith('a:')) { const a = plan.find(x => x.id === id.slice(2)); return a ? `${a.work_orders.title}, ${placeOf(a.work_orders.site_id)}` : 'nalog'; }
    if (id.startsWith('o:')) { const o = unscheduled.find(x => x.id === id.slice(2)); return o ? `${o.title}, ${placeOf(o.site_id)}` : 'nalog'; }
    if (id.startsWith('s:')) { const s = pendingServices.find(x => x.sc.id === id.slice(2)); return s ? `servis, ${s.client.name}` : 'servis'; }
    if (id.startsWith('g:')) {
      const c = crews.get(id.slice(2));
      const o = c?.items[0].work_orders;
      return o ? `${o.title}, ${placeOf(o.site_id)} (${c.items.length} tehničara)` : 'nalog';
    }
    if (id.startsWith('p:')) { const a = plan.find(x => x.id === id.slice(2)); return a ? `${nameOf(a.employee_id)} na nalogu ${placeOf(a.work_orders.site_id)}` : 'tehničar'; }
    return '';
  };
  const describeCell = (id: string) => {
    const [who, day] = id.slice(2).split('|');
    if (id.startsWith('t:')) return `ekipa ${teams.find(t => t.id === who)?.name ?? ''}, ${formatWeekday(day)}`;
    return `${nameOf(who)}, ${formatWeekday(day)}`;
  };

  /** Prisutni članovi ekipe tog dana (odsutni se ne uključuju automatski). */
  const presentMembers = (t: Team, day: string) => {
    const known = new Set(staff.map(e => e.id));
    return t.members.filter(m => known.has(m) && !cal.absenceOf(m, day));
  };

  /** Nalog na red ekipe: dobivaju ga svi prisutni članovi tog dana. */
  const assignToTeam = (t: Team, day: string, order: { id: string; title: string; hours: number }, from: { id: string; employee_id: string }[]) => {
    const ids = presentMembers(t, day);
    if (ids.length === 0) { toast.error(`Nitko iz ekipe ${t.name} ne radi ${formatWeekday(day)}.`); return; }
    const skipped = t.members.length - ids.length;
    setDayCrew.mutate({ work_order_id: order.id, from, day, employee_ids: ids, planned_hours: order.hours }, {
      onSuccess: () => toast.success(`Dodijeljeno ekipi ${t.name}`, {
        description: `${order.title} → ${formatWeekday(day)}${skipped > 0 ? ` · ${ids.length}/${t.members.length} (odsutni nisu uključeni)` : ''}`,
      }),
      onError: e => toast.error(e && /duplicate|unique/i.test(errorMessage(e)) ? 'Netko iz ekipe već ima ovaj nalog tog dana.' : errorMessage(e)),
    });
  };

  const undoMove = (id: string, prev: { employee_id: string; day: string }) =>
    move.mutate({ id, ...prev }, { onError: e => toast.error(errorMessage(e)) });

  const moveTo = (a: PlanAssignment, employee_id: string, day: string) => {
    if (a.employee_id === employee_id && a.day === day) return;
    const prev = { employee_id: a.employee_id, day: a.day };
    move.mutate({ id: a.id, employee_id, day }, {
      onSuccess: () => toast.success('Premješteno', {
        description: `${a.work_orders.title} → ${nameOf(employee_id).split(' ')[0]}, ${formatWeekday(day)}`,
        action: { label: 'Poništi', onClick: () => undoMove(a.id, prev) },
      }),
      onError: e => toast.error(e && /duplicate|unique/i.test(errorMessage(e)) ? 'Taj tehničar već ima ovaj nalog tog dana.' : errorMessage(e)),
    });
  };

  /** Cijela ekipa naloga na drugi dan; tehničari ostaju isti. */
  const moveCrew = (crew: Crew, day: string) => {
    if (crew.items[0].day === day) return;
    const prev = crew.items.map(a => ({ id: a.id, employee_id: a.employee_id, day: a.day }));
    const title = crew.items[0].work_orders.title;
    const away = crew.items.filter(a => cal.absenceOf(a.employee_id, day)).map(a => firstName(nameOf(a.employee_id)));
    if (away.length) toast.warning(`Taj dan ${away.length === 1 ? 'je odsutan' : 'su odsutni'}: ${away.join(', ')}`);
    moveMany.mutate(crew.items.map(a => ({ id: a.id, employee_id: a.employee_id, day })), {
      onSuccess: () => toast.success('Premješteno', {
        description: `${title} (${crew.items.length} tehničara) → ${formatWeekday(day)}`,
        action: { label: 'Poništi', onClick: () => moveMany.mutate(prev, { onError: e => toast.error(errorMessage(e)) }) },
      }),
      onError: e => toast.error(e && /duplicate|unique/i.test(errorMessage(e)) ? 'Netko iz ekipe već ima ovaj nalog tog dana.' : errorMessage(e)),
    });
  };

  /** Dodaje tehničara na nalog za taj dan ili ga uklanja (posljednji se ne može ukloniti ovdje). */
  const toggleMember = (crew: Crew, empId: string) => {
    const first = crew.items[0];
    const existing = crew.items.find(a => a.employee_id === empId);
    const who = firstName(nameOf(empId));
    if (existing) {
      if (crew.items.length === 1) return;
      removeAsg.mutate(existing.id, {
        onSuccess: () => toast.success(`Uklonjeno s naloga: ${who}`, { description: first.work_orders.title }),
        onError: e => toast.error(errorMessage(e)),
      });
      return;
    }
    const away = cal.absenceOf(empId, first.day);
    if (away) toast.warning(`${who} je taj dan odsutan (${ABSENCE_LABEL[away.kind].toLowerCase()})`);
    addAsg.mutate({ work_order_id: first.work_order_id, employee_id: empId, day: first.day, planned_hours: Number(first.planned_hours) }, {
      onSuccess: () => toast.success(`Dodano na nalog: ${who}`, { description: first.work_orders.title }),
      onError: e => toast.error(errorMessage(e)),
    });
  };

  const removeCrew = (crew: Crew) => removeMany.mutate(crew.items.map(a => a.id), {
    onSuccess: () => toast.success('Uklonjeno iz dana', { description: crew.items[0].work_orders.title }),
    onError: e => toast.error(errorMessage(e)),
  });

  const scheduleService = (item: ServiceItem, employee_ids: string[], day: string, who: string) =>
    saveOrder.mutate({
      site_id: item.site.id, kind: 'servis', title: 'Redovni servis', notes: item.sc.note ?? '', estimate_hours: 2,
      service_case_id: item.sc.id, device_ids: item.devices.map(d => d.id),
      assignments: employee_ids.map(employee_id => ({ employee_id, day, planned_hours: 2 })),
    }, {
      onSuccess: () => toast.success('Servis zakazan', { description: `${item.client.name} → ${who}, ${formatWeekday(day)}` }),
      onError: e => toast.error(errorMessage(e)),
    });

  /** Inicijali s kartice na drugog tehničara: zamjena osobe na tom nalogu (dan ostaje). */
  const swapPerson = (asgId: string, emp: string) => {
    const a = plan.find(x => x.id === asgId);
    if (!a || a.employee_id === emp) return;
    const prev = { employee_id: a.employee_id, day: a.day };
    const away = cal.absenceOf(emp, a.day);
    if (away) toast.warning(`${firstName(nameOf(emp))} je taj dan odsutan (${ABSENCE_LABEL[away.kind].toLowerCase()})`);
    move.mutate({ id: a.id, employee_id: emp, day: a.day }, {
      onSuccess: () => toast.success('Tehničar zamijenjen', {
        description: `${placeOf(a.work_orders.site_id)}: ${firstName(nameOf(prev.employee_id))} → ${firstName(nameOf(emp))}`,
        action: { label: 'Poništi', onClick: () => undoMove(a.id, prev) },
      }),
      onError: e => toast.error(e && /duplicate|unique/i.test(errorMessage(e)) ? `${firstName(nameOf(emp))} je već na ovom nalogu tog dana.` : errorMessage(e)),
    });
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const over = e.over ? String(e.over.id) : null;
    const id = String(e.active.id);

    // Red ekipe: nalog dobivaju svi prisutni članovi
    if (over?.startsWith('t:')) {
      const [teamId, day] = over.slice(2).split('|');
      const t = teams.find(x => x.id === teamId);
      if (!t || id.startsWith('p:')) return;
      if (id.startsWith('g:') || id.startsWith('a:')) {
        const items = id.startsWith('g:') ? crews.get(id.slice(2))?.items : plan.filter(x => x.id === id.slice(2));
        if (!items?.length) return;
        const o = items[0].work_orders;
        assignToTeam(t, day, { id: o.id, title: o.title, hours: Number(items[0].planned_hours) }, items);
      } else if (id.startsWith('o:')) {
        const o = unscheduled.find(x => x.id === id.slice(2));
        if (o) assignToTeam(t, day, { id: o.id, title: o.title, hours: Number(o.estimate_hours) }, []);
      } else if (id.startsWith('s:')) {
        const s = pendingServices.find(x => x.sc.id === id.slice(2));
        const ids = presentMembers(t, day);
        if (s && ids.length) scheduleService(s, ids, day, `ekipa ${t.name}`);
        else if (s) toast.error(`Nitko iz ekipe ${t.name} ne radi ${formatWeekday(day)}.`);
      }
      return;
    }

    if (!over?.startsWith('c:')) return;
    const [emp, day] = over.slice(2).split('|');
    if (id.startsWith('p:')) { swapPerson(id.slice(2), emp); return; }
    if (id.startsWith('g:')) {
      const crew = crews.get(id.slice(2));
      if (!crew) return;
      // Po ekipama: kartica ekipe na red jednog tehničara → samo on (izdvaja se iz ekipe)
      if (byTeams && crew.team) {
        const o = crew.items[0].work_orders;
        setDayCrew.mutate({ work_order_id: o.id, from: crew.items, day, employee_ids: [emp], planned_hours: Number(crew.items[0].planned_hours) }, {
          onSuccess: () => toast.success('Dodijeljeno samo jednom tehničaru', { description: `${o.title} → ${firstName(nameOf(emp))}, ${formatWeekday(day)}` }),
          onError: err => toast.error(errorMessage(err)),
        });
        return;
      }
      // Inače se mijenja samo dan, članovi ostaju (mijenjaju se u izborniku kartice ili povlačenjem inicijala)
      moveCrew(crew, day);
      return;
    }
    // Odsutnost se ne blokira (plan se može promijeniti), ali se upozori
    const away = cal.absenceOf(emp, day);
    if (away) toast.warning(`${nameOf(emp).split(' ')[0]} je taj dan odsutan (${ABSENCE_LABEL[away.kind].toLowerCase()})`);
    if (id.startsWith('a:')) {
      const a = plan.find(x => x.id === id.slice(2));
      if (a) moveTo(a, emp, day);
    } else if (id.startsWith('o:')) {
      const o = unscheduled.find(x => x.id === id.slice(2));
      if (o) addAsg.mutate({ work_order_id: o.id, employee_id: emp, day, planned_hours: Number(o.estimate_hours) }, {
        onSuccess: () => toast.success('Nalog dodan u raspored', { description: `${o.title} → ${nameOf(emp).split(' ')[0]}, ${formatWeekday(day)}` }),
        onError: err => toast.error(errorMessage(err)),
      });
    } else if (id.startsWith('s:')) {
      const s = pendingServices.find(x => x.sc.id === id.slice(2));
      if (s) scheduleService(s, [emp], day, firstName(nameOf(emp)));
    }
  };

  if (!dir.isLoading && dir.missingSchema) return <ModuleNotEnabled />;
  if (planQ.data === null) return <NotEnabled />;

  // Kapacitet: samo tko taj dan radi (bez praznika i odobrenih odsutnosti)
  const teamCapacity = (day: string) => staff.filter(e => cal.expected(e.id, day, 1) > 0).length * DAY_CAPACITY;
  const plannedOn = (day: string) => plan.filter(a => a.day === day).reduce((s, a) => s + Number(a.planned_hours), 0);
  const weekPlanned = (emp: string) => plan.filter(a => a.employee_id === emp).reduce((s, a) => s + Number(a.planned_hours), 0);
  const weekCapacity = (emp: string) => visibleDays.filter(d => cal.expected(emp, d, 1) > 0).length * DAY_CAPACITY;

  const chipFor = (crew: Crew, draggable: boolean) => {
    const own = crew.items.find(x => x.employee_id === crew.lead) ?? crew.items[0];
    const multi = crew.items.length > 1;
    const states = crew.items.map(x => assignmentState(x, loggedAsg.has(x.id), today));
    const state: AssignmentState = states.every(s => s === 'done') ? 'done' : states.some(s => s === 'missed') ? 'missed' : 'planned';
    const team: CrewMember[] = crew.items.map(x => ({
      id: x.employee_id, asgId: x.id, name: nameOf(x.employee_id), color: colors[x.employee_id], away: cal.absenceOf(x.employee_id, x.day),
    }));
    return (
      <AssignmentChip
        key={crew.key}
        dragId={multi ? `g:${crew.key}` : `a:${own.id}`}
        a={own}
        team={team}
        present={crew.present}
        place={placeOf(own.work_orders.site_id)}
        state={state}
        draggable={draggable}
        staff={staff}
        onOpen={() => setOpenOrder(own.work_order_id)}
        onShift={dir => multi ? moveCrew(crew, shiftWorkday(own.day, dir)) : moveTo(own, own.employee_id, shiftWorkday(own.day, dir))}
        onReassign={multi ? undefined : emp => moveTo(own, emp, own.day)}
        onToggleMember={emp => toggleMember(crew, emp)}
        onRemove={() => removeCrew(crew)}
      />
    );
  };

  /**
   * Sadržaj ćelije tehničara: kartice naloga kojima je voditelj ili jedini; nalozi ekipe
   * (u prikazu po ekipama) i tuđe kartice samo kao iscrtkane trake zauzetosti.
   */
  const cellContent = (empId: string, day: string, draggable: boolean, withTeams = byTeams, hideTeamBands = false) => {
    const items = byCell.get(`${empId}|${day}`) ?? [];
    const cards: ReactNode[] = [];
    const bands = new Map<string, { who: string; whoFull: string; list: PlanAssignment[] }>();
    for (const a of items) {
      const crew = crews.get(crewKey(a)) ?? { key: crewKey(a), items: [a], lead: a.employee_id, present: 1, team: null };
      let band: { key: string; who: string; whoFull: string } | null = null;
      if (withTeams && crew.team) band ={ key: `t:${crew.team.id}`, who: crew.team.name, whoFull: `ekipa ${crew.team.name}` };
      else if (crew.items.length > 1 && crew.lead !== empId) band = { key: crew.lead, who: firstName(nameOf(crew.lead)), whoFull: nameOf(crew.lead) };
      if (band) {
        // Mobitel: nalog ekipe je već prikazan na kartici ekipe iznad članova
        if (hideTeamBands && band.key.startsWith('t:')) continue;
        if (!bands.has(band.key)) bands.set(band.key, { who: band.who, whoFull: band.whoFull, list: [] });
        bands.get(band.key)!.list.push(a);
      } else {
        cards.push(chipFor(crew, draggable));
      }
    }
    return (
      <>
        {cards}
        {[...bands].map(([k, b]) => (
          <CrewBand key={k} who={b.who} whoFull={b.whoFull} items={b.list} placeOf={placeOf} onOpen={setOpenOrder} />
        ))}
      </>
    );
  };

  /** Nalozi ekipe tog dana (jedna kartica po nalogu). */
  const teamCrews = (teamId: string, day: string) =>
    [...crews.values()].filter(c => c.team?.id === teamId && c.items[0].day === day);
  const crewHours = (c: Crew) => Math.max(...c.items.map(a => Number(a.planned_hours)));

  // Raspored redova: ekipe s članovima ispod, zatim tehničari bez ekipe (svatko samo jednom)
  const placed = new Set<string>();
  const teamRows = byTeams ? teams.map(t => {
    const members = staff.filter(e => t.members.includes(e.id) && !placed.has(e.id));
    members.forEach(e => placed.add(e.id));
    return { t, members };
  }) : [];
  const looseStaff = staff.filter(e => !placed.has(e.id));

  const personRow = (emp: Profile, indented: boolean) => {
    const wp = weekPlanned(emp.id);
    return (
      <Fragment key={emp.id}>
        <div className={cn('sticky left-0 z-10 px-3 py-2.5 border-b border-slate-100', indented ? 'bg-slate-50/80 pl-6' : 'bg-white')}>
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            {indented && <span className="text-slate-400 -ml-3" aria-hidden="true">└</span>}
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
            <span className="truncate">{emp.full_name}</span>
          </p>
          <p className={cn('text-xs tabular-nums ml-[18px]', wp > weekCapacity(emp.id) ? 'text-amber-800 font-medium' : 'text-slate-600')}>
            {short(wp)} / {short(weekCapacity(emp.id))}
          </p>
        </div>
        {visibleDays.map(d => {
          const items = byCell.get(`${emp.id}|${d}`) ?? [];
          const narrow = isNarrow(d);
          return (
            <DayCell key={d} id={cellId(emp.id, d)} day={d} today={today} narrow={narrow} compact={indented}
              workday={isWorkday(d, cal)} absence={cal.absenceOf(emp.id, d)}
              planned={items.reduce((s, a) => s + Number(a.planned_hours), 0)}
              actual={actualByCell.get(`${emp.id}|${d}`) ?? 0}
              label={`${emp.full_name}, ${formatWeekday(d)}`}
              onAdd={() => setCreating({ employee_id: emp.id, day: d })}>
              {cellContent(emp.id, d, true)}
            </DayCell>
          );
        })}
      </Fragment>
    );
  };

  const teamRow = ({ t, members }: { t: Team; members: Profile[] }) => {
    const open = !collapsed.has(t.id);
    const weekTeam = visibleDays.reduce((s, d) => s + teamCrews(t.id, d).reduce((x, c) => x + crewHours(c), 0), 0);
    return (
      <Fragment key={t.id}>
        <div className="sticky left-0 z-10 bg-blue-50/60 px-3 py-2.5 border-b border-slate-200">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <span className="text-[10px] font-bold tracking-wide text-blue-800 bg-blue-100 rounded px-1.5 py-0.5">EKIPA</span>
            <span className="truncate">{t.name}</span>
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex -space-x-1">
              {t.members.map(m => <PersonAvatar key={m} name={nameOf(m)} color={colors[m]} size="xs" title={`${nameOf(m)}${m === t.lead_id ? ' (voditelj)' : ''}`} />)}
            </span>
            <span className="text-xs text-slate-600 tabular-nums">{short(weekTeam)}</span>
          </div>
          {members.length > 0 && (
            <button type="button" onClick={() => setCollapsed(s => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
              aria-expanded={open} className="mt-0.5 text-xs font-medium text-blue-700 hover:underline min-h-6">
              {open ? 'Sakrij članove' : `Prikaži članove (${members.length})`}
            </button>
          )}
        </div>
        {visibleDays.map(d => {
          const list = teamCrews(t.id, d);
          const narrow = isNarrow(d);
          const away = t.members.filter(m => cal.absenceOf(m, d));
          return (
            <DayCell key={d} id={teamCellId(t.id, d)} day={d} today={today} narrow={narrow} team
              workday={isWorkday(d, cal)} absence={null}
              planned={list.reduce((s, c) => s + crewHours(c), 0)}
              label={`ekipa ${t.name}, ${formatWeekday(d)}`}
              onAdd={() => setCreating({ crew_id: t.id, day: d })}>
              {away.length > 0 && isWorkday(d, cal) && (
                <span className="text-[11px] font-medium text-violet-800">
                  Odsutni: {away.map(m => firstName(nameOf(m))).join(', ')}
                </span>
              )}
              {list.map(c => chipFor(c, true))}
            </DayCell>
          );
        })}
        {open && members.map(e => personRow(e, true))}
      </Fragment>
    );
  };

  const mobileAdd = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} aria-label={label}
      className="w-full min-h-10 inline-flex items-center justify-center gap-1 text-sm text-blue-700 border border-dashed border-slate-300 rounded-lg hover:bg-blue-50">
      <Plus size={14} aria-hidden="true" /> Dodaj
    </button>
  );

  /** Mobitel: tehničar u danu. Član ekipe vidi samo svoje naloge – nalozi ekipe su na kartici ekipe iznad. */
  const mobilePerson = (emp: Profile, d: string, indented: boolean) => {
    const items = byCell.get(`${emp.id}|${d}`) ?? [];
    const p = items.reduce((s, a) => s + Number(a.planned_hours), 0);
    const away = cal.absenceOf(emp.id, d);
    return (
      <li key={emp.id} className={cn('px-4 py-2.5', indented && 'pl-7 bg-slate-50/60')}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900 min-w-0">
            {indented && <span className="text-slate-400 -ml-3" aria-hidden="true">└</span>}
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
            <span className="truncate">{emp.full_name}</span>
            {away && <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold shrink-0', ABSENCE_TONE[away.kind].approved)}>{ABSENCE_LABEL[away.kind]}</span>}
          </p>
          <span className={cn('text-xs tabular-nums shrink-0', p > DAY_CAPACITY ? 'text-amber-800 font-medium' : 'text-slate-600')}>
            {short(p)} / {DAY_CAPACITY} h
          </span>
        </div>
        <div className="space-y-1.5">
          {cellContent(emp.id, d, false, byTeams, true)}
          {mobileAdd(() => setCreating({ employee_id: emp.id, day: d }), `Dodaj nalog: ${emp.full_name}, ${formatWeekday(d)}`)}
        </div>
      </li>
    );
  };

  const activeItem = dragging ? describe(dragging) : null;

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-3 sm:gap-4">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-6">
        <div className="min-w-0 lg:max-w-2xl">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Raspored</h1>
          <p className="text-sm text-slate-600 mt-0.5 text-pretty">
            {byTeams
              ? 'Povucite nalog na red ekipe (dobivaju ga svi prisutni članovi) ili na tehničara (samo on). Inicijale s kartice povucite na drugog tehničara za zamjenu.'
              : 'Povucite nalog na tehničara i dan. Nalog s više tehničara prikazuje se jednom, a ostalim članovima kao iscrtkana traka.'}
            {' '}Stupac uz rub ćelije pokazuje koliko je dan popunjen (do {DAY_CAPACITY} h).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          {crewsQ.data != null && (
            teams.length > 0 ? (
              <div role="radiogroup" aria-label="Način prikaza" className="grid grid-cols-2 sm:inline-grid sm:grid-cols-[auto_auto] gap-1 p-1 bg-slate-100 rounded-lg">
                {([['ekipe', 'Po ekipama'], ['zaposlenici', 'Po zaposlenicima']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                    className={cn('px-3 min-h-10 sm:min-h-8 text-sm font-medium rounded-md whitespace-nowrap',
                      view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <Link to="/ekipe" className="hidden lg:inline text-sm font-medium text-blue-700 hover:underline whitespace-nowrap">Složi ekipe</Link>
            )
          )}
          <PeriodStepper period={period} className="sm:[&>div]:min-h-10" />
          <button type="button" onClick={() => setCreating({})}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-10 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0">
            <PlusCircle size={15} aria-hidden="true" /> Novi nalog
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          screenReaderInstructions: { draggable: 'Za premještanje naloga pritisnite razmaknicu, pomičite strelicama i ponovno pritisnite razmaknicu za spuštanje. Escape odustaje.' },
          announcements: {
            onDragStart: ({ active }) => `Podignut: ${describe(String(active.id))}.`,
            onDragOver: ({ over }) => over ? `Iznad: ${describeCell(String(over.id))}` : 'Izvan rasporeda.',
            onDragEnd: ({ over }) => over ? `Spušteno: ${describeCell(String(over.id))}` : 'Spušteno izvan rasporeda, bez promjene.',
            onDragCancel: () => 'Premještanje otkazano.',
          },
        }}
      >
        <div className="grid grid-cols-1 2xl:grid-cols-[15rem_minmax(0,1fr)] gap-3 sm:gap-4 items-start">
          {/* Na čekanju */}
          <aside className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden 2xl:sticky 2xl:top-4" aria-labelledby="queue-title">
            <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
              <h2 id="queue-title" className="text-sm font-semibold text-slate-800">Na čekanju</h2>
              <span className="text-xs text-slate-600 tabular-nums">{pendingServices.length + unscheduled.length}</span>
            </div>
            {pendingServices.length + unscheduled.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-600">Sve je raspoređeno.</p>
            ) : (
              <div className="pb-2 flex flex-wrap gap-x-4 2xl:block 2xl:max-h-[60vh] 2xl:overflow-y-auto">
                {pendingServices.length > 0 && (
                  <QueueGroup title="Servis dospijeva">
                    {pendingServices.map(s => {
                      const due = dueText(s.sc.due_date, today);
                      return (
                        <QueueItem key={s.sc.id} id={`s:${s.sc.id}`} kind="servis" title={s.client.name}
                          meta={<span className={due.late ? 'text-red-700' : ''}>{due.text}</span>}
                          onSchedule={() => setCreating({ kind: 'servis', site_id: s.site.id, device_ids: s.devices.map(d => d.id), title: 'Redovni servis', service_case_id: s.sc.id })}
                        />
                      );
                    })}
                  </QueueGroup>
                )}
                {unscheduled.length > 0 && (
                  <QueueGroup title="Nalozi bez dana">
                    {unscheduled.map(o => (
                      <QueueItem key={o.id} id={`o:${o.id}`} kind={o.kind} title={placeOf(o.site_id)}
                        meta={<>{o.title} · {short(Number(o.estimate_hours))}</>}
                        onOpen={() => setOpenOrder(o.id)}
                      />
                    ))}
                  </QueueGroup>
                )}
              </div>
            )}
          </aside>

          {/* Tjedna mreža (desktop) */}
          <section aria-label="Tjedni raspored" className="hidden lg:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto relative">
            <div className="grid min-w-[56rem]" style={{
              gridTemplateColumns: `10rem ${visibleDays.map(d => (isNarrow(d) ? '4.5rem' : 'minmax(8.5rem,1fr)')).join(' ')}`,
            }}>
              <div className="sticky left-0 z-10 bg-white border-b border-slate-200" />
              {visibleDays.map(d => {
                const p = plannedOn(d);
                const wd = isWorkday(d, cal);
                const info = cal.dayInfo(d);
                return (
                  <div key={d} className={cn('px-2.5 py-2 border-b border-l border-slate-200', !wd && 'bg-slate-50', d === today && 'bg-blue-50/60')}>
                    <p className={cn('flex items-center gap-1.5 text-xs whitespace-nowrap', d === today ? 'font-bold text-slate-900' : wd ? 'font-medium text-slate-700' : 'text-slate-500')}>
                      <span className="truncate">{formatWeekdayShort(d)} {formatShort(d)}</span>
                      {d === today && <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-semibold text-white bg-blue-600">Danas</span>}
                    </p>
                    {wd && <p className="text-[11px] text-slate-600 tabular-nums">{short(p)} / {short(teamCapacity(d))}</p>}
                    {info.type === 'holiday' && <p className="text-[11px] text-slate-500 truncate" title={info.label ?? ''}>{info.label}</p>}
                  </div>
                );
              })}

              {teamRows.map(teamRow)}
              {byTeams && looseStaff.length > 0 && (
                <div className="col-span-full px-3 pt-3 pb-1.5 text-xs font-semibold text-slate-600 border-b border-slate-200 bg-slate-50">Bez ekipe</div>
              )}
              {looseStaff.map(emp => personRow(emp, false))}
            </div>
            {staff.length === 0 && <p className="p-6 text-sm text-slate-600">Nema aktivnih tehničara.</p>}
          </section>

          {/* Mobitel: dan po dan */}
          <div className="lg:hidden flex flex-col gap-3">
            {visibleDays.filter(d => isWorkday(d, cal) || weekendBusy(d)).map(d => (
              <section key={d} aria-label={formatWeekday(d)} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={cn('flex items-baseline justify-between px-4 py-2.5 border-b border-slate-100', d === today && 'bg-blue-50/60')}>
                  <h2 className={cn('text-sm', d === today ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
                    {formatWeekday(d)}{d === today && <span className="font-normal text-blue-800"> · danas</span>}
                  </h2>
                  <span className="text-xs text-slate-600 tabular-nums">{short(plannedOn(d))} / {short(teamCapacity(d))}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {teamRows.map(({ t, members }) => {
                    const list = teamCrews(t.id, d);
                    const away = t.members.filter(m => cal.absenceOf(m, d));
                    return (
                      <Fragment key={t.id}>
                        <li className="px-4 py-2.5 bg-blue-50/60">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 min-w-0">
                              <span className="text-[10px] font-bold tracking-wide text-blue-800 bg-blue-100 rounded px-1.5 py-0.5">EKIPA</span>
                              <span className="truncate">{t.name}</span>
                              <span className="flex -space-x-1 ml-1">
                                {t.members.map(m => <PersonAvatar key={m} name={nameOf(m)} color={colors[m]} size="xs" title={nameOf(m)} />)}
                              </span>
                            </p>
                            <span className="text-xs tabular-nums text-slate-600 shrink-0">{short(list.reduce((s, c) => s + crewHours(c), 0))}</span>
                          </div>
                          {away.length > 0 && (
                            <p className="mb-1.5 text-[11px] font-medium text-violet-800">Odsutni: {away.map(m => firstName(nameOf(m))).join(', ')}</p>
                          )}
                          <div className="space-y-1.5">
                            {list.map(c => chipFor(c, false))}
                            {mobileAdd(() => setCreating({ crew_id: t.id, day: d }), `Dodaj nalog: ekipa ${t.name}, ${formatWeekday(d)}`)}
                          </div>
                        </li>
                        {members.map(emp => mobilePerson(emp, d, true))}
                      </Fragment>
                    );
                  })}
                  {byTeams && looseStaff.length > 0 && (
                    <li className="px-4 pt-2.5 pb-1.5 text-xs font-semibold text-slate-600 bg-slate-50">Bez ekipe</li>
                  )}
                  {looseStaff.map(emp => mobilePerson(emp, d, false))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <div className="px-3 py-2 text-sm font-medium bg-white border border-blue-300 rounded-lg shadow-xl max-w-56 truncate">{activeItem}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {creating && (
        <OrderFormDialog preset={creating} onClose={() => setCreating(null)}
          onSaved={day => { if (day && (day < start || day > end)) navigate(`/raspored?view=week&date=${day}`); }} />
      )}
      {openOrder && <OrderDrawer orderId={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  );
}

/** Ćelija tehničar × dan: spremnik kapaciteta uz lijevi rub, nalozi, dodavanje. */
function DayCell({ id, day, today, narrow, workday, absence, planned, actual, label, onAdd, children, compact, team }: {
  id: string; day: string; today: string; narrow: boolean; workday: boolean; absence: Absence | null; planned: number;
  /** Upisani sati; izostavljeno (red ekipe) = ne prikazuje se */
  actual?: number;
  label: string;
  onAdd: () => void; children: ReactNode;
  /** Član ispod ekipe: niži red */
  compact?: boolean;
  /** Red ekipe */
  team?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const over = planned > DAY_CAPACITY;
  const past = day < today;
  const showActual = actual !== undefined && day <= today && (actual > 0 || past) && planned > 0;
  const fill = Math.min(planned / DAY_CAPACITY, 1) * 100;
  const actualPos = Math.min((actual ?? 0) / DAY_CAPACITY, 1);
  const wd = workday;

  return (
    <div ref={setNodeRef}
      className={cn('group relative border-b border-l border-slate-100 pl-5 pr-2 py-2 flex flex-col gap-1.5 transition-colors',
        compact ? 'min-h-16 bg-slate-50/40' : 'min-h-28', team && 'bg-blue-50/30 border-b-slate-200',
        !wd && 'bg-slate-50/70', day === today && 'bg-blue-50/30', absence && ABSENCE_TONE[absence.kind].approved, isOver && 'bg-blue-50 ring-2 ring-inset ring-blue-400')}>
      {absence && <span className="text-[11px] font-semibold">{ABSENCE_LABEL[absence.kind]}{planned > 0 && <span className="font-normal"> · sukob s planom</span>}</span>}
      {/* Spremnik: plan puni stupac do 8 h, crtica = upisano */}
      {!narrow && (
        <span aria-hidden="true" className="absolute left-2 top-2.5 bottom-2.5 w-1.5 rounded-full bg-slate-100">
          <span className={cn('absolute inset-x-0 bottom-0 rounded-full', over ? 'bg-amber-500' : 'bg-blue-600/45')} style={{ height: `${fill}%` }} />
          {over && <span className="absolute -left-0.5 -right-0.5 top-0 h-0.5 bg-amber-700" />}
          {showActual && (
            <span className="absolute -left-1 w-3.5 h-[3px] rounded-full bg-slate-900"
              style={{ bottom: `calc(${actualPos * 100}% - 1.5px)` }} />
          )}
        </span>
      )}
      {children}
      <div className="mt-auto flex items-center justify-between gap-1 min-h-6">
        {planned > 0 ? (
          <span className={cn('text-[11px] tabular-nums', over ? 'text-amber-800 font-semibold' : 'text-slate-600')}>
            {over && <AlertTriangle size={11} className="inline -mt-0.5 mr-0.5" aria-hidden="true" />}
            {showActual ? `${short(actual ?? 0)} od ${short(planned)}` : short(planned)}
            {over && <span className="sr-only">, više od {DAY_CAPACITY} h</span>}
          </span>
        ) : <span />}
        <button type="button" onClick={onAdd} aria-label={`Dodaj nalog: ${label}`}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-blue-700 hover:bg-blue-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const CHIP: Record<AssignmentState, string> = {
  planned: 'bg-white border-slate-300 text-slate-800',
  done: 'bg-slate-800 border-slate-800 text-white',
  missed: 'bg-red-50 border-red-300 text-red-900',
};

function AssignmentChip({ dragId, a, team, present, place, state, draggable, staff, onOpen, onShift, onReassign, onToggleMember, onRemove }: {
  dragId: string; a: PlanAssignment; team: CrewMember[]; present: number; place: string; state: AssignmentState; draggable: boolean; staff: Profile[];
  onOpen: () => void; onShift: (dir: 1 | -1) => void; onReassign?: (emp: string) => void;
  onToggleMember: (emp: string) => void; onRemove: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: draggable ? dragId : `m:${dragId}`, disabled: !draggable }); // mobilna kopija ne smije dijeliti ID
  const o = a.work_orders;
  const multi = team.length > 1;
  const inCrew = new Set(team.map(m => m.id));
  const stateText = state === 'done' ? 'upisano' : state === 'missed' ? 'bez unosa' : 'planirano';
  const teamText = multi
    ? `, tehničari: ${team.map(m => `${m.name}${m.away ? ` (${ABSENCE_LABEL[m.away.kind].toLowerCase()})` : ''}`).join(', ')}`
    : '';
  return (
    <div ref={setNodeRef}
      className={cn('group/chip relative flex flex-col rounded-lg border text-left shadow-[0_1px_0_rgba(15,23,42,0.04)]', CHIP[state], isDragging && 'opacity-40')}>
      <div className="flex items-stretch">
      {draggable && (
        <button type="button" {...listeners} {...attributes}
          aria-label={`Premjesti: ${o.title}, ${place}`}
          className={cn('w-3.5 shrink-0 flex items-center justify-center rounded-l-lg cursor-grab active:cursor-grabbing touch-none', state === 'done' ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700')}>
          <GripVertical size={12} aria-hidden="true" />
        </button>
      )}
      {/* Ime klijenta smije u dva reda; radnje "⋯" leže u kutu i ne krate tekst */}
      <button type="button" onClick={onOpen} className={cn('flex-1 min-w-0 py-1.5 pr-6 text-left', !draggable && 'pl-2.5')}>
        <span className="flex items-start gap-1.5 text-xs font-semibold leading-snug">
          <KindIcon kind={o.kind} size={12} className="shrink-0 mt-px" />
          <span className="line-clamp-2 break-words">{place}</span>
        </span>
        <span className={cn('flex items-center gap-1 text-[11px] leading-tight mt-0.5', state === 'done' ? 'text-slate-300' : state === 'missed' ? 'text-red-800' : 'text-slate-600')}>
          {state === 'done' && <CheckCircle2 size={11} className="shrink-0" aria-hidden="true" />}
          {state === 'missed' && <CircleAlert size={11} className="shrink-0" aria-hidden="true" />}
          <span className="truncate">{o.title}</span>
          <span className="shrink-0 tabular-nums">· {short(Number(a.planned_hours))}</span>
        </span>
        <span className="sr-only">, {KIND_LABEL[o.kind]}, {stateText}{teamText}</span>
      </button>
      </div>
      {multi && (
        <div className={cn('flex items-center justify-between gap-1 pr-2 pb-1.5', draggable ? 'pl-3.5' : 'pl-2.5')}>
          <span className="flex -space-x-1">
            {team.map(m => draggable
              ? <AvatarHandle key={m.id} member={m} />
              : <PersonAvatar key={m.id} name={m.name} color={m.color} size="xs" faded={!!m.away}
                  title={`${m.name}${m.away ? ` · ${ABSENCE_LABEL[m.away.kind]}` : ''}`} />)}
          </span>
          {present < team.length && (
            <span className={cn('text-[10px] font-semibold tabular-nums', state === 'done' ? 'text-slate-300' : 'text-amber-800')}
              title={`${present} od ${team.length} tehničara radi taj dan`}>
              {present}/{team.length}
            </span>
          )}
        </div>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label={`Radnje: ${o.title}, ${place}`}
          className={cn('absolute top-0.5 right-0.5 w-6 h-6 inline-flex items-center justify-center rounded-md', state === 'done' ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100')}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={12}
            className="z-50 min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
            <MenuItem icon={ArrowLeft} onSelect={() => onShift(-1)}>{multi ? 'Svi na prethodni radni dan' : 'Prethodni radni dan'}</MenuItem>
            <MenuItem icon={ArrowRight} onSelect={() => onShift(1)}>{multi ? 'Svi na sljedeći radni dan' : 'Sljedeći radni dan'}</MenuItem>
            {onReassign && (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100 data-[state=open]:bg-slate-100">
                  <UserRound size={15} className="text-slate-500" aria-hidden="true" /> Drugom tehničaru
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent sideOffset={4} collisionPadding={12} className="z-50 min-w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                    {staff.filter(e => e.id !== a.employee_id).map(e => (
                      <MenuItem key={e.id} icon={UserRound} onSelect={() => onReassign(e.id)}>{e.full_name}</MenuItem>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            )}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100 data-[state=open]:bg-slate-100">
                <Users size={15} className="text-slate-500" aria-hidden="true" /> {multi ? `Tehničari (${team.length})` : 'Dodaj tehničara'}
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent sideOffset={4} collisionPadding={12} className="z-50 min-w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                  {staff.map(e => {
                    const checked = inCrew.has(e.id);
                    const last = checked && team.length === 1;
                    return (
                      <DropdownMenu.CheckboxItem key={e.id} checked={checked} disabled={last}
                        onCheckedChange={() => onToggleMember(e.id)}
                        className="flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100 data-[disabled]:text-slate-500 data-[disabled]:cursor-default">
                        <span className={cn('w-4 h-4 rounded border inline-flex items-center justify-center shrink-0', checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400')}>
                          <DropdownMenu.ItemIndicator><CheckCircle2 size={12} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                        </span>
                        {e.full_name}
                      </DropdownMenu.CheckboxItem>
                    );
                  })}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <MenuItem icon={CalendarPlus} onSelect={onOpen}>Otvori nalog</MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
            <MenuItem icon={Trash2} onSelect={onRemove} danger>{multi ? 'Ukloni iz dana (svi tehničari)' : 'Ukloni iz dana'}</MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** Inicijali na kartici: povlačenjem na drugog tehničara zamjenjuje se osoba na nalogu. */
function AvatarHandle({ member }: { member: CrewMember }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `p:${member.asgId}` });
  const awayText = member.away ? ` (${ABSENCE_LABEL[member.away.kind].toLowerCase()})` : '';
  return (
    <button ref={setNodeRef} type="button" {...listeners} {...attributes}
      aria-label={`Zamijeni tehničara: ${member.name}${awayText}. Povucite na drugog tehničara.`}
      title={`${member.name}${awayText} · povucite na drugog tehničara za zamjenu`}
      className={cn('rounded-full cursor-grab active:cursor-grabbing touch-none hover:z-10 hover:scale-110 transition-transform', isDragging && 'opacity-40')}>
      <PersonAvatar name={member.name} color={member.color} size="xs" faded={!!member.away} title="" />
    </button>
  );
}

/**
 * Član ekipe u svom redu: bez ponovljene kartice, samo zauzetost. Više naloga iste ekipe
 * (ili istog voditelja) tog dana spaja se u jednu traku.
 */
function CrewBand({ who, whoFull, items, placeOf, onOpen }: {
  who: string; whoFull: string; items: PlanAssignment[]; placeOf: (siteId: string | null) => string; onOpen: (orderId: string) => void;
}) {
  const hours = items.reduce((s, a) => s + Number(a.planned_hours), 0);
  const label = items.length === 1 ? placeOf(items[0].work_orders.site_id) : `${items.length} naloga`;
  const list = items.map(a => `${placeOf(a.work_orders.site_id)} · ${a.work_orders.title}`).join('\n');
  const body = (
    <>
      <Users size={11} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{who} · {label}</span>
      <span className="shrink-0 tabular-nums font-normal">· {short(hours)}</span>
      <span className="sr-only">. Kartica naloga je u redu: {whoFull}. {list.replace(/\n/g, '; ')}</span>
    </>
  );
  const cls = 'w-full flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-2 py-1 text-[11px] font-semibold text-blue-900 text-left';
  return items.length === 1 ? (
    <button type="button" onClick={() => onOpen(items[0].work_order_id)} title={`Kartica je u redu: ${whoFull}\n${list}`} className={cn(cls, 'hover:bg-blue-50')}>
      {body}
    </button>
  ) : (
    <div title={`Kartica je u redu: ${whoFull}\n${list}`} className={cls}>{body}</div>
  );
}

function MenuItem({ icon: Icon, onSelect, children, danger }: { icon: typeof Wrench; onSelect: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <DropdownMenu.Item onSelect={onSelect}
      className={cn('flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm outline-none cursor-pointer',
        danger ? 'text-red-700 data-[highlighted]:bg-red-50' : 'text-slate-800 data-[highlighted]:bg-slate-100')}>
      <Icon size={15} className={danger ? '' : 'text-slate-500'} aria-hidden="true" />
      {children}
    </DropdownMenu.Item>
  );
}

function QueueGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-1 min-w-0">
      <h3 className="px-4 pt-2 pb-1 text-xs font-medium text-slate-600">{title}</h3>
      <ul className="px-2 flex flex-wrap gap-1.5 2xl:block 2xl:space-y-1">{children}</ul>
    </div>
  );
}

function QueueItem({ id, kind, title, meta, onSchedule, onOpen }: {
  id: string; kind: OrderWithDevices['kind']; title: string; meta: ReactNode; onSchedule?: () => void; onOpen?: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id });
  return (
    <li ref={setNodeRef} className={cn('w-56 2xl:w-auto flex items-stretch rounded-lg border border-slate-200 bg-white hover:border-slate-300', isDragging && 'opacity-40')}>
      <button type="button" {...listeners} {...attributes} aria-label={`Povuci u raspored: ${title}`}
        className="hidden lg:block px-0.5 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing touch-none rounded-l-lg">
        <GripVertical size={13} aria-hidden="true" />
      </button>
      <button type="button" onClick={onSchedule ?? onOpen} className="flex-1 min-w-0 px-2 py-1.5 text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
          <KindIcon kind={kind} size={12} className="shrink-0 text-slate-600" />
          <span className="truncate">{title}</span>
        </span>
        <span className="block text-[11px] text-slate-600 truncate mt-0.5">{meta}</span>
      </button>
    </li>
  );
}

function NotEnabled() {
  return (
    <div className="px-4 py-10 sm:p-10 max-w-xl">
      <Wrench size={32} className="text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900">Raspored još nije uključen</h1>
      <p className="mt-2 text-sm text-slate-700">
        Pokrenite migraciju <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">supabase/migrations/20261109_work_orders.sql</code> u Supabase SQL editoru.
      </p>
    </div>
  );
}
