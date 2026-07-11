-- Los teléfonos nacionales capturados antes de que la ingesta normalizara el
-- prefijo de país (ver app/api/extension/idealista-leads) quedaron sin "+34".
-- Idempotente: tras la primera pasada todos empiezan por "+", así que la
-- condición WHERE deja de matchear en re-ejecuciones.
UPDATE idealista_leads
SET phone = '+34 ' || phone,
    updated_at = now()
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone !~ '^00';
