import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RequestKind, RequestStatus, ServiceRequest } from '../types';
import { isMissingAuditSchema, isMissingFunction } from './useWorkLogChanges';

export const REQUESTS_KEY = 'service_requests';

/** Tablica zahtjeva ne postoji (migracija 20261116 nije pokrenuta). */
function missing(err: unknown): boolean {
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  return isMissingAuditSchema(err) || (/service_request/.test(msg) && /does not exist|could not find/i.test(msg));
}

async function rpcResult<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    if (missing(error) || isMissingFunction(error)) throw new Error('Zaprimanje zahtjeva trenutno nije dostupno. Molimo nazovite nas.');
    throw new Error(error.message);
  }
  const r = data as { error?: string } | null;
  if (r && typeof r === 'object' && r.error) throw new Error(r.error);
  return data as T;
}

/** Zahtjevi s web forme (admin). Svi novi + zadnjih 200 obrađenih. `data === null` → modul nije uključen. */
export function useServiceRequests(enabled = true) {
  return useQuery({
    queryKey: [REQUESTS_KEY],
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    retry: (count, err) => !missing(err) && count < 2,
    queryFn: async (): Promise<ServiceRequest[] | null> => {
      const [fresh, handled] = await Promise.all([
        supabase.from('service_requests').select('*').eq('status', 'new').order('created_at', { ascending: false }),
        supabase.from('service_requests').select('*').neq('status', 'new').order('created_at', { ascending: false }).limit(200),
      ]);
      const error = fresh.error ?? handled.error;
      if (error) {
        if (missing(error)) return null;
        throw error;
      }
      return [...(fresh.data ?? []), ...(handled.data ?? [])] as ServiceRequest[];
    },
  });
}

export interface PublicRequestInput {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  device_kind: string;
  device_brand: string;
  device_model: string;
  request_kind: RequestKind | '';
  description: string;
  preferred_time: string;
  /** Zamka za botove – ljudi je ne vide */
  website: string;
}

/** Javna forma: radi bez prijave (uloga anon). */
export function useSubmitServiceRequest() {
  return useMutation({
    mutationFn: (v: PublicRequestInput) =>
      rpcResult(supabase.rpc('submit_service_request', { p: { ...v } })),
  });
}

export function useAcceptRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; client_id?: string | null; site_id?: string | null; device_id?: string | null }) =>
      rpcResult<{ client_id: string; site_id: string; device_id: string | null }>(supabase.rpc('accept_service_request', {
        p_id: v.id, p_client_id: v.client_id ?? null, p_site_id: v.site_id ?? null, p_device_id: v.device_id ?? null,
      })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [REQUESTS_KEY] });
      client.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useSetRequestStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: RequestStatus; work_order_id?: string | null }) => {
      const { error } = await supabase.from('service_requests')
        .update({ status: v.status, ...(v.work_order_id !== undefined ? { work_order_id: v.work_order_id } : {}) })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [REQUESTS_KEY] }),
  });
}
