-- =============================================================================
-- Popis vozila za odabir u ekipi ("+ Dodaj vozilo").
-- Ekipa i dalje sprema naziv vozila (crews.vehicle); ova tablica je samo popis ponude.
-- Postojeća vozila iz ekipa prenose se u popis.
-- Preduvjet: 20261104 – 20261114 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_name_key ON public.vehicles (lower(trim(name)));

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicles_select ON public.vehicles;
DROP POLICY IF EXISTS vehicles_write  ON public.vehicles;
CREATE POLICY vehicles_select ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY vehicles_write  ON public.vehicles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;

INSERT INTO public.vehicles (name)
SELECT DISTINCT ON (lower(trim(vehicle))) trim(vehicle)
FROM public.crews
WHERE vehicle IS NOT NULL AND length(trim(vehicle)) >= 2
ON CONFLICT DO NOTHING;
