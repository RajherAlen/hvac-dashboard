import { useMemo, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { WorkLog, Profile } from '../types';
import { formatHours, getLast7Days, todayISO } from '../lib/utils';
import { formatShort, formatWeekdayShort, formatDayLong, formatRange, capitalize } from '../lib/format-date';
import { isoWeekBuckets, isWorkday, type Bucket } from '../lib/period';
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
  /** Klik na stupac (dan / tjedan) – npr. otvara unose za taj period. */
  onBucketClick?: (bucket: Bucket) => void;
  /** Ako je zadano, stavke legende postaju linkovi na profil zaposlenika. */
  employeeHref?: (employeeId: string) => string;
  /** Norma po osobi i radnom danu (npr. 8) – crta isprekidanu liniju; samo za groupBy 'day'. */
  normPerPerson?: number;
  /** Tko se očekuje da radi: ulazi u normu i legendu i kad nema sati. */
  normStaffIds?: string[];
  /** Klik na ime u legendi skriva / prikazuje zaposlenika (umjesto linka na profil). */
  legendToggle?: boolean;
  height?: number;
  maxBarSize?: number;
}

type Row = {
  key: string;
  bucket: Bucket;
  total: number;
  isFuture: boolean;
  isToday: boolean;
  isWeekend: boolean;
  /** Šrafirani "placeholder" za dane koji još nisu prošli. */
  future: number;
  /** Placeholder za današnji dan bez unosa ("u tijeku"). */
  now: number;
  /** Zadnji (najviši) segment u stogu s vrijednošću > 0 – nosi oznaku zbroja. */
  topSeries: string | null;
  [employeeId: string]: unknown;
};

