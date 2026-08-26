-- Fase 2 (aislamiento por país del CRM Chile): índices parciales para las
-- queries filtradas por `country` que ahora usan lib/db/queries/{clients,
-- reports,calendar,dashboard}.ts, y backfill determinista de `country` en
-- las tablas que enlazan con `properties` o `profiles` (la fuente de verdad
-- de país de cada fila es la propiedad/perfil al que pertenece).
--
-- NO se backfillea `profiles.country` de clientes aquí: no hay forma
-- determinista de saber si un cliente existente es de España o Chile (no
-- enlaza con una propiedad concreta). Eso lo decide el admin caso a caso
-- desde /cl/admin/usuarios y /admin/usuarios (o /es/admin/usuarios), editando
-- el perfil. Para un backfill manual masivo (p. ej. si se identifica a los
-- clientes chilenos por dominio de email o por alguna lista externa), correr
-- a mano algo como:
--
--   UPDATE profiles SET country = 'cl'
--   WHERE role = 'client' AND id IN (<lista de ids identificados a mano>);

-- 1. Índices parciales / de filtro por país -------------------------------

CREATE INDEX IF NOT EXISTS idx_properties_country_active
  ON properties(country)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visit_requests_country_lookup
  ON visit_requests(country);

CREATE INDEX IF NOT EXISTS idx_profiles_country_lookup
  ON profiles(country);

-- 2. Backfill determinista --------------------------------------------------

-- visit_requests.country := country de la propiedad visitada. Las visitas de
-- propiedades españolas ya tienen country='es' (default histórico), así que
-- esto solo corrige las que apuntan a una propiedad country='cl' pero se
-- crearon antes de que el flujo de captación/alta CL fijara el país.
UPDATE visit_requests vr
SET country = p.country
FROM properties p
WHERE vr.property_id = p.id
  AND vr.country IS DISTINCT FROM p.country;

-- conversations: la tabla (migración 0001_init) es 1 conversación por
-- cliente con la agencia — NO tiene `property_id`, así que no hay forma de
-- derivar su país desde una propiedad enlazada. Se deja tal cual (default
-- 'es' salvo que se edite el perfil del cliente y se quiera propagar a mano
-- con la consulta de más abajo). Si en el futuro conversations gana un
-- `property_id`, este bloque debería actualizarse con el mismo patrón que
-- visit_requests.

-- client_preferences.country := country del profile dueño (client_id).
UPDATE client_preferences cpref
SET country = pr.country
FROM profiles pr
WHERE cpref.client_id = pr.id
  AND cpref.country IS DISTINCT FROM pr.country;
