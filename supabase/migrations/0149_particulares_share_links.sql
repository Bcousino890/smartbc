-- SmartBC · Enlaces temporales para compartir un particular fuera del equipo
-- ============================================================
-- Un asesor necesita reenviar (WhatsApp) UN anuncio de particular concreto a
-- alguien de fuera del equipo (cliente, colega externo) sin que abra sesión.
-- Es primo de `property_shares` (migración 0007) pero para `particulares` —
-- un anuncio scrapeado de Idealista/Fotocasa/pisos.com, NO una ficha nuestra.
--
-- Deliberadamente su propia tabla y su propia ruta pública (/a/{token}, ver
-- app/a/[token]/page.tsx): este enlace no debe tocar `properties`,
-- `property_shares`, `client_property_selections` ni `client_portal_links` —
-- son sistemas distintos con su propio ciclo de vida.
--
-- El destinatario es SIEMPRE alguien de fuera del equipo, así que la ruta
-- pública solo puede proyectar campos "de escaparate" (fotos, precio,
-- operación, zona, habitaciones/baños/m², descripción, características).
-- Eso lo aplica el SELECT explícito de columnas en
-- lib/db/queries/particulares-shares.ts — esta migración no lo puede
-- garantizar por sí sola, así que si alguien cambia ese SELECT debe seguir
-- respetando el mismo límite.

create table if not exists particulares_share_links (
  id uuid primary key default gen_random_uuid(),
  particular_id uuid not null references particulares(id) on delete cascade,
  token text not null unique,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz,
  -- Contador simple en vez de una tabla de aperturas (a diferencia de
  -- property_share_opens): esta funcionalidad es mucho más pequeña que el
  -- tracking de SmartLinks y no necesita IP/UA por apertura.
  opened_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_particulares_share_links_particular
  on particulares_share_links(particular_id);
create index if not exists idx_particulares_share_links_token
  on particulares_share_links(token);

alter table particulares_share_links enable row level security;

-- Mismo reparto que property_shares (0007): staff lee, admin escribe. Esto
-- es defensa en profundidad nada más — la ruta pública /a/[token] resuelve
-- siempre con createAdminClient() (service role, bypassa RLS), igual que
-- /c y /v. Quién puede realmente CREAR un enlace lo decide
-- assertPermission("particulares", "view") en el server action (bastante
-- más permisivo que is_admin() — ver 0112, que documenta el mismo desajuste
-- para is_staff() en la propia tabla `particulares`). No se toca aquí para
-- no reabrir esa discusión en una migración que no la necesita: como no es
-- la puerta real, el desajuste no tiene efecto práctico.
create policy "particulares_share_links_staff_select"
  on particulares_share_links for select using (is_staff());
create policy "particulares_share_links_admin_write"
  on particulares_share_links for all using (is_admin()) with check (is_admin());
