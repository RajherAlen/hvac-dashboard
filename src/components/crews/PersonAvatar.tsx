import { cn, initials } from '../../lib/utils';

/**
 * Inicijali tehničara u krugu: bijela podloga i obrub u boji osobe, tamni tekst
 * (svijetle boje iz palete ne bi imale dovoljan kontrast s bijelim slovima).
 */
export function PersonAvatar({ name, color, size = 'md', faded, title, className }: {
  name: string | null | undefined;
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  /** Odsutan taj dan */
  faded?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" title={title ?? name ?? undefined}
      className={cn('rounded-full border-2 bg-white text-slate-900 font-bold inline-flex items-center justify-center shrink-0',
        size === 'xs' ? 'w-5 h-5 text-[9px]' : size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]',
        faded && 'opacity-35', className)}
      style={{ borderColor: color ?? '#94a3b8' }}>
      {initials(name)}
    </span>
  );
}
