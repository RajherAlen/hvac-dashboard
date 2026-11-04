import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  isValid, parse, parseISO, startOfMonth, startOfWeek, subDays,
} from 'date-fns';
import { capitalize, formatMonth, formatRange, toISODate } from '../lib/format-date';
import { todayISO } from '../lib/utils';

export type PeriodView = 'week' | 'month' | 'custom';

export interface Period {
  view: PeriodView;
  start: string;
  end: string;
  days: string[];
  label: string;
  /** Period sadrži današnji dan → nema "sljedećeg" ni gumba "Danas". */
  isCurrent: boolean;
  canGoNext: boolean;
  setView: (v: PeriodView) => void;
  shift: (delta: 1 | -1) => void;
  goToday: () => void;
  setCustomRange: (from: string, to: string) => void;
}

const MONTH_FMT = 'yyyy-MM';

function parseAnchor(view: PeriodView, raw: string | null): Date {
  if (raw) {
    const d = view === 'month' ? parse(raw, MONTH_FMT, new Date()) : parseISO(raw);
    if (isValid(d)) return d;
  }
  return new Date();
}

/**
 * Odabrani period u URL-u: ?view=week&date=2026-11-02 · ?view=month&date=2026-11 ·
 * ?view=custom&from=2026-10-06&to=2026-11-04 — link se može podijeliti, back gumb radi.
 */
export function usePeriod(defaultView: PeriodView, allowed: PeriodView[] = ['week', 'month', 'custom']): Period {
  const [params, setParams] = useSearchParams();
  const today = todayISO();

  const rawView = params.get('view') as PeriodView | null;
  const view: PeriodView = rawView && allowed.includes(rawView) ? rawView : defaultView;
  const anchor = parseAnchor(view, params.get('date'));

  const { start, end } = (() => {
    if (view === 'week') {
      return {
        start: toISODate(startOfWeek(anchor, { weekStartsOn: 1 })),
        end: toISODate(endOfWeek(anchor, { weekStartsOn: 1 })),
      };
    }
    if (view === 'month') {
      return { start: toISODate(startOfMonth(anchor)), end: toISODate(endOfMonth(anchor)) };
    }
    let from = params.get('from') ?? toISODate(subDays(new Date(), 29));
    let to = params.get('to') ?? today;
    if (!isValid(parseISO(from))) from = toISODate(subDays(new Date(), 29));
    if (!isValid(parseISO(to)) || to > today) to = today;
    if (from > to) from = to;
    return { start: from, end: to };
  })();

  const days = useMemo(
    () => eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map(toISODate),
    [start, end],
  );

  const label = view === 'month' ? capitalize(formatMonth(start)) : formatRange(start, end);
  const isCurrent = start <= today && today <= end;

  const update = useCallback((next: Record<string, string | null>) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      return p;
    });
  }, [setParams]);

  const setView = useCallback((v: PeriodView) => {
    if (v === 'custom') update({ view: v, date: null, from: start, to: end > today ? today : end });
    else update({ view: v, date: null, from: null, to: null });
  }, [update, start, end, today]);

  const shift = useCallback((delta: 1 | -1) => {
    if (view === 'custom') return;
    const next = view === 'week' ? addWeeks(parseISO(start), delta) : addMonths(parseISO(start), delta);
    update({ view, date: view === 'month' ? toISODate(next).slice(0, 7) : toISODate(next) });
  }, [view, start, update]);

  const goToday = useCallback(() => update({ date: null }), [update]);
  const setCustomRange = useCallback((from: string, to: string) => update({ view: 'custom', from, to }), [update]);

  return {
    view, start, end, days, label, isCurrent,
    canGoNext: view !== 'custom' && end < today,
    setView, shift, goToday, setCustomRange,
  };
}
