-- Foto de perfil de WhatsApp del contacto — confirmado en producción por
-- Zinto (2026-09-16): `avatarUrl` en la respuesta de PUT /contacts/{externalId}
-- y `contact.avatar_url` en los eventos message.received/sent/delivered/
-- read/failed. Es de SOLO LECTURA de su lado (nunca lo mandamos nosotros),
-- capturada una sola vez por Zinto al crear el contacto — no se actualiza
-- sola si el cliente cambia su foto después. Solo existe para el canal
-- WhatsApp NO oficial (QR); el canal oficial de Meta nunca la trae.
--
-- Igual que media_url, la URL es un endpoint AUTENTICADO
-- (GET /media?type=profile_pictures&filename=..., Bearer +
-- X-Zinto-Integration-Id) — pasa por el mismo proxy que ya existe para
-- adjuntos, app/api/admin/zinto/media/route.ts, sin cambios ahí.
ALTER TABLE zinto_conversations
  ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT;
