-- ============================================================
-- SmartBC · Sesiones de la extensión de Chrome, una por usuario y navegador
-- ============================================================
-- Hasta esta migración la extensión entraba con UN token compartido (HMAC,
-- lib/services/idealista/extension-token.ts): no decía quién era, duraba un
-- año, daba la lista entera de clientes y solo se revocaba rotando el secreto
-- del servidor — es decir, echando a todos a la vez. Si se filtraba (un
-- ex-empleado, un navegador prestado), no había forma de cortarle el acceso a
-- una sola persona.
--
-- Ahora cada usuario conecta SU extensión desde el CRM
-- (/{país}/admin/extension) y recibe un token propio:
--   · se guarda solo su SHA-256 (`token_hash`), nunca en claro;
--   · caduca si no se usa (ventana deslizante, lib/extension/sessions.ts);
--   · se revoca de uno en uno, por el propio usuario o por un admin;
--   · deja de valer en cuanto el usuario deja de ser del equipo.
--
-- Sin políticas RLS a propósito: solo la toca el service role desde el
-- servidor. Ningún cliente del navegador debe poder leer ni los hashes.
-- ============================================================

CREATE TABLE IF NOT EXISTS extension_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  -- Parte pública del token (sbx_XXXXXXXX), para reconocerla en el panel.
  token_prefix text NOT NULL,
  -- "Chrome en macOS" — lo que el navegador dice de sí mismo al conectar.
  label text,
  -- ID de la extensión que se conectó (chrome.runtime.id). El token SOLO vale
  -- en peticiones con `Origin: chrome-extension://<ese id>`, y ese Origin lo
  -- pone Chrome: una copia de la extensión (otro ID) no puede usarlo aunque
  -- alguien le pegue el token.
  extension_id text CHECK (extension_id IS NULL OR extension_id ~ '^[a-p]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_user_active
  ON extension_sessions (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE extension_sessions ENABLE ROW LEVEL SECURITY;

-- El token compartido de antes sigue funcionando hasta que un admin lo
-- apague desde /{país}/admin/extension (las extensiones ya instaladas lo
-- llevan pegado). `allowedExtensionIds` vacío = no se exige un ID concreto
-- (hasta publicar en la Chrome Web Store y saber cuál es).
INSERT INTO app_settings (key, value)
VALUES ('extension.security', '{"legacyTokenEnabled": true, "allowedExtensionIds": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Quién hizo cada recorrido de "Capturar todas" (NULL con el token antiguo,
-- que no identifica a nadie).
ALTER TABLE idealista_capture_runs
  ADD COLUMN IF NOT EXISTS captured_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
