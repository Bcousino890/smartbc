-- ============================================================================
-- SmartBC · PROPERTIES WORKSPACE — la propiedad conoce su propia demanda
-- ============================================================================
-- Foto de producción antes de esta migración: 1.335 propiedades, 687 visibles
-- en la web pública DE HECHO y 3 DE DERECHO (la web ignoraba `published_web`),
-- `property_prices` vacía, ningún historial de disponibilidad, y toda la
-- información de interés de cliente invisible desde la propiedad.
--
-- Esta migración añade las CUATRO piezas que faltaban, y nada más:
--
--   1 · el contrato de publicación se vuelve real (con backfill deliberado)
--   2 · historial de precio y de estado, desde ahora (sin inventar pasado)
--   3 · identidad analítica OPACA por propiedad (ni UUID ni slug)
--   4 · la vista de hechos con la que la bandeja pagina y filtra en servidor
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

-- ─── 1 · Contrato de publicación ────────────────────────────────────────────
--
-- A partir de este despliegue la web pública SÍ filtra por `published_web`.
-- Sin backfill, el catálogo público pasaría de 687 propiedades a 3 en el
-- momento del deploy: se tumba la web comercial de un plumazo.
--
-- Decisión deliberada: lo que hoy es visible DE HECHO pasa a estar publicado
-- DE DERECHO, una sola vez. Desde aquí, el interruptor manda y despublicar
-- funciona de verdad. (Guardado por un flag en app_settings para que el
-- backfill no se re-aplique en cada despliegue y "resucite" despublicadas.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_settings WHERE key = 'published_web_backfill_0143'
  ) THEN
    UPDATE properties
      SET published_web = true
      WHERE status IN ('available', 'reserved')
        AND archived_at IS NULL
        AND published_web = false;
    INSERT INTO app_settings (key, value)
      VALUES ('published_web_backfill_0143', jsonb_build_object('applied_at', now()));
  END IF;
END $$;

-- ─── 2 · Identidad analítica opaca ──────────────────────────────────────────
--
-- Los eventos del shortlist y del Private Book llevaban la POSICIÓN de la
-- residencia ({"order": 3}), que deja de significar nada en cuanto alguien
-- reordena. La proyección pública no puede exponer UUIDs (hay un test que lo
-- vigila), así que cada propiedad recibe un token aleatorio: opaco, estable y
-- sin relación matemática con su id.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS analytics_token text;

UPDATE properties
  SET analytics_token = encode(gen_random_bytes(9), 'hex')
  WHERE analytics_token IS NULL;

ALTER TABLE properties
  ALTER COLUMN analytics_token SET DEFAULT encode(gen_random_bytes(9), 'hex');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_analytics_token_key') THEN
    ALTER TABLE properties ALTER COLUMN analytics_token SET NOT NULL;
    ALTER TABLE properties ADD CONSTRAINT properties_analytics_token_key UNIQUE (analytics_token);
  END IF;
END $$;

-- ─── 3 · Tipo normalizado: el override del agente ───────────────────────────
--
-- `property_type` es del scraper (20 valores para ~8 conceptos: Piso/piso,
-- house, apartamento…) y el sincronizador puede reescribirlo. La normalización
-- es determinista y vive en código (lib/properties-workspace/normalize.ts);
-- esta columna guarda SOLO la corrección manual del agente, que gana siempre
-- y sobrevive a cualquier sincronización.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_type_override text;

-- ─── 4 · Historial de precio y de estado ────────────────────────────────────
--
-- Un TRIGGER, no código de aplicación: el precio lo cambian el editor Y el
-- sincronizador del scraper, y un historial que solo ve una de las dos manos
-- miente. El actor queda NULL cuando escribe el sistema; es una limitación
-- conocida y preferible a un historial incompleto.
--
-- No se inventa histórico anterior: el registro empieza hoy.

CREATE TABLE IF NOT EXISTS property_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  old_value   text,
  new_value   text,
  currency    text,
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ph_kind_valid CHECK (kind IN ('price', 'status', 'published_web'))
);

COMMENT ON TABLE property_history IS
  'Cambios de precio, estado y publicación web. Lo escribe un trigger para no perder los cambios del sincronizador. Empieza en la migración 0143: no hay histórico anterior.';

