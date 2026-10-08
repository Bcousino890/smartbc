-- ============================================================
-- SmartBC · Descripción de la ficha apta para el cliente (caché)
-- ============================================================
-- "Ver residencia" en la selección privada (/s/[token]) enseña la descripción
-- y las características de la ficha. Las fichas importadas de portales traen
-- el texto de OTRA inmobiliaria ("Inmobiliaria X le presenta…", teléfonos,
-- referencias): el cliente no debe verlo tal cual.
--
-- lib/services/properties/client-description.ts lo limpia con IA la primera
-- vez que alguien abre esa residencia y guarda aquí el resultado, por idioma.
-- `src` es el md5 de descripción+características de la ficha: si cambian, deja
-- de casar y se regenera.
--
-- Tabla aparte y no una columna de `properties` a propósito: escribir la caché
-- en `properties` dispararía su trigger de updated_at, y cualquier proceso que
-- mire updated_at (sincronización, sindicación) lo tomaría por un cambio real
-- de la ficha.
--
-- Solo la lee y escribe el servidor (service role): RLS activada sin políticas.
-- ============================================================

CREATE TABLE IF NOT EXISTS property_client_descriptions (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  language    text NOT NULL,
  src         text NOT NULL,
  description text,
  features    text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, language)
);

ALTER TABLE property_client_descriptions ENABLE ROW LEVEL SECURITY;
