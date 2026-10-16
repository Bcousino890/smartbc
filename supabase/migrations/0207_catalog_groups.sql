-- ============================================================================
-- 0207 · HOME de Fabricio: grupos editables de catálogos.
--
-- Expediente: docs/changes/2026-10-16-bcp-01-home-grupos/
--
-- Qué añade (solo objetos NUEVOS; no altera ninguna tabla existente):
--   · catalog_groups         grupos y subgrupos del dueño de la HOME (dos
--                            niveles como mucho, nombres libres, orden manual).
--   · catalog_group_members  qué catálogo está en qué grupo. Un catálogo puede
--                            estar en varios (también en un grupo y en uno de
--                            sus subgrupos); es el MISMO catálogo, no una copia.
--   · funciones de gestión atómicas (crear, renombrar, ordenar, mover, borrar,
--     asignar) y catalog_create_in_group (crear un catálogo ya asignado, en
--     una sola transacción).
--
-- Organizar NO cambia los catálogos: ninguna función de aquí escribe en
-- catalogs, catalog_items ni en las tablas de C1, C2 o E3, ni sube
-- catalogs.version ni updated_at. Por eso no cambia la instantánea ni la huella
-- pública, y no avisa a los lectores. Tampoco bloquea la fila del catálogo:
-- la propiedad se comprueba con una lectura.
--
-- Permisos (como 0192–0202): RLS activado y SIN políticas; tablas y funciones
-- solo para service_role; funciones SECURITY INVOKER con search_path fijo. Cada
-- función recibe p_actor y lanza 'forbidden' si no está en home_owners o si el
-- grupo o el catálogo no son suyos (no revela si existen).
--
-- Concurrencia: las escrituras de grupos de un mismo dueño se serializan con
-- un bloqueo de su fila de home_owners (posiciones, límite de 100 y borrados
-- coherentes con dos pestañas a la vez).
--
-- Integridad del árbol, también frente a escrituras directas: un disparador
-- exige que el padre sea del mismo dueño y no tenga padre (dos niveles, sin
-- ciclos) y que un grupo con subgrupos no pase a ser subgrupo; otro exige que
-- el catálogo y el grupo de una asignación sean del mismo dueño.
--
-- Nombres: 1–60 caracteres tras quitar espacios sobrantes; únicos entre
-- hermanos sin distinguir mayúsculas ni tildes (catalog_fold, de 0195, que es
-- IMMUTABLE: si algún día se redefine, hay que hacer REINDEX del índice
-- catalog_groups_sibling_name).
--
-- Todo va en una transacción y es idempotente (se puede aplicar dos veces).
-- Reversión: docs/changes/2026-10-16-bcp-01-home-grupos/rollback-0207.sql
-- (borra solo estos objetos: se pierde la organización; los catálogos no se
-- tocan). La ejecuta una persona, nunca un agente contra datos reales.
-- ============================================================================

BEGIN;

-- ── Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id  uuid        REFERENCES catalog_groups(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  position   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_groups_name_ok CHECK (
    char_length(name) BETWEEN 1 AND 60 AND name = btrim(name) AND name !~ '[[:cntrl:]]'
  ),
  CONSTRAINT catalog_groups_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_groups_sibling_name
  ON catalog_groups (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), catalog_fold(name));
