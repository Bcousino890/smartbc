-- SOLO PRUEBAS LOCALES. Tras 0242 aplicada dos veces.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT count(*) FROM information_schema.columns
  WHERE table_name = 'idealista_leads' AND column_name IN ('zinto_phone', 'call_phone')) = 2,
  '0242: columnas zinto_phone y call_phone');

-- Un lead de antes: sin teléfonos propios, sigue con el recibido.
INSERT INTO idealista_leads (id, conversation_id, name, phone)
VALUES ('00000000-0000-4000-9242-000000000001', 'tel-0242-a', 'Prueba Teléfonos', '+34 600 000 101');
SELECT test_util.ok((SELECT zinto_phone IS NULL AND call_phone IS NULL AND phone = '+34 600 000 101'
  FROM idealista_leads WHERE id = '00000000-0000-4000-9242-000000000001'),
  '0242: un lead existente no tiene teléfonos propios y conserva el recibido');

-- Dos números distintos se guardan sin tocar el recibido.
UPDATE idealista_leads SET zinto_phone = '+34 611 111 111', call_phone = '+34 622 222 222'
 WHERE id = '00000000-0000-4000-9242-000000000001';
SELECT test_util.ok((SELECT zinto_phone = '+34 611 111 111' AND call_phone = '+34 622 222 222'
  AND phone = '+34 600 000 101' AND phone_digits = '34600000101'
  FROM idealista_leads WHERE id = '00000000-0000-4000-9242-000000000001'),
  '0242: WhatsApp y llamadas por separado; el recibido y sus dígitos intactos');

-- Basura fuera.
DO $$
BEGIN
  BEGIN
    UPDATE idealista_leads SET call_phone = '12' WHERE id = '00000000-0000-4000-9242-000000000001';
    RAISE EXCEPTION 'debía fallar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT test_util.ok(true, '0242: un teléfono demasiado corto se rechaza');
SELECT 'test-solicitudes-telefonos.sql: OK' AS resultado;
