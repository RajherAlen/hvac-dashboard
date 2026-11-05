-- =============================================================================
-- Odsutnosti (godišnji, bolovanje, slobodan dan) i kalendar tvrtke.
-- Zaposlenik šalje zahtjev, administrator odobrava; administratorov unos je odmah odobren.
-- Državni praznici RH računaju se u aplikaciji; ovdje se čuvaju samo iznimke
-- (dodatni neradni dani i isključeni praznici).
-- Preduvjet: 20261104 – 20261110 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

-- ── Odsutnosti ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.absences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('godisnji','bolovanje','slobodan')),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  note           TEXT,
  requested_by   UUID DEFAULT auth.uid(),
  decided_by     UUID,
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT absences_range_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_absences_emp_range ON public.absences(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_absences_status    ON public.absences(status);

-- ── Kalendar tvrtke: iznimke od pon–pet + državnih praznika ──────────────────
-- neradni = dodatni slobodan dan za sve (Badnjak, kolektivni godišnji)
-- radni   = izračunati praznik koji se kod nas radi (isključen)
CREATE TABLE IF NOT EXISTS public.calendar_overrides (
  day    DATE PRIMARY KEY,
  kind   TEXT NOT NULL CHECK (kind IN ('neradni','radni')),
  label  TEXT
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.absences           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS absences_select ON public.absences;
CREATE POLICY absences_select ON public.absences FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());
-- Pisanje samo kroz funkcije ispod (nema INSERT/UPDATE/DELETE politika).

DROP POLICY IF EXISTS calendar_overrides_select ON public.calendar_overrides;
DROP POLICY IF EXISTS calendar_overrides_write  ON public.calendar_overrides;
CREATE POLICY calendar_overrides_select ON public.calendar_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY calendar_overrides_write  ON public.calendar_overrides FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.absences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_overrides TO authenticated;

-- ── Oznaka vrste za poruke ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.absence_kind_label(p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind WHEN 'godisnji' THEN 'Godišnji' WHEN 'bolovanje' THEN 'Bolovanje' ELSE 'Slobodan dan' END;
$$;

-- ── Zahtjev / upis odsutnosti ────────────────────────────────────────────────
-- Zaposlenik: samo za sebe, status 'pending'. Admin: za bilo koga, odmah 'approved'.
-- Zbog RLS-a (nema INSERT politike) funkcija je SECURITY DEFINER, uz ručne provjere.
CREATE OR REPLACE FUNCTION public.request_absence(
  p_kind TEXT, p_start DATE, p_end DATE, p_note TEXT DEFAULT NULL, p_employee_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me     UUID := auth.uid();
  admin  BOOLEAN := public.is_admin();
  emp    UUID := COALESCE(p_employee_id, auth.uid());
  clash  public.absences;
  new_id UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Niste prijavljeni.' USING ERRCODE = '42501'; END IF;
  IF emp <> me AND NOT admin THEN RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('godisnji','bolovanje','slobodan') THEN RAISE EXCEPTION 'Nepoznata vrsta odsutnosti.' USING ERRCODE = '22023'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'Završni datum ne može biti prije početnog.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO clash FROM public.absences
   WHERE employee_id = emp AND status IN ('pending','approved')
     AND start_date <= p_end AND end_date >= p_start
   ORDER BY start_date LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Za taj period već postoji zahtjev (% %).', public.absence_kind_label(clash.kind),
      CASE WHEN clash.start_date = clash.end_date THEN to_char(clash.start_date, 'FMDD. FMMM.')
           ELSE to_char(clash.start_date, 'FMDD. FMMM.') || ' – ' || to_char(clash.end_date, 'FMDD. FMMM.') END
      USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.absences (employee_id, kind, start_date, end_date, status, note, requested_by, decided_by, decided_at)
  VALUES (emp, p_kind, p_start, p_end,
          CASE WHEN admin THEN 'approved' ELSE 'pending' END,
          NULLIF(trim(COALESCE(p_note,'')),''), me,
          CASE WHEN admin THEN me END, CASE WHEN admin THEN now() END)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ── Odluka administratora ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_absence(p_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501'; END IF;
  UPDATE public.absences
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = NULLIF(trim(COALESCE(p_note,'')),'')
   WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Zahtjev više ne čeka odluku.' USING ERRCODE = 'P0002'; END IF;
END;
$$;

-- ── Povlačenje / otkazivanje ─────────────────────────────────────────────────
-- Zaposlenik: svoj zahtjev na čekanju ili odobrenu odsutnost koja još nije počela.
-- Admin: bilo koju aktivnu odsutnost.
CREATE OR REPLACE FUNCTION public.cancel_absence(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.absences;
BEGIN
  SELECT * INTO a FROM public.absences WHERE id = p_id;
  IF NOT FOUND OR a.status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'Odsutnost nije pronađena ili je već zatvorena.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_admin() THEN
    IF a.employee_id <> auth.uid() THEN RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501'; END IF;
    IF a.status = 'approved' AND a.start_date <= current_date THEN
      RAISE EXCEPTION 'Odobrena odsutnost je već počela – javite se administratoru.' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE public.absences SET status = 'cancelled', decided_by = auth.uid(), decided_at = now() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_absence(TEXT, DATE, DATE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_absence(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_absence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_absence(TEXT, DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_absence(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_absence(UUID) TO authenticated;
