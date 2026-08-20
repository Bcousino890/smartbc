-- ============================================================================
-- SmartBC · SmartLink 2.0 — story versionado, inteligencia de foto/vídeo,
-- capa de barrios/POIs y eventos de analítica nuevos.
-- ============================================================================
-- Decisiones de producto (sprint SmartLink 2.0):
--  · El story NUNCA vive en properties.description (el sync la pisa): tiene
--    su propia persistencia versionada, keyed por hash de la fuente.
--  · Modelo de 3 capas trazable: claim (evidencia literal) → bloque editorial.
--  · Conflictos (texto contradice specs) bloquean SOLO el bloque afectado.
--  · Barrios/POIs curados y extensibles sin migraciones futuras (filas, no
--    columnas): añadir un barrio o un POI es un INSERT.
--  · Los minutos a un POI NO se guardan: se calculan por geometría contra las
--    coords de cada propiedad (lib/geo/poi-distance.ts). Nada inventado.

-- ─── STORY · capa 1+2: versión y claims con evidencia ────────────────────────

create table if not exists property_story_versions (
  id            uuid        primary key default gen_random_uuid(),
  property_id   uuid        not null references properties(id) on delete cascade,
  -- sha256 de (description + hechos estructurados). Si la fuente no cambia,
  -- no se regenera: el hash es la clave de caché del motor.
  source_hash   text        not null,
  status        text        not null default 'generated'
                check (status in ('generated','approved','rejected','disabled')),
  model         text,
  provider      text,
  created_at    timestamptz not null default now(),
  reviewed_by   uuid        references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  notes         text
);

-- Una sola versión aprobada por propiedad: aprobar una nueva exige
-- rechazar/deshabilitar la anterior (lo hace la server action en transacción).
create unique index if not exists uq_story_approved_per_property
  on property_story_versions(property_id) where status = 'approved';
create index if not exists idx_story_versions_property
  on property_story_versions(property_id, created_at desc);

create table if not exists property_story_claims (
  id            uuid        primary key default gen_random_uuid(),
  version_id    uuid        not null references property_story_versions(id) on delete cascade,
  -- Evidencia LITERAL: la frase exacta de la fuente. Sin esto no hay claim.
  source_text   text        not null,
  source_field  text        not null default 'description'
                check (source_field in ('description','features','specs')),
  category      text        not null
                check (category in ('overview','living','kitchen','private',
                                    'outdoor','finishes','building','barrio',
                                    'boilerplate','other')),
  fact          text        not null,
  confidence    numeric     not null default 0,
  -- Duplicado de un campo estructurado (m², dormitorios, ascensor…): se
  -- conserva como evidencia pero NO entra en la prosa editorial.
  is_duplicate  boolean     not null default false,
  -- Contradice un campo estructurado (specs mandan): bloquea su bloque.
  conflict      boolean     not null default false,
  conflict_reason text
);
create index if not exists idx_story_claims_version
  on property_story_claims(version_id);

-- ─── STORY · capa 3: bloques editoriales ─────────────────────────────────────

create table if not exists property_story_blocks (
  id            uuid        primary key default gen_random_uuid(),
  version_id    uuid        not null references property_story_versions(id) on delete cascade,
  chapter       text        not null
                check (chapter in ('overview','living','kitchen','private',
                                   'outdoor','finishes','building','barrio')),
  copy          text        not null,
  position      int         not null default 0,
  status        text        not null default 'generated'
                check (status in ('generated','approved','rejected','conflict')),
  confidence    numeric     not null default 0,
  -- Trazabilidad: ids de los claims que sostienen este bloque.
  claim_ids     uuid[]      not null default '{}',
  edited_by     uuid        references profiles(id) on delete set null,
  edited_at     timestamptz
);
create index if not exists idx_story_blocks_version
  on property_story_blocks(version_id, position);

-- ─── FOTOS · clasificación persistente ───────────────────────────────────────
-- Clases v1 del sprint. `class_override` (humano) manda sobre `ai_class`.

