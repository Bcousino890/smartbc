-- ============================================================================
-- SmartBC · Enlaces de portales — valoración y orden de prioridad
-- ============================================================================
-- Dos cosas que faltaban al ver diez pisos con el cliente delante:
--
--   rating   · cuánto le gusta AL CLIENTE (0 = sin valorar, 1..5 estrellas).
--              Es su opinión, no la nuestra: por eso no se mezcla con `status`,
--              que cuenta cómo va la llamada. Un piso puede gustarle 5 y estar
--              descartado porque no aceptan 11 meses.
--
--   position · el orden en el que se trabajan. Enteros espaciados de 100 en
--              100, el mismo esquema que `viewing_stops`: deja hueco para
--              insertar entre dos vecinos sin renumerar la lista entera.
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

ALTER TABLE client_portal_links
  ADD COLUMN IF NOT EXISTS rating   smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_portal_links'::regclass
      AND conname = 'cpl_rating_range'
  ) THEN
    ALTER TABLE client_portal_links
      ADD CONSTRAINT cpl_rating_range CHECK (rating BETWEEN 0 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_portal_links'::regclass
      AND conname = 'cpl_position_positive'
  ) THEN
    ALTER TABLE client_portal_links
      ADD CONSTRAINT cpl_position_positive CHECK (position IS NULL OR position > 0);
  END IF;
END $$;

-- Backfill: los enlaces que ya existían reciben posición por antigüedad
-- (el más viejo arriba), y así los que lleguen después se añaden al final de
-- la cola de forma natural. `id` desempata porque un envío de la extensión
-- inserta decenas de filas con el mismo created_at.
WITH ordenados AS (
  SELECT id,
         row_number() OVER (PARTITION BY client_id ORDER BY created_at, id) * 100 AS pos
  FROM client_portal_links
  WHERE position IS NULL
)
UPDATE client_portal_links l
SET position = o.pos
FROM ordenados o
WHERE l.id = o.id;

CREATE INDEX IF NOT EXISTS idx_cpl_client_position
  ON client_portal_links(client_id, position);

-- ── Reordenar en una sola ida y vuelta ──────────────────────────────────────
-- El panel manda el orden COMPLETO de la lista tras arrastrar y aquí se
-- reescriben las posiciones de golpe. Frente al cálculo del punto medio entre
-- vecinos, esto no tiene el caso borde de "no queda hueco" — y con decenas de
-- enlaces por cliente el coste es irrelevante.
--
-- El filtro por client_id NO es decorativo: aunque la autorización ya se hizo
-- en la server action, impide que una lista de ids manipulada mueva enlaces de
-- la ficha de otro cliente.
CREATE OR REPLACE FUNCTION reorder_client_portal_links(
  p_client_id uuid,
  p_ids       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE client_portal_links l
  SET position = t.ord * 100
  FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
  WHERE l.id = t.id
    AND l.client_id = p_client_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END $$;
