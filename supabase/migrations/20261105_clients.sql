-- =============================================================================
-- Klijenti → Objekti → Uređaji, veza unosa rada na objekt i uređaje
-- Preduvjet: 20261104_employee_status.sql (funkcija public.is_admin()).
-- Pokrenuti jednom u Supabase SQL editoru. Skripta je idempotentna.
-- =============================================================================

-- ── Tablice ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  kind          TEXT NOT NULL DEFAULT 'private' CHECK (kind IN ('private', 'company')),
  oib           TEXT,
  phone         TEXT,
  email         TEXT,
  notes         TEXT,
  needs_review  BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  label         TEXT,
  address       TEXT NOT NULL CHECK (length(trim(address)) >= 2),
  city          TEXT,
  postal_code   TEXT,
  access_notes  TEXT,
  needs_review  BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.devices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                  UUID NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  kind                     TEXT NOT NULL DEFAULT 'split'
                           CHECK (kind IN ('split','multisplit','vrf','toplinska_pumpa','kotao','ventilacija','ostalo')),
  brand                    TEXT,
  model                    TEXT,
  serial_number            TEXT,
  install_date             DATE,
  warranty_until           DATE,
  refrigerant              TEXT,
  capacity_kw              NUMERIC(6,2),
  placement                TEXT,
  service_interval_months  INT NOT NULL DEFAULT 12 CHECK (service_interval_months BETWEEN 1 AND 120),
  notes                    TEXT,
  needs_review             BOOLEAN NOT NULL DEFAULT false,
  created_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at              TIMESTAMPTZ
);

ALTER TABLE public.work_logs ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.work_log_devices (
  work_log_id UUID NOT NULL REFERENCES public.work_logs(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  PRIMARY KEY (work_log_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_sites_client      ON public.sites(client_id);
CREATE INDEX IF NOT EXISTS idx_devices_site      ON public.devices(site_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_site    ON public.work_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_wld_device        ON public.work_log_devices(device_id);

-- ── Ne-admin zapisi automatski "novo – provjeriti" ───────────────────────────
CREATE OR REPLACE FUNCTION public.mark_needs_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.needs_review := true;
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_review ON public.clients;
CREATE TRIGGER trg_clients_review BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.mark_needs_review();
DROP TRIGGER IF EXISTS trg_sites_review ON public.sites;
CREATE TRIGGER trg_sites_review BEFORE INSERT ON public.sites FOR EACH ROW EXECUTE FUNCTION public.mark_needs_review();
DROP TRIGGER IF EXISTS trg_devices_review ON public.devices;
CREATE TRIGGER trg_devices_review BEFORE INSERT ON public.devices FOR EACH ROW EXECUTE FUNCTION public.mark_needs_review();

-- ── RLS: svi prijavljeni čitaju i dodaju, samo admin mijenja/briše ───────────
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_log_devices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','sites','devices'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.is_admin())', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS wld_select ON public.work_log_devices;
DROP POLICY IF EXISTS wld_insert ON public.work_log_devices;
DROP POLICY IF EXISTS wld_delete ON public.work_log_devices;
CREATE POLICY wld_select ON public.work_log_devices FOR SELECT TO authenticated USING (true);
-- Vezu smije dodati/maknuti autor unosa ili admin
CREATE POLICY wld_insert ON public.work_log_devices FOR INSERT TO authenticated WITH CHECK (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.work_logs w WHERE w.id = work_log_id AND w.employee_id = auth.uid()));
CREATE POLICY wld_delete ON public.work_log_devices FOR DELETE TO authenticated USING (
  public.is_admin() OR EXISTS (SELECT 1 FROM public.work_logs w WHERE w.id = work_log_id AND w.employee_id = auth.uid()));

-- ── Stanje servisa uređaja ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.device_service_status WITH (security_invoker = true) AS
SELECT d.id AS device_id,
       last.last_service_date,
       (COALESCE(last.last_service_date, d.install_date) + make_interval(months => d.service_interval_months))::date
         AS next_service_due
FROM public.devices d
LEFT JOIN LATERAL (
  SELECT max(w.log_date) AS last_service_date
  FROM public.work_log_devices wd JOIN public.work_logs w ON w.id = wd.work_log_id
  WHERE wd.device_id = d.id
) last ON true;

-- ── Atomarni unos više stavki s uređajima ────────────────────────────────────
-- items: [{ employee_id, log_date, site_id|null, location, task_description, hours_worked, notes, device_ids: [] }]
CREATE OR REPLACE FUNCTION public.add_work_logs(items JSONB)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE it JSONB; new_id UUID;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(items) LOOP
    INSERT INTO public.work_logs (employee_id, log_date, site_id, location, task_description, hours_worked, notes)
    VALUES ((it->>'employee_id')::uuid, (it->>'log_date')::date, NULLIF(it->>'site_id','')::uuid,
            it->>'location', it->>'task_description', (it->>'hours_worked')::numeric, NULLIF(it->>'notes',''))
    RETURNING id INTO new_id;
    INSERT INTO public.work_log_devices (work_log_id, device_id)
    SELECT new_id, (d)::uuid FROM jsonb_array_elements_text(COALESCE(it->'device_ids','[]'::jsonb)) d;
    RETURN NEXT new_id;
  END LOOP;
END;
$$;

-- ── Brzo dodavanje s terena: (postojeći ili novi) klijent + novi objekt ──────
CREATE OR REPLACE FUNCTION public.create_site_quick(
  p_client_id UUID, p_client_name TEXT, p_client_kind TEXT, p_address TEXT, p_city TEXT, p_label TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cid UUID := p_client_id; sid UUID;
BEGIN
  IF cid IS NULL THEN
    INSERT INTO public.clients (name, kind) VALUES (trim(p_client_name), COALESCE(p_client_kind, 'private'))
    RETURNING id INTO cid;
  END IF;
  INSERT INTO public.sites (client_id, address, city, label)
  VALUES (cid, trim(p_address), NULLIF(trim(p_city), ''), NULLIF(trim(p_label), ''))
  RETURNING id INTO sid;
  RETURN json_build_object('client_id', cid, 'site_id', sid);
END;
$$;

-- ── Spajanje duplikata (admin) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_sites(from_id UUID, into_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  IF from_id = into_id THEN RETURN json_build_object('error', 'Odaberite drugi objekt.'); END IF;
  UPDATE public.work_logs SET site_id = into_id WHERE site_id = from_id;
  UPDATE public.devices   SET site_id = into_id WHERE site_id = from_id;
  UPDATE public.sites SET archived_at = now() WHERE id = from_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_clients(from_id UUID, into_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  IF from_id = into_id THEN RETURN json_build_object('error', 'Odaberite drugog klijenta.'); END IF;
  UPDATE public.sites SET client_id = into_id WHERE client_id = from_id;
  UPDATE public.clients SET archived_at = now() WHERE id = from_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ── Povezivanje starih unosa (admin): svi unosi s tom slobodnom lokacijom → objekt ──
CREATE OR REPLACE FUNCTION public.link_legacy_location(p_location TEXT, p_site_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  UPDATE public.work_logs SET site_id = p_site_id
   WHERE site_id IS NULL AND lower(regexp_replace(trim(location), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_location), '\s+', ' ', 'g'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'updated', n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_work_logs(JSONB)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_site_quick(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_sites(UUID, UUID)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_clients(UUID, UUID)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_legacy_location(TEXT, UUID)                     TO authenticated;
GRANT SELECT ON public.device_service_status TO authenticated;
