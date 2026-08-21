-- 0146 · Planta verificada por humano — patrón class_override, por propiedad.
--
-- No existe columna floor: la planta se infiere de features/título/descripción
-- (lib/floor.ts). Cuando esa inferencia es dudosa, el gate de publicación
-- retiene la story ("Planta inferida de una zona secundaria"). Este override
-- registra la decisión HUMANA tras revisar la evidencia: manda sobre el
-- parser (que queda intacto) y desactiva la regla contextual solo para esa
-- propiedad. Valores: 'none' (la propiedad no tiene planta: chalet,
-- unifamiliar), 'atico', o el número de planta.
alter table properties add column if not exists floor_override text
  check (floor_override is null or floor_override ~ '^(none|atico|-?[0-9]{1,2})$');

comment on column properties.floor_override is
  'Planta verificada por humano. none = sin planta (chalet). Manda sobre lib/floor.ts.';

-- BC-0002 · Resolución humana 2026-08-22 (FINAL FALLBACK RECOVERY, acción 3).
-- Evidencia: chalet independiente de 905 m². Las DOS menciones de "planta
-- baja" en su descripción nombran un NIVEL INTERNO del chalet, no la planta
-- del inmueble en un edificio:
--   · "La vivienda se distribuye en tres plantas: planta baja o sótano,
--      planta principal y planta alta."
--   · "La planta baja o sótano alberga … trastero, cuarto de calderas,
--      vestuario … y bodega de vinos"
-- No existe evidencia de un floor comparable al key fact PLANTA → floor null,
-- el key fact no se pinta, y el claim de distribución puede usarse
-- narrativamente en su capítulo.
update properties set floor_override = 'none'
where bc_reference = 'BC-0002' and floor_override is null;
