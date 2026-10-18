-- SOLO PRUEBAS LOCALES (BCP-01 P5). Un borrador listo para confirmar.
\set ON_ERROR_STOP 1
SET ROLE service_role;
INSERT INTO property_import_drafts (created_by, source_kind, request_key, agency_id)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'pdf', 'req-concurrent', 'b5000000-0000-0000-0000-0000000000a1');
