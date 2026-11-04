import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { isMissingClientsSchema } from '../lib/clients';
import type { ClientWithSites, Client, Site, Device, SiteWithDevices } from '../types';
import type { TablesInsert, TablesUpdate } from '../types/database';

const KEY = 'clients';
const LOGS_KEY = 'work_logs';

async function rpcResult<T = unknown>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  const r = data as { error?: string } | null;
  if (r && typeof r === 'object' && 'error' in r && r.error) throw new Error(r.error);
  return data as T;
}

/**
 * Svi klijenti s objektima i uređajima u jednom upitu (stotine zapisa) – pretraga i
 * odabir objekta rade na klijentu, bez čekanja na mrežu pri svakom tipkanju.
 * `enabled = false` ako migracija za klijente još nije pokrenuta.
 */
export function useClientDirectory() {
  const q = useQuery({
    queryKey: [KEY, 'directory'],
    staleTime: 5 * 60_000,
    retry: (count, err) => !isMissingClientsSchema(err) && count < 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, sites(*, devices(*))')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as ClientWithSites[];
    },
  });

  const index = useMemo(() => {
    const sites = new Map<string, { site: SiteWithDevices; client: ClientWithSites }>();
    const devices = new Map<string, { device: Device; site: SiteWithDevices; client: ClientWithSites }>();
    for (const client of q.data ?? []) {
      for (const site of client.sites ?? []) {
        sites.set(site.id, { site, client });
        for (const device of site.devices ?? []) devices.set(device.id, { device, site, client });
      }
    }
    return { sites, devices };
  }, [q.data]);

  const missingSchema = q.isError && isMissingClientsSchema(q.error);
  return {
    ...q,
    clients: q.data ?? [],
    siteIndex: index.sites,
    deviceIndex: index.devices,
    /** Modul je dostupan (migracija pokrenuta). Dok se učitava, smatramo da jest. */
    enabled: !missingSchema,
    missingSchema,
  };
}

/** device_id → { last_service_date, next_service_due } */
export function useDeviceServiceStatus(enabled = true) {
  return useQuery({
    queryKey: [KEY, 'service-status'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('device_service_status').select('*');
      if (error) throw error;
      const out: Record<string, { last: string | null; next: string | null }> = {};
      for (const r of data ?? []) out[r.device_id] = { last: r.last_service_date, next: r.next_service_due };
      return out;
    },
  });
}

/** Zadnjih 5 objekata na kojima je zaposlenik radio – "Nedavno" u odabiru objekta. */
export function useRecentSites(employeeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [LOGS_KEY, 'recent-sites', employeeId],
    enabled: enabled && !!employeeId,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('site_id, log_date')
        .eq('employee_id', employeeId!)
        .not('site_id', 'is', null)
        .order('log_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      const seen: string[] = [];
      for (const r of data ?? []) if (r.site_id && !seen.includes(r.site_id)) seen.push(r.site_id);
      return seen.slice(0, 5);
    },
  });
}

/** work_log_id → device_id[] za zadane unose. */
export function useWorkLogDevices(workLogIds: string[], enabled = true) {
  const ids = [...workLogIds].sort();
  return useQuery({
    queryKey: [LOGS_KEY, 'devices', ids],
    enabled: enabled && ids.length > 0,
    retry: false,
    queryFn: async () => {
      const out: Record<string, string[]> = {};
      // PostgREST URL limit – u blokovima
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await supabase.from('work_log_devices').select('*').in('work_log_id', ids.slice(i, i + 150));
        if (error) throw error;
        for (const r of data ?? []) (out[r.work_log_id] ??= []).push(r.device_id);
      }
      return out;
    },
  });
}

