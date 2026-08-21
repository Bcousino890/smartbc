-- 0150 · PROPERTY PRELUDE — apertura editorial de la vivienda.
--
-- El Prelude vive en columnas propias de la versión, FUERA de los bloques y
-- de sus gates: así puede editarse, aprobarse o regenerarse sin tocar la
-- Property Story ni disparar los invariantes de capítulos. `overview` queda
-- como capa de evidencia/admin; el prelude es la presentación editorial
-- pública (solo se muestra con prelude_status='approved').
--
-- prelude_evidence guarda los ids de los claims usados y el modelo: cada
-- afirmación material es rastreable hasta su evidencia.
alter table property_story_versions
  add column if not exists prelude text,
  add column if not exists prelude_status text
    check (prelude_status is null or prelude_status in ('generated','approved','rejected')),
  add column if not exists prelude_evidence jsonb,
  add column if not exists prelude_generated_at timestamptz;
