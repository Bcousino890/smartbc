-- ============================================================
-- SmartBC · Enriquecer particulares con lo que dice la DESCRIPCIÓN
--           (teléfono, dirección exacta, responsable)
-- ============================================================
-- Reglas y medición: lib/particulares/enrich-from-description.ts (módulo PURO) y
-- CLAUDE.md → «Enriquecer particulares desde la descripción». El job es
-- POST /api/cron/particulares/enrich (?dry=1 solo calcula).
--
-- · `particulares_enrichments`: AUDITORÍA de cada dato añadido (valor antes/después,
--   regla, confianza, fragmento de evidencia). Se puede revertir (`reverted_at`).
-- · `particulares_enrichment_state`: una fila por anuncio con el md5 de la descripción
--   ya procesada (no se reprocesa si no cambia), los números de teléfono que aparecen
--   en el texto (índice para saber si un número es de una agencia o está repartido en
--   varios inmuebles) y los CANDIDATOS de confianza media/baja con su evidencia.
--   Va en tabla propia y no en `particulares.scraper_extra` porque el crawler externo
--   reescribe `scraper_extra` entero en cada upsert y se llevaría los candidatos y el
--   hash por delante.
-- · Funciones: cola de trabajo, escritura con comprobaciones (nunca pisa un dato
--   verificado) y reversión. Solo service_role.
-- Idempotente.
-- ============================================================

create table if not exists particulares_enrichments (
  id             uuid primary key default gen_random_uuid(),
  particular_id  uuid not null references particulares(id) on delete cascade,
  -- phone/phone2/address/owner_name y `location` (latitude, longitude, location_precision).
  campo          text not null check (campo in ('phone', 'phone2', 'address', 'owner_name', 'location')),
  valor_antes    jsonb,
  valor_despues  jsonb not null,
  regla          text not null,
  confianza      text not null check (confianza in ('alta', 'media')),
  evidencia      text,
  origen         text not null default 'auto' check (origen in ('auto', 'manual')),
  applied_by     uuid references profiles(id) on delete set null,
  applied_at     timestamptz not null default now(),
  reverted_at    timestamptz,
  reverted_by    uuid references profiles(id) on delete set null,
  revert_note    text
);
create index if not exists idx_particulares_enrichments_particular
  on particulares_enrichments(particular_id, applied_at desc);
create index if not exists idx_particulares_enrichments_vigentes
  on particulares_enrichments(campo, applied_at desc) where reverted_at is null;

create table if not exists particulares_enrichment_state (
  particular_id  uuid primary key references particulares(id) on delete cascade,
  desc_md5       text not null,
  -- 0 = pendiente de evaluar con las reglas actuales.
  rules_version  integer not null default 0,
  processed_at   timestamptz not null default now(),
  -- claves E.164 sin «+» (34600123456) de TODO lo que parece un teléfono en la descripción.
  phones         text[] not null default '{}',
  -- [{key, field, value, confidence, rule, evidence, reason, status: pendiente|aceptado|descartado}]
  candidates     jsonb not null default '[]'::jsonb,
  -- claves «campo:valor» que una persona rechazó o deshizo: no se vuelven a proponer.
  dismissed      jsonb not null default '[]'::jsonb,
  constraint particulares_enrichment_state_rules_nonneg check (rules_version >= 0)
);
create index if not exists idx_particulares_enrichment_state_phones
  on particulares_enrichment_state using gin (phones);
create index if not exists idx_particulares_enrichment_state_pending
  on particulares_enrichment_state(rules_version) where rules_version = 0;

alter table particulares_enrichments enable row level security;
alter table particulares_enrichment_state enable row level security;
-- Mismo reparto que particulares_links (0176): staff lee, admin escribe; la puerta real son las rutas
-- del servidor (service role + permisos de la app).
drop policy if exists "particulares_enrichments_staff_select" on particulares_enrichments;
create policy "particulares_enrichments_staff_select"
  on particulares_enrichments for select using (is_staff());
drop policy if exists "particulares_enrichments_admin_write" on particulares_enrichments;
create policy "particulares_enrichments_admin_write"
  on particulares_enrichments for all using (is_admin()) with check (is_admin());
drop policy if exists "particulares_enrichment_state_staff_select" on particulares_enrichment_state;
create policy "particulares_enrichment_state_staff_select"
  on particulares_enrichment_state for select using (is_staff());
drop policy if exists "particulares_enrichment_state_admin_write" on particulares_enrichment_state;
create policy "particulares_enrichment_state_admin_write"
  on particulares_enrichment_state for all using (is_admin()) with check (is_admin());

