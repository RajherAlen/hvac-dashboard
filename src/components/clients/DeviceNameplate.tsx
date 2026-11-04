import { AlertTriangle, CalendarClock, Clock } from 'lucide-react';
import type { Device } from '../../types';
import { DEVICE_KIND_LABEL, serviceState, type ServiceState } from '../../lib/clients';
import { formatNumeric, formatRelative } from '../../lib/format-date';
import { cn, todayISO, pluralHr } from '../../lib/utils';

interface Props {
  device: Device;
  service?: { last: string | null; next: string | null };
  onOpen?: () => void;
  /** Kompaktna verzija (u dijalogu detalja) – bez klikabilnosti. */
  static?: boolean;
}

/**
 * Natpisna pločica – uređaj prikazan kao pločica zakovana na vanjsku jedinicu:
 * dvostruki obrub, "zakovice" u kutovima, podaci u dva stupca, serijski broj u monospaceu.
 * Ispod pločice jedna traka stanja servisa.
 */
export function DeviceNameplate({ device, service, onOpen, static: isStatic }: Props) {
  const title = [device.brand, device.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[device.kind];
  const sub = [DEVICE_KIND_LABEL[device.kind], device.placement].filter(Boolean).join(', ');
  const st = serviceState(service?.next, todayISO());
  const capacity = device.capacity_kw != null ? `${String(device.capacity_kw).replace('.', ',')} kW` : null;
  const gas = [device.refrigerant, capacity].filter(Boolean).join(' / ');

  const rows: [string, React.ReactNode][] = [
    ['Serijski br.', device.serial_number
      ? <span className="font-mono tabular-nums tracking-tight">{device.serial_number}</span>
      : <span className="text-slate-400">nije upisan</span>],
    ['Ugrađeno', device.install_date ? formatNumeric(device.install_date) : <span className="text-slate-400">–</span>],
  ];
  if (gas) rows.push(['Medij / snaga', gas]);
  if (device.warranty_until) rows.push(['Jamstvo do', formatNumeric(device.warranty_until)]);

  const plate = (
    <div className="relative rounded-md border border-slate-300 bg-slate-50 p-[3px] shadow-[inset_0_1px_0_white]">
      <div className="relative rounded-[4px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 pt-3 pb-3">
        {/* zakovice */}
        {['left-1.5 top-1.5', 'right-1.5 top-1.5', 'left-1.5 bottom-1.5', 'right-1.5 bottom-1.5'].map(pos => (
          <span key={pos} aria-hidden="true"
            className={cn('absolute w-[7px] h-[7px] rounded-full bg-slate-300 shadow-[inset_0_-1px_0_rgba(15,23,42,0.25),0_1px_0_white]', pos)} />
        ))}
        <div className="px-1.5">
          <p className="text-[15px] font-semibold text-slate-900 leading-tight truncate">{title}</p>
          <p className="text-xs text-slate-600 mt-0.5 truncate">{sub}</p>
          <dl className="mt-2.5 pt-2 border-t border-dashed border-slate-300 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-600">{k}</dt>
                <dd className="text-slate-900 text-right truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );

  const bar = <ServiceBar state={st.state} days={st.days} next={service?.next ?? null} last={service?.last ?? null} />;

  if (isStatic || !onOpen) return <div>{plate}{bar}</div>;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left rounded-lg transition-transform hover:-translate-y-px focus-visible:outline-offset-4"
      aria-label={`Uređaj: ${title}${device.placement ? `, ${device.placement}` : ''}. ${serviceText(st.state, st.days)}`}
    >
      {plate}
      {bar}
    </button>
  );
}

function serviceText(state: ServiceState, days: number | null): string {
  const d = (n: number) => `${n} ${pluralHr(n, 'dan', 'dana', 'dana')}`;
  if (state === 'overdue') return `Servis kasni ${d(Math.abs(days!))}`;
  if (state === 'soon') return days === 0 ? 'Servis danas' : `Servis za ${d(days!)}`;
  if (state === 'ok') return 'Servis nije uskoro';
  return 'Bez podataka o servisu';
}

function ServiceBar({ state, days, next, last }: { state: ServiceState; days: number | null; next: string | null; last: string | null }) {
  const styles: Record<ServiceState, string> = {
    overdue: 'bg-red-50 text-red-800 border-red-200',
    soon: 'bg-amber-50 text-amber-900 border-amber-200',
    ok: 'bg-white text-slate-600 border-slate-200',
    unknown: 'bg-white text-slate-500 border-slate-200',
  };
  const Icon = state === 'overdue' ? AlertTriangle : state === 'soon' ? CalendarClock : Clock;
  return (
    <p className={cn('mx-2 -mt-px px-3 py-1.5 text-xs border border-t-0 rounded-b-md flex items-center gap-1.5', styles[state])}>
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">
        {state === 'unknown'
          ? 'Upišite datum ugradnje za servisni rok'
          : <>{serviceText(state, days)}{next && <span className="opacity-80"> · {formatNumeric(next)}</span>}</>}
        {state === 'ok' && last && <span className="opacity-80"> · zadnji {formatRelative(last)}</span>}
      </span>
    </p>
  );
}
