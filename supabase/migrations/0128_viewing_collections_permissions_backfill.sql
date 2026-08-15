-- ============================================================================
-- SmartBC · Backfill de permisos para Viewing Collections
-- ============================================================================
-- Al añadir el recurso `viewing_collections` y la acción `publish`,
-- normalizeMatrix() (lib/permissions.ts) devuelve false para cualquier clave
-- ausente del JSON guardado. Los roles personalizados perderían acceso EN
-- SILENCIO: sin error, sin pista de por qué el módulo no les aparece.
--
-- Verificado el 2026-08-15: custom_roles tiene 0 filas, así que hoy esto es un
-- no-op. Se aplica igualmente por si se crean roles antes del despliegue.
--
-- Criterio: viewing_collections hereda de 'clientes' (quien gestiona clientes
-- debe poder gestionar sus selecciones), EXCEPTO publish, que se deja en false
-- a propósito — publicar es una capacidad nueva y se concede a mano.
--
-- Idempotente: solo escribe donde falta la clave.
--
-- ⚠️ La columna de la matriz se llama `matrix` (jsonb), no `permissions`.
-- Verificado contra el esquema vivo.
-- ============================================================================

-- ── 1 · El recurso nuevo, heredando de 'clientes' ───────────────────────────
UPDATE custom_roles
SET matrix = jsonb_set(
      matrix,
      '{viewing_collections}',
      jsonb_build_object(
        'view',    coalesce(matrix #> '{clientes,view}',   'false'::jsonb),
        'create',  coalesce(matrix #> '{clientes,create}', 'false'::jsonb),
        'edit',    coalesce(matrix #> '{clientes,edit}',   'false'::jsonb),
        'delete',  coalesce(matrix #> '{clientes,delete}', 'false'::jsonb),
        'export',  'false'::jsonb,
        'publish', 'false'::jsonb
      ),
      true
    )
WHERE matrix IS NOT NULL
  AND jsonb_typeof(matrix) = 'object'
  AND NOT (matrix ? 'viewing_collections');

-- ── 2 · La acción `publish` en los recursos ya existentes ───────────────────
-- False explícito, para que el JSON guardado y PERMISSION_ACTIONS no diverjan.
UPDATE custom_roles cr
SET matrix = (
  SELECT jsonb_object_agg(
           key,
           CASE
             WHEN jsonb_typeof(value) = 'object' AND NOT (value ? 'publish')
               THEN value || '{"publish": false}'::jsonb
             ELSE value
           END
         )
    FROM jsonb_each(cr.matrix)
)
WHERE matrix IS NOT NULL
  AND jsonb_typeof(matrix) = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(cr.matrix) e
     WHERE jsonb_typeof(e.value) = 'object' AND NOT (e.value ? 'publish')
  );

-- ── 3 · Feature flag / kill switch ──────────────────────────────────────────
-- Permite apagar el módulo sin desplegar: oculta los bloques del panel y hace
-- que /v/[token] devuelva la vista de "no disponible".
INSERT INTO app_settings (key, value)
VALUES (
  'viewing_collections',
  jsonb_build_object(
    'enabled', true,
    'default_expiry_days', 60,
    'max_expiry_days', 180,
    'allow_renewal', true
  )
)
ON CONFLICT (key) DO NOTHING;
