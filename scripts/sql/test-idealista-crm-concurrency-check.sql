-- SOLO PRUEBAS LOCALES. Tras las dos sesiones: una ficha y una etiqueta por anuncio.
\set ON_ERROR_STOP 1
DO $$
BEGIN
  PERFORM test_util.ok((SELECT count(*) FROM idealista_crm_sync s JOIN idealista_listings l ON l.id = s.listing_id
                         WHERE l.reference_code LIKE 'BC-C%' AND s.status = 'synced') = 20, 'concurrencia: 20 de 20 sincronizadas');
  PERFORM test_util.ok((SELECT count(*) FROM properties p JOIN idealista_listings l ON p.external_id = 'idealista-api-' || l.id || '-production'
                         WHERE l.reference_code LIKE 'BC-C%') = 20, 'concurrencia: exactamente una ficha por anuncio');
  PERFORM test_util.ok((SELECT count(*) FROM property_tag_links t JOIN idealista_crm_sync s ON s.property_id = t.property_id
                          JOIN idealista_listings l ON l.id = s.listing_id WHERE l.reference_code LIKE 'BC-C%') = 20,
                       'concurrencia: una etiqueta por ficha');
END $$;