alter table property_photos add column if not exists ai_class       text;
alter table property_photos add column if not exists ai_confidence  numeric;
alter table property_photos add column if not exists ai_source_hash text;
alter table property_photos add column if not exists ai_model       text;
alter table property_photos add column if not exists class_override text;
alter table property_photos add column if not exists classified_at  timestamptz;

-- ─── VÍDEO · metadata para manual/externo (ffprobe) + poster ────────────────
-- width/height/duration_seconds/format ya existen para los generados (0115);
-- IF NOT EXISTS por si alguna instalación no los tiene. `probed_at` marca que
-- ffprobe ya pasó (con éxito o no) para no re-sondear en bucle.

alter table property_media add column if not exists width            int;
alter table property_media add column if not exists height           int;
alter table property_media add column if not exists duration_seconds numeric;
alter table property_media add column if not exists format           text;
alter table property_media add column if not exists poster_url       text;
alter table property_media add column if not exists probed_at        timestamptz;

-- ─── BARRIOS · capa curada y extensible ──────────────────────────────────────

create table if not exists neighborhoods (
  id            uuid        primary key default gen_random_uuid(),
  country       text        not null default 'es',
  -- clave normalizada (minúsculas, sin acentos) contra la que se casan
  -- properties.subzone y properties.zone — subzone tiene prioridad.
  zone_key      text        not null unique,
  display_name  text        not null,
  -- Intro editorial curada (30–70 palabras, factual). Base reutilizable: el
  -- Content Engine puede COMPLEMENTAR con hechos de la propiedad, nunca
  -- reinventar el barrio por inmueble (decisión D3).
  intro         text        not null,
  facts         jsonb       not null default '{}'::jsonb,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists neighborhood_pois (
  id              uuid      primary key default gen_random_uuid(),
  neighborhood_id uuid      not null references neighborhoods(id) on delete cascade,
  name            text      not null,
  category        text      not null
                  check (category in ('parque','transporte','cultura','compras',
                                      'educacion','salud','gastronomia','deporte','otro')),
  latitude        double precision not null,
  longitude       double precision not null,
  priority        int       not null default 100,
  -- Modos permitidos para mostrar tiempo ('walk','drive','transit').
  travel_modes    text[]    not null default '{walk,drive}',
  verified_source text,
  active          boolean   not null default true
);
create index if not exists idx_neighborhood_pois
  on neighborhood_pois(neighborhood_id, priority);

-- Seeds: barrios que BCP trabaja hoy. Añadir más = INSERT, sin migración.
insert into neighborhoods (zone_key, display_name, intro) values
  ('recoletos', 'Recoletos',
   'Recoletos es la cara más señorial del barrio de Salamanca: fincas de finales del XIX entre el Paseo de Recoletos y Serrano, a un paso del Retiro y de la Puerta de Alcalá. Concentra las boutiques de la milla de oro, galerías y algunos de los restaurantes más consolidados de Madrid.'),
  ('almagro', 'Almagro',
   'Almagro, en Chamberí, reúne palacetes y fincas clásicas en calles arboladas junto al Paseo de la Castellana. Es un barrio residencial tranquilo con embajadas, el Museo Sorolla y una oferta gastronómica de primer nivel entre Zurbano y Almagro, bien conectado por las líneas 5, 7 y 10 de metro.'),
  ('salamanca', 'Barrio de Salamanca',
   'El barrio de Salamanca es el ensanche burgués de Madrid: manzanas regulares, portales señoriales y comercio de calidad en Serrano, Velázquez y Goya. Ofrece la mayor densidad de compras y restaurantes de la ciudad, con el Retiro y la Castellana como límites verdes y de negocio.'),
  ('chamberi', 'Chamberí',
   'Chamberí conserva el Madrid de fincas clásicas con portero, plazas de barrio y comercio de proximidad. De Olavide a Almagro, combina vida vecinal con una escena gastronómica en auge, y conecta el centro con la Castellana en pocos minutos de metro.'),
  ('retiro', 'Retiro',
   'El distrito de Retiro vive alrededor del parque: calles residenciales serenas junto a Menéndez Pelayo e Ibiza, con el Jardín Botánico y el eje del Prado a un paseo. Es una de las zonas más equilibradas de Madrid entre verde, servicios y conexión con el centro.'),
  ('chamartin', 'Chamartín',
   'Chamartín es el norte residencial y de negocio de Madrid: la Castellana, el Bernabéu y calles amplias con fincas de los 60 y 70 muy demandadas por familias. Buenas dotaciones escolares y deportivas, y conexión directa con la estación de Chamartín y el aeropuerto.'),
  ('centro', 'Centro',
   'El distrito Centro concentra el Madrid histórico: de la Puerta del Sol al Palacio Real y del Barrio de las Letras a Malasaña. Vivir aquí es tener teatros, museos y toda la ciudad a pie, en edificios rehabilitados con siglos de historia.'),
  ('pozuelo', 'Pozuelo de Alarcón',
   'Pozuelo de Alarcón es el municipio residencial de referencia al oeste de Madrid: urbanizaciones consolidadas, colegios de primer nivel y amplias zonas verdes, a veinte minutos del centro por la A-6 o en tren de Cercanías.'),
  ('la-moraleja', 'La Moraleja',
   'La Moraleja es la urbanización más consolidada del norte de Madrid: parcelas amplias, seguridad, campos de golf y colegios internacionales, con acceso rápido al aeropuerto y al eje financiero de la Castellana por la A-1.')
on conflict (zone_key) do nothing;

-- POIs curados (coordenadas de lugares públicos notorios; los minutos se
-- calculan por geometría en runtime — nunca se almacenan ni se inventan).
-- Idempotente por lote: neighborhood_pois no tiene constraint único natural,
-- así que se borra el lote curado antes de reinsertarlo (necesario porque una
-- pasada parcial de esta migración puede haber insertado ya los seeds — psql
-- aplica sentencia a sentencia, no en una transacción).
delete from neighborhood_pois where verified_source = 'curated-2026-08';
with n as (select id, zone_key from neighborhoods)
insert into neighborhood_pois (neighborhood_id, name, category, latitude, longitude, priority, travel_modes, verified_source)
select n.id, p.name, p.category, p.lat, p.lng, p.priority, p.modes::text[], 'curated-2026-08'
from n
join (values
  -- Recoletos / Salamanca / Retiro comparten landmarks del eje Retiro–Serrano
  ('recoletos',  'Parque del Retiro',        'parque',     40.4153, -3.6845, 10, '{walk}'),
  ('recoletos',  'Puerta de Alcalá',         'cultura',    40.4200, -3.6889, 20, '{walk}'),
  ('recoletos',  'Calle Serrano (compras)',  'compras',    40.4312, -3.6871, 30, '{walk}'),
  ('recoletos',  'Museo del Prado',          'cultura',    40.4138, -3.6921, 40, '{walk,drive}'),
  ('recoletos',  'Mercado de la Paz',        'gastronomia',40.4266, -3.6835, 50, '{walk}'),
  ('salamanca',  'Parque del Retiro',        'parque',     40.4153, -3.6845, 10, '{walk}'),
  ('salamanca',  'Calle Serrano (compras)',  'compras',    40.4312, -3.6871, 20, '{walk}'),
  ('salamanca',  'Puerta de Alcalá',         'cultura',    40.4200, -3.6889, 30, '{walk}'),
  ('salamanca',  'Mercado de la Paz',        'gastronomia',40.4266, -3.6835, 40, '{walk}'),
  ('salamanca',  'WiZink Center',            'deporte',    40.4239, -3.6716, 50, '{walk,drive}'),
  ('retiro',     'Parque del Retiro',        'parque',     40.4153, -3.6845, 10, '{walk}'),
  ('retiro',     'Real Jardín Botánico',     'parque',     40.4114, -3.6906, 20, '{walk}'),
  ('retiro',     'Museo del Prado',          'cultura',    40.4138, -3.6921, 30, '{walk}'),
  ('retiro',     'Estación de Atocha',       'transporte', 40.4066, -3.6904, 40, '{walk,drive}'),
  ('almagro',    'Museo Sorolla',            'cultura',    40.4354, -3.6924, 10, '{walk}'),
  ('almagro',    'Plaza de Olavide',         'gastronomia',40.4325, -3.7005, 20, '{walk}'),
  ('almagro',    'Paseo de la Castellana',   'transporte', 40.4370, -3.6900, 30, '{walk}'),
  ('almagro',    'Parque del Retiro',        'parque',     40.4153, -3.6845, 40, '{walk,drive}'),
  ('chamberi',   'Plaza de Olavide',         'gastronomia',40.4325, -3.7005, 10, '{walk}'),
  ('chamberi',   'Museo Sorolla',            'cultura',    40.4354, -3.6924, 20, '{walk}'),
  ('chamberi',   'Canal (zona deportiva)',   'deporte',    40.4406, -3.7043, 30, '{walk}'),
  ('chamberi',   'Gran Vía',                 'compras',    40.4203, -3.7058, 40, '{walk,drive}'),
  ('chamartin',  'Estadio Santiago Bernabéu','deporte',    40.4531, -3.6883, 10, '{walk}'),
  ('chamartin',  'Estación de Chamartín',    'transporte', 40.4720, -3.6825, 20, '{walk,drive}'),
  ('chamartin',  'Paseo de la Castellana',   'compras',    40.4478, -3.6900, 30, '{walk}'),
  ('centro',     'Puerta del Sol',           'cultura',    40.4169, -3.7035, 10, '{walk}'),
  ('centro',     'Plaza Mayor',              'cultura',    40.4155, -3.7074, 20, '{walk}'),
  ('centro',     'Teatro Real',              'cultura',    40.4181, -3.7144, 30, '{walk}'),
  ('centro',     'Gran Vía',                 'compras',    40.4203, -3.7058, 40, '{walk}'),
  ('pozuelo',    'Estación de Pozuelo (Cercanías)', 'transporte', 40.4406, -3.8055, 10, '{walk,drive}'),
  ('pozuelo',    'Ciudad de la Imagen',      'otro',       40.4239, -3.8286, 20, '{drive}'),
  ('la-moraleja','Plaza de la Moraleja',     'compras',    40.5107, -3.6295, 10, '{walk,drive}'),
  ('la-moraleja','Aeropuerto Madrid-Barajas','transporte', 40.4936, -3.5668, 20, '{drive}')
) as p(zone_key, name, category, lat, lng, priority, modes)
  on p.zone_key = n.zone_key
on conflict do nothing;

-- ─── ANALÍTICA · eventos nuevos del SmartLink 2.0 ───────────────────────────
-- El CHECK cerrado de 0057 ya NO existe en producción: el esquema evolucionó a
-- vocabulario abierto (Shortlist registra shortlist_open, decision_change,
-- property_view… sin migración por evento). Se respeta esa decisión: los
-- eventos nuevos del SmartLink 2.0 (photo_gallery_open, hero_video_play,
-- video_progress, story_chapter_view, location_view, poi_click) no requieren
-- DDL — este drop queda solo por si alguna instalación conserva el CHECK viejo,
-- que rechazaría los eventos nuevos.
alter table page_events drop constraint if exists valid_event_type;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mismas garantías que el resto del esquema: sin policies para anon; el
-- acceso es siempre server-side con service role. Nada de esto se expone
-- a PostgREST público.

alter table property_story_versions enable row level security;
alter table property_story_claims   enable row level security;
alter table property_story_blocks   enable row level security;
alter table neighborhoods           enable row level security;
alter table neighborhood_pois       enable row level security;
