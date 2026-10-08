-- ============================================================
-- SmartBC · Estrellas del cliente en la selección privada
-- ============================================================
-- En /s/[token] el cliente valora cada residencia de 1 a 5 estrellas, además
-- de decidir (quiero visitarla / quizá / descartar). 0 = sin valorar.
-- Si la residencia ya es ficha, la misma valoración se copia a
-- client_property_selections.client_rating, que es lo que ve el CRM en
-- "Propiedades seleccionadas".
-- ============================================================

ALTER TABLE client_shortlist_items
  ADD COLUMN IF NOT EXISTS client_rating smallint NOT NULL DEFAULT 0
    CHECK (client_rating BETWEEN 0 AND 5);