-- ── ¿es genérico el owner_name? (misma regla que isGenericOwnerName en TS) ─────────────
create or replace function particulares_owner_is_generic(p_name text)
returns boolean
language sql
immutable
as $$
  select
    btrim(coalesce(p_name, '')) = ''
    or lower(btrim(p_name)) ~ '^(particular|anuncio particular|particular a particular|propietari[oa]|anunciante|privado|usuario|contacto|vendedor|vendedora|sin nombre|n/a|idealista|fotocasa|pisos\.com)[ .\-]*$'
    -- el crawler a veces deja el TÍTULO del anuncio en owner_name («Alquiler de piso en Calle X, 15»)
    or lower(translate(btrim(p_name), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) ~ '^((alquiler|venta) de )?(piso|apartamento|atico|chalet|casa|duplex|estudio|loft|local|finca|flat|studio|penthouse|villa)\M.* (en|in|for) '
    -- un número de teléfono no es un nombre
    or btrim(p_name) ~ '^[+0-9 ]{7,}$';
$$;

-- ── Clave de candidato/descartado: «campo:valor» plegado ──────────────────────────────
create or replace function particulares_enrichment_key(p_field text, p_value text)
returns text
language sql
immutable
as $$
  select p_field || ':' || regexp_replace(
    lower(translate(coalesce(p_value, ''), 'áàäâéèëêíìïîóòöôúùüûñÁÉÍÓÚÑ', 'aaaaeeeeiiiioooouuuunAEIOUN')),
    '[^a-z0-9+]+', '', 'g');
$$;

-- ── Cola 1: anuncios cuya descripción hay que INDEXAR (todos los tipos, activos o no) ───
create or replace function particulares_enrich_index_queue(p_limit integer)
returns table (id uuid, description text, desc_md5 text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.description, md5(p.description)
  from particulares p
  left join particulares_enrichment_state s on s.particular_id = p.id
  where p.description is not null
    and (s.particular_id is null or s.desc_md5 <> md5(p.description))
  order by p.created_at desc
  limit greatest(p_limit, 0);
$$;

-- ── Cola 2: anuncios ACTIVOS de particular ya indexados que hay que evaluar ─────────────
create or replace function particulares_enrich_queue(p_limit integer, p_rules integer)
returns table (
  id uuid, portal text, advertiser_type text, is_ad_professional boolean, description text,
  address text, zone text, municipality text, owner_name text, phone text, phone2 text,
  chat_only boolean, phone_source text, location_precision text, latitude double precision,
  longitude double precision, desc_md5 text, dismissed jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.portal, p.advertiser_type, p.is_ad_professional, p.description,
         p.address, p.zone, p.scraper_extra->>'municipality', p.owner_name, p.phone, p.phone2,
         p.chat_only, p.scraper_extra->>'phone_source', p.location_precision, p.latitude,
         p.longitude, s.desc_md5, s.dismissed
  from particulares_enrichment_state s
  join particulares p on p.id = s.particular_id
  where p.is_active
    and p.advertiser_type <> 'professional'
    and coalesce(p.is_ad_professional, false) = false
    and p.description is not null and length(p.description) >= 15
    and s.desc_md5 = md5(p.description)
    and s.rules_version <> p_rules
  order by p.created_at desc
  limit greatest(p_limit, 0);
$$;

-- ── Cuántos anuncios faltan por indexar (el job no aplica nada hasta que el índice esté al día) ──
create or replace function particulares_enrich_index_pending()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from particulares p
  left join particulares_enrichment_state s on s.particular_id = p.id
  where p.description is not null
    and (s.particular_id is null or s.desc_md5 <> md5(p.description));
$$;

-- ── Guardar el índice de teléfonos de las descripciones leídas ─────────────────────────
-- p = [{id, desc_md5, phones:[…]}]. Si el texto cambió se vacían los candidatos y la fila vuelve
-- a «pendiente» (rules_version 0); los descartados se conservan.
create or replace function particulares_enrich_state_index(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  insert into particulares_enrichment_state (particular_id, desc_md5, rules_version, phones, candidates, processed_at)
  select (e->>'id')::uuid, e->>'desc_md5', 0,
         coalesce(array(select jsonb_array_elements_text(e->'phones')), '{}'::text[]),
         '[]'::jsonb, now()
  from jsonb_array_elements(p) e
  where exists (select 1 from particulares x where x.id = (e->>'id')::uuid)
  on conflict (particular_id) do update
    set desc_md5 = excluded.desc_md5,
        rules_version = 0,
        phones = excluded.phones,
        candidates = '[]'::jsonb,
        processed_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Guardar el resultado de evaluar un anuncio ─────────────────────────────────────────
-- p = [{id, desc_md5, rules_version, candidates}]. Solo si el md5 sigue siendo el mismo
-- (si el crawler cambió el texto entretanto, se vuelve a evaluar con el nuevo).
create or replace function particulares_enrich_state_save(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update particulares_enrichment_state s
     set rules_version = (e->>'rules_version')::integer,
         candidates = coalesce(e->'candidates', '[]'::jsonb),
         processed_at = now()
    from jsonb_array_elements(p) e
   where s.particular_id = (e->>'id')::uuid
     and s.desc_md5 = e->>'desc_md5';
  get diagnostics n = row_count;
  return n;
end $$;

-- ── ¿Dónde más aparece cada teléfono? (para descartar números de agencia o repartidos) ──
-- Filas que lo tienen en phone/phone2 o escrito en la descripción (índice de arriba).
-- Máx. 60 filas por número: con eso ya se sabe que es de una agencia.
create or replace function particulares_enrich_phone_rows(p_keys text[])
returns table (
  key text, id uuid, advertiser_type text, duplicate_of uuid, address text, zone text,
  square_meters integer, bedrooms integer
)
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select u.key,
           array['+' || u.key, u.key]
             || case when u.key like '34%' and length(u.key) = 11 then array[substr(u.key, 3)] else '{}'::text[] end as vs
    from unnest(p_keys) as u(key)
  ),
  hits as (
    select k.key, s.particular_id as pid
    from k join particulares_enrichment_state s on s.phones @> array[k.key]
    union
    select k.key, p.id
    from k join particulares p on p.phone = any (k.vs) or p.phone2 = any (k.vs)
  ),
  ranked as (
    select h.key, h.pid, row_number() over (partition by h.key order by h.pid) rn from hits h
  )
  select r.key, p.id, p.advertiser_type, p.duplicate_of, p.address, p.zone, p.square_meters, p.bedrooms
  from ranked r join particulares p on p.id = r.pid
  where r.rn <= 60;
$$;

-- ── Aplicar UN dato (job automático o «Aceptar» de una persona) ────────────────────────
-- Devuelve {ok, id} o {ok:false, reason}. Bloquea la fila y comprueba, dentro de la transacción, que
-- NO se pisa nada verificado:
--   phone      → solo si phone está vacío (marca phone_source='description', chat_only=false);
--   phone2     → solo si phone tiene valor, phone2 está vacío y no es el mismo número;
--   address    → solo si `address` sigue siendo el que leyó el job (p_expected.address);
--   owner_name → solo si es genérico (vacío, «Particular», título del anuncio, un teléfono…);
--   location   → solo si location_precision no es 'exact' y el pin no cambió desde que se leyó.
-- Si una persona ya deshizo ese mismo valor, el job (origen 'auto') no lo vuelve a poner.
create or replace function particulares_enrichment_apply(
  p_id uuid, p_field text, p_after jsonb, p_rule text, p_conf text, p_evidence text,
  p_origin text default 'auto', p_by uuid default null, p_expected jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r particulares%rowtype;
  v text;
  before_v jsonb;
  new_id uuid;
begin
  if p_field not in ('phone', 'phone2', 'address', 'owner_name', 'location') then
    return jsonb_build_object('ok', false, 'reason', 'campo_invalido');
  end if;
  select * into r from particulares where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_existe'); end if;
  if p_origin = 'auto' and (r.advertiser_type = 'professional' or coalesce(r.is_ad_professional, false)) then
    return jsonb_build_object('ok', false, 'reason', 'anuncio_de_agencia');
  end if;
  if p_origin = 'auto' and exists (
    select 1 from particulares_enrichments e
    where e.particular_id = p_id and e.campo = p_field and e.reverted_at is not null
      and case when p_field = 'location'
               then abs((e.valor_despues->>'latitude')::double precision - (p_after->>'latitude')::double precision) < 0.0001
               else e.valor_despues->>p_field = p_after->>p_field end
  ) then
    return jsonb_build_object('ok', false, 'reason', 'deshecho_antes');
  end if;

  if p_field = 'phone' then
    v := p_after->>'phone';
    if v is null or v !~ '^\+[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'reason', 'telefono_invalido'); end if;
    if btrim(coalesce(r.phone, '')) <> '' then return jsonb_build_object('ok', false, 'reason', 'telefono_ocupado'); end if;
    before_v := jsonb_build_object('phone', r.phone, 'chat_only', r.chat_only,
                                   'phone_confidence', r.phone_confidence,
                                   'phone_source', r.scraper_extra->>'phone_source');
    update particulares
       set phone = v, chat_only = false, phone_confidence = 'medium',
           scraper_extra = coalesce(scraper_extra, '{}'::jsonb) || jsonb_build_object('phone_source', 'description')
     where id = p_id;
    p_after := jsonb_build_object('phone', v, 'chat_only', false, 'phone_confidence', 'medium', 'phone_source', 'description');

  elsif p_field = 'phone2' then
    v := p_after->>'phone2';
    if v is null or v !~ '^\+[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'reason', 'telefono_invalido'); end if;
    if btrim(coalesce(r.phone, '')) = '' then return jsonb_build_object('ok', false, 'reason', 'sin_telefono_principal'); end if;
    if btrim(coalesce(r.phone2, '')) <> '' then return jsonb_build_object('ok', false, 'reason', 'phone2_ocupado'); end if;
    if right(regexp_replace(r.phone, '\D', '', 'g'), 9) = right(regexp_replace(v, '\D', '', 'g'), 9) then
      return jsonb_build_object('ok', false, 'reason', 'ya_es_el_principal');
    end if;
    before_v := jsonb_build_object('phone2', r.phone2);
    update particulares set phone2 = v where id = p_id;
    p_after := jsonb_build_object('phone2', v);

  elsif p_field = 'address' then
    v := nullif(btrim(p_after->>'address'), '');
    if v is null then return jsonb_build_object('ok', false, 'reason', 'direccion_vacia'); end if;
    if p_expected is not null and (r.address is distinct from (p_expected->>'address')) then
      return jsonb_build_object('ok', false, 'reason', 'cambio_concurrente');
    end if;
    before_v := jsonb_build_object('address', r.address);
    update particulares set address = v where id = p_id;
    p_after := jsonb_build_object('address', v);

  elsif p_field = 'owner_name' then
    v := nullif(btrim(p_after->>'owner_name'), '');
    if v is null then return jsonb_build_object('ok', false, 'reason', 'nombre_vacio'); end if;
    if not particulares_owner_is_generic(r.owner_name) then return jsonb_build_object('ok', false, 'reason', 'nombre_real_ya_existe'); end if;
    before_v := jsonb_build_object('owner_name', r.owner_name);
    update particulares set owner_name = v where id = p_id;
    p_after := jsonb_build_object('owner_name', v);

  else -- location
    if (p_after->>'latitude') is null or (p_after->>'longitude') is null then
      return jsonb_build_object('ok', false, 'reason', 'coordenadas_invalidas');
    end if;
    if r.location_precision = 'exact' then return jsonb_build_object('ok', false, 'reason', 'pin_exacto_existente'); end if;
    if r.latitude is not null and p_expected is not null
       and (abs(r.latitude - (p_expected->>'latitude')::double precision) > 0.000001
            or abs(r.longitude - (p_expected->>'longitude')::double precision) > 0.000001) then
      return jsonb_build_object('ok', false, 'reason', 'cambio_concurrente');
    end if;
    before_v := jsonb_build_object('latitude', r.latitude, 'longitude', r.longitude,
                                   'location_precision', r.location_precision, 'geocoded_at', r.geocoded_at);
    update particulares
       set latitude = (p_after->>'latitude')::double precision,
           longitude = (p_after->>'longitude')::double precision,
           location_precision = 'exact', geocoded_at = now()
     where id = p_id;
    p_after := jsonb_build_object('latitude', (p_after->>'latitude')::double precision,
                                  'longitude', (p_after->>'longitude')::double precision,
                                  'location_precision', 'exact');
  end if;

  insert into particulares_enrichments (particular_id, campo, valor_antes, valor_despues, regla, confianza, evidencia, origen, applied_by)
  values (p_id, p_field, before_v, p_after, p_rule, p_conf, left(p_evidence, 400), p_origin, p_by)
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

-- ── Deshacer un dato añadido ───────────────────────────────────────────────────────────
-- Solo si el campo sigue valiendo lo que puso el enriquecimiento (si alguien lo cambió después, no se pisa).
-- El valor deshecho se apunta en `dismissed` para que el job no lo vuelva a proponer.
create or replace function particulares_enrichment_revert(p_enrichment uuid, p_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e particulares_enrichments%rowtype;
  r particulares%rowtype;
  v text;
  k text;
begin
  select * into e from particulares_enrichments where id = p_enrichment for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_existe'); end if;
  if e.reverted_at is not null then return jsonb_build_object('ok', false, 'reason', 'ya_deshecho'); end if;
  select * into r from particulares where id = e.particular_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'anuncio_no_existe'); end if;

  if e.campo = 'phone' then
    if r.phone is distinct from (e.valor_despues->>'phone') then return jsonb_build_object('ok', false, 'reason', 'valor_cambiado'); end if;
    update particulares
       set phone = e.valor_antes->>'phone',
           chat_only = coalesce((e.valor_antes->>'chat_only')::boolean, resolve_chat_only_fallback(e.valor_antes->>'phone')),
           phone_confidence = e.valor_antes->>'phone_confidence',
           scraper_extra = case
             when e.valor_antes->>'phone_source' is null then coalesce(scraper_extra, '{}'::jsonb) - 'phone_source'
             else coalesce(scraper_extra, '{}'::jsonb) || jsonb_build_object('phone_source', e.valor_antes->>'phone_source') end
     where id = r.id;
    v := e.valor_despues->>'phone';
  elsif e.campo = 'phone2' then
    if r.phone2 is distinct from (e.valor_despues->>'phone2') then return jsonb_build_object('ok', false, 'reason', 'valor_cambiado'); end if;
    update particulares set phone2 = e.valor_antes->>'phone2' where id = r.id;
    v := e.valor_despues->>'phone2';
  elsif e.campo = 'address' then
    if r.address is distinct from (e.valor_despues->>'address') then return jsonb_build_object('ok', false, 'reason', 'valor_cambiado'); end if;
    update particulares set address = e.valor_antes->>'address' where id = r.id;
    v := e.valor_despues->>'address';
  elsif e.campo = 'owner_name' then
    if r.owner_name is distinct from (e.valor_despues->>'owner_name') then return jsonb_build_object('ok', false, 'reason', 'valor_cambiado'); end if;
    update particulares set owner_name = e.valor_antes->>'owner_name' where id = r.id;
    v := e.valor_despues->>'owner_name';
  else
    if r.latitude is distinct from (e.valor_despues->>'latitude')::double precision
       or r.longitude is distinct from (e.valor_despues->>'longitude')::double precision then
      return jsonb_build_object('ok', false, 'reason', 'valor_cambiado');
    end if;
    update particulares
       set latitude = (e.valor_antes->>'latitude')::double precision,
           longitude = (e.valor_antes->>'longitude')::double precision,
           location_precision = e.valor_antes->>'location_precision',
           geocoded_at = (e.valor_antes->>'geocoded_at')::timestamptz
     where id = r.id;
    v := null;
  end if;

  update particulares_enrichments set reverted_at = now(), reverted_by = p_by where id = e.id;
  if v is not null then
    k := particulares_enrichment_key(e.campo, v);
    update particulares_enrichment_state
       set dismissed = case when dismissed ? k then dismissed else dismissed || to_jsonb(k) end
     where particular_id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- «solo chat» al deshacer un teléfono cuando el estado anterior no se guardó: sin teléfono → true.
create or replace function resolve_chat_only_fallback(p_phone text)
returns boolean language sql immutable as $$ select coalesce(btrim(p_phone), '') = ''; $$;

revoke all on function particulares_owner_is_generic(text) from public, anon, authenticated;
revoke all on function particulares_enrichment_key(text, text) from public, anon, authenticated;
revoke all on function particulares_enrich_index_queue(integer) from public, anon, authenticated;
revoke all on function particulares_enrich_queue(integer, integer) from public, anon, authenticated;
revoke all on function particulares_enrich_index_pending() from public, anon, authenticated;
revoke all on function particulares_enrich_state_index(jsonb) from public, anon, authenticated;
revoke all on function particulares_enrich_state_save(jsonb) from public, anon, authenticated;
revoke all on function particulares_enrich_phone_rows(text[]) from public, anon, authenticated;
revoke all on function particulares_enrichment_apply(uuid, text, jsonb, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function particulares_enrichment_revert(uuid, uuid) from public, anon, authenticated;
revoke all on function resolve_chat_only_fallback(text) from public, anon, authenticated;
grant execute on function particulares_owner_is_generic(text) to service_role;
grant execute on function particulares_enrichment_key(text, text) to service_role;
grant execute on function particulares_enrich_index_queue(integer) to service_role;
grant execute on function particulares_enrich_queue(integer, integer) to service_role;
grant execute on function particulares_enrich_index_pending() to service_role;
grant execute on function particulares_enrich_state_index(jsonb) to service_role;
grant execute on function particulares_enrich_state_save(jsonb) to service_role;
grant execute on function particulares_enrich_phone_rows(text[]) to service_role;
grant execute on function particulares_enrichment_apply(uuid, text, jsonb, text, text, text, text, uuid, jsonb) to service_role;
grant execute on function particulares_enrichment_revert(uuid, uuid) to service_role;
grant execute on function resolve_chat_only_fallback(text) to service_role;
