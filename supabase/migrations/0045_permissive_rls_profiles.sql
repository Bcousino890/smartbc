-- (Reescrita) Originalmente era la "NUCLEAR OPTION": políticas permisivas con
-- USING/WITH CHECK (true) en profiles → CUALQUIERA (incluso anónimo con la anon
-- key) podía INSERTAR/EDITAR/BORRAR cualquier perfil: escalar su cuenta a admin
-- o borrar perfiles ajenos. Agujero grave.
--
-- Se mantiene SELECT abierto para no romper las lecturas del panel/login
-- (endurecer a self+staff en un follow-up), pero las ESCRITURAS quedan
-- restringidas al propio usuario o al service role (el admin client bypassa RLS
-- de todas formas). Idempotente: DROP antes de cada CREATE.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_delete" ON profiles;

-- SELECT: abierto por ahora (lecturas del panel y del login). TODO: endurecer.
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

-- INSERT/UPDATE: solo el propio usuario o el service role.
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'service_role');

-- DELETE: solo el service role (el admin client). Nadie borra perfiles por sesión.
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');
