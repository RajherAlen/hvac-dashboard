import { useId, useState } from 'react';
import { Popover } from 'radix-ui';
import { DayPicker } from 'react-day-picker';
import { hr } from 'react-day-picker/locale/hr';
import 'react-day-picker/style.css';
import { Calendar } from 'lucide-react';
import { parseISO, subDays } from 'date-fns';
import { formatDayLong, toISODate } from '../../lib/format-date';
import { todayISO } from '../../lib/utils';
import { inputClass } from './styles';
import type { FieldControlProps } from './form';

interface DatePickerProps extends Partial<FieldControlProps> {
  value: string;               // yyyy-MM-dd
  onChange: (value: string) => void;
  onBlur?: () => void;
  min?: string;
  max?: string;
  /** Brzi izbor "Danas / Jučer" ispod kalendara. */
  quickPicks?: boolean;
  size?: 'md' | 'sm';
}

/**
 * Hrvatski date picker (react-day-picker + date-fns hr), tjedan počinje ponedjeljkom.
 * Ne ovisi o jeziku preglednika kao native <input type="date">.
 */
export function DatePicker({
  value, onChange, onBlur, min, max, quickPicks = false, size = 'md', id,
  // aria-required nije dopušten na <button> – obaveznost je vidljiva na labeli
  'aria-required': _required, // eslint-disable-line @typescript-eslint/no-unused-vars
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const autoId = useId();
  const valueId = `${id ?? autoId}-value`;
  const describedBy = [valueId, aria['aria-describedby']].filter(Boolean).join(' ');
  const selected = value ? parseISO(value) : undefined;
  const today = todayISO();
  const yesterday = toISODate(subDays(new Date(), 1));

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const inRange = (v: string) => (!min || v >= min) && (!max || v <= max);

  return (
    <Popover.Root open={open} onOpenChange={o => { setOpen(o); if (!o) onBlur?.(); }} modal>
      <Popover.Trigger
        id={id}
        type="button"
        {...aria}
        aria-describedby={describedBy}
        className={inputClass(!!aria['aria-invalid'], size === 'sm'
          ? 'flex items-center gap-2 text-left py-1.5 min-h-10 sm:min-h-0 sm:text-xs'
          : 'flex items-center gap-2 text-left')}
      >
        <Calendar size={size === 'sm' ? 13 : 15} className="text-slate-500 shrink-0" aria-hidden="true" />
        <span id={valueId} className={value ? 'text-slate-900' : 'text-slate-500'}>
          {value ? formatDayLong(value) : 'Odaberite datum'}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-60 bg-white border border-slate-200 rounded-xl shadow-xl p-3 rdp-hvac"
        >
          <DayPicker
            mode="single"
            locale={hr}
            weekStartsOn={1}
            selected={selected}
            defaultMonth={selected}
            onSelect={d => d && pick(toISODate(d))}
            disabled={[
              ...(min ? [{ before: parseISO(min) }] : []),
              ...(max ? [{ after: parseISO(max) }] : []),
            ]}
            autoFocus
          />
          {quickPicks && (
            <div className="flex gap-2 pt-2 mt-1 border-t border-slate-100">
              {[{ v: today, l: 'Danas' }, { v: yesterday, l: 'Jučer' }].filter(q => inRange(q.v)).map(q => (
                <button
                  key={q.l}
                  type="button"
                  onClick={() => pick(q.v)}
                  aria-pressed={value === q.v}
                  className={`flex-1 min-h-10 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    value === q.v ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {q.l}
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
