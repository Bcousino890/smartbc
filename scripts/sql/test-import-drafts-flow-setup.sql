-- SOLO PRUEBAS LOCALES (BCP-01 P5). Datos para scripts/test-import-drafts-flow.mts.
\set ON_ERROR_STOP 1
INSERT INTO agencies (id, name, slug) VALUES
  ('b5000000-0000-0000-0000-0000000000a1', 'Portales externos', 'portales-externos'),
  ('b5000000-0000-0000-0000-0000000000a2', 'Level', 'level'),
  ('b5000000-0000-0000-0000-0000000000a3', 'Agencia sin feed', 'otra-agencia')
ON CONFLICT DO NOTHING;
INSERT INTO agency_feeds (agency_id) VALUES ('b5000000-0000-0000-0000-0000000000a2') ON CONFLICT DO NOTHING;
-- Una ficha ya existente: mismo enlace que el anuncio del test (duplicado «cierto»).
INSERT INTO properties (id, slug, title, status, country, zone, operation, price, bedrooms, square_meters, source_url, external_id, agency_id)
VALUES ('c5000000-0000-0000-0000-000000000001', 'ya-existe', 'Piso que ya existe', 'available', 'es', 'Salamanca', 'rent', 2900, 2, 85,
        'https://www.portal-sintetico.test/anuncio/777/', 'ext-777', 'b5000000-0000-0000-0000-0000000000a1');
SET ROLE service_role;
SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Catálogo del dueño', NULL) AS cat \gset
SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Automático antiguo', NULL) AS cat_auto \gset
SELECT catalog_set_mode('00000000-0000-0000-0000-0000000000f1', :'cat_auto', 'auto', NULL);
RESET ROLE;
