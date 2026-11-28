-- =============================================================================
-- Zahtjevi klijenata preko javne forme (/zahtjev), bez prijave u aplikaciju.
-- Forma smije samo UPISATI zahtjev (funkcija submit_service_request, uloga anon);
-- čitanje i obrada zahtjeva samo za admina.
-- Admin zahtjev prihvaća u klijente (novi ili postojeći klijent/objekt/uređaj)
-- i od njega radi nalog.
-- Preduvjet: 20261104 – 20261115 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.service_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 100),
  phone           TEXT NOT NULL CHECK (length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 6 AND 15),
  email           TEXT CHECK (email IS NULL OR length(email) <= 120),
  address         TEXT NOT NULL CHECK (length(trim(address)) BETWEEN 2 AND 150),
  city            TEXT CHECK (city IS NULL OR length(city) <= 80),
  device_kind     TEXT CHECK (device_kind IS NULL OR device_kind IN
                    ('split','multisplit','vrf','toplinska_pumpa','kotao','plamenik','pec_pelet','ventilacija','ostalo')),
  device_brand    TEXT CHECK (device_brand IS NULL OR length(device_brand) <= 60),
  device_model    TEXT CHECK (device_model IS NULL OR length(device_model) <= 80),
  request_kind    TEXT NOT NULL CHECK (request_kind IN ('servis','popravak','montaza','ostalo')),
  description     TEXT CHECK (description IS NULL OR length(description) <= 2000),
  preferred_time  TEXT CHECK (preferred_time IS NULL OR length(preferred_time) <= 200),
  -- new → accepted (u klijentima) → done (nalog napravljen / riješeno); ili rejected
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','done','rejected')),
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  site_id         UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  device_id       UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  work_order_id   UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  handled_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.stamp_service_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.handled_by := auth.uid();
    NEW.handled_at := CASE WHEN NEW.status = 'new' THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_service_requests_stamp ON public.service_requests;
CREATE TRIGGER trg_service_requests_stamp BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_service_request();

-- ── RLS: samo admin čita i mijenja; upis isključivo kroz submit_service_request ──
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sr_select ON public.service_requests;
DROP POLICY IF EXISTS sr_update ON public.service_requests;
DROP POLICY IF EXISTS sr_delete ON public.service_requests;
CREATE POLICY sr_select ON public.service_requests FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY sr_update ON public.service_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY sr_delete ON public.service_requests FOR DELETE TO authenticated USING (public.is_admin());
REVOKE ALL ON public.service_requests FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.service_requests TO authenticated;

-- ── Javna forma ──────────────────────────────────────────────────────────────
-- p: { full_name, phone, email, address, city, device_kind, device_brand, device_model,
--      request_kind, description, preferred_time, website (zamka za botove – mora biti prazno) }
CREATE OR REPLACE FUNCTION public.submit_service_request(p JSONB)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone TEXT := trim(coalesce(p->>'phone', ''));
  v_digits TEXT := regexp_replace(v_phone, '\D', '', 'g');
  v_kind TEXT := NULLIF(trim(coalesce(p->>'device_kind', '')), '');
