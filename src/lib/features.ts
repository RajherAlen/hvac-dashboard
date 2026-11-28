import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Verzija najave Ekipa. Povisiti (ekipe-v2) samo ako se nova najava mora ponovno prikazati svima. */
export const FEATURE_EKIPE = 'ekipe-v1';

function seenList(user: User | null): string[] {
  const v = user?.user_metadata?.seen_features;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Je li korisnik već trajno zatvorio najavu (spremljeno na računu, vrijedi na svakom uređaju). */
export function hasSeenFeature(user: User | null, id: string): boolean {
  return seenList(user).includes(id);
}

/** Trajno zapamti najavu na računu (auth user_metadata.seen_features). */
export async function markFeatureSeen(user: User | null, id: string): Promise<void> {
  const prev = seenList(user);
  if (prev.includes(id)) return;
  const { error } = await supabase.auth.updateUser({ data: { seen_features: [...prev, id] } });
  if (error) throw error;
}

// Zatvoreno bez "Ne prikazuj ponovno" → skriveno samo dok se stranica ne osvježi.
// Namjerno u memoriji, ne u sessionStorage: slučajno zatvaranje ne smije sakriti najavu za cijelu karticu.
const dismissedNow = new Set<string>();

export function isDismissedThisSession(id: string): boolean {
  return dismissedNow.has(id);
}

export function dismissForSession(id: string): void {
  dismissedNow.add(id);
}
