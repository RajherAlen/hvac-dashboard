-- =============================================================================
-- Evidencija izmjena unosa rada: tko je i kada upisao, izmijenio ili obrisao unos
-- Preduvjet: 20261104_employee_status.sql (is_admin) i 20261105_clients.sql (site_id, work_log_devices).
-- Pokrenuti jednom u Supabase SQL editoru. Skripta je idempotentna.
--
-- Zapisivanje rade okidači u bazi, pa se bilježi svaka promjena bez obzira na to
-- odakle dolazi (aplikacija, SQL editor, RPC). Korisnici povijest mogu samo čitati.
-- =============================================================================

-- ── Brzi podaci na samom unosu (za oznaku "Izmijenjeno" bez dodatnog upita) ───
-- Namjerno bez FK na profiles: dodatni FK bi upit work_logs → profiles(...) učinio dvosmislenim.
ALTER TABLE public.work_logs ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.work_logs ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ;
ALTER TABLE public.work_logs ADD COLUMN IF NOT EXISTS edited_by  UUID;

-- ── Povijest ─────────────────────────────────────────────────────────────────
-- changes: kod 'insert'/'delete' cijeli unos, kod 'update' { polje: [staro, novo] }
--          te devices_added / devices_removed (popis ID-jeva uređaja).
-- reason:  NULL = ručna izmjena; 'merge_sites' / 'link_legacy' = admin alati.
CREATE TABLE IF NOT EXISTS public.work_log_changes (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_log_id  UUID NOT NULL,            -- bez FK: povijest ostaje i nakon brisanja unosa
  employee_id  UUID,
  action       TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by   UUID,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT,
  tx           BIGINT NOT NULL DEFAULT txid_current(),
  changes      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wlc_log      ON public.work_log_changes(work_log_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_wlc_employee ON public.work_log_changes(employee_id, changed_at DESC);

ALTER TABLE public.work_log_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wlc_select ON public.work_log_changes;
-- Admin vidi sve, zaposlenik povijest svojih unosa. Nema INSERT/UPDATE/DELETE politika:
-- pišu samo okidači (SECURITY DEFINER), pa se povijest ne može krivotvoriti iz aplikacije.
CREATE POLICY wlc_select ON public.work_log_changes FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());

CREATE OR REPLACE FUNCTION public.audit_reason()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('hvac.audit_reason', true), '');
$$;

-- ── BEFORE: autor i oznaka izmjene na samom unosu ────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_work_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.edited_at  := NULL;
    NEW.edited_by  := NULL;
    RETURN NEW;
  END IF;

  NEW.created_by := OLD.created_by;
  IF public.audit_reason() IS NULL AND
     (NEW.employee_id, NEW.log_date, NEW.site_id, NEW.location, NEW.task_description, NEW.hours_worked, NEW.notes)
     IS DISTINCT FROM
     (OLD.employee_id, OLD.log_date, OLD.site_id, OLD.location, OLD.task_description, OLD.hours_worked, OLD.notes)
  THEN
    NEW.edited_at := now();
    NEW.edited_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_logs_stamp ON public.work_logs;
CREATE TRIGGER trg_work_logs_stamp BEFORE INSERT OR UPDATE ON public.work_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_work_log();

-- ── Zapis u povijest ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_work_log_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fields  TEXT[] := ARRAY['employee_id','log_date','site_id','location','task_description','hours_worked','notes'];
  skip    TEXT[] := ARRAY['id','created_at','updated_at','created_by','edited_at','edited_by'];
  f       TEXT;
  o       JSONB;
  n       JSONB;
  acc     JSONB;
  rid     BIGINT;
  changed BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.work_log_changes (work_log_id, employee_id, action, changed_by, reason, changes)
    VALUES (NEW.id, NEW.employee_id, 'insert', auth.uid(), public.audit_reason(), to_jsonb(NEW) - skip);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- BEFORE DELETE: veze na uređaje još postoje, pa ulaze u snimku obrisanog unosa
    INSERT INTO public.work_log_changes (work_log_id, employee_id, action, changed_by, reason, changes)
    VALUES (OLD.id, OLD.employee_id, 'delete', auth.uid(), public.audit_reason(),
            (to_jsonb(OLD) - skip) || jsonb_build_object('device_ids',
              (SELECT COALESCE(jsonb_agg(device_id), '[]'::jsonb) FROM public.work_log_devices WHERE work_log_id = OLD.id)));
    RETURN OLD;
  END IF;

  -- UPDATE: samo polja koja su se stvarno promijenila; više izmjena u istoj transakciji = jedan zapis
  o := to_jsonb(OLD);
  n := to_jsonb(NEW);
  SELECT id, changes INTO rid, acc FROM public.work_log_changes
   WHERE work_log_id = NEW.id AND tx = txid_current() AND action = 'update' LIMIT 1;
  acc := COALESCE(acc, '{}'::jsonb);
  FOREACH f IN ARRAY fields LOOP
    IF (o -> f) IS DISTINCT FROM (n -> f) THEN
      acc := acc || jsonb_build_object(f, jsonb_build_array(COALESCE(acc -> f -> 0, o -> f), n -> f));
      changed := true;
    END IF;
  END LOOP;
  IF NOT changed THEN RETURN NULL; END IF;

  IF rid IS NULL THEN
    INSERT INTO public.work_log_changes (work_log_id, employee_id, action, changed_by, reason, changes)
    VALUES (NEW.id, NEW.employee_id, 'update', auth.uid(), public.audit_reason(), acc);
  ELSE
    UPDATE public.work_log_changes SET changes = acc WHERE id = rid;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_logs_audit     ON public.work_logs;
