-- Reversión de 0234 (interruptor en el CRM). Borra las dos funciones. La tabla
-- de registro se borra solo si está vacía: si tiene filas, se conserva como
-- historial de quién encendió o apagó la sincronización.
-- El valor del interruptor (app_settings.idealista_crm_sync) NO se toca.
BEGIN;
DROP FUNCTION IF EXISTS idealista_crm_set_enabled(boolean, uuid);
DROP FUNCTION IF EXISTS idealista_crm_activation_report();
DO $$
BEGIN
  IF to_regclass('public.idealista_crm_switch_log') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM idealista_crm_switch_log) THEN
    DROP TABLE idealista_crm_switch_log;
  END IF;
END $$;
COMMIT;
