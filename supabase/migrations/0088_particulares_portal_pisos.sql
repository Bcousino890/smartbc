-- Permitir nuevas fuentes cross-portal en particulares.portal.
-- El CHECK original (0012) solo aceptaba 'idealista','fotocasa','kelify', así que
-- los inserts de pisos.com (portal='pisos') fallaban silenciosamente por
-- violación del constraint → el scraping de pisos.com no persistía nada.
-- Ampliamos la lista de portales permitidos.

ALTER TABLE particulares DROP CONSTRAINT IF EXISTS particulares_portal_check;

ALTER TABLE particulares
  ADD CONSTRAINT particulares_portal_check
  CHECK (portal IN ('idealista', 'fotocasa', 'kelify', 'pisos', 'habitaclia', 'milanuncios', 'yaencontre'));
