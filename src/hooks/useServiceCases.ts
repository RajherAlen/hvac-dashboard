import { useMemo } from 'react';
import { addDays, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { SERVICE_HORIZON_DAYS } from '../lib/service';
import { todayISO } from '../lib/utils';
import { toISODate } from '../lib/format-date';
import type { ClientWithSites, Device, ServiceCase, SiteWithDevices } from '../types';
import { useClientDirectory, useDeviceServiceStatus } from './useClients';
import { isMissingAuditSchema, isMissingFunction } from './useWorkLogChanges';

export const SERVICE_KEY = 'service_cases';

/**
 * Otvoreni i odbijeni servisni slučajevi. Prije čitanja osvježava popis u bazi
 * (otvara nove, zatvara obavljene, budi odgođene). `data === null` → migracija nije pokrenuta.
 */
export function useServiceCases(enabled = true) {
  return useQuery({
    queryKey: [SERVICE_KEY],
    enabled,
    staleTime: 60_000,
    retry: (count, err) => !isMissingAuditSchema(err) && count < 2,
    queryFn: async (): Promise<ServiceCase[] | null> => {
      const refresh = await supabase.rpc('refresh_service_cases', { p_horizon_days: SERVICE_HORIZON_DAYS });
      if (refresh.error && isMissingFunction(refresh.error)) return null;
      const { data, error } = await supabase.from('service_cases').select('*').neq('status', 'done').order('due_date');
      if (error) {
        if (isMissingAuditSchema(error) || /service_cases/.test(error.message)) return null;
        throw error;
      }
      return data ?? [];
    },
  });
}

export function useUpdateServiceCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<ServiceCase, 'status' | 'scheduled_for' | 'assigned_to' | 'snooze_until' | 'note' | 'contacted_at'>> }) => {
      const { data, error } = await supabase.from('service_cases').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [SERVICE_KEY] }),
  });
}

/** Je li unos rada označen kao redovni servis (za uređivanje). */
export function useWorkLogIsService(workLogId: string | undefined) {
  return useQuery({
    queryKey: ['work_logs', 'is-service', workLogId],
    enabled: !!workLogId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('work_log_devices').select('*').eq('work_log_id', workLogId!);
      if (error) throw error;
      if (!data?.length) return true;
      return data.some(r => r.is_service !== false);
    },
  });
}

export interface ServiceItem {
  sc: ServiceCase;
  client: ClientWithSites;
  site: SiteWithDevices;
  /** Uređaji kojima rok pada unutar horizonta (oni za koje se zove) */
  devices: Device[];
  lastService: string | null;
}

/** Slučajevi spojeni s klijentom, objektom i uređajima; arhivirani se izostavljaju. */
export function useServiceBoard(enabled = true) {
  const dir = useClientDirectory();
  const on = enabled && dir.enabled && !dir.isLoading;
  const cases = useServiceCases(on);
  const status = useDeviceServiceStatus(on);

  const today = todayISO();
  const limit = toISODate(addDays(parseISO(today), SERVICE_HORIZON_DAYS));

  const items = useMemo<ServiceItem[]>(() => {
    if (!cases.data) return [];
    const out: ServiceItem[] = [];
    for (const sc of cases.data) {
      const hit = dir.siteIndex.get(sc.site_id);
      if (!hit || hit.site.archived_at || hit.client.archived_at) continue;
      const active = (hit.site.devices ?? []).filter(d => !d.archived_at);
      const dueDevices = active.filter(d => {
        const next = status.data?.[d.id]?.next;
        return next && next <= limit;
      });
      const lasts = active.map(d => status.data?.[d.id]?.last).filter((x): x is string => !!x).sort();
      out.push({ sc, client: hit.client, site: hit.site, devices: dueDevices.length ? dueDevices : active, lastService: lasts.pop() ?? null });
    }
    return out;
  }, [cases.data, dir.siteIndex, status.data, limit]);

  /** Aktivni uređaji bez roka (nema datuma ugradnje ni servisa). */
  const noDueDevices = useMemo(() => {
    if (!status.data) return [];
    return [...dir.deviceIndex.values()].filter(x =>
      !x.device.archived_at && !x.site.archived_at && !x.client.archived_at && !status.data?.[x.device.id]?.next);
  }, [dir.deviceIndex, status.data]);

  return {
    items,
    noDueDevices,
    isLoading: dir.isLoading || cases.isLoading,
    error: cases.error,
    /** Modul servisa je uključen u bazi */
    enabled: on && cases.data !== null,
    clientsMissing: dir.missingSchema,
    casesMissing: cases.data === null,
    today,
  };
}
