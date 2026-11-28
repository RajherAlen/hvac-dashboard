-- =============================================================================
-- Tehničari smiju uređivati klijenta, objekt i uređaj; nova vrsta uređaja "peć na pelet".
-- Arhiviranje, spajanje i brisanje ostaju samo administratoru.
-- Izmjena koju napravi tehničar označava zapis "za pregled" (needs_review), kao i novi unos.
-- Preduvjet: 20261104 – 20261112 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

-- ── Peć na pelet ─────────────────────────────────────────────────────────────
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_kind_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_kind_check
  CHECK (kind IN ('split','multisplit','vrf','toplinska_pumpa','kotao','plamenik','pec_pelet','ventilacija','ostalo'));

-- ── Uređivanje za sve prijavljene ────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','sites','devices'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Ne-admin ne smije arhivirati, skinuti oznaku "za pregled" ni premjestiti zapis drugom klijentu/objektu.
CREATE OR REPLACE FUNCTION public.guard_non_admin_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.archived_at  := OLD.archived_at;
    NEW.needs_review := true;
    NEW.created_by   := OLD.created_by;
    IF TG_TABLE_NAME = 'sites'   THEN NEW.client_id := OLD.client_id; END IF;
    IF TG_TABLE_NAME = 'devices' THEN NEW.site_id   := OLD.site_id;   END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_guard ON public.clients;
CREATE TRIGGER trg_clients_guard BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_non_admin_update();
DROP TRIGGER IF EXISTS trg_sites_guard ON public.sites;
CREATE TRIGGER trg_sites_guard BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.guard_non_admin_update();
DROP TRIGGER IF EXISTS trg_devices_guard ON public.devices;
CREATE TRIGGER trg_devices_guard BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.guard_non_admin_update();
