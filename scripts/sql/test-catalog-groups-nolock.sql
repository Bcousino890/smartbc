-- SOLO PRUEBAS LOCALES Y SOLO EN LA BASE TEMPORAL (contraprueba). Quita el
-- bloqueo del dueño para demostrar que el límite depende de él. Se restaura
-- volviendo a aplicar 0203.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION catalog_group_lock_owner(p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
END $$;
