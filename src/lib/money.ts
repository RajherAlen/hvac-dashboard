const EUR = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUR_PRECISE = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 7.840 € (cijeli euri – za zbrojeve i tablice) */
export function formatEur(n: number): string {
  return EUR.format(Math.round(n));
}

/** 1.250,50 € (cijena jednog naloga) */
export function formatEurPrecise(n: number): string {
  return EUR_PRECISE.format(n);
}

/** 41 €/h */
export function formatRate(n: number): string {
  return `${EUR.format(Math.round(n))}/h`;
}

/**
 * Parsira iznos: "1250", "1.250", "1250,50", "1.250,50", "1250.50", "1 250 €".
 * Prazno → null; neispravno → NaN.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(/€|eur/gi, '').replace(/\s/g, '').trim();
  if (!s) return null;
  let norm: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) norm = s.replace(',', '.');
  else if (/^\d+(\.\d{1,2})?$/.test(s)) norm = s;
  else return NaN;
  return Math.round(Number(norm) * 100) / 100;
}

/** Prikaz iznosa u polju za unos: 1250,5 → "1250,50" */
export function moneyToInput(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return Number(n).toFixed(2).replace('.', ',').replace(/,00$/, '');
}
