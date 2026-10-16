-- ============================================================
-- SmartBC · Copia recuperable de las fotos de una propiedad
-- ============================================================
-- «Reemplazar por fotos sin marca de agua (web de la agencia)» cambia las filas de `property_photos`
-- de una propiedad por las originales de la web de la agencia. Antes de cambiarlas, las filas antiguas
-- se copian aquí (los ficheros del storage NO se borran), así que se pueden restaurar desde el mismo
-- diálogo. Cada reemplazo es un `batch_id`. Idempotente.
-- ============================================================

create table if not exists property_photos_backup (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  property_id uuid not null references properties(id) on delete cascade,
  url text not null,
  alt text,
  position integer not null default 0,
  is_cover boolean not null default false,
  original_created_at timestamptz,
  reason text not null default 'replace_from_agency_web',
  backed_up_by uuid references profiles(id) on delete set null,
  backed_up_at timestamptz not null default now(),
  -- Se rellena cuando ese lote se restaura (deja de ser «el último» recuperable).
  restored_at timestamptz
);
create index if not exists idx_property_photos_backup_property on property_photos_backup(property_id, backed_up_at desc);
create index if not exists idx_property_photos_backup_batch on property_photos_backup(batch_id);

alter table property_photos_backup enable row level security;
drop policy if exists "property_photos_backup_staff_select" on property_photos_backup;
create policy "property_photos_backup_staff_select"
  on property_photos_backup for select using (is_staff());
drop policy if exists "property_photos_backup_admin_write" on property_photos_backup;
create policy "property_photos_backup_admin_write"
  on property_photos_backup for all using (is_admin()) with check (is_admin());
