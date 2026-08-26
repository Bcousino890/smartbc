-- ============================================================================
-- SmartBC · Dirección exacta escrita a mano para una visita
-- ============================================================================
-- La dirección que ve el cliente salía SIEMPRE de la ficha de la propiedad. El
-- caso real: el agente sabe el portal y el piso ("Calle de Montesa 14, 2º B")
-- pero la ficha trae la calle a medias, o nada. Entonces marcar "dirección
-- exacta" no servía de nada y el cliente se quedaba sin saber adónde ir.
--
-- ¿Por qué en la PARADA y no en la propiedad? Porque las propiedades se
-- sincronizan desde el portal (`last_synced_at`): escribir ahí la dirección
-- correcta duraría hasta la siguiente pasada del sincronizador. Y porque la
-- parada es justo la capa que ya decide qué ve este cliente en esta visita
-- —hora, estado, si se enseña la calle—, así que es donde encaja.
--
-- ⚠️ NO abre ninguna vía nueva de fuga: la dirección solo se proyecta cuando
-- `address_visibility = 'exact'`, y eso sigue estando atado a
-- `vs_exact_address_requires_confirmation` (solo confirmada o completada).
-- Cancelar una visita revierte la visibilidad y con ella deja de mostrarse,
-- esté escrita a mano o venga de la ficha.
--
-- El límite de 120 caracteres es el mismo que aplica `sanitizePublicAddress`
-- al proyectar. Se impone también aquí para que el agente reciba un error al
-- guardar en vez de que su texto se descarte en silencio y el cliente acabe
-- viendo la dirección vieja de la ficha.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP/ADD CONSTRAINT.
-- ============================================================================

ALTER TABLE viewing_stops
  ADD COLUMN IF NOT EXISTS exact_address_override text;

ALTER TABLE viewing_stops DROP CONSTRAINT IF EXISTS vs_address_override_len;
ALTER TABLE viewing_stops ADD CONSTRAINT vs_address_override_len
  CHECK (
    exact_address_override IS NULL
    OR char_length(btrim(exact_address_override)) BETWEEN 4 AND 120
  );

COMMENT ON COLUMN viewing_stops.exact_address_override IS
  'Dirección escrita por el agente para esta visita. Gana sobre properties.address al proyectar, y solo se muestra si address_visibility = ''exact''.';
