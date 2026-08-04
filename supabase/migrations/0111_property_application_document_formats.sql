-- ============================================================
-- SmartBC · Ampliar formatos aceptados en documentación de solicitudes
-- ============================================================
-- Varios tipos de documento (contrato de trabajo, nóminas, extractos
-- bancarios, pre-aprobación hipotecaria...) solo aceptaban PDF
-- (accepted_formats = ["pdf"]), así que una foto del móvil de una nómina
-- o un contrato quedaba rechazada por /api/property-applications/documents/
-- upload aunque el documento fuera perfectamente válido. Se amplía a los
-- formatos de imagen habituales de cámara/escáner de móvil, incluyendo
-- HEIC/HEIF (iPhone) y WEBP — el mismo set que ya acepta la subida con
-- detección automática (ver AUTO_ACCEPTED_EXT en
-- app/api/property-applications/documents/auto-upload/route.ts).
-- ============================================================

update property_application_document_types
set accepted_formats = '["pdf","jpg","jpeg","png","webp","heic","heif"]'::jsonb
where accepted_formats is distinct from '["pdf","jpg","jpeg","png","webp","heic","heif"]'::jsonb;
