import type { DeviceKind, RequestKind, RequestStatus, ServiceRequest, WorkOrderKind } from '../types';
import { DEVICE_KIND_LABEL } from './clients';

/** Javna putanja forme za klijente (link koji se šalje svima). */
export const REQUEST_FORM_PATH = '/zahtjev';

/**
 * Dodaje se linku (?v=…) jer WhatsApp/Viber pamte pregled linka (naslov, opis).
 * Kad se promijeni naslov/opis u zahtjev.html, povisiti broj da se pregled osvježi.
 */
export const REQUEST_LINK_VERSION = 2;

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  servis: 'Redovni servis',
  popravak: 'Popravak / kvar',
  montaza: 'Montaža novog uređaja',
  ostalo: 'Nešto drugo',
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'Novo',
  accepted: 'U klijentima',
  done: 'Riješeno',
  rejected: 'Odbijeno',
};

/** Vrste uređaja koje klijent bira na formi – jednostavniji popis nego u aplikaciji. */
export const PUBLIC_DEVICE_OPTIONS: { value: DeviceKind; label: string }[] = [
  { value: 'split', label: 'Klima uređaj' },
  { value: 'pec_pelet', label: 'Peć na pelet' },
  { value: 'kotao', label: 'Kotao' },
  { value: 'plamenik', label: 'Plamenik' },
  { value: 'toplinska_pumpa', label: 'Toplinska pumpa' },
  { value: 'ventilacija', label: 'Ventilacija / rekuperator' },
  { value: 'ostalo', label: 'Nešto drugo / ne znam' },
];

export const REQUEST_TO_ORDER_KIND: Record<RequestKind, WorkOrderKind> = {
  servis: 'servis',
  popravak: 'popravak',
  montaza: 'montaza',
  ostalo: 'ostalo',
};

/** "Klima uređaj · Daikin FTXM35" */
export function requestDeviceText(r: Pick<ServiceRequest, 'device_kind' | 'device_brand' | 'device_model'>): string {
  const kind = r.device_kind ? (PUBLIC_DEVICE_OPTIONS.find(o => o.value === r.device_kind)?.label ?? DEVICE_KIND_LABEL[r.device_kind]) : null;
  const model = [r.device_brand, r.device_model].filter(Boolean).join(' ');
  return [kind, model].filter(Boolean).join(' · ') || 'Uređaj nije naveden';
}

/** Bilješka za nalog napravljen iz zahtjeva. */
export function requestOrderNotes(r: ServiceRequest): string {
  return [
    r.description,
    r.preferred_time ? `Željeni termin: ${r.preferred_time}` : null,
    `Zahtjev s web forme – ${r.full_name}, ${r.phone}`,
  ].filter(Boolean).join('\n');
}
