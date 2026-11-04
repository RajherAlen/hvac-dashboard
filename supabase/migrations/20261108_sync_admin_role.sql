-- =============================================================================
-- Usklađivanje uloge admina
-- Aplikacija ulogu za prijavu čita iz auth.users (app_metadata.role), a popisi
-- zaposlenika i ovlasti u bazi iz profiles.role. Ako se razlikuju, admin se broji
-- kao zaposlenik ("Aktivni danas", popis zaposlenika) i nema admin ovlasti u bazi.
-- Pokrenuti jednom u Supabase SQL editoru. Skripta je idempotentna.
-- =============================================================================

-- 1. Prije: tko se razlikuje (samo za pregled, pokrenite zasebno ako želite vidjeti)
-- SELECT p.full_name, p.role AS profil, u.raw_app_meta_data->>'role' AS prijava
--   FROM public.profiles p JOIN auth.users u ON u.id = p.id
--  WHERE p.role IS DISTINCT FROM COALESCE(u.raw_app_meta_data->>'role', p.role);

-- 2. Profil preuzima ulogu iz računa za prijavu
UPDATE public.profiles p
   SET role = u.raw_app_meta_data->>'role'
  FROM auth.users u
 WHERE u.id = p.id
   AND u.raw_app_meta_data->>'role' IN ('admin', 'employee')
   AND p.role IS DISTINCT FROM u.raw_app_meta_data->>'role';

-- 3. Ovlasti u bazi prihvaćaju oba izvora, da se razlika ne može ponoviti
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
