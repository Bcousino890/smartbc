-- ============================================================
-- SmartBC · Vigilancia de enlaces de portal (Idealista) de las propiedades importadas por link
-- ============================================================
-- Si el anuncio de Idealista del que sale una propiedad importada (source_url) se da de baja, la propiedad se
-- archiva sola; si el anuncio reaparece, se vuelve a mostrar. Quien comprueba el enlace es el crawler
-- (/opt/idealista, comando `link-watch`, abre la ficha por Crawio); esta migración pone el sitio donde guardar el
-- veredicto y la ÚNICA función que decide qué hacer con él:
--
--   apply_portal_link_verdict(property_id, 'live' | 'gone', ...)
--
-- Reglas (todas aquí, para que el crawler no pueda saltárselas):
--   · Solo se archiva una propiedad en estado 'available'. Reservada o vendida solo anota el veredicto
--     (Idealista suele retirar el anuncio justo al vender y no se pisa ese estado).
--   · Una baja necesita DOS veredictos 'gone' seguidos separados al menos p_min_gap (6 h). El primero deja la
--     propiedad en 'gone_pending'. Un 404 pasajero no archiva (ya pasó con el cron antiguo: BC-1191 y BC-1248
--     se archivaron 10-16 días antes de la baja real). p_prior_gone = true da el primero por hecho (lo usa la
--     primera pasada: el crawler ya la tenía como OFF_MARKET).
--   · Lo archivado aquí queda marcado (archived_reason = 'portal_down'). Solo eso se desarchiva cuando el anuncio
--     vuelve. Lo archivado a mano (archived_reason NULL) NO se toca nunca.
--   · Un veredicto 'live' borra cualquier baja pendiente.
--
-- Archivar = lo mismo que ya hacen el cron de sync y check-bajas: archived_at = now() y status = 'archived'.
-- trg_property_history anota el cambio de estado, así que queda rastro en property_history.
--
-- Solo la ejecuta el service_role (el crawler); anon y authenticated NO pueden llamarla.
-- El runner (scripts/apply-migrations.sh) no envuelve el fichero en transacción. Idempotente. NO añadas BEGIN/COMMIT.
-- ============================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_reason          text,
  ADD COLUMN IF NOT EXISTS archived_auto_at         timestamptz,
  ADD COLUMN IF NOT EXISTS portal_link_state        text,
  ADD COLUMN IF NOT EXISTS portal_link_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS portal_link_first_gone_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_link_gone_at      timestamptz;

COMMENT ON COLUMN public.properties.archived_reason IS
  'Por qué está archivada: ''portal_down'' = la archivó el vigilante de enlaces (se desarchiva sola si el anuncio vuelve); NULL = a mano o por otro proceso (no se toca).';
COMMENT ON COLUMN public.properties.archived_auto_at IS 'Cuándo la archivó el vigilante de enlaces.';
COMMENT ON COLUMN public.properties.portal_link_state IS
  'Último veredicto del anuncio de origen: live | gone_pending (una baja sin confirmar) | gone. NULL = sin comprobar.';