CREATE INDEX IF NOT EXISTS idx_catalog_groups_owner ON catalog_groups (owner_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_catalog_groups_parent ON catalog_groups (parent_id);

CREATE TABLE IF NOT EXISTS catalog_group_members (
  group_id   uuid        NOT NULL REFERENCES catalog_groups(id) ON DELETE CASCADE,
  catalog_id uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_group_members_catalog ON catalog_group_members (catalog_id);

ALTER TABLE catalog_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_group_members ENABLE ROW LEVEL SECURITY;

-- ── Integridad (también frente a escrituras directas con service_role) ──────

CREATE OR REPLACE FUNCTION catalog_groups_check_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_parent catalog_groups;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM catalog_groups WHERE id = NEW.parent_id;
    IF NOT FOUND OR v_parent.owner_id <> NEW.owner_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF v_parent.parent_id IS NOT NULL OR v_parent.id = NEW.id THEN
      RAISE EXCEPTION 'too_deep';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM catalog_groups WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'too_deep';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_id <> OLD.owner_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS catalog_groups_check_tree ON catalog_groups;
CREATE TRIGGER catalog_groups_check_tree
  BEFORE INSERT OR UPDATE OF parent_id, owner_id ON catalog_groups
  FOR EACH ROW EXECUTE FUNCTION catalog_groups_check_tree();

CREATE OR REPLACE FUNCTION catalog_group_members_check_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM catalog_groups g JOIN catalogs c ON c.owner_id = g.owner_id
     WHERE g.id = NEW.group_id AND c.id = NEW.catalog_id
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS catalog_group_members_check_owner ON catalog_group_members;
CREATE TRIGGER catalog_group_members_check_owner
  BEFORE INSERT OR UPDATE ON catalog_group_members
  FOR EACH ROW EXECUTE FUNCTION catalog_group_members_check_owner();

-- ── Ayudas ──────────────────────────────────────────────────────────────────

-- Nombre normalizado (espacios sobrantes fuera) o error 'invalid_name'. La
-- misma regla vive en lib/catalogs/groups.ts (normalizeGroupName).
CREATE OR REPLACE FUNCTION catalog_group_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF v = '' OR char_length(v) > 60 OR v ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  RETURN v;
END
$$;

-- Dueño de la HOME + bloqueo de su fila (serializa sus escrituras de grupos).
CREATE OR REPLACE FUNCTION catalog_group_lock_owner(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
  PERFORM 1 FROM home_owners WHERE profile_id = p_actor FOR UPDATE;
END
$$;

-- Un grupo del actor (o 'forbidden').
CREATE OR REPLACE FUNCTION catalog_group_owned(p_actor uuid, p_group uuid)
RETURNS catalog_groups
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalog_groups;
BEGIN
  SELECT * INTO v FROM catalog_groups WHERE id = p_group;
  IF NOT FOUND OR v.owner_id <> p_actor THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN v;
END
$$;

-- Posiciones 0…n−1 de los hermanos, en su orden actual.
CREATE OR REPLACE FUNCTION catalog_group_renumber(p_owner uuid, p_parent uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE catalog_groups g SET position = x.n
    FROM (SELECT id, row_number() OVER (ORDER BY position, created_at, id) - 1 AS n
            FROM catalog_groups
           WHERE owner_id = p_owner AND parent_id IS NOT DISTINCT FROM p_parent) x
   WHERE g.id = x.id AND g.position <> x.n;
$$;

CREATE OR REPLACE FUNCTION catalog_group_name_taken(p_owner uuid, p_parent uuid, p_name text, p_except uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM catalog_groups
     WHERE owner_id = p_owner AND parent_id IS NOT DISTINCT FROM p_parent
       AND catalog_fold(name) = catalog_fold(p_name)
       AND id IS DISTINCT FROM p_except);
$$;

-- ── Gestión de grupos ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog_group_create(p_actor uuid, p_parent uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_parent catalog_groups;
  v_id uuid;
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  v_name := catalog_group_name(p_name);
  IF p_parent IS NOT NULL THEN
    v_parent := catalog_group_owned(p_actor, p_parent);
    IF v_parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'too_deep';
    END IF;
  END IF;
  IF (SELECT count(*) FROM catalog_groups WHERE owner_id = p_actor) >= 100 THEN
    RAISE EXCEPTION 'too_many_groups';
  END IF;
  IF catalog_group_name_taken(p_actor, p_parent, v_name, NULL) THEN
    RAISE EXCEPTION 'duplicate_name';
  END IF;
  INSERT INTO catalog_groups (owner_id, parent_id, name, position)
  VALUES (p_actor, p_parent, v_name,
          coalesce((SELECT max(position) + 1 FROM catalog_groups
                     WHERE owner_id = p_actor AND parent_id IS NOT DISTINCT FROM p_parent), 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION catalog_group_rename(p_actor uuid, p_group uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalog_groups;
  v_name text;
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  v := catalog_group_owned(p_actor, p_group);
  v_name := catalog_group_name(p_name);
  IF v_name = v.name THEN
    RETURN;
  END IF;
  IF catalog_group_name_taken(p_actor, v.parent_id, v_name, v.id) THEN
    RAISE EXCEPTION 'duplicate_name';
  END IF;
  UPDATE catalog_groups SET name = v_name, updated_at = now() WHERE id = v.id;
END
$$;

-- Orden manual de los hermanos de un nivel: la lista COMPLETA de sus ids, ya
-- ordenada (como reorder_client_portal_links: sin huecos ni casos borde).
CREATE OR REPLACE FUNCTION catalog_group_reorder(p_actor uuid, p_parent uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  IF p_parent IS NOT NULL THEN
    PERFORM catalog_group_owned(p_actor, p_parent);
  END IF;
  SELECT count(*) INTO v_n FROM catalog_groups WHERE owner_id = p_actor AND parent_id IS NOT DISTINCT FROM p_parent;
  IF p_ids IS NULL OR cardinality(p_ids) <> v_n
     OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x) <> v_n
     OR EXISTS (SELECT 1 FROM unnest(p_ids) x
                 WHERE NOT EXISTS (SELECT 1 FROM catalog_groups g
                                    WHERE g.id = x AND g.owner_id = p_actor
                                      AND g.parent_id IS NOT DISTINCT FROM p_parent)) THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;
  UPDATE catalog_groups g SET position = o.n - 1
    FROM unnest(p_ids) WITH ORDINALITY AS o(id, n)
   WHERE g.id = o.id AND g.position <> o.n - 1;
END
$$;

-- Mover un SUBGRUPO a otro grupo (D9): al final del destino, con sus
-- asignaciones. Un grupo de primer nivel no se mueve (si tuviera subgrupos
-- serían tres niveles; si no, pasar a subgrupo no es «mover un subgrupo»).
CREATE OR REPLACE FUNCTION catalog_group_move(p_actor uuid, p_group uuid, p_parent uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalog_groups;
  v_dest catalog_groups;
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  v := catalog_group_owned(p_actor, p_group);
  IF p_parent IS NULL THEN
    RAISE EXCEPTION 'invalid_move';
  END IF;
  v_dest := catalog_group_owned(p_actor, p_parent);
  IF v.parent_id IS NULL OR v_dest.id = v.id THEN
    RAISE EXCEPTION 'invalid_move';
  END IF;
  IF v_dest.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'too_deep';
  END IF;
  IF v.parent_id = v_dest.id THEN
    RETURN;
  END IF;
  IF catalog_group_name_taken(p_actor, v_dest.id, v.name, v.id) THEN
    RAISE EXCEPTION 'duplicate_name';
  END IF;
  UPDATE catalog_groups
     SET parent_id = v_dest.id, updated_at = now(),
         position = coalesce((SELECT max(position) + 1 FROM catalog_groups WHERE parent_id = v_dest.id), 0)
   WHERE id = v.id;
  PERFORM catalog_group_renumber(p_actor, v.parent_id);
END
$$;

-- Lo que se perdería al borrar un grupo (y sus subgrupos). Solo lee.
CREATE OR REPLACE FUNCTION catalog_group_preview_delete(p_actor uuid, p_group uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalog_groups;
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
  v := catalog_group_owned(p_actor, p_group);
  RETURN (
    WITH tree AS (
      SELECT id, name, position, 0 AS lvl FROM catalog_groups WHERE id = v.id
      UNION ALL
      SELECT id, name, position, 1 FROM catalog_groups WHERE parent_id = v.id
    ), mem AS (
      SELECT m.catalog_id FROM catalog_group_members m JOIN tree t ON t.id = m.group_id
    )
    SELECT jsonb_build_object(
      'groups', (SELECT count(*) FROM tree),
      'subgroups', coalesce((SELECT jsonb_agg(name ORDER BY position) FROM tree WHERE lvl = 1), '[]'::jsonb),
      'assignments', (SELECT count(*) FROM mem),
      'catalogs', (SELECT count(DISTINCT catalog_id) FROM mem),
      'unorganized', (SELECT count(DISTINCT x.catalog_id) FROM mem x
                       WHERE NOT EXISTS (SELECT 1 FROM catalog_group_members o
                                          WHERE o.catalog_id = x.catalog_id
                                            AND o.group_id NOT IN (SELECT id FROM tree))))
  );
END
$$;

-- Borra un grupo, sus subgrupos y SUS asignaciones en una sola transacción
-- (D6). Nunca borra ni cambia un catálogo; sus asignaciones a otros grupos
-- son otras filas y se conservan. Devuelve lo mismo que el preview.
CREATE OR REPLACE FUNCTION catalog_group_delete(p_actor uuid, p_group uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalog_groups;
  v_res jsonb;
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  v := catalog_group_owned(p_actor, p_group);
  v_res := catalog_group_preview_delete(p_actor, p_group);
  DELETE FROM catalog_groups WHERE id = v.id;   -- subgrupos y asignaciones, en cascada
  PERFORM catalog_group_renumber(p_actor, v.parent_id);
  RETURN v_res;
END
$$;

-- ── Asignaciones ────────────────────────────────────────────────────────────

-- Pone o quita UNA asignación. Idempotente (repetir no falla). Comprueba que
-- el catálogo es del actor con una lectura: no bloquea ni toca el catálogo.
CREATE OR REPLACE FUNCTION catalog_group_set_member(p_actor uuid, p_group uuid, p_catalog uuid, p_member boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_group_lock_owner(p_actor);
  PERFORM catalog_group_owned(p_actor, p_group);
  IF p_catalog IS NULL OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF coalesce(p_member, false) THEN
    INSERT INTO catalog_group_members (group_id, catalog_id) VALUES (p_group, p_catalog)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM catalog_group_members WHERE group_id = p_group AND catalog_id = p_catalog;
  END IF;
  RETURN coalesce(p_member, false);
END
$$;

-- Crear un catálogo YA asignado a un grupo (D10, C1): catalog_create_v2 y la
-- asignación en la MISMA transacción. Si la asignación falla (grupo borrado o
-- ajeno), se deshace todo y no queda catálogo: un reintento nunca duplica.
CREATE OR REPLACE FUNCTION catalog_create_in_group(
  p_actor uuid, p_title text, p_intro text, p_name text, p_phone text, p_role text, p_group uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_group IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_id := catalog_create_v2(p_actor, p_title, p_intro, p_name, p_phone, p_role);
  PERFORM catalog_group_set_member(p_actor, p_group, v_id, true);
  RETURN v_id;
END
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE catalog_groups, catalog_group_members FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_groups, catalog_group_members TO service_role;

REVOKE ALL ON FUNCTION catalog_groups_check_tree()                                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_members_check_owner()                                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_name(text)                                           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_lock_owner(uuid)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_owned(uuid, uuid)                                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_renumber(uuid, uuid)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_name_taken(uuid, uuid, text, uuid)                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_create(uuid, uuid, text)                             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_rename(uuid, uuid, text)                             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_reorder(uuid, uuid, uuid[])                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_move(uuid, uuid, uuid)                               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_preview_delete(uuid, uuid)                           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_delete(uuid, uuid)                                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_group_set_member(uuid, uuid, uuid, boolean)                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_create_in_group(uuid, text, text, text, text, text, uuid)  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_group_name(text)                                        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_lock_owner(uuid)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_owned(uuid, uuid)                                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_renumber(uuid, uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_name_taken(uuid, uuid, text, uuid)                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_create(uuid, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_rename(uuid, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_reorder(uuid, uuid, uuid[])                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_move(uuid, uuid, uuid)                            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_preview_delete(uuid, uuid)                        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_delete(uuid, uuid)                                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_group_set_member(uuid, uuid, uuid, boolean)             TO service_role;
GRANT EXECUTE ON FUNCTION catalog_create_in_group(uuid, text, text, text, text, text, uuid) TO service_role;

COMMIT;
