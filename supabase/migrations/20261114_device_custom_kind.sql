-- =============================================================================
-- Vlastite vrste uređaja: kind = 'ostalo' + kind_label (npr. "Solarni kolektor").
-- Upisane vrste aplikacija nudi u izborniku kod sljedećih uređaja.
-- Preduvjet: 20261104 – 20261113 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS kind_label TEXT;

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_kind_label_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_kind_label_check
  CHECK (kind_label IS NULL OR (kind = 'ostalo' AND length(trim(kind_label)) BETWEEN 2 AND 60));