COMMENT ON COLUMN public.properties.portal_link_checked_at IS 'Última vez que se comprobó el anuncio de origen.';
COMMENT ON COLUMN public.properties.portal_link_first_gone_at IS 'Primer veredicto «caído» de la racha actual (se borra al volver a verlo vivo).';
COMMENT ON COLUMN public.properties.portal_link_gone_at IS 'Fecha de baja que da el propio portal, si la da.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_portal_link_state_chk') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_portal_link_state_chk
      CHECK (portal_link_state IS NULL OR portal_link_state IN ('live', 'gone_pending', 'gone'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_archived_reason_chk') THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_archived_reason_chk
      CHECK (archived_reason IS NULL OR archived_reason IN ('portal_down'));
  END IF;
END $$;

-- Cola de comprobación del vigilante: las propiedades con enlace de Idealista, por antigüedad de la última
-- comprobación. Parcial: solo las filas con enlace de Idealista (unas cientos de ≈ miles).
CREATE INDEX IF NOT EXISTS properties_idealista_link_idx
  ON public.properties (portal_link_checked_at NULLS FIRST)
  WHERE source_url ILIKE '%idealista.com%';

CREATE OR REPLACE FUNCTION public.apply_portal_link_verdict(
  p_property_id uuid,
  p_verdict     text,
  p_gone_at     timestamptz DEFAULT NULL,
  p_prior_gone  boolean     DEFAULT false,
  p_min_gap     interval    DEFAULT interval '6 hours'
) RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  p     public.properties%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_first timestamptz;
BEGIN
  IF p_verdict NOT IN ('live', 'gone') THEN
    RAISE EXCEPTION 'apply_portal_link_verdict: veredicto no válido: %', p_verdict;
  END IF;

  SELECT * INTO p FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- ---------------------------------------------------------------- el anuncio está vivo
  IF p_verdict = 'live' THEN
    IF p.archived_reason = 'portal_down' AND (p.archived_at IS NOT NULL OR p.status = 'archived') THEN
      UPDATE public.properties
         SET archived_at = NULL,
             archived_reason = NULL,
             archived_auto_at = NULL,
             status = 'available',
             portal_link_state = 'live',
             portal_link_checked_at = v_now,
             portal_link_first_gone_at = NULL,
             portal_link_gone_at = NULL
       WHERE id = p.id;
      RETURN 'restored';
    END IF;
    UPDATE public.properties
       SET portal_link_state = 'live',
           portal_link_checked_at = v_now,
           portal_link_first_gone_at = NULL,
           portal_link_gone_at = NULL,
           -- archived_reason sin archivo no tiene sentido (p. ej. la reactivó una reimportación)
           archived_reason = CASE WHEN archived_at IS NULL AND status <> 'archived' THEN NULL ELSE archived_reason END
     WHERE id = p.id;
    RETURN 'live';
  END IF;

  -- ---------------------------------------------------------------- el anuncio está caído
  -- Ya archivada (por el vigilante o a mano): solo se anota el veredicto; no se cambia quién la archivó.
  IF p.archived_at IS NOT NULL OR p.status = 'archived' THEN
    UPDATE public.properties
       SET portal_link_state = 'gone',
           portal_link_checked_at = v_now,
           portal_link_first_gone_at = COALESCE(p.portal_link_first_gone_at, v_now),
           portal_link_gone_at = COALESCE(p_gone_at, p.portal_link_gone_at)
     WHERE id = p.id;
    RETURN 'already_archived';
  END IF;

  -- Reservada o vendida: no se archiva.
  IF p.status <> 'available' THEN
    UPDATE public.properties
       SET portal_link_state = 'gone',
           portal_link_checked_at = v_now,
           portal_link_gone_at = COALESCE(p_gone_at, p.portal_link_gone_at)
     WHERE id = p.id;
    RETURN 'skipped_status';
  END IF;

  v_first := COALESCE(p.portal_link_first_gone_at,
                      CASE WHEN p_prior_gone THEN v_now - p_min_gap ELSE NULL END);

  IF v_first IS NULL THEN
    UPDATE public.properties
       SET portal_link_state = 'gone_pending',
           portal_link_checked_at = v_now,
           portal_link_first_gone_at = v_now,
           portal_link_gone_at = COALESCE(p_gone_at, p.portal_link_gone_at)
     WHERE id = p.id;
    RETURN 'pending';
  END IF;

  IF v_now - v_first >= p_min_gap THEN
    UPDATE public.properties
       SET archived_at = v_now,
           status = 'archived',
           archived_reason = 'portal_down',
           archived_auto_at = v_now,
           portal_link_state = 'gone',
           portal_link_checked_at = v_now,
           portal_link_first_gone_at = v_first,
           portal_link_gone_at = COALESCE(p_gone_at, p.portal_link_gone_at)
     WHERE id = p.id;
    RETURN 'archived';
  END IF;

  UPDATE public.properties
     SET portal_link_state = 'gone_pending',
         portal_link_checked_at = v_now,
         portal_link_first_gone_at = v_first,
         portal_link_gone_at = COALESCE(p_gone_at, p.portal_link_gone_at)
   WHERE id = p.id;
  RETURN 'pending';
END;
$$;

COMMENT ON FUNCTION public.apply_portal_link_verdict(uuid, text, timestamptz, boolean, interval) IS
  'Aplica el veredicto del vigilante de enlaces: archiva (tras 2 bajas seguidas) o desarchiva SOLO lo archivado por el propio vigilante. Solo service_role.';

-- Nadie salvo el service_role (el crawler) puede archivar propiedades a golpe de RPC.
REVOKE ALL ON FUNCTION public.apply_portal_link_verdict(uuid, text, timestamptz, boolean, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_portal_link_verdict(uuid, text, timestamptz, boolean, interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_portal_link_verdict(uuid, text, timestamptz, boolean, interval) TO service_role;
