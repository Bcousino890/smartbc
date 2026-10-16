-- ============================================================
-- SmartBC · Origen de las fotos de una propiedad (fotos limpias de la web de la agencia)
-- ============================================================
-- El job de enlazado (lib/particulares/web-photos.ts) reemplaza solo las fotos con marca de agua de una
-- propiedad importada de un portal por las originales sin marca de la web de la agencia (Mobilia) cuando la
-- web está leída, verificada y enlazada con la propiedad. Estas columnas lo recuerdan:
--   photos_source = 'web_clean'  → ya tiene las limpias (los importadores NO las pisan);
--   photos_source = 'restored'   → alguien devolvió las anteriores a mano (el job no vuelve a reemplazar);
--   photos_source_sig            → huella de la galería de la web con la que se hizo (idempotencia).
-- Idempotente. No toca datos.
-- ============================================================

alter table properties add column if not exists photos_source text;
alter table properties add column if not exists photos_source_sig text;
alter table properties add column if not exists photos_source_at timestamptz;
