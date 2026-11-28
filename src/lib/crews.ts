import { crewActiveOn, type Crew } from '../hooks/useCrews';

/**
 * Kojoj ekipi pripada nalog određenog dana, prema tehničarima na njemu: svi moraju biti
 * članovi iste aktivne ekipe (dio ekipe je dopušten, npr. kad je netko odsutan).
 * Prednost ima ekipa s točno tim članovima, zatim najmanja koja ih sadrži.
 */
export function matchCrew(employeeIds: string[], crews: Crew[], day: string): Crew | null {
  if (employeeIds.length < 2) return null;
  let best: Crew | null = null;
  for (const c of crews) {
    if (!crewActiveOn(c, day)) continue;
    const set = new Set(c.members);
    if (!employeeIds.every(id => set.has(id))) continue;
    if (c.members.length === employeeIds.length) return c;
    if (!best || c.members.length < best.members.length) best = c;
  }
  return best;
}

/** „do 29. 11.” / „stalna” */
export function crewDurationLabel(c: Pick<Crew, 'valid_until'>, today: string, fmt: (d: string) => string): { text: string; expired: boolean } {
  if (!c.valid_until) return { text: 'Stalna', expired: false };
  if (c.valid_until < today) return { text: `Istekla ${fmt(c.valid_until)}`, expired: true };
  return { text: `Privremena · do ${fmt(c.valid_until)}`, expired: false };
}
