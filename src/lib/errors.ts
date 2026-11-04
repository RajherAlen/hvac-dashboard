/**
 * Supabase / mrežne greške dolaze na engleskom – ovdje ih prevodimo prije prikaza u UI-ju.
 */
const KNOWN: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Neispravan e-mail ili lozinka.'],
  [/relation .*(clients|sites|devices).* does not exist|could not find the (table|function) .*(clients|sites|devices|add_work_logs|create_site_quick|merge_|link_legacy)/i, 'Modul klijenata još nije aktiviran – administrator treba pokrenuti migraciju baze (clients).'],
  [/user is banned|banned/i, 'Vaš račun je deaktiviran. Obratite se administratoru.'],
  [/email not confirmed/i, 'E-mail adresa još nije potvrđena.'],
  [/user already registered|already been registered|already exists|duplicate key/i, 'Korisnik s tom e-mail adresom već postoji.'],
  [/password should be at least (\d+)/i, 'Lozinka je prekratka.'],
  [/new password should be different/i, 'Nova lozinka mora se razlikovati od stare.'],
  [/weak password|password is too weak/i, 'Lozinka je preslaba – koristite dulju lozinku s brojevima i znakovima.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'Neispravna e-mail adresa.'],
  [/rate limit|too many requests/i, 'Previše pokušaja. Pričekajte trenutak pa pokušajte ponovno.'],
  [/jwt expired|invalid jwt|session.*(missing|expired)/i, 'Sesija je istekla. Prijavite se ponovno.'],
  [/row-level security|permission denied|not authorized|forbidden/i, 'Nemate ovlasti za ovu radnju.'],
  [/failed to fetch|network ?error|load failed/i, 'Nema veze s poslužiteljem. Provjerite internetsku vezu.'],
  [/service role key not configured/i, 'Kreiranje korisnika nije konfigurirano na poslužitelju.'],
];

export function errorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message
    : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message)
    : typeof err === 'string' ? err
    : '';
  for (const [re, msg] of KNOWN) if (re.test(raw)) return msg;
  // Poruke koje već pišemo na hrvatskom (npr. iz RPC-a) propuštamo; ostalo generički.
  if (raw && /[čćžšđ]|\b(nije|ne može|greška|pogreška)\b/i.test(raw)) return raw;
  if (raw) console.warn('[nepreveden error]', raw);
  return 'Došlo je do pogreške. Pokušajte ponovno.';
}
