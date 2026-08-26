-- Un mismo contacto puede preguntar por varias propiedades distintas en el
-- mismo hilo del inbox (ej. escribe el 18 mar por un piso, el 20 mar por
-- otro y el 27 mar por un tercero). Los campos property_title/price/type
-- solo guardaban la primera tarjeta encontrada; properties guarda TODAS las
-- consultadas en el hilo. property_image_url guarda la miniatura de la
-- propiedad principal (properties[0].imageUrl) para mostrarla en el listado
-- sin tener que desempaquetar el JSON.
ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS property_image_url TEXT,
  ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '[]'::jsonb;
