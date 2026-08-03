-- Migración de verificación: no cambia ninguna funcionalidad real.
-- Sirve para confirmar de punta a punta que el pipeline
-- GitHub (main) -> auto-deploy VPS -> "Aplicar Migraciones Ahora"
-- (/admin/configuracion) está funcionando tras arreglar el secret
-- VPS_SSH_KEY. Deja un marcador con la fecha en que se aplicó.
INSERT INTO app_settings (key, value, updated_at)
VALUES ('system.deploy_pipeline_check', to_jsonb(now()::text), now())
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
