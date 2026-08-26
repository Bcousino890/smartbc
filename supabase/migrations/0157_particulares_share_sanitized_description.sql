-- SmartBC · Descripción limpiada por IA en los enlaces temporales de particulares
-- ============================================================
-- particulares_share_links (migración 0149) publica un particular fuera del
-- equipo. Hasta ahora reproducía la descripción TAL CUAL, con lo que suele
-- traer el propio anuncio: teléfono, "particular, sin agencias", avisos de
-- traducción automática del portal de origen... nada de eso debería llegar
-- a quien recibe el enlace.
--
-- sanitized_description se rellena UNA VEZ al crear el enlace
-- (createParticularShareLink → sanitizeParticularDescriptionForSharing en
-- lib/services/particulares/sanitize-description.ts) y queda fija durante
-- los 7 días de vida del enlace — no se recalcula en cada visita.
--
-- NULL en enlaces creados antes de esta migración: getParticularByShareToken
-- cae a la descripción cruda para esos (se sabe: son enlaces de 7 días,
-- expiran solos, no hace falta backfill).

alter table particulares_share_links
  add column if not exists sanitized_description text;
