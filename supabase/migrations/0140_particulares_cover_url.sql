-- ============================================================================
-- SmartBC · particulares.cover_url — portada ligera para el listado
-- ============================================================================
-- El listado de /admin/particulares traía el array `photos` COMPLETO (hasta 80
-- fotos/fila) de las ~10.000 filas de golpe, colgando la pestaña. El front ya
-- usaba una sola portada (ParticularRow.cover_url) y cargaba la galería en el
-- modal; solo faltaba la columna y que la query la sirviera. Idempotente.
ALTER TABLE public.particulares ADD COLUMN IF NOT EXISTS cover_url text;

UPDATE public.particulares
   SET cover_url = photos->0->>'url'
 WHERE cover_url IS NULL
   AND jsonb_typeof(photos) = 'array'
   AND photos <> '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.set_particular_cover()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.cover_url := NEW.photos->0->>'url';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS particulares_cover ON public.particulares;
CREATE TRIGGER particulares_cover
  BEFORE INSERT OR UPDATE OF photos ON public.particulares
  FOR EACH ROW EXECUTE FUNCTION public.set_particular_cover();
