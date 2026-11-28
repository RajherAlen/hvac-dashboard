-- =============================================================================
-- Trajno brisanje arhiviranog klijenta (admin), s popisa "Arhiva" na stranici Klijenti.
-- Briše klijenta, njegove objekte i uređaje te servisne slučajeve tih objekata.
-- Unosi rada ostaju (adresa je zapisana u work_logs.location), samo se odvajaju od objekta.
-- Obavljeni/otkazani nalozi ostaju; u bilješku im se upisuje kojem su klijentu pripadali.
-- Klijent s otvorenim nalogom ne može se obrisati.
-- Preduvjet: 20261104 – 20261116 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_client(p_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; n_open INT; n_sites INT; n_devices INT;
BEGIN
  IF NOT public.is_admin() THEN RETURN json_build_object('error', 'Nemate ovlasti za ovu radnju.'); END IF;

  SELECT * INTO c FROM public.clients WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Klijent nije pronađen.'); END IF;
  IF c.archived_at IS NULL THEN RETURN json_build_object('error', 'Obrisati se može samo arhivirani klijent.'); END IF;

  SELECT count(*) INTO n_open FROM public.work_orders o
    JOIN public.sites s ON s.id = o.site_id
   WHERE s.client_id = p_id AND o.status = 'open';
  IF n_open > 0 THEN
    RETURN json_build_object('error', format('Klijent ima %s otvoren(ih) nalog(a). Zatvorite ili otkažite naloge pa pokušajte ponovno.', n_open));
  END IF;

  -- Zatvoreni nalozi ostaju u povijesti s oznakom klijenta
  UPDATE public.work_orders o
     SET notes = concat_ws(E'\n', NULLIF(o.notes, ''),
                   format('Obrisani klijent: %s – %s', c.name, concat_ws(', ', s.address, s.city)))
    FROM public.sites s
   WHERE s.id = o.site_id AND s.client_id = p_id;

  SELECT count(*) INTO n_sites FROM public.sites WHERE client_id = p_id;
  SELECT count(*) INTO n_devices FROM public.devices d JOIN public.sites s ON s.id = d.site_id WHERE s.client_id = p_id;

  DELETE FROM public.devices WHERE site_id IN (SELECT id FROM public.sites WHERE client_id = p_id);
  DELETE FROM public.sites   WHERE client_id = p_id;
  DELETE FROM public.clients WHERE id = p_id;

  RETURN json_build_object('success', true, 'sites', n_sites, 'devices', n_devices);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client(UUID) TO authenticated;
