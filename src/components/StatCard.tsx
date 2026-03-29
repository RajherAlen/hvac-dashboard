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
    <div className={cn('rounded-xl p-4 sm:p-5 border border-slate-200 bg-white shadow-sm', colors.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 leading-tight">{title}</p>
          {isLoading ? (
            <div className="mt-1 h-7 w-20 bg-slate-200 rounded animate-pulse" />
          ) : (
            <p className={cn('mt-1 text-xl sm:text-2xl font-bold', colors.value)}>{value}</p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
        <div className={cn('p-2 sm:p-2.5 rounded-lg shrink-0', colors.icon)}>
          <Icon size={18} className="sm:w-5 sm:h-5" />
        </div>
      </div>
    </div>
  );
}
