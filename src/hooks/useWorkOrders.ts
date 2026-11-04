import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Assignment, WorkOrder, WorkOrderKind } from '../types';
import { isMissingAuditSchema } from './useWorkLogChanges';

export const ORDERS_KEY = 'work_orders';

export type OrderWithDevices = WorkOrder & { work_order_devices: { device_id: string }[] };
export type PlanAssignment = Assignment & { work_orders: OrderWithDevices };
export type OrderDetail = OrderWithDevices & { work_order_assignments: Assignment[] };

/** Tablice naloga ne postoje (migracija 20261109 nije pokrenuta). */
function missing(err: { code?: string; message?: string } | null): boolean {
  return !!err && (isMissingAuditSchema(err) || /work_order/.test(err.message ?? '') && /does not exist|could not find/i.test(err.message ?? ''));
}

/**
 * Dodjele u rasponu dana (s nalogom i uređajima naloga). Otkazani nalozi se izostavljaju.
 * `data === null` → modul naloga nije uključen.
 */
export function usePlan(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: [ORDERS_KEY, 'plan', start, end],
    enabled: enabled && !!start && !!end,
    staleTime: 30_000,
    retry: (count, err) => !isMissingAuditSchema(err) && count < 2,
    queryFn: async (): Promise<PlanAssignment[] | null> => {
      const { data, error } = await supabase
        .from('work_order_assignments')
        .select('*, work_orders(*, work_order_devices(device_id))')
        .gte('day', start)
        .lte('day', end)
        .order('day')
        .order('position');
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return ((data ?? []) as unknown as PlanAssignment[]).filter(a => a.work_orders && a.work_orders.status !== 'cancelled');
    },
  });
}

/** Otvoreni nalozi bez ijedne dodjele ("Na čekanju"). */
export function useUnscheduledOrders(enabled = true) {
  return useQuery({
    queryKey: [ORDERS_KEY, 'unscheduled'],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<OrderWithDevices[] | null> => {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*, work_order_devices(device_id), work_order_assignments(id)')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return ((data ?? []) as unknown as (OrderWithDevices & { work_order_assignments: { id: string }[] })[])
        .filter(o => o.work_order_assignments.length === 0);
    },
  });
}

/** Jedan nalog sa svim dodjelama i unosima rada vezanima na njih. */
export function useOrder(id: string | null) {
  return useQuery({
    queryKey: [ORDERS_KEY, 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select('*, work_order_devices(device_id), work_order_assignments(*)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      const order = data as unknown as OrderDetail;
      const ids = order.work_order_assignments.map(a => a.id);
      let logs: { id: string; assignment_id: string | null; hours_worked: number; log_date: string; employee_id: string; task_description: string }[] = [];
      if (ids.length) {
        const res = await supabase.from('work_logs').select('id, assignment_id, hours_worked, log_date, employee_id, task_description').in('assignment_id', ids);
        if (res.error) throw res.error;
        logs = (res.data ?? []) as typeof logs;
      }
      return { order, logs };
    },
  });
}

export interface SaveOrderInput {
  id?: string;
  site_id: string | null;
  kind: WorkOrderKind;
  title: string;
  notes: string;
  estimate_hours: number;
  /** Dogovorena cijena (€); null = nije upisana; izostavljeno = ne mijenja se. */
  price?: number | null;
  service_case_id?: string | null;
  device_ids: string[];
  assignments: { id?: string; employee_id: string; day: string; planned_hours: number }[];
}

function useInvalidate() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: [ORDERS_KEY] });
    client.invalidateQueries({ queryKey: ['service_cases'] });
  };
}

export function useSaveOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: SaveOrderInput) => {
      const { data, error } = await supabase.rpc('save_work_order', {
        p_order: {
          id: v.id ?? null, site_id: v.site_id, kind: v.kind, title: v.title, notes: v.notes,
          estimate_hours: v.estimate_hours, service_case_id: v.service_case_id ?? null,
          ...(v.price !== undefined ? { price: v.price } : {}),
        },
        p_assignments: v.assignments,
        p_device_ids: v.device_ids,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Premještanje dodjele na drugi dan ili drugog tehničara. */
export function useMoveAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, employee_id, day }: { id: string; employee_id: string; day: string }) => {
      const { error } = await supabase.from('work_order_assignments').update({ employee_id, day }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Dodjela postojećeg naloga (npr. iz "Na čekanju") tehničaru za dan. */
export function useAddAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { work_order_id: string; employee_id: string; day: string; planned_hours: number }) => {
      const { data, error } = await supabase.from('work_order_assignments').insert(a).select().single();
      if (error) throw error;
      return data as Assignment;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_order_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetOrderStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkOrder['status'] }) => {
      const { error } = await supabase.from('work_orders')
        .update({ status, done_at: status === 'done' ? new Date().toISOString() : null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
