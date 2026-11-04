-- =============================================================================
-- Raspored i dodjela naloga: nalozi po objektima, dodjele tehničarima po danima
-- (s procjenom sati) i veza unosa rada na dodjelu (plan prema stvarnom).
-- Preduvjet: 20261104 – 20261108 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

-- ── Nalozi ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID REFERENCES public.sites(id) ON DELETE SET NULL,   -- NULL = Ured / ostalo
  kind             TEXT NOT NULL DEFAULT 'servis'
                   CHECK (kind IN ('servis','montaza','popravak','dijagnostika','ostalo')),
  title            TEXT NOT NULL CHECK (length(trim(title)) >= 2),
  notes            TEXT,
  estimate_hours   NUMERIC(4,2) NOT NULL DEFAULT 2 CHECK (estimate_hours > 0 AND estimate_hours <= 24),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  service_case_id  UUID REFERENCES public.service_cases(id) ON DELETE SET NULL,
  created_by       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.work_order_devices (
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  device_id     UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  PRIMARY KEY (work_order_id, device_id)
);

-- Jedan red = jedan tehničar jedan dan. Višednevni posao ili više tehničara = više redova.
CREATE TABLE IF NOT EXISTS public.work_order_assignments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  planned_hours  NUMERIC(4,2) NOT NULL DEFAULT 2 CHECK (planned_hours > 0 AND planned_hours <= 24),
  position       INT NOT NULL DEFAULT 0,
  done_at        TIMESTAMPTZ,
  UNIQUE (work_order_id, employee_id, day)
);

ALTER TABLE public.work_logs ADD COLUMN IF NOT EXISTS assignment_id UUID
  REFERENCES public.work_order_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_woa_day_emp   ON public.work_order_assignments(day, employee_id);
CREATE INDEX IF NOT EXISTS idx_woa_order     ON public.work_order_assignments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_status     ON public.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wl_assignment ON public.work_logs(assignment_id);

-- ── RLS: svi čitaju, admin planira ───────────────────────────────────────────
ALTER TABLE public.work_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_assignments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_orders','work_order_devices','work_order_assignments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;

-- ── Spremanje naloga u jednoj transakciji ────────────────────────────────────
-- p_order:       { id?, site_id, kind, title, notes, estimate_hours, service_case_id? }
-- p_assignments: [{ id?, employee_id, day, planned_hours }]   (postojeći se ažuriraju, izostavljeni brišu)
-- p_device_ids:  uređaji naloga
CREATE OR REPLACE FUNCTION public.save_work_order(p_order JSONB, p_assignments JSONB, p_device_ids UUID[] DEFAULT '{}')
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  oid UUID := NULLIF(p_order->>'id','')::uuid;
  a   JSONB;
  keep UUID[] := '{}';
  aid UUID;
  first_day DATE;
  first_emp UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501'; END IF;

  IF oid IS NULL THEN
    INSERT INTO public.work_orders (site_id, kind, title, notes, estimate_hours, service_case_id)
    VALUES (NULLIF(p_order->>'site_id','')::uuid, COALESCE(p_order->>'kind','servis'), trim(p_order->>'title'),
            NULLIF(trim(COALESCE(p_order->>'notes','')),''), COALESCE((p_order->>'estimate_hours')::numeric, 2),
            NULLIF(p_order->>'service_case_id','')::uuid)
    RETURNING id INTO oid;
  ELSE
    UPDATE public.work_orders SET
      site_id = NULLIF(p_order->>'site_id','')::uuid,
      kind = COALESCE(p_order->>'kind', kind),
      title = trim(p_order->>'title'),
      notes = NULLIF(trim(COALESCE(p_order->>'notes','')),''),
      estimate_hours = COALESCE((p_order->>'estimate_hours')::numeric, estimate_hours)
    WHERE id = oid;
  END IF;

  DELETE FROM public.work_order_devices WHERE work_order_id = oid AND NOT (device_id = ANY (p_device_ids));
  INSERT INTO public.work_order_devices (work_order_id, device_id)
  SELECT oid, d FROM unnest(p_device_ids) d ON CONFLICT DO NOTHING;

  FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) LOOP
    aid := NULLIF(a->>'id','')::uuid;
    IF aid IS NULL THEN
      INSERT INTO public.work_order_assignments (work_order_id, employee_id, day, planned_hours)
      VALUES (oid, (a->>'employee_id')::uuid, (a->>'day')::date, (a->>'planned_hours')::numeric)
      ON CONFLICT (work_order_id, employee_id, day) DO UPDATE SET planned_hours = EXCLUDED.planned_hours
      RETURNING id INTO aid;
    ELSE
      UPDATE public.work_order_assignments
         SET employee_id = (a->>'employee_id')::uuid, day = (a->>'day')::date, planned_hours = (a->>'planned_hours')::numeric
       WHERE id = aid AND work_order_id = oid;
    END IF;
    keep := keep || aid;
  END LOOP;
  DELETE FROM public.work_order_assignments WHERE work_order_id = oid AND NOT (id = ANY (keep));

  -- Servis iz popisa "Servisi": slučaj postaje zakazan za prvi dan i prvog tehničara
  SELECT day, employee_id INTO first_day, first_emp FROM public.work_order_assignments
   WHERE work_order_id = oid ORDER BY day, position LIMIT 1;
  UPDATE public.service_cases sc
     SET status = CASE WHEN first_day IS NULL THEN (CASE WHEN sc.contacted_at IS NULL THEN 'due' ELSE 'contacted' END) ELSE 'scheduled' END,
         scheduled_for = first_day, assigned_to = first_emp
    FROM public.work_orders o
   WHERE o.id = oid AND sc.id = o.service_case_id AND sc.status NOT IN ('done','declined');

  RETURN oid;
