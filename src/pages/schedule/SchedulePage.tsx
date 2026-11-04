import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, CircleAlert, GripVertical, MoreHorizontal,
  Plus, PlusCircle, Trash2, UserRound, Wrench,
} from 'lucide-react';
import { addDays, parseISO } from 'date-fns';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { useClientDirectory } from '../../hooks/useClients';
import { useWorkLogs } from '../../hooks/useWorkLogs';
import { useServiceBoard, type ServiceItem } from '../../hooks/useServiceCases';
import {
  usePlan, useUnscheduledOrders, useMoveAssignment, useAddAssignment, useRemoveAssignment, useSaveOrder,
  type PlanAssignment, type OrderWithDevices,
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
import type { Profile } from '../../types';

const cellId = (emp: string, day: string) => `c:${emp}|${day}`;

function shiftWorkday(day: string, dir: 1 | -1): string {
  let d = addDays(parseISO(day), dir);
  while (!isWorkday(toISODate(d))) d = addDays(d, dir);
  return toISODate(d);
}

/** 6 h / 7,5 h – kratko za ćelije */
const short = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;

export function SchedulePage() {
  useDocumentTitle('Raspored');
  const period = usePeriod('week', ['week']);
  const { start, end, days } = period;
  const today = todayISO();
  const directory = useStaffDirectory();
  const dir = useClientDirectory();
  const planQ = usePlan(start, end);
  const unscheduledQ = useUnscheduledOrders();
  const board = useServiceBoard();
  const { data: allLogs = [] } = useWorkLogs({ startDate: start, endDate: end });
  const move = useMoveAssignment();
  const addAsg = useAddAssignment();
  const removeAsg = useRemoveAssignment();
  const saveOrder = useSaveOrder();

  const [creating, setCreating] = useState<OrderPreset | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

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

  const pendingServices = board.items.filter(i => i.sc.status === 'due' || i.sc.status === 'contacted');
  const unscheduled = unscheduledQ.data ?? [];

  // Vikend se prikazuje uzak, osim kad ima naloga
  const weekendBusy = (d: string) => plan.some(a => a.day === d);
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
    return '';
  };
  const describeCell = (id: string) => {
    const [emp, day] = id.slice(2).split('|');
    return `${nameOf(emp)}, ${formatWeekday(day)}`;
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

  const scheduleService = (item: ServiceItem, employee_id: string, day: string) =>
    saveOrder.mutate({
      site_id: item.site.id, kind: 'servis', title: 'Redovni servis', notes: item.sc.note ?? '', estimate_hours: 2,
      service_case_id: item.sc.id, device_ids: item.devices.map(d => d.id),
      assignments: [{ employee_id, day, planned_hours: 2 }],
    }, {
      onSuccess: () => toast.success('Servis zakazan', { description: `${item.client.name} → ${nameOf(employee_id).split(' ')[0]}, ${formatWeekday(day)}` }),
      onError: e => toast.error(errorMessage(e)),
    });

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const over = e.over ? String(e.over.id) : null;
    if (!over?.startsWith('c:')) return;
    const [emp, day] = over.slice(2).split('|');
    const id = String(e.active.id);
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
      if (s) scheduleService(s, emp, day);
    }
  };

  if (!dir.isLoading && dir.missingSchema) return <ModuleNotEnabled />;
  if (planQ.data === null) return <NotEnabled />;

  const teamCapacity = staff.length * DAY_CAPACITY;
  const plannedOn = (day: string) => plan.filter(a => a.day === day).reduce((s, a) => s + Number(a.planned_hours), 0);
  const weekPlanned = (emp: string) => plan.filter(a => a.employee_id === emp).reduce((s, a) => s + Number(a.planned_hours), 0);
  const weekCapacity = visibleDays.filter(isWorkday).length * DAY_CAPACITY;

  const chipFor = (a: PlanAssignment, draggable: boolean) => (
    <AssignmentChip
      key={a.id}
      a={a}
      place={placeOf(a.work_orders.site_id)}
      state={assignmentState(a, loggedAsg.has(a.id), today)}
      draggable={draggable}
      staff={staff}
      onOpen={() => setOpenOrder(a.work_order_id)}
      onMove={(emp, day) => moveTo(a, emp, day)}
      onRemove={() => removeAsg.mutate(a.id, {
        onSuccess: () => toast.success('Uklonjeno iz dana', { description: a.work_orders.title }),
        onError: e => toast.error(errorMessage(e)),
      })}
    />
  );

  const activeItem = dragging ? describe(dragging) : null;

  return (
    <div className="px-4 py-4 sm:p-6 flex flex-col gap-3 sm:gap-4">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Raspored</h1>
          <p className="text-sm text-slate-600 mt-0.5">Povucite nalog na tehničara i dan. Stupac uz rub ćelije pokazuje koliko je dan popunjen (do {DAY_CAPACITY} h).</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <PeriodStepper period={period} />
          <button type="button" onClick={() => setCreating({})}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
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
              gridTemplateColumns: `10rem ${visibleDays.map(d => (isWorkday(d) || weekendBusy(d) ? 'minmax(8.5rem,1fr)' : '4.5rem')).join(' ')}`,
            }}>
              <div className="sticky left-0 z-10 bg-white border-b border-slate-200" />
              {visibleDays.map(d => {
                const p = plannedOn(d);
                const wd = isWorkday(d);
                return (
                  <div key={d} className={cn('px-2.5 py-2 border-b border-l border-slate-200', !wd && 'bg-slate-50', d === today && 'bg-blue-50/60')}>
                    <p className={cn('text-xs', d === today ? 'font-bold text-slate-900' : wd ? 'font-medium text-slate-700' : 'text-slate-500')}>
                      {formatWeekdayShort(d)} {formatShort(d)}{d === today && <span className="font-normal text-blue-800"> · danas</span>}
                    </p>
                    {wd && <p className="text-[11px] text-slate-600 tabular-nums">{short(p)} / {short(teamCapacity)}</p>}
                  </div>
                );
              })}

              {staff.map(emp => {
                const wp = weekPlanned(emp.id);
                return (
                  <Fragment key={emp.id}>
                    <div className="sticky left-0 z-10 bg-white px-3 py-2.5 border-b border-slate-100">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
                        <span className="truncate">{emp.full_name}</span>
                      </p>
                      <p className={cn('text-xs tabular-nums ml-[18px]', wp > weekCapacity ? 'text-amber-800 font-medium' : 'text-slate-600')}>
                        {short(wp)} / {short(weekCapacity)}
                      </p>
                    </div>
                    {visibleDays.map(d => {
                      const items = byCell.get(`${emp.id}|${d}`) ?? [];
                      const narrow = !isWorkday(d) && !weekendBusy(d);
                      return (
                        <DayCell key={d} id={cellId(emp.id, d)} day={d} today={today} narrow={narrow}
                          planned={items.reduce((s, a) => s + Number(a.planned_hours), 0)}
                          actual={actualByCell.get(`${emp.id}|${d}`) ?? 0}
                          label={`${emp.full_name}, ${formatWeekday(d)}`}
                          onAdd={() => setCreating({ employee_id: emp.id, day: d })}>
                          {items.map(a => chipFor(a, true))}
                        </DayCell>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
            {staff.length === 0 && <p className="p-6 text-sm text-slate-600">Nema aktivnih tehničara.</p>}
          </section>

          {/* Mobitel: dan po dan */}
          <div className="lg:hidden flex flex-col gap-3">
            {visibleDays.filter(d => isWorkday(d) || weekendBusy(d)).map(d => (
              <section key={d} aria-label={formatWeekday(d)} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={cn('flex items-baseline justify-between px-4 py-2.5 border-b border-slate-100', d === today && 'bg-blue-50/60')}>
                  <h2 className={cn('text-sm', d === today ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
                    {formatWeekday(d)}{d === today && <span className="font-normal text-blue-800"> · danas</span>}
                  </h2>
                  <span className="text-xs text-slate-600 tabular-nums">{short(plannedOn(d))} / {short(teamCapacity)}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {staff.map(emp => {
                    const items = byCell.get(`${emp.id}|${d}`) ?? [];
                    const p = items.reduce((s, a) => s + Number(a.planned_hours), 0);
                    return (
                      <li key={emp.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[emp.id] }} aria-hidden="true" />
                            {emp.full_name}
                          </p>
                          <span className={cn('text-xs tabular-nums', p > DAY_CAPACITY ? 'text-amber-800 font-medium' : 'text-slate-600')}>
                            {short(p)} / {DAY_CAPACITY} h
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {items.map(a => chipFor(a, false))}
                          <button type="button" onClick={() => setCreating({ employee_id: emp.id, day: d })}
                            className="w-full min-h-10 inline-flex items-center justify-center gap-1 text-sm text-blue-700 border border-dashed border-slate-300 rounded-lg hover:bg-blue-50"
                            aria-label={`Dodaj nalog: ${emp.full_name}, ${formatWeekday(d)}`}>
                            <Plus size={14} aria-hidden="true" /> Dodaj
                          </button>
                        </div>
                      </li>
                    );
                  })}
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

      {creating && <OrderFormDialog preset={creating} onClose={() => setCreating(null)} />}
      {openOrder && <OrderDrawer orderId={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  );
}

/** Ćelija tehničar × dan: spremnik kapaciteta uz lijevi rub, nalozi, dodavanje. */
function DayCell({ id, day, today, narrow, planned, actual, label, onAdd, children }: {
  id: string; day: string; today: string; narrow: boolean; planned: number; actual: number; label: string;
  onAdd: () => void; children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const over = planned > DAY_CAPACITY;
  const past = day < today;
  const showActual = day <= today && (actual > 0 || past) && planned > 0;
  const fill = Math.min(planned / DAY_CAPACITY, 1) * 100;
  const actualPos = Math.min(actual / DAY_CAPACITY, 1);
  const wd = isWorkday(day);

  return (
    <div ref={setNodeRef}
      className={cn('group relative border-b border-l border-slate-100 min-h-28 pl-5 pr-2 py-2 flex flex-col gap-1.5 transition-colors',
        !wd && 'bg-slate-50/70', day === today && 'bg-blue-50/30', isOver && 'bg-blue-50 ring-2 ring-inset ring-blue-400')}>
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
            {showActual ? `${short(actual)} od ${short(planned)}` : short(planned)}
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

function AssignmentChip({ a, place, state, draggable, staff, onOpen, onMove, onRemove }: {
  a: PlanAssignment; place: string; state: AssignmentState; draggable: boolean; staff: Profile[];
  onOpen: () => void; onMove: (emp: string, day: string) => void; onRemove: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `${draggable ? 'a' : 'm'}:${a.id}`, disabled: !draggable }); // mobilna kopija ne smije dijeliti ID
  const o = a.work_orders;
  const stateText = state === 'done' ? 'upisano' : state === 'missed' ? 'bez unosa' : 'planirano';
  return (
    <div ref={setNodeRef}
      className={cn('group/chip relative flex items-stretch rounded-lg border text-left shadow-[0_1px_0_rgba(15,23,42,0.04)]', CHIP[state], isDragging && 'opacity-40')}>
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
        <span className="sr-only">, {KIND_LABEL[o.kind]}, {stateText}</span>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label={`Radnje: ${o.title}, ${place}`}
          className={cn('absolute top-0.5 right-0.5 w-6 h-6 inline-flex items-center justify-center rounded-md', state === 'done' ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100')}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={12}
            className="z-50 min-w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
            <MenuItem icon={ArrowLeft} onSelect={() => onMove(a.employee_id, shiftWorkday(a.day, -1))}>Prethodni radni dan</MenuItem>
            <MenuItem icon={ArrowRight} onSelect={() => onMove(a.employee_id, shiftWorkday(a.day, 1))}>Sljedeći radni dan</MenuItem>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex items-center gap-3 px-3 py-2 min-h-10 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100 data-[state=open]:bg-slate-100">
                <UserRound size={15} className="text-slate-500" aria-hidden="true" /> Drugom tehničaru
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent sideOffset={4} collisionPadding={12} className="z-50 min-w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
                  {staff.filter(e => e.id !== a.employee_id).map(e => (
                    <MenuItem key={e.id} icon={UserRound} onSelect={() => onMove(e.id, a.day)}>{e.full_name}</MenuItem>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <MenuItem icon={CalendarPlus} onSelect={onOpen}>Otvori nalog</MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
            <MenuItem icon={Trash2} onSelect={onRemove} danger>Ukloni iz dana</MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
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