/** Svi unosi za objekte (posjeti klijenta) u periodu. */
export function useSiteLogs(siteIds: string[], startDate: string, endDate: string) {
  const ids = [...siteIds].sort();
  return useQuery({
    queryKey: [LOGS_KEY, 'by-sites', ids, startDate, endDate],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('*, profiles(id, full_name, email, role, phone)')
        .in('site_id', ids)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** site_id → datum zadnjeg posjeta (za popis klijenata). */
export function useLastVisitBySite(enabled = true) {
  return useQuery({
    queryKey: [LOGS_KEY, 'last-visit-by-site'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('site_id, log_date')
        .not('site_id', 'is', null)
        .order('log_date', { ascending: false })
        .limit(3000);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const r of data ?? []) if (r.site_id && !out[r.site_id]) out[r.site_id] = r.log_date;
      return out;
    },
  });
}

/** Servisna povijest jednog uređaja. */
export function useDeviceLogs(deviceId: string | undefined) {
  return useQuery({
    queryKey: [LOGS_KEY, 'by-device', deviceId],
    enabled: !!deviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_log_devices')
        .select('work_logs(*, profiles(id, full_name))')
        .eq('device_id', deviceId!);
      if (error) throw error;
      return (data ?? [])
        .map(r => r.work_logs as unknown as { id: string; log_date: string; task_description: string; hours_worked: number; profiles: { full_name: string } | null })
        .filter(Boolean)
        .sort((a, b) => b.log_date.localeCompare(a.log_date));
    },
  });
}

// ─── Mutacije ───────────────────────────────────────────────────────────────

function useInvalidate() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: [KEY] });
    client.invalidateQueries({ queryKey: [LOGS_KEY] });
  };
}

export function useSaveClient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'clients'> | TablesUpdate<'clients'> }) => {
      const q = id
        ? supabase.from('clients').update(values).eq('id', id).select().single()
        : supabase.from('clients').insert(values as TablesInsert<'clients'>).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as Client;
    },
    onSuccess: invalidate,
  });
}

export function useSaveSite() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'sites'> | TablesUpdate<'sites'> }) => {
      const q = id
        ? supabase.from('sites').update(values).eq('id', id).select().single()
        : supabase.from('sites').insert(values as TablesInsert<'sites'>).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as Site;
    },
    onSuccess: invalidate,
  });
}

export function useSaveDevice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'devices'> | TablesUpdate<'devices'> }) => {
      const q = id
        ? supabase.from('devices').update(values).eq('id', id).select().single()
        : supabase.from('devices').insert(values as TablesInsert<'devices'>).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as Device;
    },
    onSuccess: invalidate,
  });
}

type Entity = 'clients' | 'sites' | 'devices';

/** Arhiviranje / vraćanje iz arhive i potvrda "novo – provjeriti" (admin). */
export function useSetEntityFlags() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ table, id, archived, reviewed }: { table: Entity; id: string; archived?: boolean; reviewed?: boolean }) => {
      const patch: { archived_at?: string | null; needs_review?: boolean } = {};
      if (archived !== undefined) patch.archived_at = archived ? new Date().toISOString() : null;
      if (reviewed) patch.needs_review = false;
      const { error } = await supabase.from(table).update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Brzo dodavanje s terena: postojeći ili novi klijent + novi objekt. */
export function useCreateSiteQuick() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { clientId: string | null; clientName: string | null; clientKind: 'private' | 'company'; address: string; city: string; label: string }) =>
      rpcResult<{ client_id: string; site_id: string }>(supabase.rpc('create_site_quick', {
        p_client_id: v.clientId, p_client_name: v.clientName, p_client_kind: v.clientKind,
        p_address: v.address, p_city: v.city, p_label: v.label,
      })),
    onSuccess: invalidate,
  });
}

export function useMerge() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ kind, fromId, intoId }: { kind: 'clients' | 'sites'; fromId: string; intoId: string }) =>
      rpcResult(supabase.rpc(kind === 'clients' ? 'merge_clients' : 'merge_sites', { from_id: fromId, into_id: intoId })),
    onSuccess: invalidate,
  });
}

export function useLinkLegacyLocation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ location, siteId }: { location: string; siteId: string }) =>
      rpcResult<{ updated: number }>(supabase.rpc('link_legacy_location', { p_location: location, p_site_id: siteId })),
    onSuccess: invalidate,
  });
}

/** Stare slobodne lokacije koje još nisu povezane s objektom (za alat povezivanja). */
export function useUnlinkedLocations(enabled = true) {
  return useQuery({
    queryKey: [LOGS_KEY, 'unlinked-locations'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_logs')
        .select('location, log_date')
        .is('site_id', null)
        .order('log_date', { ascending: false })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, { label: string; count: number; last: string }>();
      for (const r of data ?? []) {
        const label = r.location.trim().replace(/\s+/g, ' ');
        if (!label) continue;
        const key = label.toLowerCase();
        const hit = map.get(key);
        if (hit) hit.count++;
        else map.set(key, { label, count: 1, last: r.log_date });
      }
      return [...map.values()].sort((a, b) => b.count - a.count);
    },
  });
}
