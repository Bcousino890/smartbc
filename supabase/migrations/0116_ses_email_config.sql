-- ============================================================
-- SmartBC · Email Configuration — migrar SMTP genérico → AWS SES nativo
-- ============================================================
-- El SMTP configurado (relay "Mail Manager" de AWS) rechazaba el login con
-- 550 5.1.1 "mailbox unavailable" — problema de cuenta en AWS, no de la app.
-- Un producto hermano (Zinto CRM) ya envía email de producción con SES
-- clásico (Access Key ID + Secret Access Key, sin SMTP) desde la misma
-- identidad verificada. Migramos email_config al mismo esquema para
-- eliminar toda la clase de bugs de puertos/TLS/AUTH de SMTP.
--
-- Columnas nuevas nullable: la tabla ya tiene una fila y no se puede añadir
-- NOT NULL sin default a una tabla poblada. "Requerido" se valida en la capa
-- de aplicación (app/api/admin/email-config/route.ts), igual que hoy.
--
-- Irreversible: borra las credenciales SMTP guardadas (ya inservibles).
-- scripts/post-deploy.sh re-ejecuta TODAS las migraciones en cada deploy sin
-- tabla de control, así que todo aquí debe ser idempotente.
-- ============================================================

ALTER TABLE email_config
  ADD COLUMN IF NOT EXISTS aws_region text,
  ADD COLUMN IF NOT EXISTS aws_access_key_id text,
  ADD COLUMN IF NOT EXISTS aws_secret_access_key_encrypted text,
  ADD COLUMN IF NOT EXISTS aws_secret_access_key_iv text;

ALTER TABLE email_config
  DROP COLUMN IF EXISTS smtp_server,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_password_encrypted,
  DROP COLUMN IF EXISTS smtp_password_iv,
  DROP COLUMN IF EXISTS use_ssl;

-- from_email / from_name quedan igual: identidad remitente en SES.
-- RLS (is_admin() FOR ALL, de 0021_email_config.sql) no cambia: es a nivel
-- de fila, no de columna.

-- --------------------------------------------------------------
-- Drive-by fix: el índice "singleton" actual indexa la PK (ya única por
-- definición), así que no impide dos filas. Como ya se reescribe esta
-- tabla, se corrige con el idiom correcto de Postgres para singleton.
-- --------------------------------------------------------------
DROP INDEX IF EXISTS idx_email_config_singleton;
CREATE UNIQUE INDEX idx_email_config_singleton ON email_config ((true));