const FUTURE_KEY = 'future';
const NOW_KEY = 'now';
const AXIS_INK = '#475569';   // slate-600 – AA na bijelom
const MUTED_INK = '#94a3b8';  // slate-400 – samo za buduće dane
const WEEKEND_INK = '#64748b'; // slate-500 – vikend prigušen, i dalje AA
const NORM_COLOR = '#d97706';  // amber-600 – linija norme
const NORM_INK = '#b45309';    // amber-700 – tekst ispod norme (AA na bijelom)

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
  onBucketClick,
  employeeHref,
  normPerPerson,
  normStaffIds,
  legendToggle = false,
  height = 240,
  maxBarSize = 40,
}: HoursChartProps) {
  const titleId = useId();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const days = propDays ?? getLast7Days();
  const today = todayISO();
  const isStacked = mode === 'stacked' && employees.length > 0;

  const colors = useMemo(() => employeeColorMap(employees), [employees]);

  const { rows, series, visible, ticks, hasFuture, hasNow, norm } = useMemo(() => {
    const buckets: Bucket[] = groupBy === 'week'
      ? isoWeekBuckets(days)
      : days.map(d => ({ key: d, label: d, days: [d] }));

    // Zaposlenici s 0 h u cijelom periodu ne ulaze u graf ni legendu (osim onih od kojih se rad očekuje).
    const hoursByEmp = new Map<string, number>();
    for (const l of logs) hoursByEmp.set(l.employee_id, (hoursByEmp.get(l.employee_id) ?? 0) + Number(l.hours_worked));
    const expected = new Set(normStaffIds ?? []);
    const series = isStacked ? employees.filter(e => (hoursByEmp.get(e.id) ?? 0) > 0 || expected.has(e.id)) : [];
    const visible = series.filter(e => !hidden.has(e.id));
    const visibleIds = new Set(visible.map(e => e.id));
    const normCount = isStacked ? visible.filter(e => expected.has(e.id)).length : expected.size;
    const norm = groupBy === 'day' && normPerPerson ? normPerPerson * normCount : 0;

    const base = buckets.map(b => {
      const set = new Set(b.days);
      const bucketLogs = logs.filter(l => set.has(l.log_date) && (!isStacked || visibleIds.has(l.employee_id)));
      const row: Row = {
        key: b.key,
        bucket: b,
        total: bucketLogs.reduce((s, l) => s + Number(l.hours_worked), 0),
        isFuture: b.days[0] > today,
        isToday: groupBy === 'day' && b.days[0] === today,
        isWeekend: groupBy === 'day' && !isWorkday(b.days[0]),
        future: 0,
        now: 0,
        topSeries: null,
      };
      for (const emp of visible) {
        const v = bucketLogs.filter(l => l.employee_id === emp.id).reduce((s, l) => s + Number(l.hours_worked), 0);
        row[emp.id] = v;
        if (v > 0) row.topSeries = emp.id;
      }
      return row;
    });

    const ticks = niceTicks(Math.max(0, norm * 1.1, ...base.map(r => r.total)));
    const top = ticks[ticks.length - 1];
    for (const r of base) {
      if (r.isFuture) r.future = top;
      if (r.isToday && r.total === 0) r.now = norm > 0 ? norm : top * 0.85;
    }

    return {
      rows: base, series, visible, ticks, norm,
      hasFuture: base.some(r => r.isFuture),
      hasNow: base.some(r => r.now > 0),
    };
  }, [days, groupBy, logs, employees, isStacked, today, hidden, normPerPerson, normStaffIds]);

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
      <figcaption id={titleId} className="flex items-baseline justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {onBucketClick && <span className="hidden sm:inline text-xs text-slate-500">Kliknite stupac za unose</span>}
      </figcaption>

      <div role="img" aria-label={summary} className="-ml-2">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={rows}
            margin={{ top: isStacked ? 18 : 8, right: 4, left: 0, bottom: 0 }}
            barCategoryGap={many ? '15%' : '25%'}
            style={onBucketClick ? { cursor: 'pointer' } : undefined}
            onClick={state => {
              if (!onBucketClick) return;
              const row = rows.find(r => r.key === state?.activeLabel) ?? rows[Number(state?.activeIndex)];
              if (row && !row.isFuture) onBucketClick(row.bucket);
            }}
          >
            <defs>
              <pattern id={`${titleId}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#f8fafc" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
              </pattern>
              <pattern id={`${titleId}-hatch-wk`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#fcfdfe" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#f1f5f9" strokeWidth="2" />
              </pattern>
              <pattern id={`${titleId}-hatch-now`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#eff4ff" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="#d6e0fb" strokeWidth="2" />
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
                  series={visible}
                  colors={colors}
                  groupBy={groupBy}
                  norm={norm}
                />
              )}
            />
            {norm > 0 && (
              <ReferenceLine
                y={norm}
                stroke={NORM_COLOR}
                strokeWidth={1.5}
                strokeDasharray="6 5"
                label={{ value: `norma ${formatAxisHours(norm)}`, position: 'insideTopRight', fill: NORM_INK, fontSize: 11, fontWeight: 600 }}
              />
            )}
            {isStacked ? (
              visible.map(emp => (
                <Bar
                  key={emp.id}
                  dataKey={emp.id}
                  name={emp.full_name}
                  stackId="a"
                  fill={colors[emp.id]}
                  stroke="#fff"
                  strokeWidth={1}
                  maxBarSize={maxBarSize}
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
                      const row = rows[Number(p.index)];
                      const under = norm > 0 && total < norm && !!row && !row.isToday && !row.isWeekend && !row.isFuture;
                      return (
                        <text x={x} y={Number(p.y) - 5} textAnchor="middle" fontSize={many ? 9 : 11} fontWeight={600} fill={under ? NORM_INK : AXIS_INK}>
                          {many ? formatAxisHours(total) : formatHours(total)}
                        </text>
                      );
                    }}
                  />
                </Bar>
              ))
            ) : (
              <Bar dataKey="total" name="Sati" stackId="a" fill={TOTAL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={maxBarSize} isAnimationActive={false} />
            )}
            {/* Današnji dan bez unosa: "u tijeku", ne prazan stupac s 0 h */}
            <Bar dataKey={NOW_KEY} stackId="a" fill={`url(#${titleId}-hatch-now)`} maxBarSize={maxBarSize} isAnimationActive={false} legendType="none">
              <LabelList
                dataKey={NOW_KEY}
                content={p => Number(p.value) > 0 ? (
                  <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 5} textAnchor="middle" fontSize={many ? 9 : 11} fontWeight={600} fill="#1d4ed8">
                    u tijeku
                  </text>
                ) : null}
              />
            </Bar>
            {/* Uvijek zadnji u stogu: šrafira dane koji još nisu prošli (vikend svjetlije). */}
            <Bar dataKey={FUTURE_KEY} stackId="a" maxBarSize={maxBarSize} isAnimationActive={false} legendType="none">
              {rows.map(r => <Cell key={r.key} fill={`url(#${titleId}-hatch${r.isWeekend ? '-wk' : ''})`} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda: samo zaposlenici koji imaju sate u periodu */}
      {(isStacked || hasFuture || norm > 0) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-600" aria-label="Legenda">
          {series.map(emp => (
            <li key={emp.id}>
              {legendToggle ? (
                <button
                  type="button"
                  onClick={() => toggle(emp.id)}
                  aria-pressed={!hidden.has(emp.id)}
                  className={`flex items-center gap-1.5 -mx-1 px-1.5 py-1 rounded hover:bg-slate-100 ${hidden.has(emp.id) ? 'text-slate-500 line-through' : 'text-slate-700'}`}
                  title={hidden.has(emp.id) ? `Prikaži: ${emp.full_name}` : `Sakrij: ${emp.full_name}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[emp.id], opacity: hidden.has(emp.id) ? 0.3 : 1 }} aria-hidden="true" />
                  {emp.full_name}
                </button>
              ) : employeeHref ? (
                <Link
                  to={employeeHref(emp.id)}
                  className="flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded hover:bg-slate-100 hover:text-slate-900 hover:underline"
                  title={`Otvori profil: ${emp.full_name}`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
                  {emp.full_name}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[emp.id] }} aria-hidden="true" />
                  {emp.full_name}
                </span>
              )}
            </li>
          ))}
          {isStacked && series.length === 0 && <li className="text-slate-500">Nema evidentiranih sati u periodu.</li>}
          {norm > 0 && (
            <li className="flex items-center gap-1.5 text-slate-600">
              <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={NORM_COLOR} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
              Norma ({normPerPerson} h × osoba)
            </li>
          )}
          {hasNow && (
            <li className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-blue-100" style={{ background: 'repeating-linear-gradient(45deg,#eff4ff 0 2px,#d6e0fb 2px 4px)' }} aria-hidden="true" />
              Danas, u tijeku
            </li>
          )}
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
            {visible.map(e => <th key={e.id} scope="col">{e.full_name}</th>)}
            <th scope="col">Ukupno</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <th scope="row">{bucketTitle(r.bucket, groupBy)}</th>
              {visible.map(e => <td key={e.id}>{formatHours(Number(r[e.id] ?? 0))}</td>)}
              <td>{r.isFuture ? 'još nije prošlo' : r.isToday && r.total === 0 ? 'u tijeku' : formatHours(r.total)}</td>
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
  const fill = row.isFuture ? MUTED_INK : row.isWeekend ? WEEKEND_INK : AXIS_INK;
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
  active, row, series, colors, groupBy, norm = 0,
}: {
  active?: boolean; row?: Row; series: Profile[]; colors: Record<string, string>; groupBy: 'day' | 'week'; norm?: number;
}) {
  if (!active || !row) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-44">
      <p className="font-semibold text-slate-800 mb-1">{bucketTitle(row.bucket, groupBy)}</p>
      {row.isFuture ? (
        <p className="text-slate-500">Još nije prošlo</p>
      ) : row.isToday && row.total === 0 ? (
        <p className="text-slate-600">Dan u tijeku · još nema unosa</p>
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
            <span className="tabular-nums">
              {formatHours(row.total)}
              {norm > 0 && !row.isWeekend && <span className="font-normal text-slate-500"> / {formatHours(norm)}</span>}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
