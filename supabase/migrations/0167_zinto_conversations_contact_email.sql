-- Correo del contacto de una conversación de WhatsApp — mismo patrón que
-- `contact_name` (misma tabla, editable desde el mismo panel). No sale de
-- Zinto: v2 no tiene ningún GET de contactos (contrato de solo empuje), así
-- que esto es nuestra propia fuente de verdad; se empuja a Zinto por
-- PUT /contacts/{externalId} al guardar (confirmado por Zinto, 2026-09-16:
-- `email` es un campo propio del contacto, igual que `name`/`phone`, y
-- actualiza el valor guardado en un PUT sobre un externalId existente).
ALTER TABLE zinto_conversations
  ADD COLUMN IF NOT EXISTS contact_email TEXT;
