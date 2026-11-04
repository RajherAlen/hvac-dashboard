-- =============================================================================
-- Podsjetnici za servis: slučajevi "servis dospijeva" po objektu, statusi kontakta i termina
-- Preduvjet: 20261104, 20261105 i 20261106 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
--
-- Tijek: dospijeva → kontaktiran → zakazan → obavljen (sam se zatvara kad se upiše servis),
--        uz izlaze odgođen (do datuma) i odbio (vraća se za godinu dana).
-- =============================================================================

-- ── Plamenik kao vrsta uređaja ───────────────────────────────────────────────
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_kind_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_kind_check
  CHECK (kind IN ('split','multisplit','vrf','toplinska_pumpa','kotao','plamenik','ventilacija','ostalo'));

-- ── Servis ili popravak: rok sljedećeg servisa pomiče samo redovni servis ────
ALTER TABLE public.work_log_devices ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW public.device_service_status WITH (security_invoker = true) AS
SELECT d.id AS device_id,
       last.last_service_date,
       (COALESCE(last.last_service_date, d.install_date) + make_interval(months => d.service_interval_months))::date
         AS next_service_due
FROM public.devices d
LEFT JOIN LATERAL (
  SELECT max(w.log_date) AS last_service_date
  FROM public.work_log_devices wd JOIN public.work_logs w ON w.id = wd.work_log_id
  WHERE wd.device_id = d.id AND wd.is_service
) last ON true;

-- add_work_logs: stavka može nositi is_service (zadano: true)
CREATE OR REPLACE FUNCTION public.add_work_logs(items JSONB)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE it JSONB; new_id UUID;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(items) LOOP
    INSERT INTO public.work_logs (employee_id, log_date, site_id, location, task_description, hours_worked, notes)
    VALUES ((it->>'employee_id')::uuid, (it->>'log_date')::date, NULLIF(it->>'site_id','')::uuid,
            it->>'location', it->>'task_description', (it->>'hours_worked')::numeric, NULLIF(it->>'notes',''))
    RETURNING id INTO new_id;
    INSERT INTO public.work_log_devices (work_log_id, device_id, is_service)
    SELECT new_id, (d)::uuid, COALESCE((it->>'is_service')::boolean, true)
    FROM jsonb_array_elements_text(COALESCE(it->'device_ids','[]'::jsonb)) d;
    RETURN NEXT new_id;
  END LOOP;
END;
$$;

-- update_work_log: dodan p_is_service (NULL = ne mijenja)
DROP FUNCTION IF EXISTS public.update_work_log(UUID, JSONB, UUID[]);
CREATE OR REPLACE FUNCTION public.update_work_log(p_id UUID, p_values JSONB, p_device_ids UUID[] DEFAULT NULL, p_is_service BOOLEAN DEFAULT NULL)
RETURNS public.work_logs LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.work_logs;
BEGIN
  UPDATE public.work_logs SET
    log_date         = CASE WHEN p_values ? 'log_date'         THEN (p_values->>'log_date')::date         ELSE log_date END,
    site_id          = CASE WHEN p_values ? 'site_id'          THEN NULLIF(p_values->>'site_id','')::uuid ELSE site_id END,
    location         = CASE WHEN p_values ? 'location'         THEN p_values->>'location'                 ELSE location END,
    task_description = CASE WHEN p_values ? 'task_description' THEN p_values->>'task_description'         ELSE task_description END,
    hours_worked     = CASE WHEN p_values ? 'hours_worked'     THEN (p_values->>'hours_worked')::numeric  ELSE hours_worked END,
    notes            = CASE WHEN p_values ? 'notes'            THEN NULLIF(p_values->>'notes','')         ELSE notes END
  WHERE id = p_id
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unos nije pronađen.' USING ERRCODE = 'P0002'; END IF;

  IF p_device_ids IS NOT NULL THEN
    DELETE FROM public.work_log_devices WHERE work_log_id = p_id AND NOT (device_id = ANY (p_device_ids));
    INSERT INTO public.work_log_devices (work_log_id, device_id, is_service)
    SELECT p_id, d, COALESCE(p_is_service, true) FROM unnest(p_device_ids) AS d
    ON CONFLICT DO NOTHING;
  END IF;
  IF p_is_service IS NOT NULL THEN
    UPDATE public.work_log_devices SET is_service = p_is_service WHERE work_log_id = p_id AND is_service <> p_is_service;
  END IF;
  SELECT * INTO r FROM public.work_logs WHERE id = p_id;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_work_log(UUID, JSONB, UUID[], BOOLEAN) TO authenticated;

