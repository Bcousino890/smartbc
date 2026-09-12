-- El Integration ID de Zinto es un UUID opaco, no un identificador numérico.
-- Los valores ya truncados se conservan visibles para que el panel los marque
-- como inválidos y el administrador pueda reemplazarlos por el UUID original.
ALTER TABLE zinto_config
  ALTER COLUMN integration_id TYPE text
  USING integration_id::text;
