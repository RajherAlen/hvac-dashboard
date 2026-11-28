-- =============================================================================
-- Ekipe: spremljene grupe tehničara (naziv, članovi, voditelj, vozilo).
-- Stalna ekipa nema rok; privremena vrijedi do `valid_until` (uključivo).
-- Nalog se ekipi ne veže stupcem: dodjela ekipi = jedna dodjela po članu
-- (work_order_assignments), a raspored ekipu prepoznaje po članovima.
-- Preduvjet: 20261104 – 20261112 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  lead_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle      TEXT,
  valid_until  DATE,                                 -- NULL = stalna ekipa
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crew_members (
  crew_id      UUID NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (crew_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_members_emp ON public.crew_members(employee_id);

-- ── RLS: svi čitaju, admin uređuje ───────────────────────────────────────────
ALTER TABLE public.crews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crews','crew_members'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crews, public.crew_members TO authenticated;

-- ── Spremanje ekipe s članovima u jednoj transakciji ─────────────────────────
-- p_crew:    { id?, name, lead_id?, vehicle?, valid_until? }
-- p_members: svi članovi (zamjenjuju dosadašnje); voditelj mora biti među njima
CREATE OR REPLACE FUNCTION public.save_crew(p_crew JSONB, p_members UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  cid  UUID := NULLIF(p_crew->>'id','')::uuid;
  lead UUID := NULLIF(p_crew->>'lead_id','')::uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501'; END IF;
  IF COALESCE(array_length(p_members, 1), 0) < 2 THEN
    RAISE EXCEPTION 'Ekipa mora imati barem dva člana.' USING ERRCODE = '22023';
  END IF;
  IF lead IS NOT NULL AND NOT (lead = ANY (p_members)) THEN
    RAISE EXCEPTION 'Voditelj mora biti član ekipe.' USING ERRCODE = '22023';
  END IF;

  IF cid IS NULL THEN
    INSERT INTO public.crews (name, lead_id, vehicle, valid_until, position)
    VALUES (trim(p_crew->>'name'), lead, NULLIF(trim(COALESCE(p_crew->>'vehicle','')),''),
            NULLIF(p_crew->>'valid_until','')::date,
            COALESCE((SELECT max(position) + 1 FROM public.crews), 0))
    RETURNING id INTO cid;
  ELSE
    UPDATE public.crews SET
      name = trim(p_crew->>'name'),
      lead_id = lead,
      vehicle = NULLIF(trim(COALESCE(p_crew->>'vehicle','')),''),
      valid_until = NULLIF(p_crew->>'valid_until','')::date
    WHERE id = cid;
  END IF;

  DELETE FROM public.crew_members WHERE crew_id = cid AND NOT (employee_id = ANY (p_members));
  INSERT INTO public.crew_members (crew_id, employee_id)
  SELECT cid, m FROM unnest(p_members) m ON CONFLICT DO NOTHING;

  RETURN cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crew(JSONB, UUID[]) TO authenticated;
