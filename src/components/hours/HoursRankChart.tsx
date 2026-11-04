import { useId } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KIND_COLORS } from '../../lib/colors';
import { KIND_KEYS, KIND_KEY_LABEL, topWithRest, type BreakdownNode, type KindKey } from '../../lib/hoursBreakdown';
import { formatEur } from '../../lib/money';
import { formatHours } from '../../lib/utils';

interface Props {
  rows: BreakdownNode[];
  showValue: boolean;
  /** Klik na stupac – otvara i ističe red u tablici. */
  onSelect: (key: string) => void;
  title: string;
}

const ROW_H = 34;
const AXIS_INK = '#475569';

type Datum = Record<KindKey, number> & { key: string; name: string; end: string; node: BreakdownNode };

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Rangirani vodoravni stupci (top 10 + "Ostali"), složeni po vrsti posla. */
export function HoursRankChart({ rows, showValue, onSelect, title }: Props) {
  const id = useId();
  const hatch = `${id}-hatch`.replace(/:/g, '');
  const shown = topWithRest(rows, 10);
  const data: Datum[] = shown.map(n => ({
    ...n.byKind,
    key: n.key,
    name: n.label,
    end: showValue && n.value > 0 ? `${formatHours(n.hours)}  ·  ${formatEur(n.value)}` : formatHours(n.hours),
    node: n,
  }));
  const kinds = KIND_KEYS.filter(k => shown.some(n => n.byKind[k] > 0));
  const summary = `${title}: ` + shown.slice(0, 5).map(n => `${n.label} ${formatHours(n.hours)}`).join(', ');

  return (
    <figure className="m-0">
      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={data.length * ROW_H + 8}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
            barCategoryGap="22%"
            style={{ cursor: 'pointer' }}
            onClick={state => {
              const d = data[Number(state?.activeIndex)];
              if (d && d.key !== 'rest') onSelect(d.key);
            }}
          >
            <defs>
              <pattern id={hatch} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="#fff" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="#cbd5e1" strokeWidth="2.5" />
              </pattern>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              yAxisId="name"
              type="category"
              dataKey="name"
              width={190}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 13, fill: '#0f172a' }}
              tickFormatter={v => truncate(String(v), 26)}
            />
            <YAxis
              yAxisId="end"
              orientation="right"
              type="category"
              dataKey="end"
              width={showValue ? 150 : 72}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 12, fill: AXIS_INK, fontVariantNumeric: 'tabular-nums' } as object}
            />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={p => {
                const d = p.active ? (p.payload?.[0]?.payload as Datum | undefined) : undefined;
                if (!d) return null;
                return (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm min-w-48">
                    <p className="font-semibold text-slate-900 mb-1">{d.name}</p>
                    <ul className="space-y-0.5">
                      {KIND_KEYS.filter(k => d.node.byKind[k] > 0).map(k => (
                        <li key={k} className="flex items-center gap-2 text-slate-700">
                          <span className={`w-2.5 h-2.5 rounded-sm ${k === 'none' ? 'hatch-none ring-1 ring-slate-300' : ''}`}
                            style={k === 'none' ? undefined : { backgroundColor: KIND_COLORS[k] }} aria-hidden="true" />
                          <span className="flex-1">{KIND_KEY_LABEL[k]}</span>
                          <span className="tabular-nums">{formatHours(d.node.byKind[k])}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="flex justify-between gap-3 mt-1 pt-1 border-t border-slate-100 font-semibold text-slate-900 tabular-nums">
                      <span>Ukupno</span><span>{formatHours(d.node.hours)}</span>
                    </p>
                  </div>
                );
              }}
            />
            {kinds.map(k => (
              <Bar
                key={k}
                yAxisId="name"
                dataKey={k}
                stackId="h"
                fill={k === 'none' ? `url(#${hatch})` : KIND_COLORS[k]}
                stroke={k === 'none' ? '#cbd5e1' : '#fff'}
                strokeWidth={1}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