-- ── Servisni slučajevi (jedan po objektu i roku) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_cases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  due_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'due'
                 CHECK (status IN ('due','contacted','scheduled','snoozed','declined','done')),
  contacted_at   TIMESTAMPTZ,
  scheduled_for  DATE,
  assigned_to    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  snooze_until   DATE,
  note           TEXT,
  work_log_id    UUID REFERENCES public.work_logs(id) ON DELETE SET NULL,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID
);

-- Najviše jedan otvoren slučaj po objektu
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_cases_open ON public.service_cases(site_id)
  WHERE status NOT IN ('done','declined');
CREATE INDEX IF NOT EXISTS idx_service_cases_status ON public.service_cases(status, due_date);
CREATE INDEX IF NOT EXISTS idx_service_cases_assigned ON public.service_cases(assigned_to, scheduled_for);

CREATE OR REPLACE FUNCTION public.stamp_service_case()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF NEW.status IN ('done','declined') AND OLD.status NOT IN ('done','declined') THEN NEW.closed_at := now(); END IF;
  IF NEW.status NOT IN ('done','declined') THEN NEW.closed_at := NULL; END IF;
  IF NEW.status = 'contacted' AND NEW.contacted_at IS NULL THEN NEW.contacted_at := now(); END IF;
  IF NEW.status <> 'snoozed' THEN NEW.snooze_until := NULL; END IF;
  IF NEW.status <> 'scheduled' AND NEW.status <> 'done' THEN NEW.scheduled_for := NULL; NEW.assigned_to := NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_service_cases_stamp ON public.service_cases;
CREATE TRIGGER trg_service_cases_stamp BEFORE UPDATE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.stamp_service_case();

ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sc_select ON public.service_cases;
DROP POLICY IF EXISTS sc_update ON public.service_cases;
-- Svi prijavljeni čitaju (tehničar vidi nadolazeće servise), mijenja samo admin.
-- Slučajeve stvara i zatvara isključivo refresh_service_cases().
CREATE POLICY sc_select ON public.service_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_update ON public.service_cases FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Najraniji rok servisa po objektu (aktivni uređaji, objekti i klijenti) ──
CREATE OR REPLACE FUNCTION public.site_service_due()
RETURNS TABLE (site_id UUID, due DATE) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d.site_id, min(s.next_service_due)
  FROM public.devices d
  JOIN public.device_service_status s ON s.device_id = d.id
  JOIN public.sites si  ON si.id = d.site_id
  JOIN public.clients c ON c.id = si.client_id
  WHERE d.archived_at IS NULL AND si.archived_at IS NULL AND c.archived_at IS NULL
    AND s.next_service_due IS NOT NULL
  GROUP BY d.site_id;
$$;

-- ── Osvježavanje: otvara nove, zatvara obavljene, budi odgođene ──────────────
-- Poziva ga aplikacija pri otvaranju popisa (jeftino i idempotentno).
-- Po želji i dnevno preko pg_cron:  select cron.schedule('servisi', '0 5 * * *', 'select public.refresh_service_cases()');
CREATE OR REPLACE FUNCTION public.refresh_service_cases(p_horizon_days INT DEFAULT 45)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  -- Obavljeno: najraniji rok na objektu pomaknuo se iza roka slučaja (upisan je servis)
  UPDATE public.service_cases sc
     SET status = 'done',
         work_log_id = (SELECT w.id FROM public.work_logs w
                         JOIN public.work_log_devices wd ON wd.work_log_id = w.id AND wd.is_service
                        WHERE w.site_id = sc.site_id ORDER BY w.log_date DESC, w.created_at DESC LIMIT 1)
    FROM public.site_service_due() sd
   WHERE sd.site_id = sc.site_id AND sc.status NOT IN ('done','declined') AND sd.due > sc.due_date;

  -- Odgoda istekla
  UPDATE public.service_cases
     SET status = CASE WHEN contacted_at IS NOT NULL THEN 'contacted' ELSE 'due' END
   WHERE status = 'snoozed' AND snooze_until <= current_date;

  -- Novi slučajevi (odbijeni miruju 11 mjeseci)
  INSERT INTO public.service_cases (site_id, due_date)
  SELECT sd.site_id, sd.due FROM public.site_service_due() sd
   WHERE sd.due <= current_date + p_horizon_days
     AND NOT EXISTS (
       SELECT 1 FROM public.service_cases sc
        WHERE sc.site_id = sd.site_id
          AND (sc.status NOT IN ('done','declined')
               OR (sc.status = 'declined' AND sc.closed_at > now() - interval '11 months')
               OR (sc.status = 'done' AND sc.due_date >= sd.due)))
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO n FROM public.service_cases WHERE status NOT IN ('done','declined');
  RETURN n;
END;
$$;

GRANT SELECT, UPDATE ON public.service_cases TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_service_cases(INT) TO authenticated;
