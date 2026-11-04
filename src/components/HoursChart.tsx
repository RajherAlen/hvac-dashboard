import { useMemo, useId } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { WorkLog, Profile } from '../types';
import { formatHours, getLast7Days, todayISO } from '../lib/utils';
import { formatShort, formatWeekdayShort, formatDayLong, formatRange, capitalize } from '../lib/format-date';
import { isoWeekBuckets, type Bucket } from '../lib/period';
import { TOTAL_COLOR, employeeColorMap } from '../lib/colors';

interface HoursChartProps {
  logs: WorkLog[];
  employees?: Profile[];
  days?: string[];
  /** 'day' = stupac po danu, 'week' = stupac po ISO tjednu (pon–ned). */
  groupBy?: 'day' | 'week';
  mode?: 'stacked' | 'simple';
  title?: string;
  isLoading?: boolean;
}

type Row = {
  key: string;
  bucket: Bucket;
  total: number;
  isFuture: boolean;
  /** Šrafirani "placeholder" za dane koji još nisu prošli. */
  future: number;
  /** Zadnji (najviši) segment u stogu s vrijednošću > 0 – nosi oznaku zbroja. */
  topSeries: string | null;
  [employeeId: string]: unknown;
};

const FUTURE_KEY = 'future';
const AXIS_INK = '#475569';   // slate-600 – AA na bijelom
const MUTED_INK = '#94a3b8';  // slate-400 – samo za buduće dane

