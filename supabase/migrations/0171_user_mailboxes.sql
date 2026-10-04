-- Correo corporativo dentro del CRM (/admin/correo): cada usuario del staff
-- conecta UNA vez su buzón @bcousinoprop.com (cPanel, IMAP 993 / SMTP 465) y
-- desde ahí lo lee y envía sin salir del panel.
--
-- Servidor, puertos y dominio NO viven aquí: son los mismos para todos y los
-- fija lib/mailbox/config.ts (con override por env). Aquí solo lo que es de
-- cada usuario: la dirección, la contraseña cifrada (AES-256-GCM con
-- EMAIL_ENCRYPTION_KEY, igual que email_config/idealista/zinto) y la firma.
--
-- Firma: 'auto' (por defecto, también para los usuarios que ya existían) la
-- genera lib/mailbox/signature.ts a partir del perfil EN CADA ENVÍO, así que
-- un usuario nuevo o antiguo la tiene sin hacer nada y se actualiza sola si
-- cambia su nombre, rol o teléfono. 'custom' usa signature_html; 'none', sin
-- firma. signature_title es el cargo que sale en la firma automática (NULL =
-- el que corresponde a su rol).
--
-- RLS activado SIN políticas: solo el service role (las rutas
-- /api/admin/correo/**, que filtran por el usuario de la sesión) lo toca. La
-- contraseña nunca sale del servidor.
CREATE TABLE IF NOT EXISTS user_mailboxes (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_encrypted text,
  password_iv text,
  signature_mode text NOT NULL DEFAULT 'auto'
    CHECK (signature_mode IN ('auto', 'custom', 'none')),
  signature_html text,
  signature_title text,
  connected_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_mailboxes ENABLE ROW LEVEL SECURITY;