CREATE INDEX IF NOT EXISTS idx_property_history_prop
  ON property_history (property_id, created_at DESC);

CREATE OR REPLACE FUNCTION log_property_changes() RETURNS trigger AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO property_history (property_id, kind, old_value, new_value, currency)
      VALUES (NEW.id, 'price', OLD.price::text, NEW.price::text, NEW.currency);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO property_history (property_id, kind, old_value, new_value)
      VALUES (NEW.id, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.published_web IS DISTINCT FROM OLD.published_web THEN
    INSERT INTO property_history (property_id, kind, old_value, new_value)
      VALUES (NEW.id, 'published_web', OLD.published_web::text, NEW.published_web::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_history ON properties;
CREATE TRIGGER trg_property_history
  AFTER UPDATE OF price, status, published_web ON properties
  FOR EACH ROW EXECUTE FUNCTION log_property_changes();

-- ─── 5 · Índices para paginar y filtrar en servidor ─────────────────────────
--
-- El listado deja de descargar 4,3 MB y filtrar en el navegador. Estos son los
-- caminos que la bandeja recorre de verdad. Postgres NO indexa las FK solas:
-- los índices de las relaciones hijas evitan un scan por propiedad abierta.

CREATE INDEX IF NOT EXISTS idx_props_status_country ON properties (status, country);
CREATE INDEX IF NOT EXISTS idx_props_updated        ON properties (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_props_synced         ON properties (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_props_zone           ON properties (zone);
CREATE INDEX IF NOT EXISTS idx_props_agency         ON properties (agency_id);
CREATE INDEX IF NOT EXISTS idx_props_price          ON properties (price);
CREATE INDEX IF NOT EXISTS idx_props_published      ON properties (published_web) WHERE published_web = true;

CREATE INDEX IF NOT EXISTS idx_photos_property      ON property_photos (property_id);
CREATE INDEX IF NOT EXISTS idx_media_property       ON property_media (property_id, type);
CREATE INDEX IF NOT EXISTS idx_selections_property  ON client_property_selections (property_id);
CREATE INDEX IF NOT EXISTS idx_shortitems_property  ON client_shortlist_items (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_property      ON visit_requests (property_id);
CREATE INDEX IF NOT EXISTS idx_apps_property        ON property_applications (property_id);
CREATE INDEX IF NOT EXISTS idx_shares_property      ON property_shares (property_id);
CREATE INDEX IF NOT EXISTS idx_share_opens_share    ON property_share_opens (share_id, opened_at DESC);

-- ─── 6 · La vista de hechos ─────────────────────────────────────────────────
--
-- Igual que `lead_inbox_facts` en la Sales Inbox: los agregados que la lista
-- necesita para filtrar y ordenar EN SQL, sin traerse 16.549 filas de foto.
-- Solo cuenta; el detalle se pide al abrir la propiedad. El Health se deriva
-- en TypeScript sobre estos hechos (lib/properties-workspace/derive.ts) — la
-- vista no opina, solo mide.

CREATE OR REPLACE VIEW property_workspace_facts AS
WITH photos AS (
  SELECT property_id, count(*) AS photo_count
  FROM property_photos GROUP BY property_id
),
media AS (
  SELECT property_id,
    count(*) FILTER (WHERE type = 'video') AS video_count,
    count(*) FILTER (WHERE type = 'plan')  AS plan_count
  FROM property_media GROUP BY property_id
),
sel AS (
  SELECT property_id,
    count(*)                                          AS selection_count,
    count(DISTINCT client_id)                         AS selection_clients
  FROM client_property_selections
  WHERE status <> 'discarded'
  GROUP BY property_id
),
shortl AS (
  SELECT i.property_id,
    count(*)                                          AS shortlist_count,
    count(*) FILTER (WHERE i.decision = 'must_visit') AS must_visit_count,
    min(i.rank) FILTER (WHERE i.decision = 'must_visit') AS best_rank
  FROM client_shortlist_items i
  JOIN client_shortlists s ON s.id = i.shortlist_id
  WHERE i.property_id IS NOT NULL AND s.status <> 'archived'
  GROUP BY i.property_id
),
stops AS (
  SELECT cps.property_id,
    count(*) FILTER (
      WHERE it.status IN ('draft', 'published')
        AND COALESCE(st.scheduled_at, it.scheduled_date::timestamptz) >= now() - interval '12 hours'
    ) AS upcoming_stops,
    min(COALESCE(st.scheduled_at, it.scheduled_date::timestamptz)) FILTER (
      WHERE it.status IN ('draft', 'published')
        AND COALESCE(st.scheduled_at, it.scheduled_date::timestamptz) >= now() - interval '12 hours'
    ) AS next_stop_at
  FROM viewing_stops st
  JOIN client_property_selections cps ON cps.id = st.selection_id
  JOIN viewing_itineraries it ON it.id = st.itinerary_id
  GROUP BY cps.property_id
),
apps AS (
  SELECT property_id, count(*) AS application_count
  FROM property_applications GROUP BY property_id
),
shares AS (
  SELECT s.property_id,
    count(DISTINCT s.id)  AS share_count,
    count(o.id)           AS share_opens,
    max(o.opened_at)      AS last_opened_at
  FROM property_shares s
  LEFT JOIN property_share_opens o ON o.share_id = s.id
  GROUP BY s.property_id
),
visits AS (
  SELECT property_id,
    count(*) FILTER (WHERE status = 'pending') AS pending_visit_requests
  FROM visit_requests GROUP BY property_id
)
SELECT
  p.id,
  p.slug,
  p.title,
  p.zone,
  p.subzone,
  p.address,
  p.bc_reference,
  p.property_reference,
  p.external_id,
  p.operation,
  p.price,
  p.currency,
  p.bedrooms,
  p.bathrooms,
  p.square_meters,
  p.property_type,
  p.property_type_override,
  p.status,
  p.published_web,
  p.country,
  p.agency_id,
  p.source,
  p.source_url,
  p.cover_photo_url,
  p.latitude,
  p.longitude,
  p.description,
  p.archived_at,
  p.last_synced_at,
  p.created_at,
  p.updated_at,
  p.analytics_token,

  COALESCE(ph.photo_count, 0)       AS photo_count,
  COALESCE(m.video_count, 0)        AS video_count,
  COALESCE(m.plan_count, 0)         AS plan_count,
  COALESCE(sel.selection_count, 0)  AS selection_count,
  COALESCE(sel.selection_clients, 0) AS selection_clients,
  COALESCE(sh.shortlist_count, 0)   AS shortlist_count,
  COALESCE(sh.must_visit_count, 0)  AS must_visit_count,
  sh.best_rank                      AS best_rank,
  COALESCE(st.upcoming_stops, 0)    AS upcoming_stops,
  st.next_stop_at                   AS next_stop_at,
  COALESCE(a.application_count, 0)  AS application_count,
  COALESCE(sr.share_count, 0)       AS share_count,
  COALESCE(sr.share_opens, 0)       AS share_opens,
  sr.last_opened_at                 AS share_last_opened_at,
  COALESCE(v.pending_visit_requests, 0) AS pending_visit_requests,

  -- La demanda total, deduplicada por señal (no por cliente: eso lo hace la
  -- capa de detalle, que sí sabe qué cliente hay detrás de cada fila).
  (COALESCE(sel.selection_count, 0) + COALESCE(sh.shortlist_count, 0)
   + COALESCE(a.application_count, 0) + COALESCE(v.pending_visit_requests, 0)) AS interest_signals
FROM properties p
LEFT JOIN photos  ph ON ph.property_id = p.id
LEFT JOIN media   m  ON m.property_id = p.id
LEFT JOIN sel        ON sel.property_id = p.id
LEFT JOIN shortl sh  ON sh.property_id = p.id
LEFT JOIN stops  st  ON st.property_id = p.id
LEFT JOIN apps   a   ON a.property_id = p.id
LEFT JOIN shares sr  ON sr.property_id = p.id
LEFT JOIN visits v   ON v.property_id = p.id;

COMMENT ON VIEW property_workspace_facts IS
  'Hechos agregados por propiedad para el Properties Workspace: media, interés de cliente, visitas, SmartLinks. El Health se deriva en lib/properties-workspace/derive.ts sobre estos hechos.';