/** 7,5 h – decimalni zarez */
function formatAxisHours(v: number): string {
  return `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;
}

/** "Lijepi" koraci osi: 0, 5, 10, 15, 20 / 0, 10, 20, 30, 40 … (najviše 5 intervala). */
function niceTicks(max: number): number[] {
  const target = Math.max(max, 4);
  const raw = target / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s * 5 >= target && s >= raw) ?? 10 * pow;
  const top = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function bucketTitle(b: Bucket, groupBy: 'day' | 'week'): string {
  return groupBy === 'day'
    ? capitalize(formatDayLong(b.days[0]))
    : `${b.label.split(' · ')[0]} · ${formatRange(b.days[0], b.days[b.days.length - 1])}`;
}

export function HoursChart({
  logs,
  employees = [],
  days: propDays,
  groupBy = 'day',
  mode = 'simple',
  title = 'Sati po danu (zadnjih 7 dana)',
  isLoading = false,
}: HoursChartProps) {
  const titleId = useId();
  const days = propDays ?? getLast7Days();
  const today = todayISO();
  const isStacked = mode === 'stacked' && employees.length > 0;

  const colors = useMemo(() => employeeColorMap(employees), [employees]);

  const { rows, series, ticks, hasFuture } = useMemo(() => {
    const buckets: Bucket[] = groupBy === 'week'
      ? isoWeekBuckets(days)
      : days.map(d => ({ key: d, label: d, days: [d] }));

    // Zaposlenici s 0 h u cijelom periodu ne ulaze u graf ni legendu.
    const hoursByEmp = new Map<string, number>();
    for (const l of logs) hoursByEmp.set(l.employee_id, (hoursByEmp.get(l.employee_id) ?? 0) + Number(l.hours_worked));
    const series = isStacked ? employees.filter(e => (hoursByEmp.get(e.id) ?? 0) > 0) : [];

    const base = buckets.map(b => {
      const set = new Set(b.days);
      const bucketLogs = logs.filter(l => set.has(l.log_date));
      const row: Row = {
        key: b.key,
        bucket: b,
        total: bucketLogs.reduce((s, l) => s + Number(l.hours_worked), 0),
        isFuture: b.days[0] > today,
        future: 0,
        topSeries: null,
      };
      for (const emp of series) {
        const v = bucketLogs.filter(l => l.employee_id === emp.id).reduce((s, l) => s + Number(l.hours_worked), 0);
        row[emp.id] = v;
        if (v > 0) row.topSeries = emp.id;
      }
      return row;
    });

    const ticks = niceTicks(Math.max(0, ...base.map(r => r.total)));
    const top = ticks[ticks.length - 1];
    for (const r of base) if (r.isFuture) r.future = top;

    return { rows: base, series, ticks, hasFuture: base.some(r => r.isFuture) };
  }, [days, groupBy, logs, employees, isStacked, today]);

  const many = rows.length > 10;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const summary = `${title}. Ukupno ${formatHours(total)} u ${rows.length} ${groupBy === 'day' ? 'dana' : 'tjedana'}.`;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5" aria-busy="true">
        <div className="h-4 w-40 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="h-[240px] flex items-end gap-2 sm:gap-3 px-6 pb-6">
          {[45, 70, 30, 85, 55, 20, 60].map((h, i) => (
            <div key={i} className="flex-1 bg-slate-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
          ))}
        </div>
        <span className="sr-only">Učitavanje grafa…</span>
      </div>
    );
  }

  return (
    <figure className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 m-0" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-sm font-semibold text-slate-800 mb-3">{title}</figcaption>

      <div role="img" aria-label={summary} className="-ml-2">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: isStacked ? 18 : 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={many ? '15%' : '25%'}>
            <defs>
              <pattern id={`${titleId}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#f8fafc" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="key"
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              interval={many ? 'preserveStartEnd' : 0}
              minTickGap={4}
              height={many ? 24 : 36}
              tick={props => <AxisTick {...props} rows={rows} groupBy={groupBy} many={many} />}
            />
            <YAxis
              width={44}
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: AXIS_INK }}
              tickFormatter={v => formatAxisHours(Number(v))}
            />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={p => (
                <ChartTooltip
                  active={p.active}
                  row={rows.find(r => r.key === p.label)}
                  series={series}
                  colors={colors}
                  groupBy={groupBy}
                />
              )}
            />
            {isStacked ? (
              series.map(emp => (
                <Bar
                  key={emp.id}
                  dataKey={emp.id}
                  name={emp.full_name}
                  stackId="a"
                  fill={colors[emp.id]}
                  stroke="#fff"
                  strokeWidth={1}
                  maxBarSize={40}
                  isAnimationActive={false}
                >
                  {/* Zbroj iznad stupca – samo na najvišem segmentu. Vrijednost se računa po
                      retku (indeks u LabelList-u preskače segmente visine 0). */}
                  <LabelList
                    dataKey={(r: Row) => (r.topSeries === emp.id ? r.total : null)}
                    content={p => {
                      if (p.value == null) return null;
                      const total = Number(p.value);
                      const x = Number(p.x) + Number(p.width) / 2;
                      return (
                        <text x={x} y={Number(p.y) - 5} textAnchor="middle" fontSize={many ? 9 : 11} fontWeight={600} fill={AXIS_INK}>
                          {many ? formatAxisHours(total) : formatHours(total)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              ))
            ) : (
              <Bar dataKey="total" name="Sati" stackId="a" fill={TOTAL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            )}
            {/* Uvijek zadnji u stogu: šrafira dane koji još nisu prošli. */}
            <Bar dataKey={FUTURE_KEY} stackId="a" fill={`url(#${titleId}-hatch)`} maxBarSize={40} isAnimationActive={false} legendType="none" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda: samo zaposlenici koji imaju sate u periodu */}
      {(isStacked || hasFuture) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-600" aria-hidden="true">
          {series.map(emp => (
            <li key={emp.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[emp.id] }} />
              {emp.full_name}
            </li>
          ))}
          {isStacked && series.length === 0 && <li className="text-slate-500">Nema evidentiranih sati u periodu.</li>}
          {hasFuture && (
            <li className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-slate-200" style={{ background: 'repeating-linear-gradient(45deg,#f8fafc 0 2px,#e2e8f0 2px 4px)' }} />
              Još nije prošlo
            </li>
          )}
        </ul>
      )}

      {/* Tablični prikaz za čitače ekrana (omotač: sr-only na <table> ne ograničava širinu) */}
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{groupBy === 'day' ? 'Dan' : 'Tjedan'}</th>
            {series.map(e => <th key={e.id} scope="col">{e.full_name}</th>)}
            <th scope="col">Ukupno</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row">{bucketTitle(r.bucket, groupBy)}</th>
              {series.map(e => <td key={e.id}>{formatHours(Number(r[e.id] ?? 0))}</td>)}
              <td>{r.isFuture ? 'još nije prošlo' : formatHours(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

// ─── Os X: dvoredna oznaka (dan u tjednu + datum), buduće prigušeno ──────────

function AxisTick({
  x, y, payload, rows, groupBy, many,
}: {
  x?: number | string; y?: number | string; payload?: { value: string };
  rows: Row[]; groupBy: 'day' | 'week'; many: boolean;
}) {
  const row = rows.find(r => r.key === payload?.value);
  if (!row) return null;
  const fill = row.isFuture ? MUTED_INK : AXIS_INK;
  const day = row.bucket.days[0];
  const isToday = groupBy === 'day' && day === todayISO();

  let line1: string;
  let line2: string | null = null;
  if (groupBy === 'week') {
    const [week, range] = row.bucket.label.split(' · ');
    line1 = week;
    line2 = many ? null : range;
  } else if (many) {
    line1 = `${Number(day.slice(8))}.`;
  } else {
    line1 = formatWeekdayShort(day);
    line2 = formatShort(day);
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={11} fill={fill} fontWeight={isToday ? 700 : 400}>
        <tspan x={0} dy={12}>{line1}</tspan>
        {line2 && <tspan x={0} dy={13}>{line2}</tspan>}
      </text>
    </g>
  );
}

// ─── Tooltip: svi zaposlenici za taj stupac + ukupno ─────────────────────────

function ChartTooltip({
  active, row, series, colors, groupBy,
}: {
  active?: boolean; row?: Row; series: Profile[]; colors: Record<string, string>; groupBy: 'day' | 'week';
}) {
  if (!active || !row) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-44">
      <p className="font-semibold text-slate-800 mb-1">{bucketTitle(row.bucket, groupBy)}</p>
      {row.isFuture ? (
        <p className="text-slate-500">Još nije prošlo</p>
      ) : (
        <>
          {series.length > 0 && (
            <ul className="space-y-0.5 mb-1.5">
              {series.map(e => {
                const v = Number(row[e.id] ?? 0);
                return (
                  <li key={e.id} className={`flex items-center justify-between gap-4 ${v === 0 ? 'text-slate-400' : 'text-slate-700'}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: colors[e.id], opacity: v === 0 ? 0.4 : 1 }} />
                      {e.full_name}
                    </span>
                    <span className="tabular-nums">{formatHours(v)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={`flex justify-between gap-4 font-semibold text-slate-900 ${series.length > 0 ? 'border-t border-slate-100 pt-1' : ''}`}>
            <span>Ukupno</span>
            <span className="tabular-nums">{formatHours(row.total)}</span>
          </p>
        </>
      )}
    </div>
  );
}
