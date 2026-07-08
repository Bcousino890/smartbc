-- Datos de la corredora y código de referencia del aviso scrapeado.
-- El código (ej: EB-VX1848) identifica la propiedad en la corredora de origen
-- y permite hacer seguimiento del aviso (histórico de subidas/bajadas).

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS broker_name TEXT;
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS external_reference TEXT;

COMMENT ON COLUMN captaciones.broker_name IS 'Nombre de la corredora del aviso original (ej: Home Hunters)';
COMMENT ON COLUMN captaciones.external_reference IS 'Código de la propiedad en la corredora de origen (ej: EB-VX1848)';

CREATE INDEX IF NOT EXISTS idx_captaciones_external_reference
  ON captaciones(external_reference) WHERE external_reference IS NOT NULL;

-- Fuerza a PostgREST a recargar la caché de esquema para que vea las columnas.
NOTIFY pgrst, 'reload schema';
