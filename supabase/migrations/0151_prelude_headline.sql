-- 0151 · PROPERTY PRELUDE v2 — titular editorial.
--
-- La apertura dejó de ser un párrafo suelto: ahora es una banda editorial con
-- titular propio a la izquierda y cuerpo a la derecha (EDITORIAL OPENING
-- SPREAD). El titular es contenido generado y validado como el cuerpo — no un
-- rótulo fijo — así que necesita su columna y su trazabilidad.
--
-- Nace vacío a propósito: los preludes de la v1 se regeneran con el contrato
-- v2 (años en cifra, dos párrafos, sin enumerar estancias). Hasta entonces el
-- renderer muestra la banda sin titular, que es una degradación honesta.
alter table property_story_versions
  add column if not exists prelude_headline text;
