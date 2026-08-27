-- SmartBC · Ficha técnica de `particulares` (columnas que ya existían a mano)
-- ============================================================
-- Estas columnas YA están en la base de producción del VPS —se añadieron a
-- mano, sin migración— y las lee `app/api/admin/particulares/detail/route.ts`
-- (DETAIL_COLUMNS) para el bloque "Ficha técnica" del modal. Nunca se
-- declararon aquí, así que una base creada solo con estas migraciones NO las
-- tiene, y cualquier consulta que las nombre falla entera.
--
-- Eso pasó de ser un detalle a un problema al añadir filtros por precio/m²,
-- bajada de precio, ascensor, estado y año: un filtro sobre una columna que
-- no existe no degrada, tumba el listado completo. Se declaran aquí para que
-- el esquema del repo diga la verdad.
--
-- `if not exists` en cada una: en producción son NO-OP (ya están), y no se
-- toca el tipo de las que ya existan. Ninguna la escribe el código todavía
-- (las rellena el scraper de la ficha por fuera), así que no hay backfill.

alter table particulares add column if not exists price_per_m2 numeric(12, 2);
alter table particulares add column if not exists previous_price numeric(14, 2);
alter table particulares add column if not exists price_drop_pct numeric(6, 2);
alter table particulares add column if not exists floor text;
alter table particulares add column if not exists has_lift boolean;
alter table particulares add column if not exists condition text;
alter table particulares add column if not exists year_built integer;
alter table particulares add column if not exists orientation text;
alter table particulares add column if not exists energy_consumption text;
alter table particulares add column if not exists energy_emissions text;
alter table particulares add column if not exists advertiser_profile_url text;
alter table particulares add column if not exists reference text;
alter table particulares add column if not exists source_update_text text;

-- Índices para los filtros nuevos del listado. Parciales (solo filas con
-- dato): la mayoría de anuncios no tiene ficha técnica scrapeada todavía, y
-- un índice sobre millones de NULL no aporta nada y ocupa de más.
create index if not exists idx_particulares_price_drop
  on particulares(price_drop_pct) where price_drop_pct is not null;
create index if not exists idx_particulares_price_per_m2
  on particulares(price_per_m2) where price_per_m2 is not null;
