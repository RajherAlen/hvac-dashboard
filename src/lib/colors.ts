import type { WorkOrderKind } from '../types';

/**
 * Boje grafova.
 *
 * TOTAL_COLOR – brand plava, isključivo za "ukupno" grafove; namjerno NIJE u paleti zaposlenika.
 * EMPLOYEE_PALETTE – 7 kategoričkih boja, redoslijed provjeren na CVD razdvojivost
 * (dataviz validate_palette: susjedni parovi ΔE ≥ 9.1, normalni vid ≥ 19.6).
 */
export const TOTAL_COLOR = '#2563eb';

export const EMPLOYEE_PALETTE = [
  '#eb6834', // narančasta
  '#1baf7a', // tirkizna
  '#eda100', // žuta
  '#e87ba4', // magenta
  '#008300', // zelena
  '#6250d6', // ljubičasta
  '#e34948', // crvena
];

export const NEUTRAL_COLOR = '#94a3b8';

/**
 * Boje vrsta posla – samo na stranici "Sati i vrijednost", gdje se ne prikazuju boje zaposlenika.
 * Uzete iz iste CVD-provjerene palete; uz boju uvijek ide i riječ (i ikona).
 */
export const KIND_COLORS: Record<WorkOrderKind, string> = {
  servis: '#1baf7a',
  montaza: '#6250d6',
  popravak: '#eb6834',
  dijagnostika: '#eda100',
  ostalo: '#64748b',
};

/** "Bez naloga" – šrafura na bijelom, ne puna boja (rad koji nije prošao kroz planiranje). */
export const NO_ORDER_COLOR = '#94a3b8';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Stabilna boja po ID-u zaposlenika: polazna boja je hash ID-a, a sudari se
 * razrješavaju na sljedeću slobodnu (redoslijed po ID-u, ne po imenu ili rangu),
 * pa dodavanje novog zaposlenika rijetko mijenja boje postojećih.
 * Ista mapa koristi se u svim grafovima i legendama.
 */
export function employeeColorMap(employees: { id: string }[]): Record<string, string> {
  const ids = [...new Set(employees.map(e => e.id))].sort();
  const n = EMPLOYEE_PALETTE.length;
  const taken = new Set<number>();
  const out: Record<string, string> = {};
  for (const id of ids) {
    let idx = hash(id) % n;
    if (taken.size < n) {
      while (taken.has(idx)) idx = (idx + 1) % n;
      taken.add(idx);
    }
    out[id] = EMPLOYEE_PALETTE[idx];
  }
  return out;
}
