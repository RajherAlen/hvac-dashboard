import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Client, DeviceKind, Site } from '../types';

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  split: 'Split klima',
  multisplit: 'Multi-split',
  vrf: 'VRF sustav',
  toplinska_pumpa: 'Toplinska pumpa',
  kotao: 'Kotao',
  ventilacija: 'Ventilacija / rekuperator',
  ostalo: 'Ostalo',
};

export const CLIENT_KIND_LABEL = { private: 'Privatna osoba', company: 'Tvrtka' } as const;

/** Oznaka za unos rada koja ostaje u work_logs.location (PDF, stari prikazi). */
export const OFFICE_LOCATION = 'Ured / ostalo';
/** Vrijednost odabira objekta za rad koji nije kod klijenta (ured, skladište, edukacija). */
export const OFFICE_SITE = '__office__';

/** Ilica 34, Zagreb */
export function siteAddress(site: Pick<Site, 'address' | 'city'>): string {
  return [site.address, site.city].filter(Boolean).join(', ');
}

/** Horvat d.o.o. – Ilica 34, Zagreb (Kuća) */
export function siteLabel(site: Pick<Site, 'address' | 'city' | 'label'>, client?: Pick<Client, 'name'> | null): string {
  const addr = siteAddress(site) + (site.label ? ` (${site.label})` : '');
  return client ? `${client.name} – ${addr}` : addr;
}

export function mapsUrl(site: Pick<Site, 'address' | 'city' | 'postal_code'>): string {
  const q = [site.address, site.postal_code, site.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export type ServiceState = 'overdue' | 'soon' | 'ok' | 'unknown';

/** Servis "uskoro" = unutar ovoliko dana. */
export const SERVICE_SOON_DAYS = 30;

export function serviceState(nextDue: string | null | undefined, today: string): { state: ServiceState; days: number | null } {
  if (!nextDue) return { state: 'unknown', days: null };
  const days = differenceInCalendarDays(parseISO(nextDue), parseISO(today));
  if (days < 0) return { state: 'overdue', days };
  if (days <= SERVICE_SOON_DAYS) return { state: 'soon', days };
  return { state: 'ok', days };
}

/** Migracija za klijente još nije pokrenuta → modul se skriva, unos rada ostaje slobodni tekst. */
export function isMissingClientsSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  return /relation .*(clients|sites|devices).* does not exist|could not find the table|schema cache|PGRST205|42P01/i.test(msg);
}