DROP TRIGGER IF EXISTS trg_work_logs_audit_del ON public.work_logs;
CREATE TRIGGER trg_work_logs_audit AFTER INSERT OR UPDATE ON public.work_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_work_log_change();
CREATE TRIGGER trg_work_logs_audit_del BEFORE DELETE ON public.work_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_work_log_change();

-- ── Uređaji na unosu ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_work_log_device_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lid UUID := COALESCE(NEW.work_log_id, OLD.work_log_id);
  dev UUID := COALESCE(NEW.device_id, OLD.device_id);
  k   TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'devices_added' ELSE 'devices_removed' END;
  emp UUID;
  rid BIGINT;
BEGIN
  SELECT employee_id INTO emp FROM public.work_logs WHERE id = lid;
  IF NOT FOUND THEN RETURN NULL; END IF;  -- kaskadno brisanje unosa: već zapisano kao 'delete'

  -- Unos nastao u istoj transakciji: uređaj ide u snimku upisa, nije izmjena
  SELECT id INTO rid FROM public.work_log_changes
   WHERE work_log_id = lid AND tx = txid_current() AND action = 'insert' LIMIT 1;
  IF rid IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.work_log_changes
         SET changes = jsonb_set(changes, '{device_ids}', COALESCE(changes -> 'device_ids', '[]'::jsonb) || to_jsonb(dev))
       WHERE id = rid;
    END IF;
    RETURN NULL;
  END IF;

  SELECT id INTO rid FROM public.work_log_changes
   WHERE work_log_id = lid AND tx = txid_current() AND action = 'update' LIMIT 1;
  IF rid IS NULL THEN
    INSERT INTO public.work_log_changes (work_log_id, employee_id, action, changed_by, reason, changes)
    VALUES (lid, emp, 'update', auth.uid(), public.audit_reason(), jsonb_build_object(k, jsonb_build_array(dev)));
  ELSE
    UPDATE public.work_log_changes
       SET changes = jsonb_set(changes, ARRAY[k], COALESCE(changes -> k, '[]'::jsonb) || to_jsonb(dev))
     WHERE id = rid;
  END IF;

  IF public.audit_reason() IS NULL THEN
    UPDATE public.work_logs SET edited_at = now(), edited_by = auth.uid() WHERE id = lid;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wld_audit ON public.work_log_devices;
CREATE TRIGGER trg_wld_audit AFTER INSERT OR DELETE ON public.work_log_devices
  FOR EACH ROW EXECUTE FUNCTION public.log_work_log_device_change();

-- ── Atomarna izmjena unosa (polja + uređaji u jednoj transakciji = jedan zapis povijesti) ──
-- p_values: { log_date, site_id, location, task_description, hours_worked, notes } – izostavljeno polje se ne mijenja
-- p_device_ids: NULL = uređaji se ne diraju; [] = ukloni sve
CREATE OR REPLACE FUNCTION public.update_work_log(p_id UUID, p_values JSONB, p_device_ids UUID[] DEFAULT NULL)
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
    INSERT INTO public.work_log_devices (work_log_id, device_id)
    SELECT p_id, d FROM unnest(p_device_ids) AS d
    ON CONFLICT DO NOTHING;
    SELECT * INTO r FROM public.work_logs WHERE id = p_id;
  END IF;
  RETURN r;
END;
$$;

-- ── Admin alati bilježe razlog, a ne "ručnu izmjenu" ─────────────────────────
CREATE OR REPLACE FUNCTION public.merge_sites(from_id UUID, into_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  IF from_id = into_id THEN RETURN json_build_object('error', 'Odaberite drugi objekt.'); END IF;
  PERFORM set_config('hvac.audit_reason', 'merge_sites', true);
  UPDATE public.work_logs SET site_id = into_id WHERE site_id = from_id;
  UPDATE public.devices   SET site_id = into_id WHERE site_id = from_id;
  UPDATE public.sites SET archived_at = now() WHERE id = from_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_legacy_location(p_location TEXT, p_site_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;
  PERFORM set_config('hvac.audit_reason', 'link_legacy', true);
  UPDATE public.work_logs SET site_id = p_site_id
   WHERE site_id IS NULL AND lower(regexp_replace(trim(location), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_location), '\s+', ' ', 'g'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'updated', n);
END;
$$;

GRANT SELECT ON public.work_log_changes TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_work_log(UUID, JSONB, UUID[]) TO authenticated;
