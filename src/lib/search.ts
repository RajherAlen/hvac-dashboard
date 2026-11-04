/**
 * Pretraga neovisna o dijakritici i velikim slovima: "gradiste" nalazi "Gradište",
 * "dakovo"/"djakovo" nalaze "Đakovo". Svi dijelovi upita moraju se pojaviti (bilo kojim redom).
 */
export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/dj/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesQuery(haystack: string, query: string): boolean {
  const h = normalize(haystack);
  return normalize(query).split(' ').filter(Boolean).every(t => h.includes(t));
}
