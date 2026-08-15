-- ============================================================================
-- SmartBC · RLS de Viewing Collections
-- ============================================================================
-- Modelo: RLS GRUESA (¿es staff?) + scoping fino en TypeScript, que es el
-- patrón ya usado en el resto del panel (ver el comentario de
-- lib/db/queries/clients.ts sobre el fallback con service role).
--
-- El scope own/team/all se aplica en las queries vía resolveViewScope() y
-- getAssignedClientIds(). Duplicarlo aquí crearía dos fuentes de verdad para
-- la misma regla de negocio, y la de SQL sería invisible desde
-- lib/permissions.ts.
--
-- La ruta pública /v/[token] NO pasa por estas policies: resuelve con service
-- role en servidor, porque el visitante no está autenticado.
--
-- Sin arrays de roles hardcodeados: is_staff() es la única fuente de verdad de
-- "quién entra al panel" y ya contempla captadora y los agent_*.
-- ============================================================================

ALTER TABLE client_property_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_itineraries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_stops              ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_collection_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_collection_opens   ENABLE ROW LEVEL SECURITY;

-- ── client_property_selections ──────────────────────────────────────────────
DROP POLICY IF EXISTS cps_staff_select ON client_property_selections;
CREATE POLICY cps_staff_select ON client_property_selections
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS cps_staff_write ON client_property_selections;
CREATE POLICY cps_staff_write ON client_property_selections
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- ── viewing_itineraries ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS vi_staff_select ON viewing_itineraries;
CREATE POLICY vi_staff_select ON viewing_itineraries
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS vi_staff_write ON viewing_itineraries;
CREATE POLICY vi_staff_write ON viewing_itineraries
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- ── viewing_stops ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS vs_staff_select ON viewing_stops;
CREATE POLICY vs_staff_select ON viewing_stops
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS vs_staff_write ON viewing_stops;
CREATE POLICY vs_staff_write ON viewing_stops
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- ── viewing_collection_shares ───────────────────────────────────────────────
-- Los tokens son secretos compartidos: el rol anon de PostgREST no puede
-- enumerarlos. Mismo criterio que property_shares.
DROP POLICY IF EXISTS vcs_staff_select ON viewing_collection_shares;
CREATE POLICY vcs_staff_select ON viewing_collection_shares
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS vcs_admin_write ON viewing_collection_shares;
CREATE POLICY vcs_admin_write ON viewing_collection_shares
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── viewing_collection_opens ────────────────────────────────────────────────
-- Solo lectura para staff. La escritura la hace el service role desde la ruta
-- pública, así que no necesita policy de insert (igual que
-- property_share_opens).
DROP POLICY IF EXISTS vco_staff_select ON viewing_collection_opens;
CREATE POLICY vco_staff_select ON viewing_collection_opens
  FOR SELECT USING (is_staff());
