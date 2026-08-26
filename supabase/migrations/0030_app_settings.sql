-- Ajustes globales clave/valor.
--
-- ⚠️ Esta migración bloqueaba el runner: `CREATE POLICY` sin `DROP POLICY IF
-- EXISTS` falla si la policy ya existe, y como apply-migrations.sh corre con
-- ON_ERROR_STOP=1 y para en el primer error, ninguna migración posterior
-- llegaba a aplicarse. La tabla ya existía en producción desde antes de que
-- hubiera runner, así que fallaba en cada deploy.
--
-- Todo el fichero es ahora idempotente, que es lo que exige el flujo del
-- proyecto (post-deploy relanza las migraciones en cada despliegue).
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all" ON app_settings;
CREATE POLICY "admin_all" ON app_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin'))
  );
