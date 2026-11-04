import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { BreakdownLog, OrderRef } from '../lib/hoursBreakdown';
import { isStaff } from '../lib/period';

const PROFILE = 'profiles(id, full_name, email, role, phone)';

type Raw = BreakdownLog & { work_order_assignments?: { work_orders: OrderRef | null } | null };

function msg(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
}
const missingColumn = (err: unknown, col: string) => new RegExp(`${col}.*does not exist|column .*${col}`, 'i').test(msg(err));
const missingRelation = (err: unknown) => /work_order|assignment_id|relationship|does not exist|schema cache|PGRST2/i.test(msg(err));

export interface HoursData {
  logs: BreakdownLog[];
  /** work_order_id → svi ikad upisani sati */
  orderTotals: Map<string, number>;
  /** Migracija 20261110 je pokrenuta (cijene i €/h su dostupni). */
  hasPrice: boolean;
  /** Migracija 20261109 je pokrenuta (vrste posla preko naloga). */
  hasOrders: boolean;
}

/**
 * Unosi rada u razdoblju s nalogom (vrsta, cijena) preko dodjele, plus ukupni sati
 * po nalogu za izračun €/h. Admini su isključeni (ne evidentiraju rad).
 * Ako migracije za naloge ili cijene nisu pokrenute, vraća što može (samo sati).
 */
export function useHoursBreakdown(start: string, end: string) {
  return useQuery({
    queryKey: ['work_logs', 'hours-breakdown', start, end],
    enabled: !!start && !!end,
    staleTime: 30_000,
    queryFn: async (): Promise<HoursData> => {
      const run = (select: string) => supabase.from('work_logs').select(select)
        .gte('log_date', start).lte('log_date', end)
        .order('log_date', { ascending: false });

      let hasPrice = true;
      let hasOrders = true;
      let res = await run(`*, ${PROFILE}, work_order_assignments(work_orders(id, title, kind, price, site_id))`);
      if (res.error && missingColumn(res.error, 'price')) {
        hasPrice = false;
        res = await run(`*, ${PROFILE}, work_order_assignments(work_orders(id, title, kind, site_id))`);
      }
      if (res.error && missingRelation(res.error)) {
        hasPrice = false;
        hasOrders = false;
        res = await run(`*, ${PROFILE}`);
      }
      if (res.error) throw res.error;

      const logs: BreakdownLog[] = ((res.data ?? []) as unknown as Raw[])
        .filter(l => isStaff(l.profiles))
        .map(({ work_order_assignments, ...l }) => ({ ...l, order: work_order_assignments?.work_orders ?? null }));

      const orderTotals = new Map<string, number>();
      const ids = [...new Set(logs.map(l => l.order?.id).filter((x): x is string => !!x))];
      if (hasPrice && ids.length) {
        for (let i = 0; i < ids.length; i += 150) {
          const t = await supabase.from('work_order_hours').select('work_order_id, total_hours').in('work_order_id', ids.slice(i, i + 150));
          if (t.error) { hasPrice = false; break; }
          for (const r of t.data ?? []) orderTotals.set(r.work_order_id, Number(r.total_hours));
        }
      }
      return { logs, orderTotals, hasPrice, hasOrders };
    },
  });
}
