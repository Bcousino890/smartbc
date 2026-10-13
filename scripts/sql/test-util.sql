-- SOLO PRUEBAS LOCALES (BCP-01). Ayudas para los tests SQL.
CREATE SCHEMA IF NOT EXISTS test_util;
GRANT USAGE ON SCHEMA test_util TO anon, authenticated, service_role;

-- Ejecuta p_sql y exige que falle con el error esperado. p_expect es un
-- mensaje propio ('forbidden', 'order_mismatch'…) o una clase de error
-- ('insufficient_privilege', 'unique_violation', 'check_violation').
CREATE OR REPLACE FUNCTION test_util.expect_error(p_sql text, p_expect text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF (p_expect = 'insufficient_privilege' AND SQLSTATE = '42501')
       OR (p_expect = 'unique_violation' AND SQLSTATE = '23505')
       OR (p_expect = 'check_violation' AND SQLSTATE = '23514')
       OR SQLERRM = p_expect THEN
      RAISE NOTICE 'ok · error esperado (%): %', p_expect, left(p_sql, 90);
      RETURN;
    END IF;
    RAISE EXCEPTION 'TEST FAIL: se esperaba % y llegó [%] % · %', p_expect, SQLSTATE, SQLERRM, left(p_sql, 90);
  END;
  RAISE EXCEPTION 'TEST FAIL: se esperaba % pero no hubo error · %', p_expect, left(p_sql, 90);
END $$;

CREATE OR REPLACE FUNCTION test_util.ok(p_cond boolean, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'TEST FAIL: %', p_msg;
  END IF;
  RAISE NOTICE 'ok · %', p_msg;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_util TO anon, authenticated, service_role;