END;
$$;

-- ── Zatvaranje dodjele iz upisa rada (tehničar smije samo svoju) ─────────────
CREATE OR REPLACE FUNCTION public.complete_assignment(p_assignment UUID, p_order_done BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oid UUID; emp UUID;
BEGIN
  SELECT work_order_id, employee_id INTO oid, emp FROM public.work_order_assignments WHERE id = p_assignment;
  IF oid IS NULL THEN RETURN; END IF;
  IF emp <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nemate ovlasti za ovu radnju.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.work_order_assignments SET done_at = COALESCE(done_at, now()) WHERE id = p_assignment;
  IF p_order_done THEN
    UPDATE public.work_orders SET status = 'done', done_at = now() WHERE id = oid AND status = 'open';
  END IF;
END;
$$;

-- ── add_work_logs: stavka može nositi assignment_id i order_done ─────────────
CREATE OR REPLACE FUNCTION public.add_work_logs(items JSONB)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE it JSONB; new_id UUID; asg UUID;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(items) LOOP
    asg := NULLIF(it->>'assignment_id','')::uuid;
    INSERT INTO public.work_logs (employee_id, log_date, site_id, location, task_description, hours_worked, notes, assignment_id)
    VALUES ((it->>'employee_id')::uuid, (it->>'log_date')::date, NULLIF(it->>'site_id','')::uuid,
            it->>'location', it->>'task_description', (it->>'hours_worked')::numeric, NULLIF(it->>'notes',''), asg)
    RETURNING id INTO new_id;
    INSERT INTO public.work_log_devices (work_log_id, device_id, is_service)
    SELECT new_id, (d)::uuid, COALESCE((it->>'is_service')::boolean, true)
    FROM jsonb_array_elements_text(COALESCE(it->'device_ids','[]'::jsonb)) d;
    IF asg IS NOT NULL THEN
      PERFORM public.complete_assignment(asg, COALESCE((it->>'order_done')::boolean, false));
    END IF;
    RETURN NEXT new_id;
  END LOOP;
END;
$$;

-- ── Obrisan ili otkazan nalog za servis: servis se vraća na popis za kontakt ──
CREATE OR REPLACE FUNCTION public.unschedule_service_case()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.work_orders := OLD;  -- okidač je samo za DELETE i UPDATE, OLD uvijek postoji
BEGIN
  IF r.service_case_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.status = 'cancelled' THEN
    UPDATE public.service_cases
       SET status = CASE WHEN contacted_at IS NULL THEN 'due' ELSE 'contacted' END
     WHERE id = r.service_case_id AND status = 'scheduled';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_wo_unschedule ON public.work_orders;
CREATE TRIGGER trg_wo_unschedule AFTER DELETE OR UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.unschedule_service_case();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders, public.work_order_devices, public.work_order_assignments TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_work_order(JSONB, JSONB, UUID[])     TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_assignment(UUID, BOOLEAN)        TO authenticated;
