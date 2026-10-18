-- ============================================================================
-- Reversión de 0213 (BCP-01 P4: conversión de automáticos con vista previa).
-- Borra las dos funciones. El registro catalog_conversions SE CONSERVA a
-- propósito: es lo que permite deshacer una conversión ya hecha
-- (undo-conversion-0213.sql) incluso después de revertir. No cambia ningún
-- catálogo: los ya convertidos siguen en selección fija.
-- Se revierte junto con el build anterior a P4. La ejecuta una persona.
-- ============================================================================
BEGIN;
DROP FUNCTION IF EXISTS catalog_convert_explicit(uuid, uuid, bigint, uuid[]);
DROP FUNCTION IF EXISTS catalog_conversion_preview(uuid, uuid);
COMMIT;
