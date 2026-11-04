import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Device, ServiceCaseStatus } from '../types';
import { DEVICE_KIND_LABEL } from './clients';
import { formatNumeric, formatWeekday } from './format-date';
import { pluralHr } from './utils';

/** Koliko dana prije roka se objekt pojavljuje na popisu (isto kao u refresh_service_cases). */
export const SERVICE_HORIZON_DAYS = 45;

export const CASE_STATUS_LABEL: Record<ServiceCaseStatus, string> = {
  due: 'Nije kontaktiran',
  contacted: 'Kontaktiran',
  scheduled: 'Zakazan',
  snoozed: 'Odgođen',
  declined: 'Klijent odbio',
  done: 'Obavljen',
};

export function deviceDisplayName(d: Pick<Device, 'brand' | 'model' | 'kind' | 'placement'>): string {
  const name = [d.brand, d.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[d.kind];
  return d.placement ? `${name}, ${d.placement}` : name;
}

/** "kasni 14 dana" / "danas" / "sutra" / "za 9 dana" */
export function dueText(due: string, today: string): { text: string; late: boolean; days: number } {
  const days = differenceInCalendarDays(parseISO(due), parseISO(today));
  if (days < 0) return { text: `kasni ${-days} ${pluralHr(-days, 'dan', 'dana', 'dana')}`, late: true, days };
  if (days === 0) return { text: 'rok danas', late: false, days };
  if (days === 1) return { text: 'rok sutra', late: false, days };
  return { text: `za ${days} ${pluralHr(days, 'dan', 'dana', 'dana')}`, late: false, days };
}

/** "Danas", "Sutra", "pon, 10. 11." */
export function visitDayLabel(date: string, today: string): string {
  const days = differenceInCalendarDays(parseISO(date), parseISO(today));
  if (days === 0) return 'Danas';
  if (days === 1) return 'Sutra';
  if (days === -1) return 'Jučer';
  return formatWeekday(date);
}

/** Hrvatski broj u međunarodnom obliku za tel:/sms: poveznice. "091 234 5678" → "+385912345678" */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+385' + p.slice(1);
  return p.length >= 8 ? p : null;
}

/** Radi na iOS-u i Androidu. */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

/** Prijedlog SMS poruke klijentu (može se urediti prije slanja). */
export function serviceMessage(opts: {
  siteAddress: string;
  devices: Pick<Device, 'brand' | 'model' | 'kind' | 'placement'>[];
  lastService: string | null;
}): string {
  const kinds = [...new Set(opts.devices.map(d => d.kind))];
  const what = opts.devices.length === 0
    ? 'vaše uređaje'
    : kinds.length === 1 && kinds[0] === 'plamenik'
      ? opts.devices.length === 1 ? 'vaš plamenik' : 'vaše plamenike'
      : kinds.length === 1 && kinds[0] === 'kotao'
        ? opts.devices.length === 1 ? 'vaš kotao' : 'vaše kotlove'
      : kinds.every(k => ['split', 'multisplit', 'vrf'].includes(k))
        ? opts.devices.length === 1 ? 'vašu klimu' : 'vaše klime'
        : 'vaše uređaje';
  const last = opts.lastService ? ` Zadnji servis bio je ${formatNumeric(opts.lastService)}` : ''; // formatNumeric završava točkom
  return `Poštovani, bliži se redovni godišnji servis za ${what} na adresi ${opts.siteAddress}.${last} Javite nam kada vam odgovara termin pa dolazimo. Hvala i lijep pozdrav!`;
}
