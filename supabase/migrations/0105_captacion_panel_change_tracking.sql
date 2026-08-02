-- ============================================================================
-- SmartBC · Marca de "último cambio hecho por una persona"
-- ============================================================================
-- El integrador "crm chile" quiere cerrar el círculo: hoy nos mandan el
-- inmueble y los contactos, pero lo que pasa después —que el equipo mueva la
-- etapa, confirme al propietario o corrija un teléfono— se queda aquí, y ellos
-- siguen trabajando captaciones que ya rechazamos.
--
-- La vía natural es que sondeen GET /api/v1/captaciones?updated_since=…, que ya
-- existe. Pero detectaron el problema de fondo antes de montarlo, y tenían
-- razón: `captaciones` NO tiene trigger de updated_at, se escribe a mano en
-- cada ruta, y lo tocan tanto las del panel como las de la API. Sondeando
-- updated_at, cada push suyo les volvería como "cambio en SmartBC", lo
-- reflejarían, eso ensuciaría la captación, la reenviarían… ping-pong.
--
-- `updated_by_user_at` avanza SOLO cuando el cambio lo hace una persona desde
-- el panel. Nunca lo tocan las rutas de /api/v1 ni el reparto automático. Con
-- eso, ?changed_by=panel les devuelve el trabajo del equipo y nunca el eco del
-- suyo.
--
-- Se deja NULL en las filas existentes a propósito: significa "nadie ha tocado
-- esto a mano desde que existe la marca", que es exactamente lo que queremos
-- decir. Un sondeo con changed_by=panel no las devuelve, y así el integrador no
-- recibe de golpe todo el histórico la primera vez que consulta.
-- ============================================================================

ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS updated_by_user_at TIMESTAMP WITH TIME ZONE;

-- El sondeo filtra por esta columna y ordena por ella; el índice parcial deja
-- fuera las filas que nunca ha tocado una persona, que son la mayoría.
CREATE INDEX IF NOT EXISTS idx_captaciones_updated_by_user_at
  ON captaciones (updated_by_user_at DESC)
  WHERE updated_by_user_at IS NOT NULL;

COMMENT ON COLUMN captaciones.updated_by_user_at IS 'Último cambio hecho por una persona desde el panel. No lo tocan las rutas de /api/v1 ni el reparto automático: es lo que permite a una integración distinguir el trabajo del equipo del eco de sus propios envíos.';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
