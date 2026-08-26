-- La referencia de particulares dejaba de ser única al pasar de 9.999 fichas.
--
-- `generate_particular_reference` construía la referencia con
-- `LPAD(nextval(...)::TEXT, 4, '0')`, y en PostgreSQL LPAD **trunca** cuando el
-- texto es más largo que la longitud pedida:
--
--     LPAD('10000', 4, '0')  ->  '1000'     (no '10000')
--
-- Con la secuencia por encima de 10.000, cada alta volvía a generar
-- 'PART-2026-1000', 'PART-2026-1001'… que ya existían, y el INSERT moría con
-- `duplicate key value violates unique constraint
-- "particulares_particular_reference_key"`. En la práctica: la tabla dejaba de
-- admitir fichas nuevas de CUALQUIER portal (Idealista incluido) en silencio,
-- porque el scraper sólo lo registra como un error más.
--
-- Arreglo: seguir rellenando a 4 dígitos mientras quepa, y a partir de ahí usar
-- los dígitos que hagan falta. Así las referencias antiguas (PART-2026-0001)
-- mantienen su formato y las nuevas simplemente crecen (PART-2026-10000).

CREATE OR REPLACE FUNCTION public.generate_particular_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  next_id TEXT;
BEGIN
  IF NEW.particular_reference IS NULL THEN
    next_id := nextval('particulares_reference_seq')::TEXT;
    NEW.particular_reference :=
      'PART-' ||
      TO_CHAR(CURRENT_DATE, 'YYYY') ||
      '-' ||
      LPAD(next_id, GREATEST(4, LENGTH(next_id)), '0');
  END IF;
  RETURN NEW;
END;
$function$;
