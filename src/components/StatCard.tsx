import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'amber' | 'purple';
  isLoading?: boolean;
}

const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   value: 'text-blue-700' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  value: 'text-green-700' },
  amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-100 text-amber-600',  value: 'text-amber-700' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', value: 'text-purple-700' },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  isLoading = false,
}: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div className={cn('rounded-xl p-5 border border-slate-200 bg-white shadow-sm', colors.bg)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          {isLoading ? (
            <div className="mt-1 h-8 w-24 bg-slate-200 rounded animate-pulse" />
          ) : (
            <p className={cn('mt-1 text-2xl font-bold', colors.value)}>{value}</p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', colors.icon)}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
