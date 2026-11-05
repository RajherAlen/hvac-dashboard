import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { buildWorkCalendar, type WorkCalendar } from '../lib/workCalendar';
import type { Absence, AbsenceKind, AbsenceStatus, CalendarOverride, CalendarOverrideKind } from '../types';
import { isMissingAuditSchema, isMissingFunction } from './useWorkLogChanges';

export const ABSENCES_KEY = 'absences';
export const OVERRIDES_KEY = 'calendar_overrides';

/** Tablica ne postoji (migracija 20261111 nije pokrenuta). */
export function isMissingAbsenceSchema(err: unknown): boolean {
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  return isMissingAuditSchema(err) || /absences|calendar_overrides/.test(msg) && /does not exist|could not find/i.test(msg);
}

interface AbsenceFilters {
  /** Odsutnosti koje se preklapaju s rasponom */
  from?: string;
  to?: string;
  employeeId?: string;
  statuses?: AbsenceStatus[];
}

/**
 * Odsutnosti (zaposlenik kroz RLS vidi samo svoje).
 * `data === null` → modul odsutnosti nije uključen.
 */
export function useAbsences(filters: AbsenceFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [ABSENCES_KEY, filters],
    enabled,
    staleTime: 30_000,
    retry: (count, err) => !isMissingAbsenceSchema(err) && count < 2,
    queryFn: async (): Promise<Absence[] | null> => {
      let q = supabase.from('absences').select('*');
      if (filters.from) q = q.gte('end_date', filters.from);
      if (filters.to) q = q.lte('start_date', filters.to);
      if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
      if (filters.statuses?.length) q = q.in('status', filters.statuses);
      const { data, error } = await q.order('start_date');
      if (error) {
        if (isMissingAbsenceSchema(error)) return null;
        throw error;
      }
      return data ?? [];
    },
  });
}

/** Zahtjevi koji čekaju odluku administratora. */
export function usePendingAbsences(enabled = true) {
  return useAbsences({ statuses: ['pending'] }, enabled);
}

export function useCalendarOverrides(enabled = true) {
  return useQuery({
    queryKey: [OVERRIDES_KEY],
    enabled,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isMissingAbsenceSchema(err) && count < 2,
    queryFn: async (): Promise<CalendarOverride[] | null> => {
      const { data, error } = await supabase.from('calendar_overrides').select('*').order('day');
      if (error) {
        if (isMissingAbsenceSchema(error)) return null;
        throw error;
      }
      return data ?? [];
    },
  });
}

/**
 * Radni kalendar za raspon: državni praznici + neradni dani tvrtke + odsutnosti (odobrene i na čekanju).
 * Bez migracije vraća kalendar samo s praznicima.
 */
export function useWorkCalendar(start: string, end: string, enabled = true): { cal: WorkCalendar; absences: Absence[]; isLoading: boolean } {
  const absQ = useAbsences({ from: start, to: end, statuses: ['approved', 'pending'] }, enabled && !!start && !!end);
  const ovQ = useCalendarOverrides(enabled);
  const absences = absQ.data;
  const overrides = ovQ.data;
  const cal = useMemo(
    () => buildWorkCalendar({ absences: absences ?? [], overrides: overrides ?? [], absencesEnabled: absences !== null && absences !== undefined }),
    [absences, overrides],
  );
  return { cal, absences: absences ?? [], isLoading: absQ.isLoading || ovQ.isLoading };
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [ABSENCES_KEY] });
}

function friendly(err: unknown): Error {
  if (isMissingFunction(err) || isMissingAbsenceSchema(err)) {
    return new Error('Odsutnosti još nisu uključene u bazi (migracija 20261111_absences.sql).');
  }
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  return new Error(msg || 'Spremanje nije uspjelo.');
}

export interface AbsenceRequest {
  kind: AbsenceKind;
  start: string;
  end: string;
  note?: string;
  /** Samo admin: za koga se upisuje (odmah odobreno) */
  employeeId?: string;
}

export function useRequestAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: AbsenceRequest): Promise<string> => {
      const { data, error } = await supabase.rpc('request_absence', {
        p_kind: r.kind, p_start: r.start, p_end: r.end, p_note: r.note ?? null, p_employee_id: r.employeeId ?? null,
      });
      if (error) throw friendly(error);
      return data as string;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDecideAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => {
      const { error } = await supabase.rpc('decide_absence', { p_id: id, p_approve: approve, p_note: note ?? null });
      if (error) throw friendly(error);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useCancelAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_absence', { p_id: id });
      if (error) throw friendly(error);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSetCalendarOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ day, kind, label }: { day: string; kind: CalendarOverrideKind | null; label?: string | null }) => {
      const { error } = kind === null
        ? await supabase.from('calendar_overrides').delete().eq('day', day)
        : await supabase.from('calendar_overrides').upsert({ day, kind, label: label ?? null });
      if (error) throw friendly(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [OVERRIDES_KEY] }),
  });
}
