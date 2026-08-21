// SmartLink 2.0 · genera supabase/migrations/0145_neighborhood_layer.sql
//
// Junta el catálogo curado (nombres, alias, intros) con las coordenadas ya
// verificadas por scripts/geocode-neighborhood-pois.mjs. No se escribe SQL a
// mano: así el fichero de migración y el JSON validado no pueden divergir.
//
// Uso: node scripts/geocode-neighborhood-pois.mjs && node scripts/build-neighborhood-migration.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { NEIGHBORHOODS, ALIASES_FOR_EXISTING } from "./neighborhood-poi-catalog.mjs";
import { INTROS } from "./neighborhood-intros.mjs";

const { resolved, rejected } = JSON.parse(readFileSync("scripts/out/neighborhood-pois.json", "utf8"));

const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => `'{${xs.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")}}'`;

// ── Verificaciones que abortan la generación ─────────────────────────────
const problems = [];
for (const h of NEIGHBORHOODS) {
  const intro = INTROS[h.key];
  if (!intro) problems.push(`${h.key}: sin intro`);
  else {
    const words = intro.trim().split(/\s+/).length;
    if (words < 35 || words > 70) problems.push(`${h.key}: intro de ${words} palabras (35-70)`);
    if (/\b\d+\s*(min|minutos)\b/i.test(intro)) problems.push(`${h.key}: la intro menciona minutos`);
  }
  const n = resolved.filter((r) => r.hood === h.key).length;
  if (n < 4 || n > 8) problems.push(`${h.key}: ${n} POIs (se esperan 4-8)`);
}
if (problems.length) {
  console.error("[build] catálogo inválido:\n  " + problems.join("\n  "));
  process.exit(1);
}

const lines = [];
lines.push(`-- 0145 · SmartLink 2.0 — expansión de la capa de conocimiento de barrio.
--
-- Generado por scripts/build-neighborhood-migration.mjs. NO editar a mano:
-- vuelve a ejecutar el generador. Las coordenadas de los POIs salen de
-- scripts/geocode-neighborhood-pois.mjs (Nominatim + estaciones de Overpass)
-- y están validadas por radio contra el centro de su barrio; ninguna se ha
-- escrito de memoria.
--
-- Idempotente: se puede reaplicar sin duplicar filas.

-- 1) Alias y adscripción administrativa.
--    'aliases' evita reescribir el catálogo de propiedades: una zona sucia
--    ("Lista, Barrio de Salamanca") resuelve contra el barrio canónico sin
--    tocar la ficha. Un valor sólo puede pertenecer a un barrio: lo garantiza
--    el índice único de más abajo.
alter table neighborhoods add column if not exists aliases      text[] not null default '{}';
alter table neighborhoods add column if not exists district     text;
alter table neighborhoods add column if not exists municipality text not null default 'Madrid';

create index if not exists idx_neighborhoods_aliases on neighborhoods using gin (aliases);
`);

// Alias de barrios ya existentes.
lines.push(`\n-- 2) Alias sobre los barrios que ya existían.`);
for (const [key, aliases] of Object.entries(ALIASES_FOR_EXISTING)) {
  lines.push(`update neighborhoods set aliases = ${arr(aliases)}, updated_at = now() where zone_key = ${q(key)};`);
}

// Barrios nuevos.
lines.push(`\n-- 3) Barrios nuevos (${NEIGHBORHOODS.length}), ordenados por volumen de propiedades activas.`);
lines.push(`insert into neighborhoods (country, zone_key, display_name, intro, aliases, district, municipality, active) values`);
lines.push(
  NEIGHBORHOODS.map((h) =>
    `  ('es', ${q(h.key)}, ${q(h.display)}, ${q(INTROS[h.key].trim())}, ${arr(h.aliases)}, ${q(h.district)}, ${q(h.municipality)}, true)`,
  ).join(",\n"),
);
lines.push(`on conflict (zone_key) do update set
  display_name = excluded.display_name,
  intro        = excluded.intro,
  aliases      = excluded.aliases,
  district     = excluded.district,
  municipality = excluded.municipality,
  updated_at   = now();`);

// Un alias no puede apuntar a dos barrios ni chocar con un zone_key.
lines.push(`
-- 4) Un alias no puede resolver a dos barrios distintos ni pisar un zone_key:
--    si ocurriera, el SmartLink mostraría el barrio equivocado. Se comprueba
--    aquí y la migración aborta antes de dejar datos ambiguos.
do $$
declare dup text;
begin
  select string_agg(a, ', ') into dup from (
    select unnest(aliases) a from neighborhoods group by 1 having count(*) > 1
  ) t;
  if dup is not null then
    raise exception 'Alias duplicados en neighborhoods: %', dup;
  end if;
  select string_agg(n.zone_key, ', ') into dup
  from neighborhoods n
  where exists (select 1 from neighborhoods m where m.id <> n.id and n.zone_key = any(m.aliases));
  if dup is not null then
    raise exception 'Alias que pisan un zone_key existente: %', dup;
  end if;
end $$;`);

// POIs.
lines.push(`
-- 5) POIs curados. Mismo patrón idempotente que 0144: se borra el lote y se
--    reinserta, porque la tabla no tiene clave natural.
delete from neighborhood_pois where verified_source like 'osm-2026-08%';
with n as (select id, zone_key from neighborhoods)
insert into neighborhood_pois (neighborhood_id, name, category, latitude, longitude, priority, travel_modes, verified_source)
select n.id, p.name, p.category, p.lat, p.lng, p.priority, p.modes::text[], p.src
from n
join (values`);
lines.push(
  resolved.map((r) =>
    `  (${q(r.hood)}, ${q(r.name)}, ${q(r.category)}, ${r.lat}, ${r.lng}, ${r.priority}, ${arr(r.modes)}, ${q(`osm-2026-08 ${r.osm}`)})`,
  ).join(",\n"),
);
lines.push(`) as p(zone_key, name, category, lat, lng, priority, modes, src)
  on p.zone_key = n.zone_key;`);

// Corrección de las 4 propiedades con zona genérica.
lines.push(`
-- 6) Cuatro propiedades cuyo 'zone' es literalmente "Madrid" y por tanto no
--    resuelve contra ningún barrio. El barrio se ha obtenido por geocodifi-
--    cación INVERSA de las coordenadas de cada una contra los límites
--    administrativos de OSM (no del texto libre del anuncio, que en BC-1209
--    decía "Bernabéu-Hispanoamérica" cuando el punto cae en El Viso).
--    Sólo se escribe 'subzone'; 'zone' se deja intacto.
update properties set subzone = 'El Viso'      where bc_reference = 'BC-1209' and coalesce(subzone,'') = '';
update properties set subzone = 'Castillejos'  where bc_reference = 'BC-1211' and coalesce(subzone,'') = '';
update properties set subzone = 'Lista'        where bc_reference = 'BC-1210' and coalesce(subzone,'') = '';
update properties set subzone = 'Goya'         where bc_reference = 'BC-1401' and coalesce(subzone,'') = '';`);

writeFileSync("supabase/migrations/0145_neighborhood_layer.sql", lines.join("\n") + "\n");

console.log(`[build] 0145_neighborhood_layer.sql`);
console.log(`        barrios nuevos: ${NEIGHBORHOODS.length} · POIs: ${resolved.length} · descartados en geocoding: ${rejected.length}`);
for (const h of NEIGHBORHOODS) {
  const n = resolved.filter((r) => r.hood === h.key).length;
  console.log(`        ${h.key.padEnd(22)} ${String(n).padStart(2)} POIs · ${INTROS[h.key].trim().split(/\s+/).length} palabras`);
}
