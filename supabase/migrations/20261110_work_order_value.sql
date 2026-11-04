-- =============================================================================
-- Vrijednost posla: dogovorena cijena na nalogu i ukupni sati po nalogu
-- (za izračun €/h na stranici "Sati i vrijednost").
-- Preduvjet: 20261109_work_orders.sql. Pokrenuti jednom u Supabase SQL editoru.
-- Skripta je idempotentna.
-- =============================================================================

-- ── Cijena naloga (€, prazno = nije upisana) ─────────────────────────────────
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_price_check') THEN
    ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_price_check CHECK (price IS NULL OR price >= 0);
  END IF;
END $$;

-- ── Ukupno upisanih sati po nalogu (svi unosi, bez obzira na razdoblje) ─────
-- €/h naloga = price / total_hours; vrijednost u razdoblju = sati u razdoblju × €/h,
-- pa nalog koji traje kroz dva mjeseca ne broji cijenu dvaput.
CREATE OR REPLACE VIEW public.work_order_hours WITH (security_invoker = on) AS
SELECT a.work_order_id, SUM(l.hours_worked)::numeric AS total_hours
  FROM public.work_logs l
  JOIN public.work_order_assignments a ON a.id = l.assignment_id
 GROUP BY a.work_order_id;

GRANT SELECT ON public.work_order_hours TO authenticated;

-- ── save_work_order: sprema i cijenu ─────────────────────────────────────────
-- p_order: { id?, site_id, kind, title, notes, estimate_hours, service_case_id?, price? }
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
    INSERT INTO public.work_orders (site_id, kind, title, notes, estimate_hours, service_case_id, price)
    VALUES (NULLIF(p_order->>'site_id','')::uuid, COALESCE(p_order->>'kind','servis'), trim(p_order->>'title'),
            NULLIF(trim(COALESCE(p_order->>'notes','')),''), COALESCE((p_order->>'estimate_hours')::numeric, 2),
            NULLIF(p_order->>'service_case_id','')::uuid, NULLIF(p_order->>'price','')::numeric)
    RETURNING id INTO oid;
  ELSE
    UPDATE public.work_orders SET
      site_id = NULLIF(p_order->>'site_id','')::uuid,
      kind = COALESCE(p_order->>'kind', kind),
      title = trim(p_order->>'title'),
      notes = NULLIF(trim(COALESCE(p_order->>'notes','')),''),
      estimate_hours = COALESCE((p_order->>'estimate_hours')::numeric, estimate_hours),
      price = CASE WHEN p_order ? 'price' THEN NULLIF(p_order->>'price','')::numeric ELSE price END
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

GRANT EXECUTE ON FUNCTION public.save_work_order(JSONB, JSONB, UUID[]) TO authenticated;
