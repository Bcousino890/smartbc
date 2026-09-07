-- SmartBC · Características traducidas en los enlaces temporales de particulares
-- ============================================================
-- Mismo patrón que sanitized_description (migración 0157): particulares.features
-- guarda las etiquetas TAL CUAL las devolvió el portal de origen — y, sin la
-- cabecera Accept-Language añadida en lib/sync/import-by-link/fetch-html.ts
-- (2026-09-07), Idealista a veces las generó en inglés según la IP del proxy
-- residencial que tocó ese scrape, sin relación con el idioma del anunciante.
--
-- sanitized_features se rellena UNA VEZ al crear el enlace
-- (createParticularShareLink → translateParticularFeaturesForSharing en
-- lib/services/particulares/sanitize-description.ts) y queda fija durante
-- los 7 días de vida del enlace — no se recalcula en cada visita.
--
-- NULL en enlaces creados antes de esta migración: getParticularByShareToken
-- las traduce al vuelo en la primera visita (mismo `sanitizeIfMissing` que ya
-- usa para sanitized_description) y las persiste aquí.

alter table particulares_share_links
  add column if not exists sanitized_features jsonb;