BEGIN
  -- Bot je popunio skriveno polje: glumimo uspjeh, ništa ne spremamo
  IF length(trim(coalesce(p->>'website', ''))) > 0 THEN
    RETURN json_build_object('success', true);
  END IF;

  IF length(trim(coalesce(p->>'full_name', ''))) < 2 THEN RETURN json_build_object('error', 'Upišite ime i prezime.'); END IF;
  IF length(v_digits) NOT BETWEEN 6 AND 15 THEN RETURN json_build_object('error', 'Upišite ispravan broj telefona.'); END IF;
  IF length(trim(coalesce(p->>'address', ''))) < 2 THEN RETURN json_build_object('error', 'Upišite ulicu i kućni broj.'); END IF;
  IF coalesce(p->>'request_kind', '') NOT IN ('servis','popravak','montaza','ostalo') THEN
    RETURN json_build_object('error', 'Odaberite što vam treba.');
  END IF;

  -- Zaštita od zatrpavanja: isti broj najviše 3 puta na sat, ukupno najviše 30 u 10 minuta
  IF (SELECT count(*) FROM public.service_requests
       WHERE regexp_replace(phone, '\D', '', 'g') = v_digits AND created_at > now() - interval '1 hour') >= 3
  OR (SELECT count(*) FROM public.service_requests WHERE created_at > now() - interval '10 minutes') >= 30 THEN
    RETURN json_build_object('error', 'Zahtjev je već zaprimljen. Javit ćemo vam se uskoro, a za hitne slučajeve nazovite nas.');
  END IF;

  INSERT INTO public.service_requests
    (full_name, phone, email, address, city, device_kind, device_brand, device_model, request_kind, description, preferred_time)
  VALUES (
    left(trim(p->>'full_name'), 100),
    left(v_phone, 30),
    NULLIF(left(trim(coalesce(p->>'email', '')), 120), ''),
    left(trim(p->>'address'), 150),
    NULLIF(left(trim(coalesce(p->>'city', '')), 80), ''),
    CASE WHEN v_kind IN ('split','multisplit','vrf','toplinska_pumpa','kotao','plamenik','pec_pelet','ventilacija','ostalo') THEN v_kind END,
    NULLIF(left(trim(coalesce(p->>'device_brand', '')), 60), ''),
    NULLIF(left(trim(coalesce(p->>'device_model', '')), 80), ''),
    p->>'request_kind',
    NULLIF(left(trim(coalesce(p->>'description', '')), 2000), ''),
    NULLIF(left(trim(coalesce(p->>'preferred_time', '')), 200), '')
  );
  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_service_request(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_service_request(JSONB) TO anon, authenticated;

-- ── Admin: prihvati zahtjev u klijente ──────────────────────────────────────
-- p_site_id   → postojeći objekt (klijent se uzima s objekta)
-- p_client_id → postojeći klijent, novi objekt s adresom iz zahtjeva
-- oboje NULL  → novi klijent i novi objekt
-- p_device_id → postojeći uređaj; inače se uređaj dodaje ako je u zahtjevu navedena vrsta
CREATE OR REPLACE FUNCTION public.accept_service_request(
  p_id UUID, p_client_id UUID DEFAULT NULL, p_site_id UUID DEFAULT NULL, p_device_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.service_requests; cid UUID := p_client_id; sid UUID := p_site_id; did UUID := p_device_id;
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  SELECT * INTO r FROM public.service_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Zahtjev nije pronađen.'); END IF;
  IF r.status <> 'new' THEN RETURN json_build_object('error', 'Zahtjev je već obrađen.'); END IF;

  IF sid IS NOT NULL THEN
    SELECT client_id INTO cid FROM public.sites WHERE id = sid;
    IF cid IS NULL THEN RETURN json_build_object('error', 'Objekt nije pronađen.'); END IF;
  ELSE
    IF cid IS NULL THEN
      INSERT INTO public.clients (name, kind, phone, email)
      VALUES (r.full_name, 'private', r.phone, r.email) RETURNING id INTO cid;
    END IF;
    INSERT INTO public.sites (client_id, address, city)
    VALUES (cid, r.address, r.city) RETURNING id INTO sid;
  END IF;

  IF did IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.devices WHERE id = did AND site_id = sid) THEN
      RETURN json_build_object('error', 'Odabrani uređaj nije na tom objektu.');
    END IF;
  ELSIF r.device_kind IS NOT NULL THEN
    INSERT INTO public.devices (site_id, kind, brand, model)
    VALUES (sid, r.device_kind, r.device_brand, r.device_model) RETURNING id INTO did;
  END IF;

  UPDATE public.service_requests
     SET status = 'accepted', client_id = cid, site_id = sid, device_id = did
   WHERE id = p_id;
  RETURN json_build_object('success', true, 'client_id', cid, 'site_id', sid, 'device_id', did);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_service_request(UUID, UUID, UUID, UUID) TO authenticated;
