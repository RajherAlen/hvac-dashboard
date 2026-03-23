import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';
import type { WorkLog, Profile } from '../types';
import { getLast7Days } from '../lib/utils';

interface HoursChartProps {
  logs: WorkLog[];
  employees?: Profile[];
  days?: string[];
  mode?: 'stacked' | 'simple';
  title?: string;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

export function HoursChart({
  logs,
  employees = [],
  days: propDays,
  mode = 'simple',
  title = 'Sati po danu (zadnjih 7 dana)',
}: HoursChartProps) {
  const days = propDays ?? getLast7Days();
  const isMonthView = days.length > 10;

  // Month view: group into weekly chunks for a readable chart
  const data = isMonthView
    ? (() => {
        const chunks: string[][] = [];
        for (let i = 0; i < days.length; i += 7) {
          chunks.push(days.slice(i, Math.min(i + 7, days.length)));
        }
        return chunks.map(weekDays => {
          const weekLogs = logs.filter(l => weekDays.includes(l.log_date));
          const start = format(parseISO(weekDays[0]), 'dd/MM');
          const end = format(parseISO(weekDays[weekDays.length - 1]), 'dd/MM');
          const entry: Record<string, string | number> = {
            label: `${start}–${end}`,
            total: weekLogs.reduce((s, l) => s + Number(l.hours_worked), 0),
          };
          if (mode === 'stacked' && employees.length > 0) {
            employees.forEach(emp => {
              entry[emp.full_name] = weekLogs
                .filter(l => l.employee_id === emp.id)
                .reduce((s, l) => s + Number(l.hours_worked), 0);
            });
          }
          return entry;
        });
      })()
    : days.map(day => {
        const dayLogs = logs.filter(l => l.log_date === day);
        const entry: Record<string, string | number> = {
          date: day,
          label: format(parseISO(day), 'EEE dd/MM', { locale: hr }),
          total: dayLogs.reduce((s, l) => s + Number(l.hours_worked), 0),
        };
        if (mode === 'stacked' && employees.length > 0) {
          employees.forEach(emp => {
            entry[emp.full_name] = dayLogs
              .filter(l => l.employee_id === emp.id)
              .reduce((s, l) => s + Number(l.hours_worked), 0);
          });
        }
        return entry;
      });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        {mode === 'stacked' && employees.length > 0 ? (
          <BarChart data={data} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
            <Tooltip
              formatter={(val, name) => [`${val}h`, name]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {employees.map((emp, i) => (
              <Bar
                key={emp.id}
                dataKey={emp.full_name}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                radius={i === employees.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        ) : (
          <BarChart data={data} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
            <Tooltip
              formatter={(val) => [`${val}h`, 'Sati']}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
