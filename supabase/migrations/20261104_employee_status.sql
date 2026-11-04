-- =============================================================================
-- Statusi zaposlenika (pozvan / aktivan / neaktivan) i deaktivacija umjesto brisanja
-- Pokrenuti jednom u Supabase SQL editoru. Skripta je idempotentna.
-- =============================================================================

-- 1. Deaktivacija: zaposlenik ostaje u bazi (povijest sati se čuva), ali se ne može prijaviti.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Pomoćna provjera: je li pozivatelj admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- 2. Status prijave iz auth.users (klijent nema pristup auth shemi).
--    "pozvan" = račun postoji, ali se korisnik još nikad nije prijavio.
CREATE OR REPLACE FUNCTION public.employee_auth_status()
RETURNS TABLE (id UUID, last_sign_in_at TIMESTAMPTZ, invited_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.last_sign_in_at, COALESCE(u.invited_at, u.created_at)
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id;
END;
$$;

-- 3. Deaktiviraj / ponovno aktiviraj. Deaktivacija blokira prijavu (banned_until)
--    i poništava postojeće sesije pri sljedećem osvježavanju tokena.
CREATE OR REPLACE FUNCTION public.set_employee_active(employee_id UUID, active BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.');
  END IF;
  IF employee_id = auth.uid() THEN
    RETURN json_build_object('error', 'Ne možete deaktivirati vlastiti račun.');
  END IF;

  UPDATE public.profiles
     SET deactivated_at = CASE WHEN active THEN NULL ELSE NOW() END,
         updated_at = NOW()
   WHERE id = employee_id;

  UPDATE auth.users
     SET banned_until = CASE WHEN active THEN NULL ELSE 'infinity'::timestamptz END
   WHERE id = employee_id;

  IF NOT active THEN
    DELETE FROM auth.refresh_tokens WHERE user_id::uuid = employee_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.employee_auth_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_active(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.employee_auth_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_employee_active(UUID, BOOLEAN) FROM anon;
