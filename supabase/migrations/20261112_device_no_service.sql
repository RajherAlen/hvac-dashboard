-- =============================================================================
-- Uređaj koji ne treba servis: service_interval_months = 0.
-- Takav uređaj nema rok sljedećeg servisa (next_service_due = NULL) pa ne ulazi
-- u servisne slučajeve ni u listu "Servisi u idućih 30 dana".
-- Preduvjet: 20261104 – 20261111 (redom). Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_service_interval_months_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_service_interval_months_check
  CHECK (service_interval_months BETWEEN 0 AND 120);

CREATE OR REPLACE VIEW public.device_service_status WITH (security_invoker = true) AS
SELECT d.id AS device_id,
       last.last_service_date,
       CASE WHEN d.service_interval_months > 0 THEN
         (COALESCE(last.last_service_date, d.install_date) + make_interval(months => d.service_interval_months))::date
       END AS next_service_due
FROM public.devices d
LEFT JOIN LATERAL (
  SELECT max(w.log_date) AS last_service_date
  FROM public.work_log_devices wd JOIN public.work_logs w ON w.id = wd.work_log_id
  WHERE wd.device_id = d.id AND wd.is_service
) last ON true;

GRANT SELECT ON public.device_service_status TO authenticated;
